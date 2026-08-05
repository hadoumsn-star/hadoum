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

// PR 8: Supplier Contracts <-> Contact directory integration. Mirrors
// test/maintenance-tickets.e2e-spec.ts's PR 3 coverage exactly (real Contact
// API + real Supplier Contract API against a real Postgres database) —
// relation behavior (SetNull semantics, the supplierContactId dual-write,
// inactive-but-readable references) is exactly the kind of thing a
// mocked-Prisma unit test can't actually prove, which is why this exists
// alongside supplier-contracts.service.spec.ts rather than instead of it.
describe('Supplier Contracts — Contact assignment (e2e)', () => {
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
      data: { key: 'FOURNISSEUR', label: 'Fournisseur', sortOrder: 1 },
    });
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Awa Diop',
        organization: 'SENELEC',
        categoryId: category.id,
        phone: '771234567',
        email: 'awa.diop@senelec.sn',
      },
    });
    activeContactId = contact.id;
    activeContactName = contact.fullName;
  });

  afterAll(async () => {
    await app.close();
  });

  function createContract(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        contractName: 'Fourniture électricité',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        ...body,
      });
  }

  it('creates a contract with an active Contact and derives the legacy snapshot fields', async () => {
    const res = await createContract({ supplierContactId: activeContactId }).expect(201);
    expect(res.body.supplierContactId).toBe(activeContactId);
    expect(res.body.supplierName).toBe('SENELEC');
    expect(res.body.contactPerson).toBe(activeContactName);
    expect(res.body.phone).toBe('771234567');
    expect(res.body.email).toBe('awa.diop@senelec.sn');
    expect(res.body.supplierContact.id).toBe(activeContactId);
    expect(res.body.supplierContact.category.key).toBe('FOURNISSEUR');
  });

  it('inline-creates a supplier via the Contact API, then links it on contract creation', async () => {
    const category = await prisma.contactCategory.findFirstOrThrow({
      where: { key: 'FOURNISSEUR' },
    });
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ fullName: 'Nouveau Fournisseur', categoryId: category.id })
      .expect(201);

    const res = await createContract({ supplierContactId: created.body.id }).expect(201);
    expect(res.body.supplierContactId).toBe(created.body.id);
    expect(res.body.supplierName).toBe('Nouveau Fournisseur');
  });

  it('still supports the legacy free-text path when no Contact is selected', async () => {
    const res = await createContract({ supplierName: 'Fournisseur en texte libre' }).expect(201);
    expect(res.body.supplierContactId).toBeNull();
    expect(res.body.supplierContact).toBeNull();
    expect(res.body.supplierName).toBe('Fournisseur en texte libre');
  });

  it('rejects creation when neither a Contact nor a supplierName is given', async () => {
    await createContract({}).expect(400);
  });

  it('rejects an unknown contact id on create', async () => {
    await createContract({ supplierContactId: 'does-not-exist' }).expect(400);
  });

  it('rejects an inactive contact for a new assignment on create', async () => {
    await prisma.contact.update({ where: { id: activeContactId }, data: { active: false } });
    await createContract({ supplierContactId: activeContactId }).expect(400);
  });

  it('lists contracts with supplierContact and category included', async () => {
    await createContract({ supplierContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/supplier-contracts')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body[0].supplierContact.fullName).toBe(activeContactName);
    expect(res.body[0].supplierContact.category.key).toBe('FOURNISSEUR');
  });

  it('returns the contract detail with supplierContact included', async () => {
    const created = await createContract({ supplierContactId: activeContactId }).expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.supplierContact.fullName).toBe(activeContactName);
  });

  it('keeps a legacy supplierName-only contract (no linked contact) fully readable and editable', async () => {
    const created = await createContract({ supplierName: 'Fournisseur (texte libre)' }).expect(201);
    expect(created.body.supplierContactId).toBeNull();

    const res = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(res.body.supplierName).toBe('Fournisseur (texte libre)');
    expect(res.body.supplierContact).toBeNull();

    const updated = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contractName: 'Nom modifié' })
      .expect(200);
    expect(updated.body.contractName).toBe('Nom modifié');
    expect(updated.body.supplierName).toBe('Fournisseur (texte libre)');
  });

  it('replaces a legacy free-text supplier with a Contact on update', async () => {
    const created = await createContract({ supplierName: 'Ancien fournisseur texte' }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ supplierContactId: activeContactId })
      .expect(200);

    expect(res.body.supplierContactId).toBe(activeContactId);
    expect(res.body.supplierName).toBe('SENELEC');
    expect(res.body.contactPerson).toBe(activeContactName);
  });

  it('disconnecting the Contact (explicit null) preserves the last-known snapshot as plain text', async () => {
    const created = await createContract({ supplierContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ supplierContactId: null })
      .expect(200);

    expect(res.body.supplierContactId).toBeNull();
    expect(res.body.supplierContact).toBeNull();
    // supplierName is NOT NULL — disconnecting must never destroy it.
    expect(res.body.supplierName).toBe('SENELEC');
  });

  it('leaves the existing relation untouched when supplierContactId is omitted', async () => {
    const created = await createContract({ supplierContactId: activeContactId }).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ contractName: 'Titre modifié' })
      .expect(200);

    expect(res.body.contractName).toBe('Titre modifié');
    expect(res.body.supplierContactId).toBe(activeContactId);
    expect(res.body.supplierName).toBe('SENELEC');
  });

  it('keeps a contract readable, with the reference intact, after its Contact is deactivated', async () => {
    const created = await createContract({ supplierContactId: activeContactId }).expect(201);
    await prisma.contact.update({ where: { id: activeContactId }, data: { active: false } });

    const res = await request(app.getHttpServer())
      .get(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.supplierContact.id).toBe(activeContactId);
    expect(res.body.supplierContact.active).toBe(false);
  });

  // Supplier Contracts workflow update: creation now enters the validation
  // workflow automatically (no more amount threshold, no more separate
  // "Soumettre pour validation" click) — a fresh contract is already
  // PENDING_VALIDATION, so SUPERVISOR can approve it directly.
  it('a freshly-created contract already requires validation and can be approved directly, on a contact-linked contract', async () => {
    const created = await createContract({
      supplierContactId: activeContactId,
      amount: 600_000,
    }).expect(201);
    expect(created.body.status).toBe('BROUILLON');
    expect(created.body.validationStatus).toBe('PENDING_VALIDATION');
    expect(created.body.pendingValidationAction).toBe('CREATION');

    const approved = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({})
      .expect(200);

    expect(approved.body.status).toBe('ACTIF');
    expect(approved.body.validationStatus).toBe('APPROVED');
    expect(approved.body.supplierContact.id).toBe(activeContactId);
  });

  it('still supports reject directly on a freshly-created, contact-linked contract', async () => {
    const created = await createContract({
      supplierContactId: activeContactId,
      amount: 600_000,
    }).expect(201);

    const rejected = await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ comment: 'Montant trop élevé' })
      .expect(200);

    expect(rejected.body.validationStatus).toBe('REJECTED');
  });

  it('a low-amount, contact-linked contract also requires validation now (no more free pass)', async () => {
    const created = await createContract({
      supplierContactId: activeContactId,
      amount: 1_000, // well under the old threshold
    }).expect(201);

    expect(created.body.status).toBe('BROUILLON');
    expect(created.body.validationStatus).toBe('PENDING_VALIDATION');
  });

  it('reports EXPIRE_BIENTOT for a contact-linked contract expiring within 30 days, once approved', async () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await createContract({
      supplierContactId: activeContactId,
      endDate: soon,
    }).expect(201);

    // Supplier Contracts workflow update: every new contract now starts
    // BROUILLON/PENDING_VALIDATION — BROUILLON is one of effectiveStatus's
    // own terminal passthrough states (see SupplierContractsService), so
    // expiry-derived statuses only apply once the contract is actually
    // ACTIF, i.e. approved.
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

  it('role restrictions are unchanged: SUPERVISOR still cannot create or update contracts', async () => {
    await request(app.getHttpServer())
      .post('/api/supplier-contracts')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ contractName: 'x', category: 'ELECTRICITE', startDate: '2026-01-01', supplierContactId: activeContactId })
      .expect(403);

    const created = await createContract({ supplierContactId: activeContactId }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/supplier-contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ contractName: 'x' })
      .expect(403);
  });
});
