import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  cleanDatabase,
  getPrisma,
  seedTestUsers,
  TEST_PASSWORD,
} from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

// PR 5B: Expense Workflow Validation Integration. Drives the real Finance
// workflow endpoints and the real generic Validations endpoints together
// against a real Postgres database, with genuinely separate DIRECTOR and
// SUPERVISOR sessions — proving the two engines (ExpenseWorkflowService's
// state machine from PR 5A, and the shared ValidationsService) stay
// consistent end-to-end, not just under mocks (see
// expense-workflow.service.spec.ts for the unit-level coverage).
describe('Expense workflow validation integration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

    directorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: TEST_PASSWORD })
    ).body.token;
    supervisorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.supervisor.email, password: TEST_PASSWORD })
    ).body.token;

    // PR 5C requires an available BudgetLine to approve an expense (see
    // expense-budget.e2e-spec.ts for that behavior's own dedicated
    // coverage) — every test below uses createExpense()'s default category
    // (ENTRETIEN) and date (August 2026), so one generously-sized line here
    // covers all of them without changing what each test is actually about.
    await request(app.getHttpServer())
      .put('/api/finances/budget-lines')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        category: 'ENTRETIEN',
        month: 8,
        year: 2026,
        budgetXof: 1000000,
      });
  });

  afterAll(async () => {
    await app.close();
  });

  function createExpense(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'Réparation plomberie',
        amountXof: 25000,
        date: '2026-08-01',
        ...body,
      });
  }

  function history(transactionId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/api/validations/EXPENSE_TRANSACTION/${transactionId}/history`)
      .set('Authorization', `Bearer ${token}`);
  }

  // ─── Scenario 1 ───────────────────────────────────────────────────────

  it('scenario 1: submit -> supervisor sees it pending -> approve -> APPROVED, history shows both steps', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;

    const submitted = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ comment: 'Merci de valider' })
      .expect(201);
    expect(submitted.body.expenseWorkflowStatus).toBe('PENDING_APPROVAL');

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const pendingEntry = pending.body.find(
      (v: { resourceId: string }) => v.resourceId === id,
    );
    expect(pendingEntry).toBeTruthy();
    expect(pendingEntry.resourceType).toBe('EXPENSE_TRANSACTION');
    expect(pendingEntry.comment).toBe('Merci de valider');
    expect(pendingEntry.resource.label).toBe('Réparation plomberie');
    expect(pendingEntry.resource.amountXof).toBe(25000);

    const approved = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'OK' })
      .expect(201);
    expect(approved.body.expenseWorkflowStatus).toBe('APPROVED');

    const hist = await history(id, directorToken).expect(200);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].status).toBe('APPROVED');
    expect(hist.body[0].submittedBy.id).toBeTruthy();
    expect(hist.body[0].reviewedBy.id).toBeTruthy();
    expect(hist.body[0].comment).toBe('OK');
  });

  // ─── Scenario 2 ───────────────────────────────────────────────────────

  it('scenario 2: submit -> reject with comment -> resubmit with new comment -> approve, history shows both cycles in order', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Justificatif manquant' })
      .expect(201);
    expect(rejected.body.expenseWorkflowStatus).toBe('REJECTED');

    const resubmitted = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/resubmit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ comment: 'Justificatif joint' })
      .expect(201);
    expect(resubmitted.body.expenseWorkflowStatus).toBe('PENDING_APPROVAL');

    const approved = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(201);
    expect(approved.body.expenseWorkflowStatus).toBe('APPROVED');

    const hist = await history(id, directorToken).expect(200);
    expect(hist.body).toHaveLength(2);
    // Newest first (matches every other resource type's history ordering).
    const [second, first] = hist.body;
    expect(first.status).toBe('REJECTED');
    expect(first.comment).toBe('Justificatif manquant');
    expect(second.status).toBe('APPROVED');
    expect(second.comment).toBe('Justificatif joint');
  });

  // ─── Scenario 3 ───────────────────────────────────────────────────────

  it('scenario 3: reject without a comment is a validation error', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: '' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(400);
  });

  // ─── Scenario 4 ───────────────────────────────────────────────────────

  it('scenario 4: DIRECTOR cannot approve, SUPERVISOR cannot submit', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(403);
  });

  // ─── Scenario 5 ───────────────────────────────────────────────────────

  it('scenario 5: concurrent approve + reject on the same expense — only one succeeds', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const [approveRes, rejectRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/finances/transactions/${id}/approve`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/api/finances/transactions/${id}/reject`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ comment: 'Racing rejection' }),
    ]);

    const statuses = [approveRes.status, rejectRes.status].sort();
    // Exactly one of the two racing decisions wins (2xx); the other gets a
    // deterministic conflict (409) — never both succeeding, never both
    // failing.
    expect(statuses).toEqual([201, 409]);

    const final = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(['APPROVED', 'REJECTED']).toContain(
      final.body.expenseWorkflowStatus,
    );

    const hist = await history(id, directorToken).expect(200);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].status).toBe(final.body.expenseWorkflowStatus);
  });

  // ─── Scenario 6 ───────────────────────────────────────────────────────

  it('scenario 6: existing non-expense validation flows still work (maintenance ticket lifecycle unaffected)', async () => {
    const spaceRes = await request(app.getHttpServer())
      .post('/api/spaces')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name: 'Cuisine', type: 'CUISINE' })
      .expect(201);

    const ticket = await request(app.getHttpServer())
      .post('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Fuite d'eau",
        spaceId: spaceRes.body.id,
        urgency: 'CRITIQUE',
        reportedBy: 'Jean',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);
    expect(approved.body.status).toBe('FERME');

    const hist = await request(app.getHttpServer())
      .get(`/api/maintenance-tickets/${ticket.body.id}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].status).toBe('APPROVED');
  });

  // ─── Legacy + additional guardrail checks ──────────────────────────────

  it('legacy transaction (expenseWorkflowStatus null) has no automatic validation history and stays usable', async () => {
    const created = await createExpense().expect(201);
    expect(created.body.expenseWorkflowStatus).toBeNull();

    const hist = await history(created.body.id, directorToken).expect(200);
    expect(hist.body).toHaveLength(0);

    // Legacy read/update APIs remain fully usable, untouched by the workflow.
    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ label: 'Updated label' })
      .expect(200);
  });

  it('RECETTE never enters the expense workflow and gets no ValidationRequest', async () => {
    const income = await request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'RECETTE',
        category: 'DON',
        label: 'Don',
        amountXof: 10000,
        date: '2026-08-01',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${income.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(400);
  });

  it('completing an approved expense does not alter its validation history', async () => {
    const created = await createExpense().expect(201);
    const id = created.body.id;
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(201);

    const histBefore = await history(id, directorToken).expect(200);

    const completed = await request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/complete`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);
    expect(completed.body.expenseWorkflowStatus).toBe('COMPLETED');

    const histAfter = await history(id, directorToken).expect(200);
    expect(histAfter.body).toEqual(histBefore.body);
  });
});
