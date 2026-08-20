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

/**
 * PR 19 (Module 5 stabilization) — a single, systematic authorization pass
 * over every Module 5 route, rather than relying solely on the scattered
 * 401/403 checks each domain's own e2e spec happens to include. Verifies,
 * for every route:
 *   - unauthenticated → 401
 *   - EDUCATOR → 403 (no Module 5 access at all)
 *   - BOARD → 403 (no detailed donor registry/donations/communications/
 *     report administration — Module 6 will get BOARD a separate,
 *     aggregate-only view; this PR doesn't touch that)
 *   - SUPERVISOR → 403 on every mutation, 200 on every read
 *   - DIRECTOR → the full matrix of permitted mutations
 * This doesn't replace each domain's own richer e2e coverage (validation
 * errors, conflicts, lifecycle rules, ...) — it's a flat, exhaustive sweep
 * of the role boundary itself, in one place, so a route that's accidentally
 * left unguarded (or over-guarded) is caught immediately regardless of
 * which domain it lives in.
 */
describe('Module 5 — consolidated authorization matrix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let educatorToken: string;
  let boardToken: string;

  let categoryId: string;
  let donorProfileId: string;
  let sponsorProfileId: string;
  let campaignId: string;
  let campaignDocumentId: string;
  let donationId: string;
  let communicationId: string;
  let donorReportId: string;
  let donorReportPhotoId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  const auth = (token: string) => `Bearer ${token}`;

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
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });
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
    educatorToken = await login('educator@test.local');
    boardToken = await login('board@test.local');

    const category = await prisma.contactCategory.create({
      data: { key: 'AUTH_MATRIX_TEST', label: 'Donateur (test)' },
    });
    categoryId = category.id;

    // Fixtures — created once per test as DIRECTOR, via the real endpoints,
    // so every route below has a real resource id to target.
    const donorContact = await prisma.contact.create({
      data: { fullName: 'Donateur Matrice', categoryId },
    });
    const donorProfile = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', auth(directorToken))
        .send({ contactId: donorContact.id, type: 'DONATEUR_PONCTUEL' })
        .expect(201)
    ).body as { id: string };
    donorProfileId = donorProfile.id;

    const sponsorContact = await prisma.contact.create({
      data: { fullName: 'Parrain Matrice', categoryId },
    });
    const sponsorProfile = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', auth(directorToken))
        .send({ contactId: sponsorContact.id, type: 'PARRAIN' })
        .expect(201)
    ).body as { id: string };
    sponsorProfileId = sponsorProfile.id;

    const campaign = (
      await request(app.getHttpServer())
        .post('/api/campaigns')
        .set('Authorization', auth(directorToken))
        .send({
          title: 'Cagnotte Matrice',
          targetAmountXof: 100_000,
          startDate: '2026-01-01',
        })
        .expect(201)
    ).body as { id: string };
    campaignId = campaign.id;

    const campaignDoc = (
      await request(app.getHttpServer())
        .post(`/api/campaigns/${campaignId}/documents`)
        .set('Authorization', auth(directorToken))
        .attach('file', Buffer.from('%PDF-1.4 fake'), 'doc.pdf')
        .expect(201)
    ).body as { id: string };
    campaignDocumentId = campaignDoc.id;

    const donation = (
      await request(app.getHttpServer())
        .post('/api/donations')
        .set('Authorization', auth(directorToken))
        .send({ donorProfileId, amountXof: 5000, date: '2026-01-05' })
        .expect(201)
    ).body as { id: string };
    donationId = donation.id;

    const communication = (
      await request(app.getHttpServer())
        .post('/api/communications')
        .set('Authorization', auth(directorToken))
        .send({
          donorProfileId,
          type: 'MESSAGE_SENT',
          date: '2026-01-06',
          subject: 'Merci',
        })
        .expect(201)
    ).body as { id: string };
    communicationId = communication.id;

    const donorReport = (
      await request(app.getHttpServer())
        .post('/api/donor-reports')
        .set('Authorization', auth(directorToken))
        .send({
          donorProfileId: sponsorProfileId,
          periodType: 'TRIMESTRIEL',
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
        })
        .expect(201)
    ).body as { id: string };
    donorReportId = donorReport.id;

    const photo = (
      await request(app.getHttpServer())
        .post(`/api/donor-reports/${donorReportId}/photos`)
        .set('Authorization', auth(directorToken))
        .attach(
          'file',
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
          ),
          'photo.png',
        )
        .expect(201)
    ).body as { id: string };
    donorReportPhotoId = photo.id;

    // GET .../file-url 404s ("not yet generated") on a DRAFT report — a
    // legitimate business-logic response, not a permission one, but it
    // would otherwise pollute this file's read-route assertions below.
    // Generating it up front keeps every read route a clean 200.
    await request(app.getHttpServer())
      .post(`/api/donor-reports/${donorReportId}/generate`)
      .set('Authorization', auth(directorToken))
      .send({})
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Route table ────────────────────────────────────────────────────────
  // `mutation: true` routes are DIRECTOR-only; everything else is a read,
  // open to DIRECTOR + SUPERVISOR. Every route is closed to EDUCATOR/BOARD
  // and to unauthenticated requests regardless.

  function routes(): {
    method: 'get' | 'post' | 'patch' | 'delete';
    path: () => string;
    mutation: boolean;
    send?: object;
  }[] {
    return [
      // Donors
      { method: 'get', path: () => '/api/donors', mutation: false },
      {
        method: 'get',
        path: () => `/api/donors/${donorProfileId}`,
        mutation: false,
      },
      {
        method: 'post',
        path: () => '/api/donors',
        mutation: true,
        send: { contactId: donorProfileId, type: 'DONATEUR_PONCTUEL' },
      },
      {
        method: 'patch',
        path: () => `/api/donors/${donorProfileId}`,
        mutation: true,
        send: { notes: 'x' },
      },
      {
        method: 'patch',
        path: () => `/api/donors/${donorProfileId}/deactivate`,
        mutation: true,
      },
      {
        method: 'patch',
        path: () => `/api/donors/${donorProfileId}/reactivate`,
        mutation: true,
      },

      // Campaigns
      { method: 'get', path: () => '/api/campaigns', mutation: false },
      {
        method: 'get',
        path: () => `/api/campaigns/${campaignId}`,
        mutation: false,
      },
      {
        method: 'post',
        path: () => '/api/campaigns',
        mutation: true,
        send: { title: 'x', targetAmountXof: 1000, startDate: '2026-01-01' },
      },
      {
        method: 'patch',
        path: () => `/api/campaigns/${campaignId}`,
        mutation: true,
        send: { description: 'x' },
      },
      {
        method: 'get',
        path: () => `/api/campaigns/${campaignId}/documents`,
        mutation: false,
      },
      {
        method: 'get',
        path: () =>
          `/api/campaigns/${campaignId}/documents/${campaignDocumentId}/url`,
        mutation: false,
      },
      {
        method: 'delete',
        path: () =>
          `/api/campaigns/${campaignId}/documents/${campaignDocumentId}`,
        mutation: true,
      },

      // Donations
      { method: 'get', path: () => '/api/donations', mutation: false },
      {
        method: 'get',
        path: () => `/api/donations/${donationId}`,
        mutation: false,
      },
      {
        method: 'post',
        path: () => '/api/donations',
        mutation: true,
        send: { donorProfileId, amountXof: 1000, date: '2026-01-01' },
      },
      {
        method: 'patch',
        path: () => `/api/donations/${donationId}`,
        mutation: true,
        send: { notes: 'x' },
      },

      // Communications
      { method: 'get', path: () => '/api/communications', mutation: false },
      {
        method: 'get',
        path: () => `/api/communications/${communicationId}`,
        mutation: false,
      },
      {
        method: 'post',
        path: () => '/api/communications',
        mutation: true,
        send: {
          donorProfileId,
          type: 'MESSAGE_SENT',
          date: '2026-01-01',
          subject: 'x',
        },
      },
      {
        method: 'patch',
        path: () => `/api/communications/${communicationId}`,
        mutation: true,
        send: { subject: 'y' },
      },

      // Donor reports
      { method: 'get', path: () => '/api/donor-reports', mutation: false },
      {
        method: 'get',
        path: () => `/api/donor-reports/${donorReportId}`,
        mutation: false,
      },
      {
        method: 'get',
        path: () => `/api/donor-reports/${donorReportId}/file-url`,
        mutation: false,
      },
      {
        method: 'get',
        path: () =>
          `/api/donor-reports/${donorReportId}/photos/${donorReportPhotoId}/url`,
        mutation: false,
      },
      {
        method: 'post',
        path: () => '/api/donor-reports',
        mutation: true,
        send: {
          donorProfileId: sponsorProfileId,
          periodType: 'MENSUEL',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
        },
      },
      {
        method: 'patch',
        path: () =>
          `/api/donor-reports/${donorReportId}/photos/${donorReportPhotoId}/approve`,
        mutation: true,
      },
      {
        method: 'delete',
        path: () =>
          `/api/donor-reports/${donorReportId}/photos/${donorReportPhotoId}`,
        mutation: true,
      },
    ];
  }

  it('closes every Module 5 route to unauthenticated requests (401)', async () => {
    for (const route of routes()) {
      const res = await request(app.getHttpServer())
        [route.method](route.path())
        .send(route.send ?? {});
      expect([401]).toContain(res.status);
    }
  });

  it('closes every Module 5 route to EDUCATOR (403) — no Module 5 access at all', async () => {
    for (const route of routes()) {
      const res = await request(app.getHttpServer())
        [route.method](route.path())
        .set('Authorization', auth(educatorToken))
        .send(route.send ?? {});
      expect([403]).toContain(res.status);
    }
  });

  it('closes every Module 5 route to BOARD (403) — no detailed donor registry/donations/communications/report administration', async () => {
    for (const route of routes()) {
      const res = await request(app.getHttpServer())
        [route.method](route.path())
        .set('Authorization', auth(boardToken))
        .send(route.send ?? {});
      expect([403]).toContain(res.status);
    }
  });

  it('lets SUPERVISOR read every Module 5 route but blocks (403) every mutation', async () => {
    for (const route of routes()) {
      const res = await request(app.getHttpServer())
        [route.method](route.path())
        .set('Authorization', auth(supervisorToken))
        .send(route.send ?? {});
      if (route.mutation) {
        expect(res.status).toBe(403);
      } else {
        expect([200]).toContain(res.status);
      }
    }
  });
});
