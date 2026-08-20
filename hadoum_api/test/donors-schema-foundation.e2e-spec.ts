import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AuditModule } from '@prisma/client';
import { createTestApp, cleanDatabase, getPrisma } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { DonorsService } from '../src/donors/donors.service';

// PR 14 — Module 5 foundation has no controller/HTTP routes yet (see
// DonorsModule's own doc comment), so this isn't a supertest/HTTP e2e spec
// like the rest of test/*.e2e-spec.ts. It instead boots the real AppModule
// (proving DonorsModule wires into the application cleanly) and exercises
// the new Prisma models/constraints directly against the real, disposable
// `hadoum_test` database — the closest thing to "e2e" available for a
// schema-only PR with no business logic to call through HTTP yet.
describe('Module 5 donors schema foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const category = await prisma.contactCategory.create({
      data: { key: 'PARRAIN_TEST', label: 'Parrain (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createContact(fullName: string) {
    return prisma.contact.create({
      data: { fullName, categoryId },
    });
  }

  it('resolves DonorsService from the application container (module wiring)', () => {
    expect(app.get(DonorsService)).toBeInstanceOf(DonorsService);
  });

  it('exposes DONORS on the existing AuditModule enum', () => {
    expect(Object.values(AuditModule)).toContain('DONORS');
  });

  it('creates a PARRAIN DonorProfile linked to a Contact', async () => {
    const contact = await createContact('Fatou Diop');

    const donor = await prisma.donorProfile.create({
      data: {
        contactId: contact.id,
        type: 'PARRAIN',
        engagementStartDate: new Date('2026-01-01'),
        monthlyContributionXof: 15_000,
      },
    });

    expect(donor.contactId).toBe(contact.id);
    expect(donor.type).toBe('PARRAIN');
    expect(donor.active).toBe(true); // @default(true)
    expect(donor.monthlyContributionXof).toBe(15_000);
  });

  it('creates a DONATEUR_PONCTUEL DonorProfile without recurring-commitment fields', async () => {
    const contact = await createContact('Moussa Ba');

    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
    });

    expect(donor.engagementStartDate).toBeNull();
    expect(donor.monthlyContributionXof).toBeNull();
  });

  it('enforces at most one DonorProfile per Contact', async () => {
    const contact = await createContact('Awa Sarr');
    await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });

    await expect(
      prisma.donorProfile.create({
        data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a Donation pointing at a non-existent DonorProfile (FK integrity)', async () => {
    await expect(
      prisma.donation.create({
        data: {
          donorProfileId: 'does-not-exist',
          amountXof: 5_000,
          date: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a Donation linked to a DonorProfile, with no campaign and no Finance link yet', async () => {
    const contact = await createContact('Ibrahima Fall');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });

    const donation = await prisma.donation.create({
      data: { donorProfileId: donor.id, amountXof: 15_000, date: new Date() },
    });

    expect(donation.campaignId).toBeNull();
    expect(donation.transactionId).toBeNull(); // PR 16 sets this, not this PR
  });

  it('links a Donation to a FundraisingCampaign', async () => {
    const contact = await createContact('Khady Ndiaye');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
    });
    const campaign = await prisma.fundraisingCampaign.create({
      data: {
        title: 'Rentrée scolaire 2026',
        targetAmountXof: 500_000,
        startDate: new Date('2026-08-01'),
        status: 'ACTIVE',
      },
    });

    const donation = await prisma.donation.create({
      data: {
        donorProfileId: donor.id,
        campaignId: campaign.id,
        amountXof: 25_000,
        date: new Date(),
      },
    });

    expect(donation.campaignId).toBe(campaign.id);
  });

  it('allows at most one Donation per Transaction (transactionId is unique)', async () => {
    const contact = await createContact('Cheikh Diouf');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });
    // A real ledger row, created directly here only to exercise the FK/
    // uniqueness constraint — PR 16 is what actually creates this via
    // FinancesService, never this PR.
    const transaction = await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        label: 'Don test',
        amountXof: 15_000,
        date: new Date(),
      },
    });

    await prisma.donation.create({
      data: {
        donorProfileId: donor.id,
        amountXof: 15_000,
        date: new Date(),
        transactionId: transaction.id,
      },
    });

    await expect(
      prisma.donation.create({
        data: {
          donorProfileId: donor.id,
          amountXof: 15_000,
          date: new Date(),
          transactionId: transaction.id, // same Transaction, second Donation
        },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting a DonorProfile that still has Donation history (Restrict)', async () => {
    const contact = await createContact('Ndeye Sow');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });
    await prisma.donation.create({
      data: { donorProfileId: donor.id, amountXof: 10_000, date: new Date() },
    });

    await expect(
      prisma.donorProfile.delete({ where: { id: donor.id } }),
    ).rejects.toThrow();
  });

  it('cascades DonorCommunication and DonorReport when their DonorProfile is deleted', async () => {
    const contact = await createContact('Omar Gueye');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });
    const communication = await prisma.donorCommunication.create({
      data: {
        donorProfileId: donor.id,
        type: 'MESSAGE_SENT',
        direction: 'OUTGOING',
        date: new Date(),
        subject: 'Merci pour votre soutien',
      },
    });
    const report = await prisma.donorReport.create({
      data: {
        donorProfileId: donor.id,
        periodType: 'TRIMESTRIEL',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-03-31'),
      },
    });

    // No Donation on this profile, so DonorProfile's own delete isn't
    // blocked by Donation's Restrict rule (see the previous test) — only
    // Cascade relations are in play here.
    await prisma.donorProfile.delete({ where: { id: donor.id } });

    expect(
      await prisma.donorCommunication.findUnique({
        where: { id: communication.id },
      }),
    ).toBeNull();
    expect(
      await prisma.donorReport.findUnique({ where: { id: report.id } }),
    ).toBeNull();
  });

  it('cascades DonorReportPhoto when its DonorReport is deleted, and never stores binary image data', async () => {
    const contact = await createContact('Rokhaya Diallo');
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'PARRAIN' },
    });
    const report = await prisma.donorReport.create({
      data: {
        donorProfileId: donor.id,
        periodType: 'MENSUEL',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-30'),
      },
    });
    const photo = await prisma.donorReportPhoto.create({
      data: {
        donorReportId: report.id,
        // Only ever an S3 key/mime pair — see the model's own comment.
        fileKey: 'donor-reports/fake-key.jpg',
        fileMime: 'image/jpeg',
      },
    });

    await prisma.donorReport.delete({ where: { id: report.id } });

    expect(
      await prisma.donorReportPhoto.findUnique({ where: { id: photo.id } }),
    ).toBeNull();
  });
});
