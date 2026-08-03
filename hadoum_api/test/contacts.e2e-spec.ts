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

describe('Contacts CRUD, categories, and role restrictions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let educatorToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

    // seedTestUsers only creates DIRECTOR + SUPERVISOR (the two roles every
    // other e2e-spec needs); EDUCATOR is seeded locally here since this is
    // the first spec that needs to confirm a role with *zero* access.
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
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

    directorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: TEST_PASSWORD })
    ).body.token;
    supervisorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.supervisor.email, password: TEST_PASSWORD })
    ).body.token;
    educatorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'educator@test.local', password: TEST_PASSWORD })
    ).body.token;

    const category = await prisma.contactCategory.create({
      data: { key: 'FOURNISSEUR', label: 'Fournisseur', sortOrder: 1 },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Route-ordering regression guard ─────────────────────────────────────
  // ContactCategoriesController must be registered before ContactsController
  // so `/contacts/categories` isn't swallowed by `/contacts/:id`.

  it('routes GET /contacts/categories to the categories controller, not :id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/contacts/categories')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].key).toBe('FOURNISSEUR');
  });

  // ─── Contact CRUD ─────────────────────────────────────────────────────────

  it('creates a contact as DIRECTOR and as SUPERVISOR', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ fullName: 'Fatou Ndiaye', categoryId })
      .expect(201);
  });

  it('rejects contact creation for EDUCATOR and for an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${educatorToken}`)
      .send({ fullName: 'x', categoryId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/contacts')
      .send({ fullName: 'x', categoryId })
      .expect(401);
  });

  it('rejects a contact with no fullName (DTO validation)', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ categoryId })
      .expect(400);
  });

  it('rejects a contact referencing a category that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'x', categoryId: 'not-a-real-category' })
      .expect(400);
  });

  it('rejects a contact referencing an inactive category', async () => {
    const inactive = await prisma.contactCategory.create({
      data: { key: 'AUTRE', label: 'Autre', active: false },
    });

    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'x', categoryId: inactive.id })
      .expect(400);
  });

  it('updates a contact, preserving fields that are not sent', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId, phone: '+221 77 000 00 00' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ organization: 'Sénégal Gaz' })
      .expect(200);

    expect(updated.body.organization).toBe('Sénégal Gaz');
    expect(updated.body.phone).toBe('+221 77 000 00 00'); // unchanged
    expect(updated.body.fullName).toBe('Amadou Diop'); // unchanged
  });

  it('cannot set `active` through the generic update endpoint', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ active: false }) // whitelist:true silently strips unknown fields
      .expect(200);

    expect(updated.body.active).toBe(true);
  });

  // ─── Search ─────────────────────────────────────────────────────────────

  it('searches by fullName, organization, functionTitle, phone, and notes independently', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        fullName: 'Amadou Diop',
        organization: 'Sénégal Gaz',
        functionTitle: 'Gérant régional',
        categoryId,
        phone: '+221 77 999 88 77',
        notes: 'Contact privilégié pour les livraisons de gaz',
      })
      .expect(201);

    for (const q of [
      'Amadou',
      'Sénégal Gaz',
      'Gérant',
      '77 999 88 77',
      'livraisons',
    ]) {
      const res = await request(app.getHttpServer())
        .get('/api/contacts')
        .query({ search: q })
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(res.body.total).toBe(1);
    }

    const noMatch = await request(app.getHttpServer())
      .get('/api/contacts')
      .query({ search: 'zzz-no-such-contact' })
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(noMatch.body.total).toBe(0);
  });

  it('filters by categoryId', async () => {
    const otherCategory = await prisma.contactCategory.create({
      data: { key: 'MAINTENANCE', label: 'Maintenance', sortOrder: 2 },
    });
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'A', categoryId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'B', categoryId: otherCategory.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/contacts')
      .query({ categoryId })
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].fullName).toBe('A');
  });

  it('defaults to active-only and includes inactive contacts only when requested', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/contacts/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const defaultList = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(defaultList.body.total).toBe(0);

    const inactiveList = await request(app.getHttpServer())
      .get('/api/contacts')
      .query({ active: 'false' })
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(inactiveList.body.total).toBe(1);

    // A deactivated contact stays individually readable regardless.
    await request(app.getHttpServer())
      .get(`/api/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  // ─── Duplicate warning ────────────────────────────────────────────────────

  it('warns on a probable duplicate and allows an explicit override', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId, phone: '+221 77 123 45 67' })
      .expect(201);

    const dup = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou D.', categoryId, phone: '221771234567' })
      .expect(409);
    expect(dup.body.possibleDuplicate.fullName).toBe('Amadou Diop');

    await request(app.getHttpServer())
      .post('/api/contacts?force=true')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou D.', categoryId, phone: '221771234567' })
      .expect(201);
  });

  // ─── Deactivate / reactivate — DIRECTOR only ──────────────────────────────

  it('allows DIRECTOR but not SUPERVISOR to deactivate/reactivate a contact', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);
    const id = created.body.id;

    await request(app.getHttpServer())
      .patch(`/api/contacts/${id}/deactivate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${id}/reactivate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${id}/reactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  // ─── Categories ───────────────────────────────────────────────────────────

  it('allows DIRECTOR but not SUPERVISOR to manage categories', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts/categories')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ key: 'SOCIAL', label: 'Social' })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/api/contacts/categories')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ key: 'SOCIAL', label: 'Social' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/contacts/categories/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('both DIRECTOR and SUPERVISOR can list categories; EDUCATOR cannot', async () => {
    await request(app.getHttpServer())
      .get('/api/contacts/categories')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/contacts/categories')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/contacts/categories')
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(403);
  });

  it('refuses to deactivate a category still used by an active contact', async () => {
    await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/contacts/categories/${categoryId}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);
  });

  it('allows deactivating a category once no active contact references it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/contacts/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/contacts/categories/${categoryId}/deactivate`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  // ─── Photo (via FakeUploadService — no real S3 call) ─────────────────────

  it('uploads, retrieves the URL for, and deletes a contact photo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Amadou Diop', categoryId })
      .expect(201);
    const id = created.body.id;

    const uploaded = await request(app.getHttpServer())
      .post(`/api/contacts/${id}/photo`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('fake image bytes'), 'photo.jpg')
      .expect(201);
    expect(uploaded.body.photoKey).toContain('contacts/');
    expect(uploaded.body.photoMime).toBe('image/jpeg');

    const urlRes = await request(app.getHttpServer())
      .get(`/api/contacts/${id}/photo-url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(urlRes.body.url).toContain('fake-signed-url.test');

    await request(app.getHttpServer())
      .delete(`/api/contacts/${id}/photo`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/contacts/${id}/photo-url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404);
  });
});
