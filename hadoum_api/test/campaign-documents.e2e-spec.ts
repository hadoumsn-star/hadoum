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

interface CampaignDocumentResponse {
  id: string;
  campaignId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
}

describe('Module 5 — CampaignDocument upload/list/access/delete (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  async function createCampaign(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: 'Cagnotte avec documents',
        targetAmountXof: 100_000,
        startDate: '2026-08-01',
      })
      .expect(201);
    return (res.body as { id: string }).id;
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
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 22. Upload ─────────────────────────────────────────────────────────

  it('lets DIRECTOR upload a campaign document', async () => {
    const campaignId = await createCampaign();
    const res = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('%PDF-fake'), {
        filename: 'budget.pdf',
        contentType: 'application/pdf',
      })
      .field('label', 'Budget prévisionnel')
      .expect(201);

    const doc = res.body as CampaignDocumentResponse;
    expect(doc.campaignId).toBe(campaignId);
    expect(doc.label).toBe('Budget prévisionnel');
    expect(doc.fileMime).toBe('application/pdf');
  });

  // ─── 23–25. Role matrix ───────────────────────────────────────────────

  it('lets SUPERVISOR view campaign documents', async () => {
    const campaignId = await createCampaign();
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('%PDF-fake'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    expect(res.body as CampaignDocumentResponse[]).toHaveLength(1);
  });

  it('does not let SUPERVISOR upload or delete campaign documents', async () => {
    const campaignId = await createCampaign();
    const uploaded = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaignId}/documents`)
        .set('Authorization', `Bearer ${directorToken}`)
        .attach('file', Buffer.from('%PDF-fake'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body as CampaignDocumentResponse;

    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('file', Buffer.from('%PDF-fake'), {
        filename: 'y.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/campaigns/${campaignId}/documents/${uploaded.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('denies BOARD any campaign document access', async () => {
    const campaignId = await createCampaign();
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${boardToken}`)
      .attach('file', Buffer.from('%PDF-fake'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
  });

  // ─── Download / delete / audit ────────────────────────────────────────

  it('provides a presigned URL and lets DIRECTOR delete a document', async () => {
    const campaignId = await createCampaign();
    const uploaded = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaignId}/documents`)
        .set('Authorization', `Bearer ${directorToken}`)
        .attach('file', Buffer.from('%PDF-fake'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body as CampaignDocumentResponse;

    const urlRes = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaignId}/documents/${uploaded.id}/url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect((urlRes.body as { url: string }).url).toContain(uploaded.fileKey);

    await request(app.getHttpServer())
      .delete(`/api/campaigns/${campaignId}/documents/${uploaded.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const listAfter = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(listAfter.body as CampaignDocumentResponse[]).toHaveLength(0);

    const logs = await prisma.auditLog.findMany({
      where: { module: 'DONORS', entity: 'CampaignDocument' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'DELETE']);
  });

  it('respects the existing 10MB file size limit', async () => {
    const campaignId = await createCampaign();
    const tooBig = Buffer.alloc(11 * 1024 * 1024, 'x');
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', tooBig, {
        filename: 'huge.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
  });
});
