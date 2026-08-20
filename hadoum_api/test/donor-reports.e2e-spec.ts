import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import {
  createTestApp,
  cleanDatabase,
  getPrisma,
  getUploadService,
  seedTestUsers,
  TEST_PASSWORD,
} from './utils/test-app';
import { extractPdfText } from './utils/pdf-text';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadService } from '../src/upload/upload.service';

// Minimal valid 1x1 transparent PNG — real, decodable image bytes, small
// enough to inline here rather than shipping a fixture file.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

interface DonorReportResponse {
  id: string;
  periodType: 'MENSUEL' | 'TRIMESTRIEL';
  status: 'DRAFT' | 'GENERATED' | 'SENT';
  fileKey: string | null;
  fileMime: string | null;
  generatedAt: string | null;
  sentAt: string | null;
  financialSummarySnapshot: Record<string, unknown> | null;
  donorProfile: {
    id: string;
    type: string;
    contact: { id: string; fullName: string };
  };
  createdBy: { id: string; name: string; initials: string; roleLabel: string };
  photos: { id: string; fileKey: string; approvedForDonorReport: boolean }[];
}

describe('Module 5 — DonorReport lifecycle, PDF generation, and privacy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let uploadService: UploadService;
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

  async function createDonor(
    fullName: string,
    type: 'PARRAIN' | 'DONATEUR_PONCTUEL' = 'PARRAIN',
  ): Promise<string> {
    const contact = await prisma.contact.create({
      data: { fullName, categoryId },
    });
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type },
    });
    return donor.id;
  }

  async function createReport(
    donorProfileId: string,
    overrides: Partial<{
      periodType: string;
      periodStart: string;
      periodEnd: string;
    }> = {},
  ): Promise<DonorReportResponse> {
    const res = await request(app.getHttpServer())
      .post('/api/donor-reports')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        periodType: 'TRIMESTRIEL',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        ...overrides,
      })
      .expect(201);
    return res.body as DonorReportResponse;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    uploadService = getUploadService(app);
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
      data: { key: 'REPORT_TEST', label: 'Parrain (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 6–9. Creation / period-type / duplicate protection ────────────────

  it('lets DIRECTOR create a MENSUEL report for a PARRAIN', async () => {
    const donorProfileId = await createDonor('Fatou Diop');
    const report = await createReport(donorProfileId, {
      periodType: 'MENSUEL',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    expect(report.periodType).toBe('MENSUEL');
    expect(report.status).toBe('DRAFT');
  });

  it('lets DIRECTOR create a TRIMESTRIEL report for a PARRAIN', async () => {
    const donorProfileId = await createDonor('Moussa Ba');
    const report = await createReport(donorProfileId);
    expect(report.periodType).toBe('TRIMESTRIEL');
  });

  it('rejects a periodic report for a DONATEUR_PONCTUEL', async () => {
    const donorProfileId = await createDonor('Awa Sarr', 'DONATEUR_PONCTUEL');
    await request(app.getHttpServer())
      .post('/api/donor-reports')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        periodType: 'TRIMESTRIEL',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      })
      .expect(400);
  });

  it('prevents a duplicate report for the same donor/type/period', async () => {
    const donorProfileId = await createDonor('Cheikh Diouf');
    await createReport(donorProfileId);
    await request(app.getHttpServer())
      .post('/api/donor-reports')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        periodType: 'TRIMESTRIEL',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      })
      .expect(409);
  });

  // ─── 10–14. PDF generation / storage / content ──────────────────────────

  it('generates a PDF, stores it through UploadService, and references it from the report', async () => {
    const donorProfileId = await createDonor('Ndeye Sow');
    const report = await createReport(donorProfileId);

    const generated = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/generate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          activitiesNarrative: 'Trimestre calme, aucune sortie majeure.',
        })
        .expect(201)
    ).body as DonorReportResponse;

    expect(generated.status).toBe('GENERATED');
    expect(generated.fileKey).toBeTruthy();
    expect(generated.fileMime).toBe('application/pdf');
    expect(generated.financialSummarySnapshot).not.toBeNull();

    const bytes = await uploadService.downloadFile(generated.fileKey as string);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const { text } = extractPdfText(bytes);
    expect(text).toContain('Ndeye Sow');
    expect(text).toContain('Trimestre calme');
    expect(text).toMatch(/2026/);
  });

  it('includes a safe financial summary in the generated PDF', async () => {
    const donorProfileId = await createDonor('Khady Ndiaye');
    // A real donation in the report period, so the financial summary has
    // a non-zero figure to render and check for.
    await request(app.getHttpServer())
      .post('/api/donations')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ donorProfileId, amountXof: 37_000, date: '2026-02-15' })
      .expect(201);

    const report = await createReport(donorProfileId);
    const generated = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/generate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({})
        .expect(201)
    ).body as DonorReportResponse;

    const bytes = await uploadService.downloadFile(generated.fileKey as string);
    const { text } = extractPdfText(bytes);
    expect(text).toContain('37 000');

    const snapshot = generated.financialSummarySnapshot as {
      donorContributionXof: number;
    };
    expect(snapshot.donorContributionXof).toBe(37_000);
  });

  // ─── 15–18. Child privacy ────────────────────────────────────────────────

  it('never includes child names, file numbers, or DOB/medical/school PII in the generated PDF, while still reflecting accurate aggregate counts', async () => {
    const secretFirstName = 'Zzyxwvvu';
    const secretLastName = 'ConfidentialChildLastName';
    const secretFileNumber = 'CHILD-SECRET-0001';
    const child = await prisma.child.create({
      data: {
        fileNumber: secretFileNumber,
        firstName: secretFirstName,
        lastName: secretLastName,
        dateOfBirth: new Date('2015-06-15'),
        placeOfBirth: 'Dakar',
        gender: 'FEMININ',
        entryDate: new Date('2026-02-01'), // inside the report period
        status: 'ORPHELIN_COMPLET',
        isActive: true,
      },
    });
    await prisma.medicalRecord.create({
      data: {
        childId: child.id,
        bloodType: 'O+',
        allergies: 'Pénicilline (secret)',
      },
    });

    const donorProfileId = await createDonor('Aissatou Sy');
    const report = await createReport(donorProfileId);
    const generated = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/generate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({})
        .expect(201)
    ).body as DonorReportResponse;

    const bytes = await uploadService.downloadFile(generated.fileKey as string);
    const { text } = extractPdfText(bytes);

    expect(text).not.toContain(secretFirstName);
    expect(text).not.toContain(secretLastName);
    expect(text).not.toContain(secretFileNumber);
    expect(text).not.toContain('2015'); // date of birth year
    expect(text).not.toContain('Pénicilline');
    expect(text).not.toContain(child.id); // internal Child id

    // The aggregate the report *is* allowed to show still reflects this
    // child correctly — "1 entry this period" — proving the exclusion is
    // deliberate anonymization, not accidental data loss.
    expect(text).toContain('Nouvelles arrivées sur la période : 1');
  });

  // ─── 19. Failed generation leaves no falsely-GENERATED report ──────────

  it('does not mark a report GENERATED if PDF assembly fails', async () => {
    const donorProfileId = await createDonor('Seynabou Ndoye');
    const report = await createReport(donorProfileId);

    // A photo row pointing at a fileKey that was never actually uploaded —
    // constructed directly against the DB (not through the upload API) to
    // deterministically force PdfReportService.render's photo-embedding
    // step to fail.
    await prisma.donorReportPhoto.create({
      data: {
        donorReportId: report.id,
        fileKey: 'donor-reports/does-not-exist.png',
        fileMime: 'image/png',
        approvedForDonorReport: true,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/generate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(500);

    const stillDraft = await prisma.donorReport.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(stillDraft.status).toBe('DRAFT');
    expect(stillDraft.fileKey).toBeNull();
  });

  // ─── 20–21. Mark sent → communication ──────────────────────────────────

  it('creates a REPORT_SENT communication when a report is marked sent, and blocks a duplicate mark-sent', async () => {
    const donorProfileId = await createDonor('Lamine Diack');
    const report = await createReport(donorProfileId);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/generate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const sent = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/mark-sent`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(201)
    ).body as DonorReportResponse;
    expect(sent.status).toBe('SENT');
    expect(sent.sentAt).toBeTruthy();

    const communications = await prisma.donorCommunication.findMany({
      where: { donorReportId: report.id },
    });
    expect(communications).toHaveLength(1);
    expect(communications[0].type).toBe('REPORT_SENT');
    expect(communications[0].donorProfileId).toBe(donorProfileId);

    // A repeated mark-sent must not create a second communication.
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/mark-sent`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);
    const communicationsAfterRetry = await prisma.donorCommunication.findMany({
      where: { donorReportId: report.id },
    });
    expect(communicationsAfterRetry).toHaveLength(1);
  });

  it('rejects marking a DRAFT report as sent (no PDF yet)', async () => {
    const donorProfileId = await createDonor('Baba Sy');
    const report = await createReport(donorProfileId);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/mark-sent`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);
  });

  // ─── 26–29. Report photos ─────────────────────────────────────────────

  it('uploads a report photo, excludes it from the PDF until approved, then includes it once approved', async () => {
    const donorProfileId = await createDonor('Astou Faye');
    const report = await createReport(donorProfileId);

    const photoRes = await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/photos`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', ONE_PIXEL_PNG, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .field('caption', 'Journée sportive')
      .expect(201);
    const photo = photoRes.body as {
      id: string;
      approvedForDonorReport: boolean;
    };
    expect(photo.approvedForDonorReport).toBe(false);

    // Not approved yet — generates a 1-page PDF (no "Photo" section).
    const unapproved = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/generate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({})
        .expect(201)
    ).body as DonorReportResponse;
    const unapprovedBytes = await uploadService.downloadFile(
      unapproved.fileKey as string,
    );
    const { pageCount: pageCountBefore, text: textBefore } =
      extractPdfText(unapprovedBytes);
    expect(pageCountBefore).toBe(1);
    expect(textBefore).not.toContain('Journée sportive');

    await request(app.getHttpServer())
      .patch(`/api/donor-reports/${report.id}/photos/${photo.id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const approved = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${report.id}/generate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({})
        .expect(201)
    ).body as DonorReportResponse;
    const approvedBytes = await uploadService.downloadFile(
      approved.fileKey as string,
    );
    const { pageCount: pageCountAfter, text: textAfter } =
      extractPdfText(approvedBytes);
    expect(pageCountAfter).toBe(2);
    expect(textAfter).toContain('Journée sportive');
  });

  it('rejects a non-image file for a report photo', async () => {
    const donorProfileId = await createDonor('Rokhaya Diallo');
    const report = await createReport(donorProfileId);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/photos`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  // ─── Role matrix ──────────────────────────────────────────────────────

  it('lets SUPERVISOR read reports but not create/generate/send/upload photos', async () => {
    const donorProfileId = await createDonor('Ibrahima Fall');
    const report = await createReport(donorProfileId);

    await request(app.getHttpServer())
      .get('/api/donor-reports')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/donor-reports/${report.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/donor-reports')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        donorProfileId,
        periodType: 'MENSUEL',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/generate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/photos`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('file', ONE_PIXEL_PNG, {
        filename: 'x.png',
        contentType: 'image/png',
      })
      .expect(403);
  });

  it('denies BOARD any access to detailed reports', async () => {
    const donorProfileId = await createDonor('Modou Sène');
    const report = await createReport(donorProfileId);
    await request(app.getHttpServer())
      .get('/api/donor-reports')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/donor-reports/${report.id}`)
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  // ─── 30–31. Audit / privacy ─────────────────────────────────────────────

  it('writes audit entries for create/generate/mark-sent and curates the response', async () => {
    const donorProfileId = await createDonor('Audit Test Parrain');
    const report = await createReport(donorProfileId);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/generate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${report.id}/mark-sent`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);

    const logs = await prisma.auditLog.findMany({
      where: { module: 'DONORS', entity: 'DonorReport', entityId: report.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'CREATE',
      'GENERATE',
      'MARK_SENT',
    ]);

    const fresh = (
      await request(app.getHttpServer())
        .get(`/api/donor-reports/${report.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonorReportResponse;
    expect(Object.keys(fresh.donorProfile.contact).sort()).toEqual(
      ['id', 'fullName'].sort(),
    );
    expect(
      (fresh.createdBy as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
  });

  // ─── PR 19: lazy compute-on-read "report to prepare" alert ──────────────

  interface NotificationResponse {
    type: string;
    resourceType: string | null;
    resourceId: string | null;
    message: string;
  }

  it('notifies DIRECTOR once that an active PARRAIN with zero reports needs one prepared, and never for a DONATEUR_PONCTUEL or an inactive PARRAIN', async () => {
    const neverReported = await createDonor('Parrain Sans Rapport');
    await createDonor('Donateur Ponctuel Sans Rapport', 'DONATEUR_PONCTUEL');
    const inactiveParrainContact = await prisma.contact.create({
      data: { fullName: 'Parrain Inactif Sans Rapport', categoryId },
    });
    await prisma.donorProfile.create({
      data: {
        contactId: inactiveParrainContact.id,
        type: 'PARRAIN',
        active: false,
      },
    });

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/donor-reports')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
    }

    const notifications = (
      await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as NotificationResponse[];
    const missing = notifications.filter(
      (n) => n.type === 'DONOR_REPORT_MISSING',
    );
    expect(missing).toHaveLength(1); // exactly one, despite 3 reads
    expect(missing[0].resourceId).toBe(neverReported);
    expect(missing[0].message).toContain('Parrain Sans Rapport');
  });

  it('does not alert for a PARRAIN who already has at least one report', async () => {
    const donorProfileId = await createDonor('Parrain Avec Rapport');
    await createReport(donorProfileId);

    await request(app.getHttpServer())
      .get('/api/donor-reports')
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
          n.type === 'DONOR_REPORT_MISSING' && n.resourceId === donorProfileId,
      ),
    ).toHaveLength(0);
  });
});
