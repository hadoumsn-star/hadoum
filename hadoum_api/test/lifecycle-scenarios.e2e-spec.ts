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
// create -> rejected -> modify -> resubmit -> approved, verifying
// notifications fire at each step. Supplier Contracts workflow update:
// creation itself now already submits for validation (see
// supplier-contracts-validation-workflow.e2e-spec.ts for the dedicated
// creation-workflow coverage) — only the modify -> resubmit step after a
// rejection still uses the submit-validation endpoint here.

interface SupplierContractResponse {
  id: string;
  status: string;
  validationStatus: string;
}

interface AdministrativeProcedureResponse {
  id: string;
  status: string;
  pendingValidationAction: string | null;
}

interface NotificationEntry {
  type: string;
}

interface ValidationHistoryEntry {
  status: string;
}

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('Supplier contract: create (already pending) -> rejected -> modify -> resubmit -> approved (ACTIF)', async () => {
    const createRes = (await request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        supplierName: 'SENELEC',
        contractName: 'Électricité annuelle',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        amount: 600_000,
      })
      .expect(201)) as { body: SupplierContractResponse };
    const contractId = createRes.body.id;
    // Supplier Contracts workflow update: creation itself already enters
    // the validation workflow — no separate submit step for a brand-new
    // contract any more.
    expect(createRes.body.status).toBe('BROUILLON');
    expect(createRes.body.validationStatus).toBe('PENDING_VALIDATION');

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${contractId}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Montant à renégocier' })
      .expect(200);

    const directorNotifs = (await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: NotificationEntry[] };
    expect(
      directorNotifs.body.some((n) => n.type === 'VALIDATION_REJECTED'),
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

    const approveRes = (await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${contractId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200)) as { body: SupplierContractResponse };
    expect(approveRes.body.status).toBe('ACTIF');

    const history = (await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${contractId}/validation-history`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: ValidationHistoryEntry[] };
    expect(history.body).toHaveLength(2);
    expect(history.body.map((h) => h.status).sort()).toEqual([
      'APPROVED',
      'REJECTED',
    ]);
  });

  it('Supplier contract: DIRECTOR cannot approve/reject their own submission (role-level self-approval block)', async () => {
    const createRes = (await request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        supplierName: 'x',
        contractName: 'x',
        category: 'AUTRE',
        startDate: '2026-01-01',
        amount: 600_000,
      })
      .expect(201)) as { body: SupplierContractResponse };
    // Already pending as of creation — no submit-validation call needed.
    expect(createRes.body.validationStatus).toBe('PENDING_VALIDATION');

    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${createRes.body.id}/approve`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(403);
  });

  it('Administrative procedure: create -> submit (SUBMISSION) -> rejected -> modify -> resubmit -> approved (SOUMIS)', async () => {
    const createRes = (await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        title: "Agrément d'ouverture",
        procedureType: 'AGREMENT',
        authority: 'Ministère de la Famille',
      })
      .expect(201)) as { body: AdministrativeProcedureResponse };
    const procId = createRes.body.id;
    expect(createRes.body.status).toBe('A_PREPARER');

    const submitRes = (await request(app.getHttpServer())
      .post(`/api/administrative-procedures/${procId}/submit-validation`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({})
      .expect(201)) as { body: AdministrativeProcedureResponse };
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

    const approveRes = (await request(app.getHttpServer())
      .patch(`/api/administrative-procedures/${procId}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200)) as { body: AdministrativeProcedureResponse };
    expect(approveRes.body.status).toBe('SOUMIS');

    const directorNotifs = (await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200)) as { body: NotificationEntry[] };
    const types = directorNotifs.body.map((n) => n.type);
    expect(types).toEqual(
      expect.arrayContaining(['VALIDATION_REJECTED', 'VALIDATION_APPROVED']),
    );
  });

  it('Administrative procedure: cannot submit a procedure already in a terminal state (archived)', async () => {
    const createRes = (await request(app.getHttpServer())
      .post('/api/administrative-procedures')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ title: 'x', procedureType: 'AGREMENT', authority: 'x' })
      .expect(201)) as { body: AdministrativeProcedureResponse };
    const procId = createRes.body.id;

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
