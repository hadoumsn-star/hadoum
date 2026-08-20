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

interface DonationResponse {
  id: string;
  amountXof: number;
  date: string;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  transactionId: string;
  createdAt: string;
  donorProfile: {
    id: string;
    type: string;
    contact: { id: string; fullName: string };
  };
  campaign: { id: string; title: string; status: string } | null;
  createdBy: { id: string; name: string; initials: string; roleLabel: string };
}

interface DonationListResponse {
  data: DonationResponse[];
  total: number;
}

describe('Module 5 — Donation recording, Finance integration, and history (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let categoryId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  async function createDonor(
    fullName: string,
    type: 'PARRAIN' | 'DONATEUR_PONCTUEL' = 'DONATEUR_PONCTUEL',
  ): Promise<string> {
    const contact = await prisma.contact.create({
      data: { fullName, categoryId },
    });
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type },
    });
    return donor.id;
  }

  async function createActiveCampaign(
    title = 'Cagnotte test',
  ): Promise<string> {
    const campaign = await prisma.fundraisingCampaign.create({
      data: {
        title,
        targetAmountXof: 1_000_000,
        startDate: new Date('2026-08-01'),
        status: 'ACTIVE',
      },
    });
    return campaign.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);

    const category = await prisma.contactCategory.create({
      data: { key: 'DONATION_TEST', label: 'Donateur (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 6–11. Finance integration ──────────────────────────────────────────

  it('creates exactly one RECETTE/DON Transaction, matching the Donation amount and linked by id', async () => {
    const donorProfileId = await createDonor('Fatou Diop');

    const res = await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
      .expect(201);
    const donation = res.body as DonationResponse;

    expect(donation.transactionId).toBeTruthy();

    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    const [transaction] = transactions;
    expect(transaction.id).toBe(donation.transactionId);
    expect(transaction.type).toBe('RECETTE');
    expect(transaction.category).toBe('DON');
    expect(transaction.amountXof).toBe(15_000);
    expect(transaction.status).toBe('VALIDE');
    expect(transaction.isAnonymousDonor).toBe(false);
    expect(transaction.donorName).toBe('Fatou Diop');

    const donations = await prisma.donation.findMany();
    expect(donations).toHaveLength(1);
  });

  // ─── 16–19. Validation ───────────────────────────────────────────────────

  it('rejects a zero-amount donation', async () => {
    const donorProfileId = await createDonor('Moussa Ba');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 0, date: '2026-08-10' })
      .expect(400);
  });

  it('rejects a negative-amount donation', async () => {
    const donorProfileId = await createDonor('Awa Sarr');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: -500, date: '2026-08-10' })
      .expect(400);
  });

  it('rejects a donation for an unknown donor', async () => {
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: 'does-not-exist',
        amountXof: 5000,
        date: '2026-08-10',
      })
      .expect(404);
  });

  it('rejects a donation for an inactive donor', async () => {
    const donorProfileId = await createDonor('Cheikh Diouf');
    await request(app.getHttpServer())
      .patch(`/api/donors/${donorProfileId}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 5000, date: '2026-08-10' })
      .expect(400);
  });

  it('rejects a donation for a donor whose Contact is deactivated', async () => {
    const contact = await prisma.contact.create({
      data: { fullName: 'Ndeye Sow', categoryId },
    });
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
    });
    await request(app.getHttpServer())
      .patch(`/api/contacts/${contact.id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: donor.id,
        amountXof: 5000,
        date: '2026-08-10',
      })
      .expect(400);
  });

  it('rejects a donation for an unknown campaign', async () => {
    const donorProfileId = await createDonor('Omar Gueye');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        campaignId: 'does-not-exist',
        amountXof: 5000,
        date: '2026-08-10',
      })
      .expect(404);
  });

  it('rejects a donation to a campaign that is not ACTIVE', async () => {
    const donorProfileId = await createDonor('Khady Ndiaye');
    const campaign = await prisma.fundraisingCampaign.create({
      data: {
        title: 'Brouillon',
        targetAmountXof: 100_000,
        startDate: new Date('2026-08-01'),
        status: 'BROUILLON',
      },
    });
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        campaignId: campaign.id,
        amountXof: 5000,
        date: '2026-08-10',
      })
      .expect(400);
  });

  // ─── 15. Idempotency ─────────────────────────────────────────────────────

  it('does not create a duplicate Donation/Transaction on a retried request with the same idempotency key', async () => {
    const donorProfileId = await createDonor('Ibrahima Fall');
    const payload = {
      donorProfileId,
      amountXof: 15_000,
      date: '2026-08-10',
      idempotencyKey: 'client-generated-uuid-1',
    };

    const first = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send(payload)
        .expect(201)
    ).body as DonationResponse;

    const second = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send(payload)
        .expect(201)
    ).body as DonationResponse;

    expect(second.id).toBe(first.id);
    expect(second.transactionId).toBe(first.transactionId);
    expect(await prisma.donation.count()).toBe(1);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('lets two different idempotency keys create two separate donations', async () => {
    const donorProfileId = await createDonor('Rokhaya Diallo');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        amountXof: 10_000,
        date: '2026-08-10',
        idempotencyKey: 'key-a',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        amountXof: 10_000,
        date: '2026-08-11',
        idempotencyKey: 'key-b',
      })
      .expect(201);

    expect(await prisma.donation.count()).toBe(2);
    expect(await prisma.transaction.count()).toBe(2);
  });

  // ─── 25–26. History / filtering ──────────────────────────────────────────

  it('filters donation history by donor and by campaign through the single paginated endpoint', async () => {
    const donorA = await createDonor('Baba Sy');
    const donorB = await createDonor('Astou Faye');
    const campaignId = await createActiveCampaign();

    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId: donorA, amountXof: 5000, date: '2026-08-01' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: donorB,
        campaignId,
        amountXof: 7000,
        date: '2026-08-02',
      })
      .expect(201);

    const byDonor = (
      await request(app.getHttpServer())
        .get(`/api/donations?donorProfileId=${donorA}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonationListResponse;
    expect(byDonor.total).toBe(1);
    expect(byDonor.data[0].donorProfile.id).toBe(donorA);

    const byCampaign = (
      await request(app.getHttpServer())
        .get(`/api/donations?campaignId=${campaignId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonationListResponse;
    expect(byCampaign.total).toBe(1);
    expect(byCampaign.data[0].campaign?.id).toBe(campaignId);
  });

  it('filters donation history by date range and amount range', async () => {
    const donorProfileId = await createDonor('Seynabou Ndoye');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 5000, date: '2026-01-15' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 50_000, date: '2026-08-15' })
      .expect(201);

    const byDate = (
      await request(app.getHttpServer())
        .get('/api/donations?from=2026-08-01&to=2026-08-31')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonationListResponse;
    expect(byDate.total).toBe(1);
    expect(byDate.data[0].amountXof).toBe(50_000);

    const byAmount = (
      await request(app.getHttpServer())
        .get('/api/donations?minAmountXof=10000')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonationListResponse;
    expect(byAmount.total).toBe(1);
    expect(byAmount.data[0].amountXof).toBe(50_000);
  });

  // ─── 27–28. Mutation policy ──────────────────────────────────────────────

  it('lets DIRECTOR update notes/reference but silently ignores financial-field attempts', async () => {
    const donorProfileId = await createDonor('Lamine Diack');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
        .expect(201)
    ).body as DonationResponse;

    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/donations/${created.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          notes: 'Reçu remis en main propre',
          reference: 'REF-123',
          // None of these exist on UpdateDonationDto — whitelist:true
          // strips them before they ever reach DonationsService.
          amountXof: 999_999,
          date: '2099-01-01',
          transactionId: 'something-else',
        })
        .expect(200)
    ).body as DonationResponse;

    expect(updated.notes).toBe('Reçu remis en main propre');
    expect(updated.reference).toBe('REF-123');
    expect(updated.amountXof).toBe(15_000);
    expect(updated.transactionId).toBe(created.transactionId);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.transactionId },
    });
    expect(transaction.amountXof).toBe(15_000);
  });

  it('exposes no DELETE route for donations', async () => {
    const donorProfileId = await createDonor('Modou Sène');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ donorProfileId, amountXof: 5000, date: '2026-08-10' })
        .expect(201)
    ).body as DonationResponse;

    await request(app.getHttpServer())
      .delete(`/api/donations/${created.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404); // no route registered at all
  });

  // ─── 29–30. Finance linked-transaction protection ───────────────────────

  it('rejects an independent Finance update of a protected field on a Donation-linked Transaction', async () => {
    const donorProfileId = await createDonor('Aissatou Sy');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
        .expect(201)
    ).body as DonationResponse;

    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.transactionId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ amountXof: 1 })
      .expect(409);

    // A non-financial field (paymentMethod) is still editable directly from
    // Finances — only the fields that would desynchronize the Donation are
    // locked.
    await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.transactionId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ paymentMethod: 'CARTE' })
      .expect(200);
  });

  it('rejects independently deleting a Donation-linked Finance Transaction', async () => {
    const donorProfileId = await createDonor('Jean Dupont');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
        .expect(201)
    ).body as DonationResponse;

    await request(app.getHttpServer())
      .delete(`/api/finances/transactions/${created.transactionId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);

    expect(await prisma.transaction.count()).toBe(1);
  });

  // ─── 34. Audit ────────────────────────────────────────────────────────────

  it('writes an AuditLog entry for donation creation and metadata update', async () => {
    const donorProfileId = await createDonor('Youssou Ndour');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
        .expect(201)
    ).body as DonationResponse;

    await request(app.getHttpServer())
      .patch(`/api/donations/${created.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ notes: 'suivi' })
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { module: 'DONORS', entity: 'Donation', entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE']);

    // @Audited's `after` snapshot is the controller's own response body
    // (see AuditLogInterceptor) — for a Donation CREATE that's the same
    // curated DONATION_SELECT shape the API itself returns, which already
    // limits donor identity to id+fullName. Knowing *who* a donation was
    // for is expected audit content (same as every other @Audited module
    // in this repo); what must never appear is the deeper PII the
    // curated select itself excludes — phone/email/address/notes.
    const createLog = logs[0].after as {
      donorProfile?: { contact?: Record<string, unknown> };
    } | null;
    const auditedContact = createLog?.donorProfile?.contact ?? {};
    expect(Object.keys(auditedContact).sort()).toEqual(
      ['fullName', 'id'].sort(),
    );
    expect(auditedContact.phone).toBeUndefined();
    expect(auditedContact.email).toBeUndefined();
    expect(auditedContact.address).toBeUndefined();
  });

  // ─── 35. Privacy ──────────────────────────────────────────────────────────

  it('curates the donation response — donor identity limited to id+fullName, no unrelated fields', async () => {
    const donorProfileId = await createDonor('Privacy Test Donor');
    const res = await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 15_000, date: '2026-08-10' })
      .expect(201);
    const donation = res.body as DonationResponse;

    expect(Object.keys(donation.donorProfile.contact).sort()).toEqual(
      ['id', 'fullName'].sort(),
    );
    expect(Object.keys(donation.createdBy).sort()).toEqual(
      ['id', 'name', 'initials', 'roleLabel'].sort(),
    );
    expect(
      (donation.createdBy as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
    expect(typeof donation.transactionId).toBe('string');
  });

  it('lets SUPERVISOR view donation history for oversight, but not create one', async () => {
    const donorProfileId = await createDonor('Oversight Donor');
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 5000, date: '2026-08-10' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/donations')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ donorProfileId, amountXof: 5000, date: '2026-08-10' })
      .expect(403);
  });
});
