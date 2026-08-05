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

// PR 4: Finance/Expenses <-> Contact directory integration, plus payment
// method and the dedicated expense-document endpoints. Drives the real
// Contact API and the real Finance API against a real Postgres database —
// Finance had no automated coverage at all before this PR, so this exists
// specifically to prove relation/document behavior end-to-end rather than
// through mocked Prisma calls only (see finances.service.spec.ts for the
// unit-level coverage of the same behavior).
describe('Finances — Contact assignment, payment method, documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let activeSupplierId: string;
  let activeSupplierName: string;

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
    const supplier = await prisma.contact.create({
      data: { fullName: 'Ets Diop Fournitures', categoryId: category.id },
    });
    activeSupplierId = supplier.id;
    activeSupplierName = supplier.fullName;
  });

  afterAll(async () => {
    await app.close();
  });

  function createExpense(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'Réparation plomberie',
        amountXof: 25000,
        date: '2026-08-01',
        ...body,
      });
  }

  function createIncome(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        type: 'RECETTE',
        category: 'DON',
        label: 'Don',
        amountXof: 10000,
        date: '2026-08-01',
        ...body,
      });
  }

  // ─── Supplier relation ──────────────────────────────────────────────────

  it('creates an expense without a supplier exactly as before', async () => {
    const res = await createExpense().expect(201);
    expect(res.body.supplierContactId).toBeNull();
    expect(res.body.supplierContact).toBeNull();
  });

  it('creates an expense with an active supplier connected', async () => {
    const res = await createExpense({ supplierContactId: activeSupplierId }).expect(201);
    expect(res.body.supplierContactId).toBe(activeSupplierId);
    expect(res.body.supplierContact.fullName).toBe(activeSupplierName);
  });

  it('rejects an unknown supplier id', async () => {
    await createExpense({ supplierContactId: 'does-not-exist' }).expect(400);
  });

  it('rejects an inactive supplier for a new assignment', async () => {
    const inactive = await prisma.contact.update({
      where: { id: activeSupplierId },
      data: { active: false },
    });
    await createExpense({ supplierContactId: inactive.id }).expect(400);
  });

  it('lists and reads expense detail with supplierContact included', async () => {
    const created = await createExpense({ supplierContactId: activeSupplierId }).expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(list.body.find((t: any) => t.id === created.body.id).supplierContact.fullName)
      .toBe(activeSupplierName);

    const detail = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(detail.body.supplierContact.fullName).toBe(activeSupplierName);
  });

  it('updates the supplier on an existing expense', async () => {
    const created = await createExpense().expect(201);
    const category = await prisma.contactCategory.findFirstOrThrow();
    const otherSupplier = await prisma.contact.create({
      data: { fullName: 'Autre Fournisseur', categoryId: category.id },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ supplierContactId: otherSupplier.id })
      .expect(200);

    expect(res.body.supplierContactId).toBe(otherSupplier.id);
  });

  it('clears the supplier when supplierContactId is explicitly null', async () => {
    const created = await createExpense({ supplierContactId: activeSupplierId }).expect(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ supplierContactId: null })
      .expect(200);
    expect(res.body.supplierContactId).toBeNull();
    expect(res.body.supplierContact).toBeNull();
  });

  it('leaves the existing supplier untouched when supplierContactId is omitted', async () => {
    const created = await createExpense({ supplierContactId: activeSupplierId }).expect(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ label: 'Nouveau libellé' })
      .expect(200);
    expect(res.body.label).toBe('Nouveau libellé');
    expect(res.body.supplierContactId).toBe(activeSupplierId);
  });

  it('keeps an expense readable, with the reference intact, after its supplier is deactivated', async () => {
    const created = await createExpense({ supplierContactId: activeSupplierId }).expect(201);
    await prisma.contact.update({ where: { id: activeSupplierId }, data: { active: false } });

    const res = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.supplierContact.id).toBe(activeSupplierId);
    expect(res.body.supplierContact.active).toBe(false);
  });

  // ─── Payment method ─────────────────────────────────────────────────────

  it('creates and updates the payment method', async () => {
    const created = await createExpense({ paymentMethod: 'ESPECES' }).expect(201);
    expect(created.body.paymentMethod).toBe('ESPECES');

    const updated = await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ paymentMethod: 'VIREMENT' })
      .expect(200);
    expect(updated.body.paymentMethod).toBe('VIREMENT');
  });

  // Mobile Money split: WAVE_MOBILE_MONEY / ORANGE_MOBILE_MONEY are the new
  // selectable values; MOBILE_MONEY (additive migration, never removed from
  // the enum) must stay fully creatable/readable for historical compatibility.
  it('accepts the new Wave/Orange Mobile Money payment methods', async () => {
    const wave = await createExpense({ paymentMethod: 'WAVE_MOBILE_MONEY' }).expect(201);
    expect(wave.body.paymentMethod).toBe('WAVE_MOBILE_MONEY');

    const orange = await createExpense({ paymentMethod: 'ORANGE_MOBILE_MONEY' }).expect(201);
    expect(orange.body.paymentMethod).toBe('ORANGE_MOBILE_MONEY');
  });

  it('a historical MOBILE_MONEY transaction remains readable and unmodified', async () => {
    const created = await createExpense({ paymentMethod: 'MOBILE_MONEY' }).expect(201);
    expect(created.body.paymentMethod).toBe('MOBILE_MONEY');

    const fetched = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(fetched.body.paymentMethod).toBe('MOBILE_MONEY');

    // Updating an unrelated field must not disturb the legacy payment method.
    const updated = await request(app.getHttpServer())
      .patch(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ label: 'Libellé mis à jour' })
      .expect(200);
    expect(updated.body.paymentMethod).toBe('MOBILE_MONEY');
  });

  // ─── Legacy expense categories ──────────────────────────────────────────
  // ENTRETIEN/PEDAGOGIE/EQUIPEMENT/AUTRE are no longer offered in the
  // frontend's "new expense" dropdown (see EXPENSE_CATEGORIES), but the
  // Prisma enum and this API are unchanged — every other test in this file
  // already relies on that implicitly (createExpense()'s default category
  // is ENTRETIEN); this makes it explicit for a second legacy category.

  it('a legacy category (EQUIPEMENT) remains fully creatable and readable', async () => {
    const created = await createExpense({ category: 'EQUIPEMENT' }).expect(201);
    expect(created.body.category).toBe('EQUIPEMENT');

    const fetched = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(fetched.body.category).toBe('EQUIPEMENT');

    const list = await request(app.getHttpServer())
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(list.body.some((t: any) => t.id === created.body.id && t.category === 'EQUIPEMENT')).toBe(true);
  });

  // ─── Income compatibility ───────────────────────────────────────────────

  it('still creates income with donor fields, unaffected by the supplier/payment additions', async () => {
    const named = await createIncome({ donorName: 'Amina', isAnonymousDonor: false }).expect(201);
    expect(named.body.donorName).toBe('Amina');
    expect(named.body.supplierContactId).toBeNull();

    const anonymous = await createIncome({ isAnonymousDonor: true }).expect(201);
    expect(anonymous.body.isAnonymousDonor).toBe(true);
  });

  it('rejects a supplierContactId on income', async () => {
    await createIncome({ supplierContactId: activeSupplierId }).expect(400);
  });

  // ─── Dedicated expense documents ────────────────────────────────────────

  for (const kind of ['purchase-order', 'invoice', 'delivery-note'] as const) {
    it(`uploads, reads, and deletes a ${kind} on an expense`, async () => {
      const created = await createExpense().expect(201);

      const uploaded = await request(app.getHttpServer())
        .post(`/api/finances/transactions/${created.body.id}/${kind}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .attach('file', Buffer.from('%PDF-1.4 fake'), `${kind}.pdf`)
        .expect(201);
      const keyField = kind === 'purchase-order' ? 'purchaseOrderKey' : kind === 'invoice' ? 'invoiceKey' : 'deliveryNoteKey';
      expect(uploaded.body[keyField]).toBeTruthy();

      const urlRes = await request(app.getHttpServer())
        .get(`/api/finances/transactions/${created.body.id}/${kind}-url`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(urlRes.body.url).toBeTruthy();

      const deleted = await request(app.getHttpServer())
        .delete(`/api/finances/transactions/${created.body.id}/${kind}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(deleted.body[keyField]).toBeNull();
    });
  }

  it('rejects a purchase order upload on a RECETTE', async () => {
    const created = await createIncome().expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/purchase-order`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'po.pdf')
      .expect(400);
  });

  it('rejects an invoice upload on a RECETTE', async () => {
    const created = await createIncome().expect(201);
    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/invoice`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'invoice.pdf')
      .expect(400);
  });

  // ─── Legacy justificatif — unchanged ────────────────────────────────────

  it('still supports the legacy justificatif endpoint on an expense that also has dedicated documents', async () => {
    const created = await createExpense().expect(201);

    await request(app.getHttpServer())
      .post(`/api/finances/transactions/${created.body.id}/justificatif`)
      .set('Authorization', `Bearer ${directorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'justif.pdf')
      .expect(201);

    const urlRes = await request(app.getHttpServer())
      .get(`/api/finances/transactions/${created.body.id}/justificatif-url`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
    expect(urlRes.body.url).toBeTruthy();
  });

  // ─── Aggregation regression ─────────────────────────────────────────────

  it('dashboard totals are unaffected by supplier/payment/document fields', async () => {
    await createExpense({ status: 'VALIDE', amountXof: 15000, supplierContactId: activeSupplierId, paymentMethod: 'ESPECES' }).expect(201);
    await createIncome({ status: 'VALIDE', amountXof: 40000 }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/finances/dashboard?year=2026&month=8')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.soldeCaisseXof).toBe(40000 - 15000);
  });

  // ─── Permissions — unchanged (class-level DIRECTOR + SUPERVISOR) ────────

  it('permission behavior is unchanged: both DIRECTOR and SUPERVISOR can create/manage transactions', async () => {
    await request(app.getHttpServer())
      .post('/api/finances/transactions')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ type: 'DEPENSE', category: 'ENTRETIEN', label: 'x', amountXof: 1000, date: '2026-08-01' })
      .expect(201);
  });

  it('an unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .get('/api/finances/transactions')
      .expect(401);
  });
});
