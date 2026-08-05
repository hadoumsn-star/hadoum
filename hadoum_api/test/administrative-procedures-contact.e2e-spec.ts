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

// PR 9: Administrative Procedures <-> Contact directory integration. Mirrors
// test/maintenance-tickets.e2e-spec.ts's PR 3 coverage exactly (real Contact
// API + real Administrative Procedure API against a real Postgres database)
// — relation behavior (SetNull semantics, the assignedContactId/assignedTo
// dual-write, inactive-but-readable references) is exactly the kind of
// thing a mocked-Prisma unit test can't actually prove, which is why this
// exists alongside administrative-procedures.service.spec.ts rather than
// instead of it.
describe('Administrative Procedures — Contact assignment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let activeContactId: string;
  let activeContactName: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

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

    const category = await prisma.contactCategory.create({
      data: { key: 'ADMINISTRATION', label: 'Administration', sortOrder: 1 },
    });
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Fatou Sow',
        organization: 'Ministère de la Santé',
        categoryId: category.id,
        phone: '771234567',
      },
    });
    activeContactId = contact.id;
    activeContactName = contact.fullName;
  });

  afterAll(async () => {
    await app.close();
  });

  function createProcedure(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Agrément d'ouverture",
        procedureType: 'AGREMENT',
        authority: 'Ministère de la Santé',
        ...body,
      });
  }

  it('creates a procedure without a contact exactly as before', async () => {
    const res = await createProcedure({}).expect(201);
    expect(res.body.assignedContactId).toBeNull();
    expect(res.body.assignedContact).toBeNull();
    expect(res.body.assignedTo).toBeNull();
  });

  it('creates a procedure with an active contact and derives the assignedTo snapshot', async () => {
    const res = await createProcedure({ assignedContactId: activeContactId }).expect(201);
    expect(res.body.assignedContactId).toBe(activeContactId);
    expect(res.body.assignedTo).toBe(activeContactName);
    expect(res.body.assignedContact.id).toBe(activeContactId);
    expect(res.body.assignedContact.category.key).toBe('ADMINISTRATION');
  });

  it('inline-creates a Contact via the Contact API, then links it on procedure creation', async () => {
    const category = await prisma.contactCategory.findFirstOrThrow({
      where: { key: 'ADMINISTRATION' },
    });
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Nouveau Responsable', categoryId: category.id })
      .expect(201);

    const res = await createProcedure({ assignedContactId: created.body.id }).expect(201);
    expect(res.body.assignedContactId).toBe(created.body.id);
    expect(res.body.assignedTo).toBe('Nouveau Responsable');
  });

  it('rejects an unknown contact id on create', async () => {
    await createProcedure({ assignedContactId: 'does-not-exist' }).expect(400);
  });

  it('rejects an inactive contact for a new assignment on create', async () => {
    await prisma.contact.update({ where: { id: activeContactId }, data: { active: false } });
    await createProcedure({ assignedContactId: activeContactId }).expect(400);
  });

  it('lists procedures with assignedContact and category included', async () => {
    await createProcedure({ assignedContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body[0].assignedContact.fullName).toBe(activeContactName);
    expect(res.body[0].assignedContact.category.key).toBe('ADMINISTRATION');
  });

  it('returns the procedure detail with assignedContact included', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.assignedContact.fullName).toBe(activeContactName);
  });

  it('updates a procedure to a different contact', async () => {
    const created = await createProcedure({}).expect(201);
    const category = await prisma.contactCategory.findFirstOrThrow();
    const otherContact = await prisma.contact.create({
      data: { fullName: 'Awa Diop', categoryId: category.id },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: otherContact.id })
      .expect(200);

    expect(res.body.assignedContactId).toBe(otherContact.id);
    expect(res.body.assignedTo).toBe('Awa Diop');
  });

  it('replaces a legacy free-text Responsable with a Contact on update', async () => {
    const created = await createProcedure({ assignedTo: 'Ancien responsable texte' }).expect(201);
    expect(created.body.assignedContactId).toBeNull();

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: activeContactId })
      .expect(200);

    expect(res.body.assignedContactId).toBe(activeContactId);
    expect(res.body.assignedTo).toBe(activeContactName);
  });

  it('clears the assigned contact and assignedTo when assignedContactId is explicitly null', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: null })
      .expect(200);

    expect(res.body.assignedContactId).toBeNull();
    expect(res.body.assignedContact).toBeNull();
    expect(res.body.assignedTo).toBeNull();
  });

  it('leaves the existing relation untouched when assignedContactId is omitted', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ title: 'Titre modifié' })
      .expect(200);

    expect(res.body.title).toBe('Titre modifié');
    expect(res.body.assignedContactId).toBe(activeContactId);
    expect(res.body.assignedTo).toBe(activeContactName);
  });

  it('keeps a legacy assignedTo-only procedure (no linked contact) fully readable', async () => {
    const created = await createProcedure({ assignedTo: 'Paul (texte libre)' }).expect(201);
    expect(created.body.assignedContactId).toBeNull();
    expect(created.body.assignedTo).toBe('Paul (texte libre)');

    const res = await request(app.getHttpServer())
      .get(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.assignedTo).toBe('Paul (texte libre)');
    expect(res.body.assignedContact).toBeNull();
  });

  it('keeps a procedure readable, with the reference intact, after its contact is deactivated', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);
    await prisma.contact.update({ where: { id: activeContactId }, data: { active: false } });

    const res = await request(app.getHttpServer())
      .get(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.assignedContact.id).toBe(activeContactId);
    expect(res.body.assignedContact.active).toBe(false);
  });

  it('does not change validationStatus when only the assigned contact changes', async () => {
    const created = await createProcedure({}).expect(201);
    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: activeContactId })
      .expect(200);

    expect(res.body.validationStatus).toBe('PENDING_VALIDATION');
  });

  it('still supports the full submit -> approve validation workflow on a contact-linked procedure', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('SOUMIS');
    expect(approved.body.validationStatus).toBe('APPROVED');
    expect(approved.body.assignedContact.id).toBe(activeContactId);
  });

  it('still supports reject on a contact-linked procedure', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);
    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Dossier incomplet' })
      .expect(200);

    expect(rejected.body.validationStatus).toBe('REJECTED');
  });

  it('still supports request-renewal -> approve on a contact-linked procedure', async () => {
    const created = await createProcedure({
      assignedContactId: activeContactId,
      expirationDate: '2026-12-31',
    }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/request-renewal`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('EN_COURS');
    expect(approved.body.assignedContact.id).toBe(activeContactId);
  });

  it('still supports request-archive -> approve on a contact-linked procedure', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/request-archive`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('ARCHIVE');
  });

  it('archives directly (no validation gating) on a contact-linked procedure', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.status).toBe('ARCHIVE');
    expect(res.body.assignedContact.id).toBe(activeContactId);
  });

  it('notification text is unaffected by the linked Contact (authority-based, as before)', async () => {
    const created = await createProcedure({ assignedContactId: activeContactId }).expect(201);
    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const notif = await prisma.notification.findFirst({
      where: { resourceType: 'ADMINISTRATIVE_PROCEDURE', resourceId: created.body.id, type: 'VALIDATION_SUBMITTED' },
    });
    expect(notif?.message).toContain('Ministère de la Santé');
    expect(notif?.message).not.toContain(activeContactName);
  });

  it('role restrictions are unchanged: SUPERVISOR still cannot create or update procedures', async () => {
    await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ title: 'x', procedureType: 'AGREMENT', authority: 'x' })
      .expect(403);

    const created = await createProcedure({}).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ assignedContactId: activeContactId })
      .expect(403);
  });
});
