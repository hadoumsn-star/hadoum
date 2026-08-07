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
import { anyInstanceOf } from '../src/test-utils/jest-matchers';

describe('Auth & authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let users: Awaited<ReturnType<typeof seedTestUsers>>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    users = await seedTestUsers(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials and returns a usable token', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: TEST_PASSWORD })
        .expect(201)) as { body: { token: string; user: { role: string } } };

      expect(res.body.token).toEqual(anyInstanceOf(String));
      expect(res.body.user.role).toBe('director');
    });

    it('rejects an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: TEST_PASSWORD })
        .expect(401);
    });

    it('rejects a wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects a malformed email with a validation error', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: TEST_PASSWORD })
        .expect(400);
    });
  });

  describe('authentication is required on protected routes', () => {
    it('GET /api/spaces without a token -> 401', async () => {
      await request(app.getHttpServer()).get('/api/spaces').expect(401);
    });

    it('POST /api/spaces without a token -> 401', async () => {
      await request(app.getHttpServer())
        .post('/api/spaces')
        .send({ name: 'x', type: 'BUREAU' })
        .expect(401);
    });

    it('a garbage bearer token -> 401', async () => {
      await request(app.getHttpServer())
        .get('/api/spaces')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('formerly-unauthenticated legacy routes now require a token too', async () => {
      await request(app.getHttpServer()).get('/api/children').expect(401);
      await request(app.getHttpServer())
        .get('/api/finances/transactions')
        .expect(401);
      await request(app.getHttpServer()).get('/api/incidents').expect(401);
      await request(app.getHttpServer()).get('/api/staff').expect(401);
      await request(app.getHttpServer()).get('/api/reports').expect(401);
    });
  });

  describe('role-based authorization', () => {
    async function tokenFor(email: string) {
      const res = (await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD })) as {
        body: { token: string };
      };
      return res.body.token;
    }

    it('SUPERVISOR cannot perform an operational write (create a space)', async () => {
      const token = await tokenFor(users.supervisor.email);
      await request(app.getHttpServer())
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'x', type: 'BUREAU' })
        .expect(403);
    });

    it('DIRECTOR can perform an operational write (create a space)', async () => {
      const token = await tokenFor(users.director.email);
      const res = (await request(app.getHttpServer())
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Salle A', type: 'BUREAU' })
        .expect(201)) as { body: { name: string } };
      expect(res.body.name).toBe('Salle A');
    });

    // Stale expectation fixed: ValidationsController.findPending() is
    // @Roles('DIRECTOR', 'SUPERVISOR') — DIRECTOR has read-only access to
    // the pending-validations queue (only the per-resource approve/reject
    // routes stay SUPERVISOR-only, exercised elsewhere, e.g.
    // validation-workflow.e2e-spec.ts's "blocks self-approval structurally").
    it('DIRECTOR can read the pending-validations queue (read-only; approve/reject stays SUPERVISOR-only)', async () => {
      const token = await tokenFor(users.director.email);
      await request(app.getHttpServer())
        .get('/api/validations/pending')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('SUPERVISOR can access the pending-validations queue', async () => {
      const token = await tokenFor(users.supervisor.email);
      await request(app.getHttpServer())
        .get('/api/validations/pending')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('both DIRECTOR and SUPERVISOR can read a formerly-unauthenticated legacy module', async () => {
      const directorToken = await tokenFor(users.director.email);
      const supervisorToken = await tokenFor(users.supervisor.email);

      await request(app.getHttpServer())
        .get('/api/children')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/children')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
    });
  });
});
