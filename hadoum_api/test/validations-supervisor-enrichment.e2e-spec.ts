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

// Supervisor validation experience consistency: GET /api/validations/pending
// (the single generic engine every resource type already shares) now also
// carries the assigned responsible Contact for ADMINISTRATIVE_PROCEDURE and
// MAINTENANCE_TICKET — additive `select` enrichment only, no new business
// logic, no new endpoint. Verified against a real Postgres relation (the
// assignedContact dual-write), which a mocked-Prisma unit test can't prove.
describe('Supervisor validation queue — assignedContact enrichment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let activeContactId: string;
  let activeContactName: string;
  let spaceId: string;

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
      data: { fullName: 'Awa Diop', categoryId: category.id, phone: '771234567' },
    });
    activeContactId = contact.id;
    activeContactName = contact.fullName;

    const space = await prisma.space.create({
      data: { name: 'Cuisine principale', type: 'CUISINE' },
    });
    spaceId = space.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function findPendingEntry(body: Array<{ resourceType: string; resourceId: string }>, resourceId: string) {
    return body.find((v) => v.resourceId === resourceId);
  }

  it('a pending Administrative Procedure carries its assigned Contact in the Supervisor queue', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Agrément d'ouverture",
        procedureType: 'AGREMENT',
        authority: 'Ministère de la Famille',
        assignedContactId: activeContactId,
      })
      .expect(201);
    expect(created.body.assignedContact.id).toBe(activeContactId);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const entry = findPendingEntry(pending.body, created.body.id);
    expect(entry).toBeTruthy();
    expect(entry.resource.title).toBe("Agrément d'ouverture");
    expect(entry.resource.authority).toBe('Ministère de la Famille');
    expect(entry.resource.assignedContact).toEqual({ id: activeContactId, fullName: activeContactName });
  });

  it('a pending Administrative Procedure with no responsible assigned carries a null assignedContact and assignedTo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: 'Renouvellement de licence',
        procedureType: 'AGREMENT',
        authority: 'Préfecture',
      })
      .expect(201);
    expect(created.body.assignedContact).toBeNull();

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const entry = findPendingEntry(pending.body, created.body.id);
    expect(entry.resource.assignedContact).toBeNull();
    expect(entry.resource.assignedTo).toBeNull();
  });

  it('a pending Maintenance Ticket carries its assigned Contact in the Supervisor queue', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: 'Fuite au robinet', spaceId, urgency: 'MOYENNE',
        reportedBy: 'Test Director', assignedContactId: activeContactId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const entry = findPendingEntry(pending.body, created.body.id);
    expect(entry).toBeTruthy();
    expect(entry.resource.title).toBe('Fuite au robinet');
    expect(entry.resource.assignedContact).toEqual({ id: activeContactId, fullName: activeContactName });
  });
});
