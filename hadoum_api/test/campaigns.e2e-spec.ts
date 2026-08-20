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

interface CampaignResponse {
  id: string;
  title: string;
  description: string | null;
  targetAmountXof: number;
  startDate: string;
  endDate: string | null;
  status: 'BROUILLON' | 'ACTIVE' | 'TERMINEE' | 'ANNULEE';
  utilizationReport: string | null;
  collectedAmountXof: number;
  remainingAmountXof: number;
  progressPercentage: number | null;
  donationsCount: number;
}

interface CampaignListResponse {
  data: CampaignResponse[];
  total: number;
}

describe('Module 5 — FundraisingCampaign CRUD, lifecycle, and aggregates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;
  let categoryId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  async function createDonor(fullName: string): Promise<string> {
    const contact = await prisma.contact.create({
      data: { fullName, categoryId },
    });
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
    });
    return donor.id;
  }

  async function createCampaign(
    overrides: Partial<{
      title: string;
      targetAmountXof: number;
      startDate: string;
    }> = {},
  ): Promise<CampaignResponse> {
    const res = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: 'Rentrée scolaire 2026',
        targetAmountXof: 500_000,
        startDate: '2026-08-01',
        ...overrides,
      })
      .expect(201);
    return res.body as CampaignResponse;
  }

  async function recordDonation(
    donorProfileId: string,
    campaignId: string,
    amountXof: number,
  ) {
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, campaignId, amountXof, date: '2026-08-05' })
      .expect(201);
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

    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);
    boardToken = await login('board@test.local');

    const category = await prisma.contactCategory.create({
      data: { key: 'CAMPAIGN_TEST', label: 'Donateur (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. DIRECTOR creates a campaign ─────────────────────────────────────

  it('lets DIRECTOR create a campaign, starting BROUILLON with zero collected', async () => {
    const campaign = await createCampaign();
    expect(campaign.status).toBe('BROUILLON');
    expect(campaign.collectedAmountXof).toBe(0);
    expect(campaign.remainingAmountXof).toBe(500_000);
    expect(campaign.progressPercentage).toBe(0);
    expect(campaign.donationsCount).toBe(0);
  });

  // ─── 2–3. Role matrix ────────────────────────────────────────────────────

  it('lets SUPERVISOR view campaigns but not mutate them', async () => {
    const campaign = await createCampaign();

    await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ title: 'x', targetAmountXof: 1000, startDate: '2026-08-01' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ title: 'y' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('denies BOARD any detailed campaign administration access', async () => {
    const campaign = await createCampaign();
    await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  // ─── 4–5. Lifecycle ──────────────────────────────────────────────────────

  it('walks a campaign through its full lifecycle: BROUILLON → ACTIVE → TERMINEE', async () => {
    const campaign = await createCampaign();

    const activated = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaign.id}/activate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(201)
    ).body as CampaignResponse;
    expect(activated.status).toBe('ACTIVE');

    const terminated = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaign.id}/terminate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(201)
    ).body as CampaignResponse;
    expect(terminated.status).toBe('TERMINEE');
  });

  it('lets a BROUILLON campaign be cancelled directly', async () => {
    const campaign = await createCampaign();
    const cancelled = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaign.id}/cancel`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(201)
    ).body as CampaignResponse;
    expect(cancelled.status).toBe('ANNULEE');
  });

  it('rejects invalid lifecycle transitions', async () => {
    const campaign = await createCampaign();

    // BROUILLON cannot terminate directly (must go through ACTIVE first).
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/terminate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/terminate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    // TERMINEE is terminal — no further transition is allowed.
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/cancel`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);
  });

  // ─── 22–24. Aggregate calculation ───────────────────────────────────────

  it('derives collectedAmountXof/remainingAmountXof/progressPercentage from actual donations', async () => {
    const campaign = await createCampaign({ targetAmountXof: 100_000 });
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const donorA = await createDonor('Donateur A');
    const donorB = await createDonor('Donateur B');
    await recordDonation(donorA, campaign.id, 30_000);
    await recordDonation(donorB, campaign.id, 20_000);

    const res = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const updated = res.body as CampaignResponse;

    expect(updated.collectedAmountXof).toBe(50_000);
    expect(updated.remainingAmountXof).toBe(50_000);
    expect(updated.progressPercentage).toBe(50);
    expect(updated.donationsCount).toBe(2);
  });

  it('clamps remainingAmountXof at 0 when a campaign is overfunded, without capping progressPercentage', async () => {
    const campaign = await createCampaign({ targetAmountXof: 10_000 });
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);
    const donor = await createDonor('Généreux Donateur');
    await recordDonation(donor, campaign.id, 15_000);

    const res = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const updated = res.body as CampaignResponse;

    expect(updated.collectedAmountXof).toBe(15_000);
    expect(updated.remainingAmountXof).toBe(0);
    expect(updated.progressPercentage).toBe(150);
  });

  it("handles a zero-collected campaign's progress list computation safely", async () => {
    await createCampaign({ title: 'Cagnotte A', targetAmountXof: 20_000 });
    await createCampaign({ title: 'Cagnotte B', targetAmountXof: 40_000 });

    const res = await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const list = res.body as CampaignListResponse;

    expect(list.total).toBe(2);
    expect(list.data.every((c) => c.collectedAmountXof === 0)).toBe(true);
    expect(list.data.every((c) => c.progressPercentage === 0)).toBe(true);
  });

  // ─── PR 19: lazy compute-on-read "ending soon" / "end date passed" alerts ──

  const DAY_MS = 24 * 60 * 60 * 1000;
  const isoDate = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

  interface NotificationResponse {
    type: string;
    resourceType: string | null;
    resourceId: string | null;
    title: string;
    message: string;
  }

  async function createAndActivateCampaign(
    title: string,
    endDate: string,
  ): Promise<CampaignResponse> {
    const campaign = await createCampaign({ title, startDate: isoDate(-30) });
    await request(app.getHttpServer())
      .patch(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ endDate })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/activate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);
    return campaign;
  }

  it('flags an ACTIVE campaign ending within 7 days as isEndingSoon, and notifies DIRECTOR exactly once even after repeated reads', async () => {
    const campaign = await createAndActivateCampaign(
      'Cagnotte Bientôt Finie',
      isoDate(3),
    );

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
    }

    const list = (
      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CampaignResponse & {
      isEndingSoon: boolean;
      isEndDatePassed: boolean;
    };
    expect(list.isEndingSoon).toBe(true);
    expect(list.isEndDatePassed).toBe(false);

    const notifications = (
      await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as NotificationResponse[];
    const matching = notifications.filter(
      (n) => n.type === 'CAMPAIGN_ENDING_SOON' && n.resourceId === campaign.id,
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].message).toContain('Cagnotte Bientôt Finie');
  });

  it('flags an ACTIVE campaign whose end date has passed as isEndDatePassed, notifies DIRECTOR once, and never mutates its status', async () => {
    const campaign = await createAndActivateCampaign(
      'Cagnotte Dépassée',
      isoDate(-5),
    );

    const detail = (
      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CampaignResponse & {
      isEndingSoon: boolean;
      isEndDatePassed: boolean;
    };
    expect(detail.isEndDatePassed).toBe(true);
    expect(detail.isEndingSoon).toBe(false);
    // Never auto-mutated — still ACTIVE, only a DIRECTOR terminate/cancel
    // call (existing lifecycle endpoints) changes this.
    expect(detail.status).toBe('ACTIVE');

    // Notifying is wired to the list endpoint only, same convention as
    // StockItemsService's own notifyStockAlertsOnce (findAll(), not
    // findOne()) — the detail GET above intentionally doesn't trigger it.
    await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const notifications = (
      await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as NotificationResponse[];
    expect(
      notifications.filter(
        (n) =>
          n.type === 'CAMPAIGN_END_DATE_PASSED' && n.resourceId === campaign.id,
      ),
    ).toHaveLength(1);
  });

  it('never flags a BROUILLON/TERMINEE/ANNULEE campaign as ending soon or overdue, even with a past end date', async () => {
    const campaign = await createCampaign({ title: 'Cagnotte Jamais Activée' });
    await request(app.getHttpServer())
      .patch(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ endDate: isoDate(-10) })
      .expect(200);

    const detail = (
      await request(app.getHttpServer())
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CampaignResponse & {
      isEndingSoon: boolean;
      isEndDatePassed: boolean;
    };
    expect(detail.isEndingSoon).toBe(false);
    expect(detail.isEndDatePassed).toBe(false);
  });
});
