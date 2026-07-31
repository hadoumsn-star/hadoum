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

// Full DIRECTOR -> SUPERVISOR lifecycle scenarios for the remaining
// validation-enabled resources (maintenance tickets are covered in
// validation-workflow.e2e-spec.ts; stock/inventory/register in
// stock-inventory-register.e2e-spec.ts). Each scenario here walks:
// create -> submit -> rejected -> modify -> resubmit -> approved,
// verifying notifications fire at each step.
describe('Full lifecycle scenarios: Supplier contract & Administrative procedure (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let users: Awaited<ReturnType<typeof seedTestUsers>>;
  let directorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    users = await seedTestUsers(prisma);

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

  it('Supplier contract: create (high amount, draft) -> submit -> rejected -> modify -> resubmit -> approved (ACTIF)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        supplierName: 'SENELEC',
        contractName: 'Électricité annuelle',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        amount: 600_000, // above the validation threshold -> created as BROUILLON
      })
      .expect(201);
    const contractId = createRes.body.id as string;
    expect(createRes.body.status).toBe('BROUILLON');

    await request(app.getHttpServer())
      .post(`/api/supplier-contracts/${contractId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${contractId}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Montant à renégocier' })
      .expect(200);

    const directorNotifs = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(
      directorNotifs.body.some((n: { type: string }) => n.type === 'VALIDATION_REJECTED'),
    ).toBe(true);

    // Modify (e.g. lower the amount, still stays a draft) then resubmit.
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${contractId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ amount: 550_000 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/supplier-contracts/${contractId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approveRes = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${contractId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);
    expect(approveRes.body.status).toBe('ACTIF');

    const history = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${contractId}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.map((h: { status: string }) => h.status).sort()).toEqual([
      'APPROVED',
      'REJECTED',
    ]);
  });

  it('Supplier contract: DIRECTOR cannot approve/reject their own submission (role-level self-approval block)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        supplierName: 'x',
        contractName: 'x',
        category: 'AUTRE',
        startDate: '2026-01-01',
        amount: 600_000,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/supplier-contracts/${createRes.body.id}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${createRes.body.id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(403);
  });

  it('Administrative procedure: create -> submit (SUBMISSION) -> rejected -> modify -> resubmit -> approved (SOUMIS)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Agrément d'ouverture",
        procedureType: 'AGREMENT',
        authority: 'Ministère de la Famille',
      })
      .expect(201);
    const procId = createRes.body.id as string;
    expect(createRes.body.status).toBe('A_PREPARER');

    const submitRes = await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${procId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);
    expect(submitRes.body.pendingValidationAction).toBe('SUBMISSION');

    await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${procId}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Dossier incomplet' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${procId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ description: 'Dossier complété' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${procId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201);

    const approveRes = await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${procId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);
    expect(approveRes.body.status).toBe('SOUMIS');

    const directorNotifs = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    const types = directorNotifs.body.map((n: { type: string }) => n.type);
    expect(types).toEqual(
      expect.arrayContaining(['VALIDATION_REJECTED', 'VALIDATION_APPROVED']),
    );
  });

  it('Administrative procedure: cannot submit a procedure already in a terminal state (archived)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ title: 'x', procedureType: 'AGREMENT', authority: 'x' })
      .expect(201);
    const procId = createRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${procId}/archive`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${procId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(409);
  });
});
