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

interface DonorProfileResponse {
  id: string;
  type: 'PARRAIN' | 'DONATEUR_PONCTUEL';
  country: string | null;
  engagementStartDate: string | null;
  monthlyContributionXof: number | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    fullName: string;
    organization: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    photoKey: string | null;
    photoMime: string | null;
    active: boolean;
  };
  createdBy: {
    id: string;
    name: string;
    initials: string;
    roleLabel: string;
  } | null;
}

interface DonorListResponse {
  data: DonorProfileResponse[];
  total: number;
  page: number;
  pageSize: number;
}

describe('Module 5 — DonorProfile CRUD and role restrictions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let boardToken: string;
  let educatorToken: string;
  let categoryId: string;

  async function login(email: string): Promise<string> {
    const res = (await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })) as { body: { token: string } };
    return res.body.token;
  }

  async function createContact(
    fullName: string,
    extra: Partial<{ phone: string; email: string; organization: string }> = {},
  ): Promise<string> {
    const contact = await prisma.contact.create({
      data: { fullName, categoryId, ...extra },
    });
    return contact.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

    // seedTestUsers only creates DIRECTOR + SUPERVISOR — BOARD/EDUCATOR are
    // seeded locally here, same convention contacts.e2e-spec.ts already
    // uses for its own "role with zero access" coverage.
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
        title: 'Équipe éducative',
      },
    });

    directorToken = await login(users.director.email);
    supervisorToken = await login(users.supervisor.email);
    boardToken = await login('board@test.local');
    educatorToken = await login('educator@test.local');

    const category = await prisma.contactCategory.create({
      data: { key: 'PARRAIN_TEST', label: 'Parrain (test)' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1–2. DIRECTOR can create both donor types ───────────────────────────

  it('lets DIRECTOR create a PARRAIN with recurring-commitment fields', async () => {
    const contactId = await createContact('Fatou Diop');

    const res = await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        contactId,
        type: 'PARRAIN',
        country: 'Sénégal',
        engagementStartDate: '2026-01-01',
        monthlyContributionXof: 15_000,
        notes: 'Parraine deux enfants',
      })
      .expect(201);

    const body = res.body as DonorProfileResponse;
    expect(body.type).toBe('PARRAIN');
    expect(body.country).toBe('Sénégal');
    expect(body.monthlyContributionXof).toBe(15_000);
    expect(body.active).toBe(true);
    expect(body.contact.fullName).toBe('Fatou Diop');
  });

  it('lets DIRECTOR create a DONATEUR_PONCTUEL', async () => {
    const contactId = await createContact('Moussa Ba');

    const res = await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'DONATEUR_PONCTUEL' })
      .expect(201);

    expect((res.body as DonorProfileResponse).type).toBe('DONATEUR_PONCTUEL');
  });

  // ─── 3–5. Role matrix ─────────────────────────────────────────────────────

  it('lets SUPERVISOR list and view, but not mutate', async () => {
    const contactId = await createContact('Awa Sarr');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ contactId, type: 'PARRAIN' })
        .expect(201)
    ).body as DonorProfileResponse;

    await request(app.getHttpServer())
      .get('/api/donors')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/donors/${created.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const otherContactId = await createContact('Cheikh Diouf');
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ contactId: otherContactId, type: 'PARRAIN' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/donors/${created.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ notes: 'tentative' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/donors/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('denies BOARD any access to the detailed donor registry', async () => {
    const contactId = await createContact('Ndeye Sow');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ contactId, type: 'PARRAIN' })
        .expect(201)
    ).body as DonorProfileResponse;

    await request(app.getHttpServer())
      .get('/api/donors')
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/donors/${created.id}`)
      .set('Authorization', `Bearer ${boardToken}`)
      .expect(403);
  });

  it('denies EDUCATOR any access (no route grants it)', async () => {
    await request(app.getHttpServer())
      .get('/api/donors')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/api/donors').expect(401);
  });

  // ─── 6–7. Contact integration ─────────────────────────────────────────────

  it('rejects a second DonorProfile for the same Contact (409)', async () => {
    const contactId = await createContact('Omar Gueye');
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'PARRAIN' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'DONATEUR_PONCTUEL' })
      .expect(409);
  });

  it('rejects a DonorProfile for an unknown Contact (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: 'does-not-exist', type: 'PARRAIN' })
      .expect(404);
  });

  // ─── 8–11. Filtering / search ──────────────────────────────────────────────

  it('filters by donor type', async () => {
    const parrainId = await createContact('Khady Ndiaye');
    const donateurId = await createContact('Ibrahima Fall');
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: parrainId, type: 'PARRAIN' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: donateurId, type: 'DONATEUR_PONCTUEL' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/donors?type=PARRAIN')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DonorListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].contact.fullName).toBe('Khady Ndiaye');
  });

  it('filters by active/inactive status', async () => {
    const contactId = await createContact('Rokhaya Diallo');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ contactId, type: 'PARRAIN' })
        .expect(201)
    ).body as DonorProfileResponse;

    await request(app.getHttpServer())
      .patch(`/api/donors/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const activeOnly = (
      await request(app.getHttpServer())
        .get('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonorListResponse;
    expect(activeOnly.data.find((d) => d.id === created.id)).toBeUndefined();

    const inactiveOnly = (
      await request(app.getHttpServer())
        .get('/api/donors?active=false')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonorListResponse;
    expect(inactiveOnly.data.find((d) => d.id === created.id)).toBeDefined();
  });

  it('filters by country', async () => {
    const senegalContact = await createContact('Aissatou Sy');
    const franceContact = await createContact('Jean Dupont');
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: senegalContact, type: 'PARRAIN', country: 'Sénégal' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: franceContact, type: 'PARRAIN', country: 'France' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/donors?country=S%C3%A9n%C3%A9gal')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DonorListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].contact.fullName).toBe('Aissatou Sy');
  });

  it('searches through the linked Contact identity fields', async () => {
    await createContact('Modou Sène', { phone: '771234567' });
    const targetId = await createContact('Distinctive Sponsor Name', {
      email: 'distinctive.sponsor@example.com',
    });
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId: targetId, type: 'DONATEUR_PONCTUEL' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/donors?search=Distinctive')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const body = res.body as DonorListResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].contact.email).toBe('distinctive.sponsor@example.com');
  });

  // ─── 12. Activation / deactivation ─────────────────────────────────────────

  it('activates and deactivates a DonorProfile', async () => {
    const contactId = await createContact('Baba Sy');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ contactId, type: 'PARRAIN' })
        .expect(201)
    ).body as DonorProfileResponse;
    expect(created.active).toBe(true);

    const deactivated = (
      await request(app.getHttpServer())
        .patch(`/api/donors/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonorProfileResponse;
    expect(deactivated.active).toBe(false);

    const reactivated = (
      await request(app.getHttpServer())
        .patch(`/api/donors/${created.id}/reactivate`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)
    ).body as DonorProfileResponse;
    expect(reactivated.active).toBe(true);
  });

  // ─── 13. Money validation ───────────────────────────────────────────────

  it('rejects a negative monthly contribution (400)', async () => {
    const contactId = await createContact('Seynabou Ndoye');
    await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'PARRAIN', monthlyContributionXof: -100 })
      .expect(400);
  });

  // ─── 14–15. Recurring-field rules ──────────────────────────────────────────

  it('does not require recurring-commitment fields for DONATEUR_PONCTUEL', async () => {
    const contactId = await createContact('Lamine Diack');
    const res = await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'DONATEUR_PONCTUEL' })
      .expect(201);

    const body = res.body as DonorProfileResponse;
    expect(body.engagementStartDate).toBeNull();
    expect(body.monthlyContributionXof).toBeNull();
  });

  it('clears recurring-commitment fields when a PARRAIN transitions to DONATEUR_PONCTUEL', async () => {
    const contactId = await createContact('Astou Faye');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          contactId,
          type: 'PARRAIN',
          engagementStartDate: '2026-02-01',
          monthlyContributionXof: 20_000,
        })
        .expect(201)
    ).body as DonorProfileResponse;
    expect(created.monthlyContributionXof).toBe(20_000);

    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/donors/${created.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'DONATEUR_PONCTUEL' })
        .expect(200)
    ).body as DonorProfileResponse;

    expect(updated.type).toBe('DONATEUR_PONCTUEL');
    expect(updated.engagementStartDate).toBeNull();
    expect(updated.monthlyContributionXof).toBeNull();
  });

  // ─── PR 16 §1 follow-up: explicit null vs. omitted on recurring fields ────

  it('lets DIRECTOR explicitly clear PARRAIN recurring fields with null, while staying PARRAIN', async () => {
    const contactId = await createContact('Seynabou Ndoye');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          contactId,
          type: 'PARRAIN',
          engagementStartDate: '2026-03-01',
          monthlyContributionXof: 10_000,
        })
        .expect(201)
    ).body as DonorProfileResponse;

    const cleared = (
      await request(app.getHttpServer())
        .patch(`/api/donors/${created.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ engagementStartDate: null, monthlyContributionXof: null })
        .expect(200)
    ).body as DonorProfileResponse;

    expect(cleared.type).toBe('PARRAIN');
    expect(cleared.engagementStartDate).toBeNull();
    expect(cleared.monthlyContributionXof).toBeNull();
  });

  it('preserves current recurring-field values when they are omitted from the PATCH body', async () => {
    const contactId = await createContact('Lamine Diack');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          contactId,
          type: 'PARRAIN',
          engagementStartDate: '2026-04-01',
          monthlyContributionXof: 12_000,
        })
        .expect(201)
    ).body as DonorProfileResponse;

    // Touches only `notes` — engagementStartDate/monthlyContributionXof are
    // entirely absent from the body, which must mean "keep as-is", not "clear".
    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/donors/${created.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ notes: 'RAS' })
        .expect(200)
    ).body as DonorProfileResponse;

    expect(updated.engagementStartDate).not.toBeNull();
    expect(updated.monthlyContributionXof).toBe(12_000);
    expect(updated.notes).toBe('RAS');
  });

  // ─── 16. Response shape / privacy ──────────────────────────────────────────

  it('never exposes unrelated Contact/User internal fields in the response', async () => {
    const contactId = await createContact('Privacy Test Contact');
    const res = await request(app.getHttpServer())
      .post('/api/donors')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contactId, type: 'PARRAIN' })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'id',
        'type',
        'country',
        'engagementStartDate',
        'monthlyContributionXof',
        'active',
        'notes',
        'createdAt',
        'updatedAt',
        'contact',
        'createdBy',
      ].sort(),
    );

    const contact = body.contact as Record<string, unknown>;
    expect(Object.keys(contact).sort()).toEqual(
      [
        'id',
        'fullName',
        'organization',
        'phone',
        'email',
        'address',
        'city',
        'photoKey',
        'photoMime',
        'active',
      ].sort(),
    );
    // Neither Contact's own categoryId/notes/whatsappEnabled/timestamps nor
    // any password/auth field ever appear.
    expect(contact.categoryId).toBeUndefined();
    expect(contact.notes).toBeUndefined();
    expect(contact.passwordHash).toBeUndefined();

    const createdBy = body.createdBy as Record<string, unknown>;
    expect(Object.keys(createdBy).sort()).toEqual(
      ['id', 'name', 'initials', 'roleLabel'].sort(),
    );
    expect(createdBy.passwordHash).toBeUndefined();
    expect(createdBy.resetToken).toBeUndefined();
  });

  // ─── 17. Audit trail ────────────────────────────────────────────────────

  it('writes an AuditLog entry for create, update, and deactivate', async () => {
    const contactId = await createContact('Audit Test Contact');
    const created = (
      await request(app.getHttpServer())
        .post('/api/donors')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ contactId, type: 'PARRAIN' })
        .expect(201)
    ).body as DonorProfileResponse;

    await request(app.getHttpServer())
      .patch(`/api/donors/${created.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ notes: 'Updated note' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/donors/${created.id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { module: 'DONORS', entity: 'DonorProfile', entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'CREATE',
      'UPDATE',
      'DEACTIVATE',
    ]);
    expect(logs.every((l) => l.userId !== null)).toBe(true);
  });
});
