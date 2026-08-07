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

// PR 6: default monthly budget categories, seeded idempotently via
// POST /finances/budget-lines/ensure-defaults. cleanDatabase() gives each
// test a fresh DB, so the six brand-new categories introduced in this PR
// (VETEMENTS, TRANSPORT, ETUDES, SPORT, LOISIRS, BUREAU_FACTURES) are
// reliable, deterministic test subjects — nothing else in the schema can
// have touched them before this PR existed.

interface BudgetLineEntry {
  category: string;
  budgetXof: number;
}

interface TransactionResponse {
  category: string;
}

interface DashboardCategory {
  category: string;
  budgetXof: number;
  realizedXof: number;
  totalCommittedPercentage: number | null;
  ecartXof: number;
}

interface DashboardResponse {
  byCategory: DashboardCategory[];
}

describe('Default budget categories (e2e)', () => {
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
      (await request(app.getHttpServer()).post('/api/auth/login').send({
        email: users.supervisor.email,
        password: TEST_PASSWORD,
      })) as {
        body: { token: string };
      }
    ).body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  // Budget editing is SUPERVISOR-only (see finances.controller.ts) — every
  // test below that seeds/edits budget lines authenticates as SUPERVISOR.
  // Read calls (dashboard, transactions) stay on directorToken to prove
  // DIRECTOR's read access is unaffected. See the "Budget editing
  // authorization" describe block at the bottom for the 403 coverage itself.
  function ensureDefaults() {
    return request(app.getHttpServer())
      .post('/api/finances/budget-lines/ensure-defaults')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send();
  }

  function findLine(
    body: BudgetLineEntry[],
    category: string,
  ): BudgetLineEntry {
    const line = body.find((l) => l.category === category);
    if (!line) throw new Error(`No budget line for category ${category}`);
    return line;
  }

  it('creates all 9 default categories on an empty month, including SALAIRES at 0', async () => {
    const res = (await ensureDefaults().expect(201)) as {
      body: BudgetLineEntry[];
    };

    const expected: Record<string, number> = {
      ALIMENTATION: 250000,
      SANTE: 36000,
      VETEMENTS: 20000,
      TRANSPORT: 18000,
      ETUDES: 10000,
      SPORT: 30000,
      LOISIRS: 30000,
      BUREAU_FACTURES: 20000,
      SALAIRES: 0,
    };
    for (const [category, budgetXof] of Object.entries(expected)) {
      const line = findLine(res.body, category);
      expect(line).toBeTruthy();
      expect(line.budgetXof).toBe(budgetXof);
    }
  });

  it('calling it twice creates no duplicates', async () => {
    await ensureDefaults().expect(201);
    const second = (await ensureDefaults().expect(201)) as {
      body: BudgetLineEntry[];
    };

    const vetements = second.body.filter((l) => l.category === 'VETEMENTS');
    expect(vetements).toHaveLength(1);
    expect(second.body).toHaveLength(9);
  });

  it('preserves a custom amount already set for a default category — never overwrites', async () => {
    // A Supervisor sets a custom amount for TRANSPORT before defaults ever run.
    await request(app.getHttpServer())
      .put('/api/finances/budget-lines')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        category: 'TRANSPORT',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        budgetXof: 999000,
      })
      .expect(200);

    const res = (await ensureDefaults().expect(201)) as {
      body: BudgetLineEntry[];
    };

    const transport = findLine(res.body, 'TRANSPORT');
    expect(transport.budgetXof).toBe(999000); // untouched, not reset to 18000
    // Every other default still gets created normally alongside it.
    expect(findLine(res.body, 'SPORT').budgetXof).toBe(30000);
  });

  it('an expense can be tagged with a new default category (VETEMENTS) and shows up as consumed', async () => {
    await ensureDefaults().expect(201);
    const now = new Date();
    const created = (await request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'DEPENSE',
        category: 'VETEMENTS',
        label: 'Uniformes scolaires',
        amountXof: 5000,
        date: now.toISOString().slice(0, 10),
        status: 'VALIDE',
      })
      .expect(201)) as { body: TransactionResponse };
    expect(created.body.category).toBe('VETEMENTS');

    const dashboard = (await request(app.getHttpServer())
      .get(
        `/api/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      )
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: DashboardResponse };
    const vetements = dashboard.body.byCategory.find(
      (c) => c.category === 'VETEMENTS',
    );
    if (!vetements)
      throw new Error('VETEMENTS not found in dashboard.byCategory');
    expect(vetements.budgetXof).toBe(20000);
    expect(vetements.realizedXof).toBe(5000);
  });

  // SALAIRES defaults to a 0 XOF budget (intentionally, not omitted — see
  // DEFAULT_BUDGET_CATEGORIES) specifically to exercise this null-percentage
  // path rather than the "no budget line at all" path.
  it('SALAIRES (0 budget) never produces a divide-by-zero and displays correctly', async () => {
    await ensureDefaults().expect(201);
    const now = new Date();
    const created = (await request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'DEPENSE',
        category: 'SALAIRES',
        label: 'Salaire éducateur',
        amountXof: 150000,
        date: now.toISOString().slice(0, 10),
        status: 'VALIDE',
      })
      .expect(201)) as { body: TransactionResponse };
    expect(created.body.category).toBe('SALAIRES');

    const dashboard = (await request(app.getHttpServer())
      .get(
        `/api/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      )
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: DashboardResponse };
    const salaires = dashboard.body.byCategory.find(
      (c) => c.category === 'SALAIRES',
    );
    if (!salaires)
      throw new Error('SALAIRES not found in dashboard.byCategory');
    expect(salaires.budgetXof).toBe(0);
    expect(salaires.realizedXof).toBe(150000);
    // Every percentage/ratio field is null instead of Infinity/NaN when
    // budgetXof is 0 — never a divide-by-zero.
    expect(salaires.totalCommittedPercentage).toBeNull();
    expect(Number.isFinite(salaires.ecartXof)).toBe(true);
    expect(salaires.ecartXof).toBe(-150000);
  });

  // Budget editing authorization — SUPERVISOR can edit, DIRECTOR is
  // read-only. Every budget-modification route gets its own 403 case;
  // read routes (GET budget-lines, GET dashboard) are proven unaffected.
  describe('Budget editing authorization', () => {
    it('SUPERVISOR can create/update a budget line', async () => {
      await request(app.getHttpServer())
        .put('/api/finances/budget-lines')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          category: 'TRANSPORT',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          budgetXof: 42000,
        })
        .expect(200);
    });

    it('DIRECTOR receives 403 when creating/updating a budget line', async () => {
      await request(app.getHttpServer())
        .put('/api/finances/budget-lines')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          category: 'TRANSPORT',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          budgetXof: 42000,
        })
        .expect(403);
    });

    it('DIRECTOR receives 403 on ensure-defaults (also a budget-modification route)', async () => {
      await request(app.getHttpServer())
        .post('/api/finances/budget-lines/ensure-defaults')
        .set('Authorization', `Bearer ${directorToken}`)
        .send()
        .expect(403);
    });

    it('DIRECTOR receives 403 when deleting a budget line', async () => {
      const created = (await request(app.getHttpServer())
        .put('/api/finances/budget-lines')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          category: 'SPORT',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          budgetXof: 15000,
        })
        .expect(200)) as { body: { id: string } };

      await request(app.getHttpServer())
        .delete(`/api/finances/budget-lines/${created.body.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(403);
    });

    it('SUPERVISOR can delete a budget line', async () => {
      const created = (await request(app.getHttpServer())
        .put('/api/finances/budget-lines')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          category: 'LOISIRS',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          budgetXof: 15000,
        })
        .expect(200)) as { body: { id: string } };

      await request(app.getHttpServer())
        .delete(`/api/finances/budget-lines/${created.body.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(204);
    });

    it('DIRECTOR can still read budget lines and the dashboard — read access is unaffected', async () => {
      await ensureDefaults().expect(201);
      const now = new Date();

      await request(app.getHttpServer())
        .get(
          `/api/finances/budget-lines?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        )
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(
          `/api/finances/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        )
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
    });
  });
});
