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

describe('Document upload / signed URL / cross-resource IDOR (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let users: Awaited<ReturnType<typeof seedTestUsers>>;
  let directorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    users = await seedTestUsers(prisma);

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

  async function createSpace(name: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/spaces')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name, type: 'BUREAU' })
      .expect(201)) as { body: { id: string } };
    return res.body.id;
  }

  it('uploads a document, lists it, fetches a signed URL, then deletes it', async () => {
    const spaceId = await createSpace('Bureau A');

    const uploadRes = (await request(app.getHttpServer())
      .post(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .field('label', 'Plan')
      .attach('file', Buffer.from('fake pdf content'), 'plan.pdf')
      .expect(201)) as { body: { id: string } };
    const docId = uploadRes.body.id;

    const listRes = await request(app.getHttpServer())
      .get(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);

    const urlRes = (await request(app.getHttpServer())
      .get(`/api/spaces/${spaceId}/documents/${docId}/url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: { url: string } };
    expect(urlRes.body.url).toContain('fake-signed-url.test');

    await request(app.getHttpServer())
      .delete(`/api/spaces/${spaceId}/documents/${docId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('blocks a cross-resource document fetch: a document uploaded to space A is not reachable via space B', async () => {
    const spaceA = await createSpace('Espace A');
    const spaceB = await createSpace('Espace B');

    const uploadRes = (await request(app.getHttpServer())
      .post(`/api/spaces/${spaceA}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('fake pdf content'), 'doc.pdf')
      .expect(201)) as { body: { id: string } };
    const docId = uploadRes.body.id;

    await request(app.getHttpServer())
      .get(`/api/spaces/${spaceB}/documents/${docId}/url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/spaces/${spaceB}/documents/${docId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404);
  });

  it('SUPERVISOR can read documents but cannot upload or delete them (read-only)', async () => {
    const spaceId = await createSpace('Bureau B');
    const uploadRes = (await request(app.getHttpServer())
      .post(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('x'), 'x.pdf')
      .expect(201)) as { body: { id: string } };
    const docId = uploadRes.body.id;

    await request(app.getHttpServer())
      .get(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/spaces/${spaceId}/documents`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('file', Buffer.from('x'), 'x.pdf')
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/spaces/${spaceId}/documents/${docId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated upload attempt', async () => {
    const spaceId = await createSpace('Bureau C');
    await request(app.getHttpServer())
      .post(`/api/spaces/${spaceId}/documents`)
      .attach('file', Buffer.from('x'), 'x.pdf')
      .expect(401);
  });
});
