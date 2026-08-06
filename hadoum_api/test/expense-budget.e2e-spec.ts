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

// PR 5C: Expense Budget Reservation and Consumption. Drives the real
// Finance workflow + budget-line + dashboard endpoints against a real
// Postgres database, with genuinely separate DIRECTOR/SUPERVISOR sessions —
// the only way to prove the row-locking concurrency strategy in
// BudgetService actually serializes racing approvals (see
// budget.service.spec.ts / expense-workflow.service.spec.ts for the
// unit-level coverage of the calculation and wiring).

interface TransactionResponse {
  id: string;
  label: string;
  paymentMethod: string | null;
  expenseWorkflowStatus: string | null;
}

interface DashboardCategory {
  category: string;
  realizedXof: number;
  reservedXof: number;
  consumedXof: number;
  availableXof: number;
}

interface DashboardResponse {
  byCategory: DashboardCategory[];
}

interface InsufficientBudgetError {
  code: string;
  budgetXof: number;
  reservedXof: number;
  consumedXof: number;
  availableXof: number;
  requestedXof: number;
}

interface ValidationHistoryEntry {
  status: string;
}

describe('Expense budget reservation and consumption (e2e)', () => {
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
      (await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: TEST_PASSWORD })) as {
        body: { token: string };
      }
    ).body.token;
    supervisorToken = (
      (await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.supervisor.email, password: TEST_PASSWORD })) as {
        body: { token: string };
      }
    ).body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  function setBudget(
    body: {
      category?: string;
      month?: number;
      year?: number;
      budgetXof?: number;
    } = {},
  ) {
    // Budget editing is SUPERVISOR-only (see finances.controller.ts) —
    // directorToken would now 403 here.
    return request(app.getHttpServer())
      .put('/api/finances/budget-lines')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        category: 'ENTRETIEN',
        month: 8,
        year: 2026,
        budgetXof: 100000,
        ...body,
      });
  }

  function createExpense(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'Réparation plomberie',
        amountXof: 70000,
        date: '2026-08-15',
        ...body,
      });
  }

  function submit(id: string, token = directorToken) {
    return request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
  }

  function approve(id: string, token = supervisorToken) {
    return request(app.getHttpServer())
      .post(`/api/finances/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
  }

  function dashboard(year = 2026, month = 8) {
    return request(app.getHttpServer())
      .get(`/api/finances/dashboard?year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${directorToken}`);
  }

  function categoryOf(
    dash: { body: DashboardResponse },
    category = 'ENTRETIEN',
  ): DashboardCategory {
    const found = dash.body.byCategory.find((c) => c.category === category);
    if (!found) throw new Error(`Category ${category} not found in dashboard`);
    return found;
  }

  // ─── Scenario 1 — Reservation ───────────────────────────────────────────

  it('scenario 1: approval reserves the amount; consumed stays zero; available decreases', async () => {
    await setBudget().expect(200);
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);
    await approve(created.body.id).expect(201);

    const dash = (await dashboard().expect(200)) as { body: DashboardResponse };
    const c = categoryOf(dash);
    expect(c.reservedXof).toBe(70000);
    expect(c.consumedXof).toBe(0);
    expect(c.availableXof).toBe(30000);
  });

  // ─── Scenario 2 — Completion ─────────────────────────────────────────────

  it('scenario 2: completing moves the amount from reserved to consumed; available unchanged', async () => {
    await setBudget().expect(200);
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);
    await approve(created.body.id).expect(201);
    const beforeComplete = (await dashboard().expect(200)) as {
      body: DashboardResponse;
    };

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const dash = (await dashboard().expect(200)) as { body: DashboardResponse };
    const c = categoryOf(dash);
    expect(c.reservedXof).toBe(0);
    expect(c.consumedXof).toBe(70000);
    expect(c.availableXof).toBe(categoryOf(beforeComplete).availableXof);
    expect(c.availableXof).toBe(30000);
  });

  // ─── Scenario 3 — Cancellation ───────────────────────────────────────────

  it('scenario 3: cancelling releases the reservation without ever consuming it', async () => {
    await setBudget().expect(200);
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);
    await approve(created.body.id).expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const dash = (await dashboard().expect(200)) as { body: DashboardResponse };
    const c = categoryOf(dash);
    expect(c.reservedXof).toBe(0);
    expect(c.consumedXof).toBe(0);
    expect(c.availableXof).toBe(100000);
  });

  // ─── Scenario 4 — Insufficient budget ────────────────────────────────────

  it('scenario 4: approval is blocked when it would exceed the available budget', async () => {
    await setBudget({ budgetXof: 50000 }).expect(200); // less than the 70000 expense
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);

    const res = (await approve(created.body.id).expect(409)) as {
      body: InsufficientBudgetError;
    };
    expect(res.body).toMatchObject({
      code: 'INSUFFICIENT_BUDGET',
      budgetXof: 50000,
      reservedXof: 0,
      consumedXof: 0,
      availableXof: 50000,
      requestedXof: 70000,
    });

    const detail = (await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: TransactionResponse };
    expect(detail.body.expenseWorkflowStatus).toBe('PENDING_APPROVAL');

    const history = (await request(app.getHttpServer())
      .get(`/api/validations/EXPENSE_TRANSACTION/${created.body.id}/history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: ValidationHistoryEntry[] };
    expect(history.body[0].status).toBe('PENDING_VALIDATION');
  });

  it('blocks approval with a clear error when no BudgetLine exists at all', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);
    const res = (await approve(created.body.id).expect(400)) as {
      body: { code: string };
    };
    expect(res.body.code).toBe('NO_BUDGET_LINE');
  });

  // ─── Scenario 5 — Concurrent approvals ───────────────────────────────────

  it('scenario 5: two approvals competing for the same limited remainder — only one succeeds', async () => {
    await setBudget({ budgetXof: 100000 }).expect(200);
    const expenseA = (await createExpense({ label: 'Expense A' }).expect(
      201,
    )) as { body: TransactionResponse };
    const expenseB = (await createExpense({ label: 'Expense B' }).expect(
      201,
    )) as { body: TransactionResponse };
    await submit(expenseA.body.id).expect(201);
    await submit(expenseB.body.id).expect(201);

    const [resA, resB] = await Promise.all([
      approve(expenseA.body.id),
      approve(expenseB.body.id),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const dash = (await dashboard().expect(200)) as { body: DashboardResponse };
    const c = categoryOf(dash);
    // Exactly one 70000 reservation went through — never both (140000 would
    // blow the 100000 budget), never neither.
    expect(c.reservedXof).toBe(70000);
    expect(c.availableXof).toBe(30000);
  });

  // ─── Scenario 6 — Legacy compatibility ───────────────────────────────────

  it('scenario 6: a legacy NULL-workflow transaction keeps the old dashboard behavior and creates no reservation', async () => {
    await setBudget().expect(200);
    // Created directly through Prisma to simulate a genuinely pre-PR-5A row
    // (expenseWorkflowStatus is never set by the create API's normal path
    // once submitted, but every row created before PR 5A looked exactly
    // like this).
    await prisma.transaction.create({
      data: {
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'Legacy expense',
        amountXof: 15000,
        date: new Date('2026-08-05'),
        status: 'VALIDE',
      },
    });

    const dash = (await dashboard().expect(200)) as { body: DashboardResponse };
    const c = categoryOf(dash);
    // Old realized-based fields still see it (unchanged legacy behavior)...
    expect(c.realizedXof).toBe(15000);
    // ...and the new consumedXof also counts it (legacy-compatibility rule),
    // but it is never "reserved" — there was no approval step for it.
    expect(c.reservedXof).toBe(0);
    expect(c.consumedXof).toBe(15000);
    expect(c.availableXof).toBe(85000);
  });

  // ─── Scenario 7 — Month/category isolation ───────────────────────────────

  it('scenario 7: independent categories and months do not interfere with each other', async () => {
    await setBudget({
      category: 'ENTRETIEN',
      month: 8,
      budgetXof: 100000,
    }).expect(200);
    await setBudget({
      category: 'ALIMENTATION',
      month: 8,
      budgetXof: 100000,
    }).expect(200);
    await setBudget({
      category: 'ENTRETIEN',
      month: 9,
      budgetXof: 100000,
    }).expect(200);

    const entretienAug = (await createExpense({
      category: 'ENTRETIEN',
      date: '2026-08-10',
    }).expect(201)) as { body: TransactionResponse };
    const alimentationAug = (await createExpense({
      category: 'ALIMENTATION',
      date: '2026-08-10',
    }).expect(201)) as { body: TransactionResponse };
    const entretienSep = (await createExpense({
      category: 'ENTRETIEN',
      date: '2026-09-10',
    }).expect(201)) as { body: TransactionResponse };

    for (const t of [entretienAug, alimentationAug, entretienSep]) {
      await submit(t.body.id).expect(201);
      await approve(t.body.id).expect(201);
    }

    const augDash = (await dashboard(2026, 8).expect(200)) as {
      body: DashboardResponse;
    };
    expect(categoryOf(augDash, 'ENTRETIEN').reservedXof).toBe(70000);
    expect(categoryOf(augDash, 'ALIMENTATION').reservedXof).toBe(70000);

    const sepDash = (await dashboard(2026, 9).expect(200)) as {
      body: DashboardResponse;
    };
    expect(categoryOf(sepDash, 'ENTRETIEN').reservedXof).toBe(70000);
  });

  it('month boundary: a 31 August expense reserves against August even if nothing happens in September', async () => {
    await setBudget({ month: 8, budgetXof: 100000 }).expect(200);
    await setBudget({ month: 9, budgetXof: 100000 }).expect(200);
    const created = (await createExpense({ date: '2026-08-31' }).expect(
      201,
    )) as { body: TransactionResponse };
    await submit(created.body.id).expect(201);
    await approve(created.body.id).expect(201);

    const augDash = (await dashboard(2026, 8).expect(200)) as {
      body: DashboardResponse;
    };
    expect(categoryOf(augDash).reservedXof).toBe(70000);
    const sepDash = (await dashboard(2026, 9).expect(200)) as {
      body: DashboardResponse;
    };
    expect(categoryOf(sepDash).reservedXof).toBe(0);
  });

  // ─── Scenario 8 — Editing guard ──────────────────────────────────────────

  it('scenario 8: approved expense financial-field edits are rejected; descriptive edits still work', async () => {
    await setBudget().expect(200);
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await submit(created.body.id).expect(201);
    await approve(created.body.id).expect(201);

    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ amountXof: 1 })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ category: 'ALIMENTATION' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ date: '2026-09-01' })
      .expect(409);

    const res = (await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ label: 'Updated description', paymentMethod: 'CARTE' })
      .expect(200)) as { body: TransactionResponse };
    expect(res.body.label).toBe('Updated description');
    expect(res.body.paymentMethod).toBe('CARTE');
  });
});
