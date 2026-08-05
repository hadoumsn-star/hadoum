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

// PR 3: Maintenance Tickets <-> Contact directory integration. Drives both
// the real Contact API and the real Maintenance Ticket API against a real
// Postgres database — relation behavior (SetNull semantics, the
// assignedContactId/assignedTo dual-write, inactive-but-readable references)
// is exactly the kind of thing a mocked-Prisma unit test can't actually
// prove, which is why this exists alongside maintenance-tickets.service.spec.ts
// rather than instead of it.
describe('Maintenance Tickets — Contact assignment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let spaceId: string;
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

    const space = await prisma.space.create({
      data: { name: 'Cuisine principale', type: 'CUISINE' },
    });
    spaceId = space.id;

    const category = await prisma.contactCategory.create({
      data: { key: 'MAINTENANCE', label: 'Maintenance', sortOrder: 1 },
    });
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Ousmane Diop',
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

  function createTicket(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: 'Fuite au robinet',
        spaceId,
        urgency: 'MOYENNE',
        reportedBy: 'Test Director',
        ...body,
      });
  }

  it('creates a ticket without a contact exactly as before', async () => {
    const res = await createTicket({}).expect(201);
    expect(res.body.assignedContactId).toBeNull();
    expect(res.body.assignedContact).toBeNull();
    expect(res.body.assignedTo).toBeNull();
  });

  it('creates a ticket with an active contact and derives the assignedTo snapshot', async () => {
    const res = await createTicket({ assignedContactId: activeContactId }).expect(201);
    expect(res.body.assignedContactId).toBe(activeContactId);
    expect(res.body.assignedTo).toBe(activeContactName);
    expect(res.body.assignedContact.id).toBe(activeContactId);
    expect(res.body.assignedContact.category.key).toBe('MAINTENANCE');
  });

  it('rejects an unknown contact id on create', async () => {
    await createTicket({ assignedContactId: 'does-not-exist' }).expect(400);
  });

  it('rejects an inactive contact for a new assignment on create', async () => {
    const inactive = await prisma.contact.update({
      where: { id: activeContactId },
      data: { active: false },
    });
    await createTicket({ assignedContactId: inactive.id }).expect(400);
  });

  it('lists tickets with assignedContact included', async () => {
    await createTicket({ assignedContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body[0].assignedContact.fullName).toBe(activeContactName);
  });

  it('returns the ticket detail with assignedContact included', async () => {
    const created = await createTicket({ assignedContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.assignedContact.fullName).toBe(activeContactName);
  });

  it('updates a ticket to a different contact', async () => {
    const created = await createTicket({}).expect(201);
    const category = await prisma.contactCategory.findFirstOrThrow();
    const otherContact = await prisma.contact.create({
      data: { fullName: 'Fatou Ndiaye', categoryId: category.id },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: otherContact.id })
      .expect(200);

    expect(res.body.assignedContactId).toBe(otherContact.id);
    expect(res.body.assignedTo).toBe('Fatou Ndiaye');
  });

  it('clears the assigned contact when assignedContactId is explicitly null', async () => {
    const created = await createTicket({ assignedContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: null })
      .expect(200);

    expect(res.body.assignedContactId).toBeNull();
    expect(res.body.assignedContact).toBeNull();
    expect(res.body.assignedTo).toBeNull();
  });

  it('leaves the existing relation untouched when assignedContactId is omitted', async () => {
    const created = await createTicket({ assignedContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ title: 'Titre modifié' })
      .expect(200);

    expect(res.body.title).toBe('Titre modifié');
    expect(res.body.assignedContactId).toBe(activeContactId);
    expect(res.body.assignedTo).toBe(activeContactName);
  });

  it('keeps a legacy assignedTo-only ticket (no linked contact) fully readable', async () => {
    const created = await createTicket({ assignedTo: 'Paul (texte libre)' }).expect(201);
    expect(created.body.assignedContactId).toBeNull();
    expect(created.body.assignedTo).toBe('Paul (texte libre)');

    const res = await request(app.getHttpServer())
      .get(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.assignedTo).toBe('Paul (texte libre)');
    expect(res.body.assignedContact).toBeNull();
  });

  it('keeps a ticket readable, with the reference intact, after its contact is deactivated', async () => {
    const created = await createTicket({ assignedContactId: activeContactId }).expect(201);
    await prisma.contact.update({ where: { id: activeContactId }, data: { active: false } });

    const res = await request(app.getHttpServer())
      .get(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.assignedContact.id).toBe(activeContactId);
    expect(res.body.assignedContact.active).toBe(false);
  });

  it('does not change validationStatus when only the assigned contact changes', async () => {
    const created = await createTicket({ urgency: 'CRITIQUE' }).expect(201);
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ assignedContactId: activeContactId })
      .expect(200);

    expect(res.body.validationStatus).toBe('PENDING_VALIDATION');
  });

  it('still supports the full submit -> approve validation workflow on a contact-linked ticket', async () => {
    const created = await createTicket({
      urgency: 'CRITIQUE',
      assignedContactId: activeContactId,
    }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('FERME');
    expect(approved.body.validationStatus).toBe('APPROVED');
  });

  it('role restrictions are unchanged: SUPERVISOR still cannot create or update tickets', async () => {
    await request(app.getHttpServer())
      .post('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ title: 'x', spaceId, urgency: 'MOYENNE', reportedBy: 'x' })
      .expect(403);

    const created = await createTicket({}).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ assignedContactId: activeContactId })
      .expect(403);
  });
});
