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

interface CommunicationResponse {
  id: string;
  type: string;
  direction: string | null;
  date: string;
  subject: string;
  content: string | null;
  donorReportId: string | null;
  donorProfile: {
    id: string;
    type: string;
    contact: { id: string; fullName: string };
  };
  createdBy: { id: string; name: string; initials: string; roleLabel: string };
}

interface CommunicationListResponse {
  data: CommunicationResponse[];
  total: number;
}

describe('Module 5 — DonorCommunication history (e2e)', () => {
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
      data: { contactId: contact.id, type: 'PARRAIN' },
    });
    return donor.id;
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
      data: { key: 'COMM_TEST', label: 'Donateur (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. DIRECTOR creates ──────────────────────────────────────────────

  it('lets DIRECTOR create a communication entry', async () => {
    const donorProfileId = await createDonor('Fatou Diop');
    const res = await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        type: 'MESSAGE_SENT',
        direction: 'OUTGOING',
        date: '2026-08-10',
        subject: 'Merci pour votre soutien',
        content: 'Message de remerciement envoyé par email.',
      })
      .expect(201);

    const body = res.body as CommunicationResponse;
    expect(body.type).toBe('MESSAGE_SENT');
    expect(body.direction).toBe('OUTGOING');
    expect(body.donorProfile.contact.fullName).toBe('Fatou Diop');
  });

  it('accepts every DonorCommunicationType', async () => {
    const donorProfileId = await createDonor('Moussa Ba');
    for (const type of [
      'REPORT_SENT',
      'MESSAGE_SENT',
      'MESSAGE_RECEIVED',
      'ACKNOWLEDGEMENT',
    ]) {
      await request(app.getHttpServer())
        .post('/api/communications')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          donorProfileId,
          type,
          date: '2026-08-10',
          subject: `Test ${type}`,
        })
        .expect(201);
    }
  });

  // ─── 2–3. Role matrix ─────────────────────────────────────────────────

  it('lets SUPERVISOR read but not mutate communications', async () => {
    const donorProfileId = await createDonor('Awa Sarr');
    const created = (
      await request(app.getHttpServer())
        .post('/api/communications')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          donorProfileId,
          type: 'MESSAGE_SENT',
          date: '2026-08-10',
          subject: 'x',
        })
        .expect(201)
    ).body as CommunicationResponse;

    await request(app.getHttpServer())
      .get('/api/communications')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/communications/${created.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        donorProfileId,
        type: 'MESSAGE_SENT',
        date: '2026-08-10',
        subject: 'x',
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/communications/${created.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ subject: 'y' })
      .expect(403);
  });

  it('denies BOARD any access to detailed communications', async () => {
    await request(app.getHttpServer())
      .get('/api/communications')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  // ─── 4. Filtering ─────────────────────────────────────────────────────

  it('filters by donorProfileId, type, direction, and date range', async () => {
    const donorA = await createDonor('Cheikh Diouf');
    const donorB = await createDonor('Ndeye Sow');
    await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: donorA,
        type: 'MESSAGE_SENT',
        direction: 'OUTGOING',
        date: '2026-01-15',
        subject: 'A - janvier',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: donorA,
        type: 'MESSAGE_RECEIVED',
        direction: 'INCOMING',
        date: '2026-08-15',
        subject: 'A - août',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId: donorB,
        type: 'MESSAGE_SENT',
        date: '2026-08-16',
        subject: 'B - août',
      })
      .expect(201);

    const byDonor = (
      await request(app.getHttpServer())
        .get(`/api/communications?donorProfileId=${donorA}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CommunicationListResponse;
    expect(byDonor.total).toBe(2);

    const byType = (
      await request(app.getHttpServer())
        .get('/api/communications?type=MESSAGE_RECEIVED')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CommunicationListResponse;
    expect(byType.total).toBe(1);
    expect(byType.data[0].subject).toBe('A - août');

    const byDirection = (
      await request(app.getHttpServer())
        .get('/api/communications?direction=INCOMING')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CommunicationListResponse;
    expect(byDirection.total).toBe(1);

    const byDate = (
      await request(app.getHttpServer())
        .get('/api/communications?from=2026-08-01&to=2026-08-31')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as CommunicationListResponse;
    expect(byDate.total).toBe(2);
  });

  // ─── 5. No hard delete ────────────────────────────────────────────────

  it('exposes no DELETE route for communications', async () => {
    const donorProfileId = await createDonor('Omar Gueye');
    const created = (
      await request(app.getHttpServer())
        .post('/api/communications')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          donorProfileId,
          type: 'MESSAGE_SENT',
          date: '2026-08-10',
          subject: 'x',
        })
        .expect(201)
    ).body as CommunicationResponse;

    await request(app.getHttpServer())
      .delete(`/api/communications/${created.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404);
  });

  // ─── Metadata update ──────────────────────────────────────────────────

  it('lets DIRECTOR update subject/content but keeps type/date/donor immutable', async () => {
    const donorProfileId = await createDonor('Khady Ndiaye');
    const created = (
      await request(app.getHttpServer())
        .post('/api/communications')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          donorProfileId,
          type: 'MESSAGE_SENT',
          date: '2026-08-10',
          subject: 'Original',
        })
        .expect(201)
    ).body as CommunicationResponse;

    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/communications/${created.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          subject: 'Corrigé',
          content: 'Précision ajoutée',
          type: 'ACKNOWLEDGEMENT',
          date: '2099-01-01',
        })
        .expect(200)
    ).body as CommunicationResponse;

    expect(updated.subject).toBe('Corrigé');
    expect(updated.content).toBe('Précision ajoutée');
    expect(updated.type).toBe('MESSAGE_SENT'); // unchanged — whitelist stripped it
    expect(updated.date).toBe(new Date('2026-08-10').toISOString());
  });

  // ─── Privacy / audit ──────────────────────────────────────────────────

  it('curates the response and writes audit entries', async () => {
    const donorProfileId = await createDonor('Privacy Test Donor');
    const res = await request(app.getHttpServer())
      .post('/api/communications')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        donorProfileId,
        type: 'MESSAGE_SENT',
        date: '2026-08-10',
        subject: 'x',
      })
      .expect(201);
    const created = res.body as CommunicationResponse;

    expect(Object.keys(created.donorProfile.contact).sort()).toEqual(
      ['id', 'fullName'].sort(),
    );
    expect(
      (created.createdBy as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();

    await request(app.getHttpServer())
      .patch(`/api/communications/${created.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ subject: 'y' })
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: {
        module: 'DONORS',
        entity: 'DonorCommunication',
        entityId: created.id,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE']);
  });
});
