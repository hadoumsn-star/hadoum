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

// PR 5D: Expense workflow notifications. Drives the real Finance workflow
// endpoints and the real Notifications endpoint together against a real
// Postgres database, with genuinely separate DIRECTOR and SUPERVISOR
// sessions — the only way to prove notifications are created for the right
// *recipient* and only once the underlying transition actually committed
// (see expense-workflow.service.spec.ts for the unit-level coverage of the
// wiring and failure paths).

interface TransactionResponse {
  id: string;
}

interface NotificationEntry {
  title: string;
  resourceType: string;
  resourceId: string;
  message: string;
}

describe('Expense workflow notifications (e2e)', () => {
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

    // Budget editing is SUPERVISOR-only (see finances.controller.ts) —
    // directorToken would now 403 here.
    await request(app.getHttpServer())
      .put('/api/finances/budget-lines')
      .set('Authorization', `Bearer ${supervisorToken}`)
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

  function notificationsFor(token: string) {
    return request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
  }

  // ─── 1. Submit → SUPERVISOR ──────────────────────────────────────────────

  it('DIRECTOR submits: notifies SUPERVISOR with title, label, amount, and no supplier mention when absent', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find(
      (n) => n.title === 'Nouvelle dépense à valider',
    );
    if (!notif) throw new Error('Submit notification not found');
    expect(notif.resourceType).toBe('EXPENSE_TRANSACTION');
    expect(notif.resourceId).toBe(created.body.id);
    expect(notif.message).toContain('Réparation plomberie');
    expect(notif.message).toContain('25000');

    // The DIRECTOR who submitted is never notified about their own submission.
    const directorNotifs = (await notificationsFor(directorToken).expect(
      200,
    )) as { body: NotificationEntry[] };
    expect(
      directorNotifs.body.some((n) => n.title === 'Nouvelle dépense à valider'),
    ).toBe(false);
  });

  it('submit notification mentions the supplier when one is set', async () => {
    const category = await prisma.contactCategory.create({
      data: { key: 'FOURNISSEUR', label: 'Fournisseur', sortOrder: 1 },
    });
    const supplier = await prisma.contact.create({
      data: { fullName: 'Ets Diop Fournitures', categoryId: category.id },
    });
    const created = (await createExpense({
      supplierContactId: supplier.id,
    }).expect(201)) as { body: TransactionResponse };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find(
      (n) => n.title === 'Nouvelle dépense à valider',
    );
    if (!notif) throw new Error('Submit notification not found');
    expect(notif.message).toContain('Ets Diop Fournitures');
  });

  // ─── 2. Approve → submitting DIRECTOR ────────────────────────────────────

  it('SUPERVISOR approves: notifies the submitting DIRECTOR', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(201);

    const notifs = (await notificationsFor(directorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find((n) => n.title === 'Dépense approuvée');
    if (!notif) throw new Error('Approval notification not found');
    expect(notif.resourceId).toBe(created.body.id);
  });

  it('does not notify approval when the budget is insufficient (no duplicate/false notification)', async () => {
    await request(app.getHttpServer())
      .put('/api/finances/budget-lines')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ category: 'ENTRETIEN', month: 8, year: 2026, budgetXof: 1000 });
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    }; // amountXof 25000 > 1000
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(409);

    const notifs = (await notificationsFor(directorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    expect(notifs.body.some((n) => n.title === 'Dépense approuvée')).toBe(
      false,
    );
  });

  // ─── 3. Reject → submitting DIRECTOR ─────────────────────────────────────

  it('SUPERVISOR rejects: notifies the submitting DIRECTOR with the rejection comment', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Justificatif manquant' })
      .expect(201);

    const notifs = (await notificationsFor(directorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find((n) => n.title === 'Dépense refusée');
    if (!notif) throw new Error('Rejection notification not found');
    expect(notif.message).toContain('Justificatif manquant');
  });

  it('does not notify when reject fails validation (empty comment)', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: '' })
      .expect(400);

    const notifs = (await notificationsFor(directorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    expect(notifs.body.some((n) => n.title === 'Dépense refusée')).toBe(false);
  });

  // ─── 4. Resubmit → SUPERVISOR ─────────────────────────────────────────────

  it('DIRECTOR resubmits: notifies SUPERVISOR', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'x' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/resubmit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find(
      (n) => n.title === 'Dépense soumise à nouveau',
    );
    if (!notif) throw new Error('Resubmit notification not found');
    expect(notif.resourceId).toBe(created.body.id);
  });

  // ─── 5. Complete → SUPERVISOR ─────────────────────────────────────────────

  it('DIRECTOR completes: notifies SUPERVISOR', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find((n) => n.title === 'Dépense clôturée');
    if (!notif) throw new Error('Completion notification not found');
    expect(notif.resourceId).toBe(created.body.id);
  });

  it('does not notify completion of a non-approved expense (still PENDING_APPROVAL)', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    expect(notifs.body.some((n) => n.title === 'Dépense clôturée')).toBe(false);
  });

  // ─── 6. Cancel → SUPERVISOR ───────────────────────────────────────────────

  it('DIRECTOR cancels: notifies SUPERVISOR', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const notifs = (await notificationsFor(supervisorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const notif = notifs.body.find((n) => n.title === 'Dépense annulée');
    if (!notif) throw new Error('Cancel notification not found');
    expect(notif.resourceId).toBe(created.body.id);
  });

  // ─── No duplicate on concurrent transitions ──────────────────────────────

  it('a concurrent approve/reject race produces exactly one notification, matching whichever won', async () => {
    const created = (await createExpense().expect(201)) as {
      body: TransactionResponse;
    };
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const [approveRes, rejectRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/finances/transactions/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/api/finances/transactions/${created.body.id}/reject`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ comment: 'racing rejection' }),
    ]);
    const winnerIsApprove = approveRes.status === 201;
    expect([approveRes.status, rejectRes.status].sort()).toEqual([201, 409]);

    const notifs = (await notificationsFor(directorToken).expect(200)) as {
      body: NotificationEntry[];
    };
    const approvedNotifs = notifs.body.filter(
      (n) => n.title === 'Dépense approuvée',
    );
    const rejectedNotifs = notifs.body.filter(
      (n) => n.title === 'Dépense refusée',
    );
    expect(approvedNotifs).toHaveLength(winnerIsApprove ? 1 : 0);
    expect(rejectedNotifs).toHaveLength(winnerIsApprove ? 0 : 1);
    expect(approvedNotifs.length + rejectedNotifs.length).toBe(1);
  });
});
