import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import {
  createTestApp,
  cleanDatabase,
  getPrisma,
  seedTestUsers,
  TEST_PASSWORD,
} from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

interface DashboardOverviewResponse {
  period: { type: string; start: string; end: string };
  children: { totalActive: number; presentToday: number; absentToday: number };
  staff: {
    totalActive: number;
    presentToday: number;
    absentToday: number;
    nonConfirmedToday: number;
  };
  finance: { budgetTotalXof: number; budgetRestantXof: number };
  donors: {
    sponsorsActive: number;
    donationsCount: number;
    campaignsActive: number;
  };
}

interface DashboardOperationsResponse {
  stockAlertsCount: number;
  proceduresRequiringAttentionCount: number;
  openIncidentsCount: number;
  maintenanceTicketsRequiringAttentionCount: number;
  pendingValidationsCount: number;
}

interface DashboardTrendsResponse {
  period: { type: string; start: string; end: string };
  finance: { label: string; recettesXof: number; depensesXof: number }[];
  donations: { label: string; amountXof: number; count: number }[];
  staffAttendance: {
    label: string;
    present: number;
    absent: number;
    nonConfirmed: number;
  }[];
}

/**
 * Module 6 (PR 20) — GET /dashboard/overview. Real Postgres, real
 * FinancesService/StaffService (no DI overrides beyond the usual
 * FakeUploadService, which this endpoint never touches — no uploads
 * involved), real role guards.
 */
describe('Module 6 — GET /dashboard/overview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;
  let educatorToken: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: 'board@test.local',
        passwordHash,
        name: 'Test Board',
        initials: 'TB',
        role: 'BOARD',
        roleLabel: "Conseil d'Administration",
        title: 'Membre du Conseil',
      },
    });
    await prisma.user.create({
      data: {
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });

    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);
    boardToken = await login('board@test.local');
    educatorToken = await login('educator@test.local');
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Role matrix ────────────────────────────────────────────────────────

  it('DIRECTOR -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  it('SUPERVISOR -> 200 (read access, same aggregate shape as DIRECTOR)', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
  });

  it('BOARD -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(200);
  });

  it('EDUCATOR -> 403', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
  });

  it('unauthenticated -> 401', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .expect(401);
  });

  // ─── Empty database ─────────────────────────────────────────────────────

  it('returns valid zero values on a completely empty database', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardOverviewResponse;

    expect(body.children).toEqual({
      totalActive: 0,
      presentToday: 0,
      absentToday: 0,
    });
    expect(body.staff).toEqual({
      totalActive: 0,
      presentToday: 0,
      absentToday: 0,
      nonConfirmedToday: 0,
    });
    expect(body.finance).toEqual({ budgetTotalXof: 0, budgetRestantXof: 0 });
    expect(body.donors).toEqual({
      sponsorsActive: 0,
      donationsCount: 0,
      campaignsActive: 0,
    });
  });

  // ─── Default period ─────────────────────────────────────────────────────

  it('defaults to period=month when no query param is given', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect((res.body as DashboardOverviewResponse).period.type).toBe('month');
  });

  it('rejects an invalid ?period= value with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/overview?period=fortnight')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(400);
  });

  it('accepts every documented period type', async () => {
    for (const period of ['today', 'week', 'month', 'quarter', 'year']) {
      const res = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?period=${period}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect((res.body as DashboardOverviewResponse).period.type).toBe(period);
    }
  });

  // ─── BOARD privacy — the critical test ─────────────────────────────────

  it('BOARD response contains no PII/person-level objects, even with real named fixtures in the database', async () => {
    // Real, named fixtures — a child, a staff member, a donor contact —
    // so this test would actually catch a PII leak, not just prove an
    // empty response is safe.
    await prisma.child.create({
      data: {
        fileNumber: 'CH-PII-TEST-001',
        firstName: 'Aminata',
        lastName: 'Traoré',
        dateOfBirth: new Date('2015-03-10'),
        placeOfBirth: 'Dakar',
        gender: 'FEMININ',
        entryDate: new Date('2022-01-01'),
        status: 'ORPHELIN_COMPLET',
        isActive: true,
      },
    });
    await prisma.staffMember.create({
      data: {
        firstName: 'Moussa',
        lastName: 'Kane',
        role: 'Éducateur',
        phone: '771234567',
        email: 'moussa.kane@example.test',
      },
    });
    const category = await prisma.contactCategory.create({
      data: { key: 'DASHBOARD_PII_TEST', label: 'Donateur (test)' },
    });
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Fatoumata Cissé',
        categoryId: category.id,
        phone: '781112233',
        email: 'fatoumata.cisse@example.test',
      },
    });
    await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN', active: true },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    for (const forbidden of [
      'Aminata',
      'Traoré',
      'Moussa',
      'Kane',
      'Fatoumata',
      'Cissé',
      '771234567',
      '781112233',
      'moussa.kane@example.test',
      'fatoumata.cisse@example.test',
      'firstName',
      'lastName',
      'fullName',
      'phone',
      'email',
      'CH-PII-TEST-001',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Only the documented aggregate shape — no extra top-level keys either.
    expect(Object.keys(res.body).sort()).toEqual(
      ['children', 'donors', 'finance', 'period', 'staff'].sort(),
    );

    const body = res.body as DashboardOverviewResponse;
    expect(body.children.totalActive).toBe(1);
    expect(body.staff.totalActive).toBe(1);
    expect(body.donors.sponsorsActive).toBe(1);
  });

  it('DIRECTOR and SUPERVISOR receive the exact same aggregate shape (no hidden richer response for either)', async () => {
    const [directorRes, supervisorRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200),
    ]);
    expect(Object.keys(directorRes.body).sort()).toEqual(
      Object.keys(supervisorRes.body).sort(),
    );
  });

  // ─── Financial values come from existing Finance logic ────────────────

  it('budgetTotalXof matches FinancesService.getDashboard().soldeCaisseXof exactly for a real recette/dépense pair', async () => {
    // A validated recette and a validated dépense, recorded the same way
    // FinancesService itself would (direct Prisma create — this test
    // only needs the resulting balance, not the create-transaction flow,
    // which Finance's own e2e suite already covers).
    await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        amountXof: 100_000,
        date: new Date(),
        label: 'Don test',
        status: 'VALIDE',
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'DEPENSE',
        category: 'ALIMENTATION',
        amountXof: 30_000,
        date: new Date(),
        label: 'Dépense test',
        status: 'VALIDE',
      },
    });

    const [dashboardRes, financeRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/finances/dashboard')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
    ]);

    expect(
      (dashboardRes.body as DashboardOverviewResponse).finance.budgetTotalXof,
    ).toBe(70_000);
    expect(
      (dashboardRes.body as DashboardOverviewResponse).finance.budgetTotalXof,
    ).toBe((financeRes.body as { soldeCaisseXof: number }).soldeCaisseXof);
  });

  // ─── Donor aggregates are correct ──────────────────────────────────────

  it('donor aggregates reflect real Module 5 data correctly (active PARRAIN only, ACTIVE campaigns only)', async () => {
    const category = await prisma.contactCategory.create({
      data: { key: 'DASHBOARD_DONOR_TEST', label: 'Donateur (test)' },
    });
    const activeParrain = await prisma.contact.create({
      data: { fullName: 'Parrain Actif', categoryId: category.id },
    });
    await prisma.donorProfile.create({
      data: { contactId: activeParrain.id, type: 'PARRAIN', active: true },
    });
    const inactiveParrain = await prisma.contact.create({
      data: { fullName: 'Parrain Inactif', categoryId: category.id },
    });
    await prisma.donorProfile.create({
      data: { contactId: inactiveParrain.id, type: 'PARRAIN', active: false },
    });
    const donateurPonctuel = await prisma.contact.create({
      data: { fullName: 'Donateur Ponctuel', categoryId: category.id },
    });
    const donateurProfile = await prisma.donorProfile.create({
      data: {
        contactId: donateurPonctuel.id,
        type: 'DONATEUR_PONCTUEL',
        active: true,
      },
    });

    const donationTransaction = await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        amountXof: 5_000,
        date: new Date(),
        label: 'Don test',
        status: 'VALIDE',
      },
    });
    await prisma.donation.create({
      data: {
        donorProfileId: donateurProfile.id,
        amountXof: 5_000,
        date: new Date(),
        transactionId: donationTransaction.id,
      },
    });

    await prisma.fundraisingCampaign.create({
      data: {
        title: 'Cagnotte Active',
        targetAmountXof: 10_000,
        startDate: new Date(),
        status: 'ACTIVE',
      },
    });
    await prisma.fundraisingCampaign.create({
      data: {
        title: 'Cagnotte Brouillon',
        targetAmountXof: 10_000,
        startDate: new Date(),
        status: 'BROUILLON',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardOverviewResponse;

    expect(body.donors.sponsorsActive).toBe(1); // only the active PARRAIN
    expect(body.donors.donationsCount).toBe(1);
    expect(body.donors.campaignsActive).toBe(1); // only the ACTIVE campaign
  });

  // ─── children.presentToday/absentToday (PR 21) ─────────────────────────

  it('children presentToday/absentToday reflect the centralized attendance rule across every sortie state', async () => {
    const base = {
      dateOfBirth: new Date('2015-03-10'),
      placeOfBirth: 'Dakar',
      gender: 'FEMININ' as const,
      entryDate: new Date('2022-01-01'),
      status: 'ORPHELIN_COMPLET' as const,
    };
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

    // Ordinary present child.
    await prisma.child.create({
      data: {
        ...base,
        fileNumber: 'CH-ATT-1',
        firstName: 'A',
        lastName: 'Un',
        isActive: true,
      },
    });
    // Pending departure (exitDate in the future) — still present today.
    await prisma.child.create({
      data: {
        ...base,
        fileNumber: 'CH-ATT-2',
        firstName: 'B',
        lastName: 'Deux',
        isActive: true,
        exitType: 'temporaire',
        exitDate: inDays(3),
      },
    });
    // Active temporary sortie — absent, still isActive:true.
    await prisma.child.create({
      data: {
        ...base,
        fileNumber: 'CH-ATT-3',
        firstName: 'C',
        lastName: 'Trois',
        isActive: true,
        exitType: 'temporaire',
        exitDate: inDays(-2),
      },
    });
    // Active temporary sortie, already flagged isActive:false — still
    // absent and still counted (the documented totalActive mismatch).
    await prisma.child.create({
      data: {
        ...base,
        fileNumber: 'CH-ATT-4',
        firstName: 'D',
        lastName: 'Quatre',
        isActive: false,
        exitType: 'temporaire',
        exitDate: inDays(-2),
      },
    });
    // Permanently exited — excluded entirely.
    await prisma.child.create({
      data: {
        ...base,
        fileNumber: 'CH-ATT-5',
        firstName: 'E',
        lastName: 'Cinq',
        isActive: false,
        exitType: 'définitive',
        exitDate: inDays(-30),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardOverviewResponse;

    expect(body.children.totalActive).toBe(3); // CH-ATT-1/2/3 (isActive:true)
    expect(body.children.presentToday).toBe(2); // CH-ATT-1, CH-ATT-2
    expect(body.children.absentToday).toBe(2); // CH-ATT-3, CH-ATT-4
    // Documented, intentional mismatch — CH-ATT-4 is counted here despite
    // isActive:false (see DashboardService.getOverview's own doc comment).
    expect(body.children.presentToday + body.children.absentToday).not.toBe(
      body.children.totalActive,
    );
  });
});

/**
 * Module 6 (PR 21) — GET /dashboard/operations. DIRECTOR/SUPERVISOR only.
 */
describe('Module 6 — GET /dashboard/operations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;
  let educatorToken: string;
  let directorId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    directorId = users.director.id;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: 'board@test.local',
        passwordHash,
        name: 'Test Board',
        initials: 'TB',
        role: 'BOARD',
        roleLabel: "Conseil d'Administration",
        title: 'Membre du Conseil',
      },
    });
    await prisma.user.create({
      data: {
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });

    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);
    boardToken = await login('board@test.local');
    educatorToken = await login('educator@test.local');
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Role matrix — narrower than /overview: BOARD excluded ─────────────

  it('DIRECTOR -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  it('SUPERVISOR -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
  });

  it('BOARD -> 403 (operational counts are DIRECTOR/SUPERVISOR only)', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  it('EDUCATOR -> 403', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
  });

  it('unauthenticated -> 401', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .expect(401);
  });

  // ─── Empty database ─────────────────────────────────────────────────────

  it('returns valid zero values on a completely empty database', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body as DashboardOperationsResponse).toEqual({
      stockAlertsCount: 0,
      proceduresRequiringAttentionCount: 0,
      openIncidentsCount: 0,
      maintenanceTicketsRequiringAttentionCount: 0,
      pendingValidationsCount: 0,
    });
  });

  // ─── Real fixtures, one per count ───────────────────────────────────────

  it('openIncidentsCount counts every non-RESOLU incident, excludes RESOLU', async () => {
    await prisma.incident.create({
      data: {
        title: 'Fuite eau',
        type: 'LOGISTIQUE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });
    await prisma.incident.create({
      data: {
        title: 'Déjà réglé',
        type: 'LOGISTIQUE',
        signaledBy: 'Test',
        status: 'RESOLU',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect((res.body as DashboardOperationsResponse).openIncidentsCount).toBe(
      1,
    );
  });

  it('maintenanceTicketsRequiringAttentionCount excludes RESOLU/FERME/ANNULE tickets', async () => {
    const space = await prisma.space.create({
      data: { name: 'Cuisine', type: 'CUISINE' },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Robinet cassé',
        spaceId: space.id,
        urgency: 'MOYENNE',
        status: 'OUVERT',
        reportedBy: 'Test',
      },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Déjà fermé',
        spaceId: space.id,
        urgency: 'FAIBLE',
        status: 'FERME',
        reportedBy: 'Test',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      (res.body as DashboardOperationsResponse)
        .maintenanceTicketsRequiringAttentionCount,
    ).toBe(1);
  });

  it('pendingValidationsCount counts only PENDING_VALIDATION requests', async () => {
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'fake-1',
        status: 'PENDING_VALIDATION',
        submittedById: directorId,
      },
    });
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'fake-2',
        status: 'APPROVED',
        submittedById: directorId,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      (res.body as DashboardOperationsResponse).pendingValidationsCount,
    ).toBe(1);
  });

  it('stockAlertsCount counts out-of-stock and low-stock active items, excludes inactive/healthy items', async () => {
    await prisma.stockItem.create({
      data: {
        name: 'Riz (rupture)',
        category: 'ALIMENTAIRE',
        currentQuantity: 0,
        minimumQuantity: 10,
        isActive: true,
      },
    });
    await prisma.stockItem.create({
      data: {
        name: 'Savon (stock bas)',
        category: 'HYGIENE',
        currentQuantity: 2,
        minimumQuantity: 5,
        isActive: true,
      },
    });
    await prisma.stockItem.create({
      data: {
        name: 'Stock sain',
        category: 'BUREAU',
        currentQuantity: 50,
        minimumQuantity: 5,
        isActive: true,
      },
    });
    await prisma.stockItem.create({
      data: {
        name: 'Inactif en rupture',
        category: 'BUREAU',
        currentQuantity: 0,
        minimumQuantity: 5,
        isActive: false,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect((res.body as DashboardOperationsResponse).stockAlertsCount).toBe(2);
  });

  it('proceduresRequiringAttentionCount uses the full centralized union (PR 22): expiring-soon AND already-expired both count, far-out and non-archived-healthy do not', async () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const far = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.administrativeProcedure.create({
      data: {
        title: 'Agrément (bientôt expiré)',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: soon,
      },
    });
    await prisma.administrativeProcedure.create({
      data: {
        title: 'Agrément (loin)',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: far,
      },
    });
    await prisma.administrativeProcedure.create({
      data: {
        title: 'Agrément (déjà expiré)',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: past,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    // 1 expiring-soon + 1 already-expired = 2 (PR 21 would have reported
    // 1, since it only ever covered isExpiringSoon).
    expect(
      (res.body as DashboardOperationsResponse)
        .proceduresRequiringAttentionCount,
    ).toBe(2);
  });

  it('never includes person-level or free-text fields (titles, names) in the response', async () => {
    await prisma.incident.create({
      data: {
        title: 'Incident sensible XYZ',
        type: 'MEDICAL',
        signaledBy: 'Nom Sensible',
        status: 'EN_COURS',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('Incident sensible XYZ');
    expect(serialized).not.toContain('Nom Sensible');
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'stockAlertsCount',
        'proceduresRequiringAttentionCount',
        'openIncidentsCount',
        'maintenanceTicketsRequiringAttentionCount',
        'pendingValidationsCount',
      ].sort(),
    );
  });
});

/**
 * Module 6 (PR 21) — GET /dashboard/trends. Same DIRECTOR/SUPERVISOR/BOARD
 * access as /overview (every field is an aggregate chart series).
 */
describe('Module 6 — GET /dashboard/trends (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let boardToken: string;
  let educatorToken: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: 'board@test.local',
        passwordHash,
        name: 'Test Board',
        initials: 'TB',
        role: 'BOARD',
        roleLabel: "Conseil d'Administration",
        title: 'Membre du Conseil',
      },
    });
    await prisma.user.create({
      data: {
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });

    directorToken = await login(users.director.email);
    boardToken = await login('board@test.local');
    educatorToken = await login('educator@test.local');
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Role matrix ────────────────────────────────────────────────────────

  it('DIRECTOR -> 200, BOARD -> 200, EDUCATOR -> 403, unauthenticated -> 401', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
    await request(app.getHttpServer()).get('/api/dashboard/trends').expect(401);
  });

  // ─── Empty database / defaults / validation ────────────────────────────

  it('returns valid empty-valued series on a completely empty database', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardTrendsResponse;

    // Default period=month → finance/donations use FinancesService's own
    // fixed rolling 6-month window (getMonthlyTrend never returns an empty
    // array — it always reports 6 months, zero-valued when there is no
    // data), donations mirrors those same 6 buckets. staffAttendance is
    // one bucket per real calendar day in the resolved month.
    expect(body.finance).toHaveLength(6);
    for (const bucket of body.finance) {
      expect(bucket.recettesXof).toBe(0);
      expect(bucket.depensesXof).toBe(0);
    }
    expect(body.donations).toHaveLength(6);
    for (const bucket of body.donations) {
      expect(bucket.amountXof).toBe(0);
      expect(bucket.count).toBe(0);
    }
    expect(body.staffAttendance.length).toBeGreaterThan(0);
    for (const bucket of body.staffAttendance) {
      expect(bucket).toEqual({
        label: bucket.label,
        present: 0,
        absent: 0,
        nonConfirmed: 0,
      });
    }
  });

  it('defaults to period=month', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect((res.body as DashboardTrendsResponse).period.type).toBe('month');
  });

  it('rejects an invalid ?period= value with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/trends?period=fortnight')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(400);
  });

  // ─── Finance trend reuses FinancesService's own logic ──────────────────

  it('finance trend (period=month) includes the current month, matching a real recette/dépense pair', async () => {
    await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        amountXof: 100_000,
        date: new Date(),
        label: 'Don test',
        status: 'VALIDE',
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'DEPENSE',
        category: 'ALIMENTATION',
        amountXof: 30_000,
        date: new Date(),
        label: 'Dépense test',
        status: 'VALIDE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends?period=month')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardTrendsResponse;

    expect(body.finance).toHaveLength(6); // rolling 6-month window
    const now = new Date();
    const currentLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentBucket = body.finance.find((b) => b.label === currentLabel);
    expect(currentBucket).toBeDefined();
    expect(currentBucket?.recettesXof).toBe(100_000);
    expect(currentBucket?.depensesXof).toBe(30_000);
  });

  it('finance trend (period=today) uses day buckets, not the monthly rolling window', async () => {
    await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        amountXof: 5_000,
        date: new Date(),
        label: 'Don du jour',
        status: 'VALIDE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends?period=today')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardTrendsResponse;

    expect(body.finance).toHaveLength(1);
    const todayLabel = new Date().toISOString().slice(0, 10);
    expect(body.finance[0]).toEqual({
      label: todayLabel,
      recettesXof: 5_000,
      depensesXof: 0,
    });
  });

  // ─── Donation trend, aligned to finance's buckets, no donor identity ───

  it('donation trend reflects real Module 5 donation data, aligned to the finance buckets', async () => {
    const category = await prisma.contactCategory.create({
      data: { key: 'DASHBOARD_TRENDS_TEST', label: 'Donateur (test)' },
    });
    const contact = await prisma.contact.create({
      data: { fullName: 'Donateur Trend Test', categoryId: category.id },
    });
    const donorProfile = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL', active: true },
    });
    const donationTransaction = await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        amountXof: 7_500,
        date: new Date(),
        label: 'Don test trend',
        status: 'VALIDE',
      },
    });
    await prisma.donation.create({
      data: {
        donorProfileId: donorProfile.id,
        amountXof: 7_500,
        date: new Date(),
        transactionId: donationTransaction.id,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends?period=month')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardTrendsResponse;

    const now = new Date();
    const currentLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentBucket = body.donations.find((b) => b.label === currentLabel);
    expect(currentBucket).toEqual({
      label: currentLabel,
      amountXof: 7_500,
      count: 1,
    });

    const serialized = JSON.stringify(body.donations);
    expect(serialized).not.toContain('Donateur Trend Test');
    expect(serialized).not.toContain('donorProfileId');
  });

  // ─── Staff attendance trend preserves listDailyPresence semantics ──────

  it('staff attendance trend (period=today) matches a real confirmed presence, one bucket per day, no staff names', async () => {
    const staffMember = await prisma.staffMember.create({
      data: { firstName: 'Trend', lastName: 'Staffer', role: 'Éducateur' },
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .post(`/api/staff/${staffMember.id}/presence`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ date: todayStr, status: 'PRESENT' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends?period=today')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardTrendsResponse;

    expect(body.staffAttendance).toEqual([
      { label: todayStr, present: 1, absent: 0, nonConfirmed: 0 },
    ]);
    const serialized = JSON.stringify(body.staffAttendance);
    expect(serialized).not.toContain('Trend');
    expect(serialized).not.toContain('Staffer');
    expect(serialized).not.toContain('staffId');
  });

  it('never includes person-level data anywhere in the trends response — top-level shape is exactly the documented four keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['period', 'finance', 'donations', 'staffAttendance'].sort(),
    );
  });
});

interface DashboardAttentionItem {
  key: string;
  domain: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  count: number;
  targetPath: string;
}

interface DashboardAttentionResponse {
  summary: { total: number; critical: number; warning: number; info: number };
  items: DashboardAttentionItem[];
}

/**
 * Module 6 (PR 22) — GET /dashboard/attention. DIRECTOR/SUPERVISOR only,
 * same narrowing as /operations.
 */
describe('Module 6 — GET /dashboard/attention (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;
  let educatorToken: string;
  let directorId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    directorId = users.director.id;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: 'board@test.local',
        passwordHash,
        name: 'Test Board',
        initials: 'TB',
        role: 'BOARD',
        roleLabel: "Conseil d'Administration",
        title: 'Membre du Conseil',
      },
    });
    await prisma.user.create({
      data: {
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });

    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);
    boardToken = await login('board@test.local');
    educatorToken = await login('educator@test.local');
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Role matrix ────────────────────────────────────────────────────────

  it('DIRECTOR -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  it('SUPERVISOR -> 200', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
  });

  it('BOARD -> 403', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  it('EDUCATOR -> 403', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
  });

  it('unauthenticated -> 401', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .expect(401);
  });

  // ─── Empty database ─────────────────────────────────────────────────────

  it('returns a zeroed summary and empty items on a completely empty database', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body as DashboardAttentionResponse).toEqual({
      summary: { total: 0, critical: 0, warning: 0, info: 0 },
      items: [],
    });
  });

  // ─── Per-domain attention, real fixtures ───────────────────────────────

  it('stock attention: reflects a real low-stock item, WARNING severity, targets the stock page', async () => {
    await prisma.stockItem.create({
      data: {
        name: 'Riz (stock bas)',
        category: 'ALIMENTAIRE',
        currentQuantity: 1,
        minimumQuantity: 10,
        isActive: true,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardAttentionResponse;

    const item = body.items.find((i) => i.key === 'stock-low');
    expect(item).toMatchObject({
      domain: 'STOCK',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/stocks-inventaire',
    });
  });

  it('maintenance attention: reflects a real open ticket, WARNING severity, targets Administration', async () => {
    const space = await prisma.space.create({
      data: { name: 'Cuisine', type: 'CUISINE' },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Robinet cassé',
        spaceId: space.id,
        urgency: 'MOYENNE',
        status: 'OUVERT',
        reportedBy: 'Test',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'maintenance-overdue',
    );
    expect(item).toMatchObject({
      domain: 'MAINTENANCE',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/administration',
    });
  });

  it('procedure attention: an already-expired procedure produces procedures-overdue (CRITICAL), an expiring-soon one produces procedures-expiring (WARNING) — both target Démarches administratives', async () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.administrativeProcedure.create({
      data: {
        title: 'Agrément (bientôt expiré)',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: soon,
      },
    });
    await prisma.administrativeProcedure.create({
      data: {
        title: 'Agrément (déjà expiré)',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: past,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardAttentionResponse;

    expect(
      body.items.find((i) => i.key === 'procedures-overdue'),
    ).toMatchObject({
      domain: 'PROCEDURES',
      severity: 'CRITICAL',
      count: 1,
      targetPath: '/app/demarches-administratives',
    });
    expect(
      body.items.find((i) => i.key === 'procedures-expiring'),
    ).toMatchObject({
      domain: 'PROCEDURES',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/demarches-administratives',
    });
  });

  it('open incidents: reflects a real non-RESOLU incident, WARNING severity, targets Incidents', async () => {
    await prisma.incident.create({
      data: {
        title: 'Fuite eau',
        type: 'LOGISTIQUE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });
    await prisma.incident.create({
      data: {
        title: 'Déjà réglé',
        type: 'LOGISTIQUE',
        signaledBy: 'Test',
        status: 'RESOLU',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'incidents-open',
    );
    expect(item).toMatchObject({
      domain: 'INCIDENTS',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/incidents',
    });
  });

  it('pending validations: reflects a real PENDING_VALIDATION request, WARNING severity, targets Validations', async () => {
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'fake-1',
        status: 'PENDING_VALIDATION',
        submittedById: directorId,
      },
    });
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'fake-2',
        status: 'APPROVED',
        submittedById: directorId,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'validations-pending',
    );
    expect(item).toMatchObject({
      domain: 'VALIDATIONS',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/validations',
    });
  });

  it('campaign ending soon: WARNING severity, targets Donateurs & Parrains', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.fundraisingCampaign.create({
      data: {
        title: 'Cagnotte bientôt finie',
        targetAmountXof: 10_000,
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: soon,
        status: 'ACTIVE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'campaigns-ending-soon',
    );
    expect(item).toMatchObject({
      domain: 'CAMPAIGNS',
      severity: 'WARNING',
      count: 1,
      targetPath: '/app/donateurs',
    });
  });

  it('campaign past end: CRITICAL severity, targets Donateurs & Parrains', async () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await prisma.fundraisingCampaign.create({
      data: {
        title: 'Cagnotte à clôturer',
        targetAmountXof: 10_000,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: past,
        status: 'ACTIVE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'campaigns-past-end',
    );
    expect(item).toMatchObject({
      domain: 'CAMPAIGNS',
      severity: 'CRITICAL',
      count: 1,
      targetPath: '/app/donateurs',
    });
  });

  it('donor reports to prepare: exact Module 5 definition (active PARRAIN, zero reports), INFO severity, targets Donateurs & Parrains', async () => {
    const category = await prisma.contactCategory.create({
      data: { key: 'DASHBOARD_ATTENTION_TEST', label: 'Donateur (test)' },
    });
    const contact = await prisma.contact.create({
      data: { fullName: 'Parrain Sans Rapport', categoryId: category.id },
    });
    await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN', active: true },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const item = (res.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'donor-reports-to-prepare',
    );
    expect(item).toMatchObject({
      domain: 'DONOR_REPORTS',
      severity: 'INFO',
      count: 1,
      targetPath: '/app/donateurs',
    });
  });

  // ─── Deterministic keys / severity / no duplicates ─────────────────────

  it('deterministic keys: every item key is one of the 9 documented constants, no duplicates', async () => {
    await prisma.stockItem.create({
      data: {
        name: 'Riz',
        category: 'ALIMENTAIRE',
        currentQuantity: 0,
        minimumQuantity: 5,
        isActive: true,
      },
    });
    await prisma.incident.create({
      data: {
        title: 'X',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DashboardAttentionResponse;

    const KNOWN_KEYS = [
      'stock-low',
      'maintenance-overdue',
      'procedures-overdue',
      'procedures-expiring',
      'incidents-open',
      'validations-pending',
      'campaigns-ending-soon',
      'campaigns-past-end',
      'donor-reports-to-prepare',
    ];
    for (const item of body.items) {
      expect(KNOWN_KEYS).toContain(item.key);
    }
    const keys = body.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('severity mapping is consistent every time the same condition is queried', async () => {
    await prisma.incident.create({
      data: {
        title: 'X',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200),
    ]);
    const item1 = (res1.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'incidents-open',
    );
    const item2 = (res2.body as DashboardAttentionResponse).items.find(
      (i) => i.key === 'incidents-open',
    );
    expect(item1?.severity).toBe('WARNING');
    expect(item2?.severity).toBe('WARNING');
  });

  // ─── Consistency with /dashboard/operations ────────────────────────────

  it('consistency: stock-low and incidents-open counts match /dashboard/operations exactly', async () => {
    await prisma.stockItem.create({
      data: {
        name: 'Riz',
        category: 'ALIMENTAIRE',
        currentQuantity: 0,
        minimumQuantity: 5,
        isActive: true,
      },
    });
    await prisma.incident.create({
      data: {
        title: 'X',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });
    await prisma.incident.create({
      data: {
        title: 'Y',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });

    const [attentionRes, operationsRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/operations')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
    ]);
    const attention = attentionRes.body as DashboardAttentionResponse;
    const operations = operationsRes.body as DashboardOperationsResponse;

    expect(attention.items.find((i) => i.key === 'stock-low')?.count ?? 0).toBe(
      operations.stockAlertsCount,
    );
    expect(
      attention.items.find((i) => i.key === 'incidents-open')?.count ?? 0,
    ).toBe(operations.openIncidentsCount);
  });

  it('consistency: procedures-overdue + procedures-expiring sums to the single /operations proceduresRequiringAttentionCount', async () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.administrativeProcedure.create({
      data: {
        title: 'A',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: soon,
      },
    });
    await prisma.administrativeProcedure.create({
      data: {
        title: 'B',
        procedureType: 'AGREMENT',
        authority: 'Ministère',
        status: 'APPROUVE',
        expirationDate: past,
      },
    });

    const [attentionRes, operationsRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/operations')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
    ]);
    const attention = attentionRes.body as DashboardAttentionResponse;
    const operations = operationsRes.body as DashboardOperationsResponse;

    const overdue =
      attention.items.find((i) => i.key === 'procedures-overdue')?.count ?? 0;
    const expiring =
      attention.items.find((i) => i.key === 'procedures-expiring')?.count ?? 0;
    expect(overdue + expiring).toBe(
      operations.proceduresRequiringAttentionCount,
    );
  });

  // PR 25 — the two remaining domains that share a single private helper
  // between getOperations() and getAttention() (see DashboardService's own
  // "shared attention-domain aggregations" doc comment) but, unlike
  // stock/incidents/procedures above, had no dedicated e2e assertion
  // cross-checking the two endpoints directly. The sharing already makes
  // divergence structurally impossible, but explicit coverage here closes
  // the audit item raised in the PR 25 spec.

  it('consistency: maintenance-overdue count matches /operations maintenanceTicketsRequiringAttentionCount exactly', async () => {
    const space = await prisma.space.create({
      data: { name: 'Buanderie', type: 'BUREAU' },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Fuite',
        spaceId: space.id,
        urgency: 'MOYENNE',
        status: 'OUVERT',
        reportedBy: 'Test',
      },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Autre fuite',
        spaceId: space.id,
        urgency: 'ELEVEE',
        status: 'EN_COURS',
        reportedBy: 'Test',
      },
    });
    // Terminal states — must not count on either endpoint.
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Réglé',
        spaceId: space.id,
        urgency: 'FAIBLE',
        status: 'RESOLU',
        reportedBy: 'Test',
      },
    });

    const [attentionRes, operationsRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/operations')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
    ]);
    const attention = attentionRes.body as DashboardAttentionResponse;
    const operations = operationsRes.body as DashboardOperationsResponse;

    const maintenanceCount =
      attention.items.find((i) => i.key === 'maintenance-overdue')?.count ?? 0;
    expect(maintenanceCount).toBe(2);
    expect(maintenanceCount).toBe(
      operations.maintenanceTicketsRequiringAttentionCount,
    );
  });

  it('consistency: validations-pending count matches /operations pendingValidationsCount exactly', async () => {
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'consistency-fake-1',
        status: 'PENDING_VALIDATION',
        submittedById: directorId,
      },
    });
    await prisma.validationRequest.create({
      data: {
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 'consistency-fake-2',
        status: 'PENDING_VALIDATION',
        submittedById: directorId,
      },
    });
    // A decided request — must not count on either endpoint.
    await prisma.validationRequest.create({
      data: {
        resourceType: 'STOCK_ITEM',
        resourceId: 'consistency-fake-3',
        status: 'REJECTED',
        submittedById: directorId,
      },
    });

    const [attentionRes, operationsRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/dashboard/attention')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/dashboard/operations')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200),
    ]);
    const attention = attentionRes.body as DashboardAttentionResponse;
    const operations = operationsRes.body as DashboardOperationsResponse;

    const validationsCount =
      attention.items.find((i) => i.key === 'validations-pending')?.count ?? 0;
    expect(validationsCount).toBe(2);
    expect(validationsCount).toBe(operations.pendingValidationsCount);
  });

  // ─── Resolved conditions disappear, no dependency on stale notifications ─

  it('resolved conditions disappear: resolving the incident makes incidents-open vanish from the response', async () => {
    const incident = await prisma.incident.create({
      data: {
        title: 'X',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });

    const before = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      (before.body as DashboardAttentionResponse).items.find(
        (i) => i.key === 'incidents-open',
      ),
    ).toBeDefined();

    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'RESOLU' },
    });

    const after = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      (after.body as DashboardAttentionResponse).items.find(
        (i) => i.key === 'incidents-open',
      ),
    ).toBeUndefined();
  });

  it('no dependency on stale/read Notification records: a resolved condition stays absent even with a matching Notification row still present', async () => {
    const incident = await prisma.incident.create({
      data: {
        title: 'X',
        type: 'AUTRE',
        signaledBy: 'Test',
        status: 'EN_COURS',
      },
    });
    // Simulate a stale notification that was never cleared, for a
    // condition that has since been resolved below.
    await prisma.notification.create({
      data: {
        recipientId: directorId,
        type: 'REGISTER_INCIDENT_UNRESOLVED',
        title: 'Incident ouvert',
        message: 'Un incident est ouvert.',
        isRead: false,
      },
    });
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'RESOLU' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      (res.body as DashboardAttentionResponse).items.find(
        (i) => i.key === 'incidents-open',
      ),
    ).toBeUndefined();
  });

  // ─── Privacy ────────────────────────────────────────────────────────────

  it('never includes PII: no child/staff/donor/contact names, phone, email, notes, or ids in the response, even with real named fixtures', async () => {
    await prisma.child.create({
      data: {
        fileNumber: 'CH-ATT-PII-001',
        firstName: 'Aminata',
        lastName: 'Traoré',
        dateOfBirth: new Date('2015-03-10'),
        placeOfBirth: 'Dakar',
        gender: 'FEMININ',
        entryDate: new Date('2022-01-01'),
        status: 'ORPHELIN_COMPLET',
        isActive: true,
      },
    });
    await prisma.staffMember.create({
      data: {
        firstName: 'Moussa',
        lastName: 'Kane',
        role: 'Éducateur',
        phone: '771234567',
        email: 'moussa.kane@example.test',
      },
    });
    const category = await prisma.contactCategory.create({
      data: { key: 'DASHBOARD_ATTENTION_PII_TEST', label: 'Donateur (test)' },
    });
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Fatoumata Cissé',
        categoryId: category.id,
        phone: '781112233',
        email: 'fatoumata.cisse@example.test',
      },
    });
    await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN', active: true },
    });
    const space = await prisma.space.create({
      data: { name: 'Cuisine', type: 'CUISINE' },
    });
    await prisma.maintenanceTicket.create({
      data: {
        title: 'Ticket sensible',
        spaceId: space.id,
        urgency: 'MOYENNE',
        status: 'OUVERT',
        reportedBy: 'Nom Sensible',
        assignedTo: 'Autre Nom',
      },
    });
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.fundraisingCampaign.create({
      data: {
        title: 'Cagnotte Confidentielle',
        targetAmountXof: 10_000,
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: soon,
        status: 'ACTIVE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/attention')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    for (const forbidden of [
      'Aminata',
      'Traoré',
      'Moussa',
      'Kane',
      'Fatoumata',
      'Cissé',
      '771234567',
      '781112233',
      'moussa.kane@example.test',
      'fatoumata.cisse@example.test',
      'Nom Sensible',
      'Autre Nom',
      'Cagnotte Confidentielle',
      'firstName',
      'lastName',
      'fullName',
      'phone',
      'email',
      'CH-ATT-PII-001',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const body = res.body as DashboardAttentionResponse;
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'count',
          'domain',
          'key',
          'message',
          'severity',
          'targetPath',
          'title',
        ].sort(),
      );
    }
  });
});
