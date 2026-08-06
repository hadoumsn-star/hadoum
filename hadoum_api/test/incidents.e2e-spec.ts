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

// PR 11: Incident workflow improvements — EN_COURS/EN_ATTENTE/RESOLU statuses
// (legacy PLANIFIE/EN_RETARD preserved read-only), N1/N2/N3 priority, the
// SECURITE category, real Child/StaffMember links ("persons concerned"),
// mandatory-note status history, search/filters, and the
// DIRECTOR-vs-SUPERVISOR permission split — driven against the real API +
// real Postgres.

interface IncidentResponse {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  createdBy: { id: string; role: string } | null;
  children: { child: { id: string } }[];
  staffLinks: { staffMember: { id: string } }[];
  spaces: { space: { id: string; name: string } }[];
  statusHistory: {
    previousStatus: string;
    newStatus: string;
    note: string;
    user: { id: string };
    createdAt: string;
  }[];
  attachmentKey: string | null;
}

describe('Incidents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let directorId: string;
  let supervisorToken: string;
  let childId: string;
  let staffId: string;
  let spaceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    directorId = users.director.id;

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

    const child = await prisma.child.create({
      data: {
        fileNumber: `E2E-${Date.now()}`,
        firstName: 'Awa',
        lastName: 'Ndiaye',
        dateOfBirth: new Date('2015-01-01'),
        placeOfBirth: 'Dakar',
        gender: 'FEMININ',
        entryDate: new Date('2020-01-01'),
        status: 'ORPHELIN_COMPLET',
      },
    });
    childId = child.id;

    const staff = await prisma.staffMember.create({
      data: { firstName: 'Moussa', lastName: 'Fall', role: 'Éducateur' },
    });
    staffId = staff.id;

    const space = await prisma.space.create({
      data: { name: 'Infirmerie', type: 'INFIRMERIE' },
    });
    spaceId = space.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create', () => {
    it('DIRECTOR creates an incident with a priority', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Chute dans la cour',
          type: 'COMPORTEMENT',
          description: 'Un enfant est tombé.',
          signaledBy: 'Fatou',
          priority: 'N2',
        })
        .expect(201)) as { body: IncidentResponse };

      expect(res.body.status).toBe('EN_COURS');
      expect(res.body.priority).toBe('N2');
      expect(res.body.createdBy?.id).toBe(directorId);
    });

    it('rejects a missing description', async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ title: 'x', type: 'AUTRE', signaledBy: 'x', priority: 'N3' })
        .expect(400);
    });

    it('accepts the SECURITE category', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Intrusion',
          type: 'SECURITE',
          description: 'Personne non identifiée.',
          signaledBy: 'Gardien',
          priority: 'N1',
        })
        .expect(201)) as { body: IncidentResponse };
      expect(res.body.type).toBe('SECURITE');
    });

    it.each(['N1', 'N2', 'N3'])('accepts priority %s', async (priority) => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority,
        })
        .expect(201)) as { body: IncidentResponse };
      expect(res.body.priority).toBe(priority);
    });

    it('rejects the legacy PLANIFIE value if sent as a priority-adjacent status override attempt', async () => {
      // There is no `status` field on create at all — creation always starts
      // at EN_COURS regardless of what's sent, so a client cannot slip a
      // legacy status in through create.
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
          status: 'PLANIFIE',
        })
        .expect(201)) as { body: IncidentResponse };
      expect(res.body.status).toBe('EN_COURS');
    });

    it('links real children and staff records, never free text', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Bagarre',
          type: 'COMPORTEMENT',
          description: 'd',
          signaledBy: 'x',
          priority: 'N2',
          childIds: [childId],
          staffIds: [staffId],
        })
        .expect(201)) as { body: IncidentResponse };

      expect(res.body.children).toHaveLength(1);
      expect(res.body.children[0].child.id).toBe(childId);
      expect(res.body.staffLinks).toHaveLength(1);
      expect(res.body.staffLinks[0].staffMember.id).toBe(staffId);
    });

    it('rejects an unknown child id', async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
          childIds: ['00000000-0000-0000-0000-000000000000'],
        })
        .expect(400);
    });

    it('links a real space (Locaux et espaces) record, never free text', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: "Fuite d'eau",
          type: 'LOGISTIQUE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N2',
          spaceIds: [spaceId],
        })
        .expect(201)) as { body: IncidentResponse };

      expect(res.body.spaces).toHaveLength(1);
      expect(res.body.spaces[0].space.id).toBe(spaceId);
      expect(res.body.spaces[0].space.name).toBe('Infirmerie');
    });

    it('rejects an unknown space id', async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
          spaceIds: ['00000000-0000-0000-0000-000000000000'],
        })
        .expect(400);
    });

    it('SUPERVISOR can create an incident', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })
        .expect(201)) as { body: IncidentResponse };
      expect(res.body.createdBy?.role).toBe('SUPERVISOR');
    });
  });

  describe('status change (mandatory note + history)', () => {
    async function createIncident(token: string): Promise<string> {
      const res = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })) as { body: IncidentResponse };
      return res.body.id;
    }

    it('rejects a status change without a note', async () => {
      const id = await createIncident(directorToken);
      await request(app.getHttpServer())
        .patch(`/api/incidents/${id}/status`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ status: 'EN_ATTENTE' })
        .expect(400);
    });

    it('records a timestamped history entry with previous/new status, note and user', async () => {
      const id = await createIncident(directorToken);
      const res = (await request(app.getHttpServer())
        .patch(`/api/incidents/${id}/status`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ status: 'EN_ATTENTE', note: 'En attente du médecin.' })
        .expect(200)) as { body: IncidentResponse };

      expect(res.body.status).toBe('EN_ATTENTE');
      expect(res.body.statusHistory).toHaveLength(1);
      const entry = res.body.statusHistory[0];
      expect(entry.previousStatus).toBe('EN_COURS');
      expect(entry.newStatus).toBe('EN_ATTENTE');
      expect(entry.note).toBe('En attente du médecin.');
      expect(entry.user.id).toBe(directorId);
      expect(entry.createdAt).toBeDefined();
    });

    it('resolves an incident via the status endpoint', async () => {
      const id = await createIncident(directorToken);
      const res = (await request(app.getHttpServer())
        .patch(`/api/incidents/${id}/status`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ status: 'RESOLU', note: 'Pris en charge.' })
        .expect(200)) as { body: IncidentResponse };
      expect(res.body.status).toBe('RESOLU');
    });

    it('rejects PLANIFIE as a status-change target (legacy, not selectable)', async () => {
      const id = await createIncident(directorToken);
      await request(app.getHttpServer())
        .patch(`/api/incidents/${id}/status`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ status: 'PLANIFIE', note: 'x' })
        .expect(400);
    });

    it('SUPERVISOR cannot change status', async () => {
      const id = await createIncident(directorToken);
      await request(app.getHttpServer())
        .patch(`/api/incidents/${id}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ status: 'EN_ATTENTE', note: 'x' })
        .expect(403);
    });
  });

  describe('SUPERVISOR permissions (create-only, no edit)', () => {
    it('SUPERVISOR can read all incidents', async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        });

      const res = (await request(app.getHttpServer())
        .get('/api/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
    });

    it('SUPERVISOR cannot edit an incident, including one it created itself', async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })) as { body: IncidentResponse };

      await request(app.getHttpServer())
        .patch(`/api/incidents/${created.body.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ title: 'Modifié' })
        .expect(403);
    });

    it("a SUPERVISOR-created incident is identifiable via createdBy.role for the frontend's highlight", async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })) as { body: IncidentResponse };

      const list = (await request(app.getHttpServer())
        .get('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };

      const found = list.body.find((i) => i.id === created.body.id);
      if (!found) throw new Error('Created incident not found in list');
      expect(found.createdBy?.role).toBe('SUPERVISOR');
    });

    it('DIRECTOR can edit an incident created by SUPERVISOR', async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })) as { body: IncidentResponse };

      const res = (await request(app.getHttpServer())
        .patch(`/api/incidents/${created.body.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ title: 'Modifié par la direction' })
        .expect(200)) as { body: IncidentResponse };
      expect(res.body.title).toBe('Modifié par la direction');
    });
  });

  describe('search and filters', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: "Fuite d'eau infirmerie",
          type: 'LOGISTIQUE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N1',
          staffIds: [staffId],
          spaceIds: [spaceId],
        });
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Conflit en classe',
          type: 'COMPORTEMENT',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
          childIds: [childId],
        });
    });

    it('filters by text search (title)', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/incidents?search=fuite')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toContain('Fuite');
    });

    it('filters by priority', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/incidents?priority=N1')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].priority).toBe('N1');
    });

    it('filters by category (type)', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/incidents?type=COMPORTEMENT')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].type).toBe('COMPORTEMENT');
    });

    it('filters by linked child', async () => {
      const res = (await request(app.getHttpServer())
        .get(`/api/incidents?childId=${childId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Conflit en classe');
    });

    it('filters by linked staff', async () => {
      const res = (await request(app.getHttpServer())
        .get(`/api/incidents?staffId=${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toContain('Fuite');
    });

    it('filters by linked space (location)', async () => {
      const res = (await request(app.getHttpServer())
        .get(`/api/incidents?spaceId=${spaceId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toContain('Fuite');
    });

    it('filters by status', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/incidents?status=EN_COURS')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };
      expect(res.body).toHaveLength(2);
    });
  });

  describe('attachments still work', () => {
    it('uploads, lists and fetches a presigned url for an incident attachment', async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })) as { body: IncidentResponse };

      const uploaded = (await request(app.getHttpServer())
        .post(`/api/incidents/${created.body.id}/attachment`)
        .set('Authorization', `Bearer ${directorToken}`)
        .attach('file', Buffer.from('%PDF-1.4 fake'), 'preuve.pdf')
        .expect(201)) as { body: IncidentResponse };
      expect(uploaded.body.attachmentKey).toBeTruthy();

      const urlRes = (await request(app.getHttpServer())
        .get(`/api/incidents/${created.body.id}/attachment-url`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: { url: string } };
      expect(urlRes.body.url).toContain('fake-signed-url.test');
    });
  });

  describe('historical incidents (legacy status preserved)', () => {
    it('a pre-PR-11 incident with a legacy status still reads correctly, with default priority', async () => {
      const legacy = await prisma.incident.create({
        data: {
          title: 'Ancien incident',
          type: 'AUTRE',
          description: 'Créé avant PR 11',
          signaledBy: 'x',
          status: 'PLANIFIE',
          // priority intentionally omitted — relies on the column default.
        },
      });

      const res = (await request(app.getHttpServer())
        .get('/api/incidents')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200)) as { body: IncidentResponse[] };

      const found = res.body.find((i) => i.id === legacy.id);
      if (!found) throw new Error('Legacy incident not found in list');
      expect(found.status).toBe('PLANIFIE');
      expect(found.priority).toBe('N3');
      expect(found.createdBy).toBeNull();
    });

    it('a legacy incident can be transitioned into the new workflow', async () => {
      const legacy = await prisma.incident.create({
        data: {
          title: 'Ancien incident en retard',
          type: 'AUTRE',
          description: 'x',
          signaledBy: 'x',
          status: 'EN_RETARD',
        },
      });

      const res = (await request(app.getHttpServer())
        .patch(`/api/incidents/${legacy.id}/status`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ status: 'EN_COURS', note: 'Repris en charge.' })
        .expect(200)) as { body: IncidentResponse };

      expect(res.body.status).toBe('EN_COURS');
      expect(res.body.statusHistory[0].previousStatus).toBe('EN_RETARD');
    });
  });
});
