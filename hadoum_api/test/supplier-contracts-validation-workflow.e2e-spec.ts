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

// Supplier Contracts workflow update: every new contract created by a
// DIRECTOR now enters the generic ValidationRequest engine automatically —
// no amount threshold, no separate "Soumettre pour validation" click.
// Reuses the exact same engine every other resource type (maintenance
// tickets, stock items, ...) already goes through — nothing here
// reimplements validation state machinery of its own.
describe('Supplier Contracts — automatic validation workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let directorId: string;
  let supervisorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);
    directorId = users.director.id;

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
  });

  afterAll(async () => {
    await app.close();
  });

  function createContract(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        supplierName: 'SENELEC',
        contractName: 'Fourniture électricité',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        amount: 300_000,
        ...body,
      });
  }

  it('a DIRECTOR-created contract immediately becomes pending validation — no separate submit step', async () => {
    const created = await createContract().expect(201);

    expect(created.body.status).toBe('BROUILLON');
    expect(created.body.validationStatus).toBe('PENDING_VALIDATION');
    expect(created.body.pendingValidationAction).toBe('CREATION');
  });

  it('a ValidationRequest is created automatically, visible in the contract\'s own validation history', async () => {
    const created = await createContract().expect(201);

    const history = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe('PENDING_VALIDATION');
    expect(history.body[0].submittedBy.id).toBe(directorId);
  });

  it('SUPERVISOR sees the new contract in the generic validation queue with the fields needed to triage it', async () => {
    const created = await createContract({ contractName: 'Contrat visible par le superviseur' }).expect(201);

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const entry = pending.body.find(
      (v: { resourceType: string; resourceId: string }) =>
        v.resourceType === 'SUPPLIER_CONTRACT' && v.resourceId === created.body.id,
    );
    expect(entry).toBeTruthy();
    expect(entry.resource.contractName).toBe('Contrat visible par le superviseur');
    expect(entry.resource.supplierName).toBe('SENELEC');
    expect(entry.resource.category).toBe('ELECTRICITE');
    expect(entry.resource.startDate).toBeTruthy();
    expect(entry.resource.endDate).toBeTruthy();
    expect(entry.resource.amount).toBe(300_000);
    expect(entry.submittedBy.id).toBe(directorId);
    expect(entry.submittedAt).toBeTruthy();
  });

  it('SUPERVISOR approves: contract becomes ACTIF, validation history is kept, it leaves pending validations', async () => {
    const created = await createContract().expect(201);

    const approved = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('ACTIF');
    expect(approved.body.validationStatus).toBe('APPROVED');

    const history = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe('APPROVED');

    const pending = await request(app.getHttpServer())
      .get('/api/validations/pending')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    expect(pending.body.some((v: { resourceId: string }) => v.resourceId === created.body.id)).toBe(false);
  });

  it('SUPERVISOR rejects: requires a non-empty comment, keeps the contract readable, stores the reason', async () => {
    const created = await createContract().expect(201);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: '' })
      .expect(400);

    const rejected = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Fournisseur non homologué' })
      .expect(200);
    expect(rejected.body.validationStatus).toBe('REJECTED');

    const readBack = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(readBack.body.contractName).toBe(created.body.contractName);

    const history = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(history.body[0].comment).toBe('Fournisseur non homologué');
  });

  it('DIRECTOR cannot approve or reject', async () => {
    const created = await createContract().expect(201);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ comment: 'x' })
      .expect(403);
  });

  it('prevents a duplicate pending ValidationRequest: submitting again while already pending is rejected', async () => {
    const created = await createContract().expect(201);

    await request(app.getHttpServer())
      .post(`/api/supplier-contracts/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(409);
  });

  it('a rejected contract remains editable and can be resubmitted through the existing submit-validation workflow', async () => {
    const created = await createContract().expect(201);
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Montant à revoir' })
      .expect(200);

    const edited = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ amount: 250_000 })
      .expect(200);
    expect(edited.body.amount).toBe(250_000);

    await request(app.getHttpServer())
      .post(`/api/supplier-contracts/${created.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const resubmitted = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(resubmitted.body.validationStatus).toBe('PENDING_VALIDATION');

    const approved = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);
    expect(approved.body.status).toBe('ACTIF');
  });

  it('notifies SUPERVISOR exactly once on creation, with the required title', async () => {
    const users = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const before = users.body.length;

    await createContract({ contractName: 'Contrat notif unique' }).expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);

    const matching = after.body.filter(
      (n: { title: string }) => n.title === 'Nouveau contrat fournisseur à valider',
    );
    expect(matching).toHaveLength(1);
    expect(after.body.length).toBe(before + 1);
  });

  it('notifies the creating DIRECTOR on approval and on rejection, with the required titles', async () => {
    const approvedContract = await createContract({ contractName: 'À approuver' }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${approvedContract.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    const rejectedContract = await createContract({ contractName: 'À refuser' }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${rejectedContract.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Documents manquants' })
      .expect(200);

    const directorNotifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const approvalNotif = directorNotifications.body.find(
      (n: { title: string; resourceId: string }) =>
        n.title === 'Contrat fournisseur approuvé' && n.resourceId === approvedContract.body.id,
    );
    expect(approvalNotif).toBeTruthy();

    const rejectionNotif = directorNotifications.body.find(
      (n: { title: string; resourceId: string }) =>
        n.title === 'Contrat fournisseur refusé' && n.resourceId === rejectedContract.body.id,
    );
    expect(rejectionNotif).toBeTruthy();
    expect(rejectionNotif.message).toContain('Documents manquants');
  });

  it('Expire bientôt is untouched: a contract still reports EXPIRE_BIENTOT within the warning window', async () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await createContract({ endDate: soon }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.effectiveStatus).toBe('EXPIRE_BIENTOT');
  });
});
