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

interface MaintenanceTicketResponse {
  id: string;
  status: string;
}

interface PendingValidationEntry {
  resourceId: string;
}

interface NotificationEntry {
  type: string;
}

interface ValidationHistoryEntry {
  status: string;
}

describe('Validation workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let users: Awaited<ReturnType<typeof seedTestUsers>>;
  let directorToken: string;
  let supervisorToken: string;
  let spaceId: string;

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

    const spaceRes = (await request(app.getHttpServer())
      .post('/api/spaces')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name: 'Cuisine', type: 'CUISINE' })) as { body: { id: string } };
    spaceId = spaceRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTicket(
    overrides: Record<string, unknown> = {},
  ): Promise<MaintenanceTicketResponse> {
    const res = (await request(app.getHttpServer())
      .post('/api/maintenance-tickets')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Fuite d'eau",
        spaceId,
        urgency: 'CRITIQUE',
        reportedBy: 'Jean',
        ...overrides,
      })
      .expect(201)) as { body: MaintenanceTicketResponse };
    return res.body;
  }

  it('full lifecycle: create -> submit -> reject -> resubmit -> approve, with notifications throughout', async () => {
    const ticket = await createTicket();

    // A critical ticket cannot be closed directly.
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/close`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409);

    // Submit for validation.
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    // Supervisor sees it in the pending queue.
    const pending = (await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200)) as { body: PendingValidationEntry[] };
    expect(pending.body.some((v) => v.resourceId === ticket.id)).toBe(true);

    // Director got no notification yet; reject and check the director IS
    // notified once the supervisor rejects.
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Justificatifs manquants' })
      .expect(200);

    const directorNotifs = (await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: NotificationEntry[] };
    expect(
      directorNotifs.body.some((n) => n.type === 'VALIDATION_REJECTED'),
    ).toBe(true);

    // Resubmit after "modifying" (here: just resubmitting again).
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    // Approve this time.
    const approveRes = (await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200)) as { body: MaintenanceTicketResponse };
    expect(approveRes.body.status).toBe('FERME');

    const directorNotifsAfterApproval = (await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: NotificationEntry[] };
    expect(
      directorNotifsAfterApproval.body.some(
        (n) => n.type === 'VALIDATION_APPROVED',
      ),
    ).toBe(true);
  });

  it('blocks rejecting with an empty comment (400)', async () => {
    const ticket = await createTicket();
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: '' })
      .expect(400);
  });

  it('blocks a duplicate approval (409) once already approved', async () => {
    const ticket = await createTicket({ urgency: 'MOYENNE' });
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(409);
  });

  it('blocks approving after a rejection (409)', async () => {
    const ticket = await createTicket({ urgency: 'MOYENNE' });
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'No' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(409);
  });

  it('blocks self-approval structurally: DIRECTOR cannot call the approve route at all', async () => {
    const ticket = await createTicket({ urgency: 'MOYENNE' });
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(403);
  });

  it('returns 404 for a missing resource', async () => {
    await request(app.getHttpServer())
      .get('/api/maintenance-tickets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(404);
  });

  it('persists the full validation history in order', async () => {
    const ticket = await createTicket({ urgency: 'MOYENNE' });
    await request(app.getHttpServer())
      .post(`/api/maintenance-tickets/${ticket.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/maintenance-tickets/${ticket.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    const history = (await request(app.getHttpServer())
      .get(`/api/maintenance-tickets/${ticket.id}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: ValidationHistoryEntry[] };

    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe('APPROVED');
  });
});
