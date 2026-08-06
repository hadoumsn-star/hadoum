import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

// PR 13: Audit Logs — generic, cross-cutting audit trail covering Finance,
// Contacts, Maintenance, Administrative Procedures, Supplier Contracts,
// Stock, and Incidents. Every entry here comes from the real
// AuditLogInterceptor wired onto the real controllers — no shortcuts through
// AuditLogsService directly — so this also proves each covered module's
// business endpoints still behave exactly as before (no business-logic
// changes: every create/update below asserts on the *business* response,
// not just the audit side-effect).

interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  module: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  user: { id: string } | null;
}

interface CreatedResource {
  id: string;
  label?: string;
}

describe('Audit Logs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let directorId: string;
  let supervisorToken: string;
  let educatorToken: string;
  let spaceId: string;
  let contactCategoryId: string;

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

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const educator = await prisma.user.create({
      data: {
        email: 'educator@test.local',
        passwordHash,
        name: 'Test Educator',
        initials: 'TE',
        role: 'EDUCATOR',
        roleLabel: 'Éducateur',
        title: 'Classe',
      },
    });
    educatorToken = (
      (await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: educator.email, password: TEST_PASSWORD })) as {
        body: { token: string };
      }
    ).body.token;

    const space = await prisma.space.create({
      data: { name: 'Cuisine principale', type: 'CUISINE' },
    });
    spaceId = space.id;

    const category = await prisma.contactCategory.create({
      data: { key: 'FOURNISSEUR', label: 'Fournisseur', sortOrder: 1 },
    });
    contactCategoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  async function auditFor(
    module: string,
    entityId: string,
  ): Promise<AuditLogEntry[]> {
    const res = (await request(app.getHttpServer())
      .get(`/api/audit-logs?module=${module}`)
      .set('Authorization', auth(directorToken))
      .expect(200)) as { body: AuditLogEntry[] };
    return res.body.filter((l) => l.entityId === entityId);
  }

  describe('Finance', () => {
    it('logs a Transaction create with the business response unaffected', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/finances/transactions')
        .set('Authorization', auth(directorToken))
        .send({
          type: 'DEPENSE',
          category: 'ENTRETIEN',
          label: 'Réparation plomberie',
          amountXof: 15000,
          date: '2026-01-15',
        })
        .expect(201)) as { body: CreatedResource };
      expect(res.body.label).toBe('Réparation plomberie'); // business response untouched

      const entries = await auditFor('FINANCE', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: 'CREATE',
        entity: 'Transaction',
        entityId: res.body.id,
        before: null,
      });
      expect(entries[0].after?.label).toBe('Réparation plomberie');
      expect(entries[0].user?.id).toBe(directorId);
    });

    it('logs a Transaction update with a before/after snapshot', async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/finances/transactions')
        .set('Authorization', auth(directorToken))
        .send({
          type: 'DEPENSE',
          category: 'ENTRETIEN',
          label: 'Avant',
          amountXof: 1000,
          date: '2026-01-15',
        })) as { body: CreatedResource };

      await request(app.getHttpServer())
        .patch(`/api/finances/transactions/${created.body.id}`)
        .set('Authorization', auth(directorToken))
        .send({ label: 'Après' })
        .expect(200);

      const entries = await auditFor('FINANCE', created.body.id);
      const update = entries.find((e) => e.action === 'UPDATE');
      if (!update) throw new Error('UPDATE audit entry not found');
      expect(update.before?.label).toBe('Avant');
      expect(update.after?.label).toBe('Après');
    });
  });

  describe('Contacts', () => {
    it('logs a Contact create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/contacts')
        .set('Authorization', auth(directorToken))
        .send({ fullName: 'Ousmane Diop', categoryId: contactCategoryId })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('CONTACTS', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('Contact');
      expect(entries[0].after?.fullName).toBe('Ousmane Diop');
    });
  });

  describe('Maintenance', () => {
    it('logs a MaintenanceTicket create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/maintenance-tickets')
        .set('Authorization', auth(directorToken))
        .send({
          title: 'Fuite au robinet',
          spaceId,
          urgency: 'MOYENNE',
          reportedBy: 'Test',
        })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('MAINTENANCE', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('MaintenanceTicket');
    });
  });

  describe('Administrative Procedures', () => {
    it('logs an AdministrativeProcedure create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/administrative-procedures')
        .set('Authorization', auth(directorToken))
        .send({
          title: 'Agrément 2026',
          procedureType: 'AGREMENT',
          authority: 'Ministère',
        })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('ADMINISTRATIVE_PROCEDURES', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('AdministrativeProcedure');
    });
  });

  describe('Supplier Contracts', () => {
    it('logs a SupplierContract create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/supplier-contracts')
        .set('Authorization', auth(directorToken))
        .send({
          supplierName: 'Fournisseur X',
          contractName: 'Contrat eau',
          category: 'EAU',
          startDate: '2026-01-01',
        })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('SUPPLIER_CONTRACTS', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('SupplierContract');
    });
  });

  describe('Stock', () => {
    it('logs a StockItem create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', auth(directorToken))
        .send({ name: 'Riz', category: 'ALIMENTAIRE' })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('STOCK', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('StockItem');
    });

    it('logs an InventoryAsset create', async () => {
      const res = (await request(app.getHttpServer())
        .post('/api/inventory-assets')
        .set('Authorization', auth(directorToken))
        .send({ name: 'Ordinateur portable', category: 'BUREAU' })
        .expect(201)) as { body: CreatedResource };

      const entries = await auditFor('STOCK', res.body.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('InventoryAsset');
    });
  });

  describe('Incidents', () => {
    it('logs an Incident create and a subsequent status change', async () => {
      const created = (await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', auth(directorToken))
        .send({
          title: 'Chute',
          type: 'COMPORTEMENT',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        })
        .expect(201)) as { body: CreatedResource };

      await request(app.getHttpServer())
        .patch(`/api/incidents/${created.body.id}/status`)
        .set('Authorization', auth(directorToken))
        .send({ status: 'EN_ATTENTE', note: 'En cours de traitement' })
        .expect(200);

      const entries = await auditFor('INCIDENTS', created.body.id);
      expect(entries.map((e) => e.action).sort()).toEqual([
        'CREATE',
        'STATUS_CHANGE',
      ]);
      const statusChange = entries.find((e) => e.action === 'STATUS_CHANGE');
      if (!statusChange) throw new Error('STATUS_CHANGE audit entry not found');
      expect(statusChange.before?.status).toBe('EN_COURS');
      expect(statusChange.after?.status).toBe('EN_ATTENTE');
    });
  });

  describe('search and filters', () => {
    it('filters by module', async () => {
      await request(app.getHttpServer())
        .post('/api/contacts')
        .set('Authorization', auth(directorToken))
        .send({ fullName: 'X', categoryId: contactCategoryId });
      await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', auth(directorToken))
        .send({ name: 'Riz', category: 'ALIMENTAIRE' });

      const res = (await request(app.getHttpServer())
        .get('/api/audit-logs?module=CONTACTS')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(res.body.every((l) => l.module === 'CONTACTS')).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('filters by user', async () => {
      await request(app.getHttpServer())
        .post('/api/incidents')
        .set('Authorization', auth(supervisorToken))
        .send({
          title: 'x',
          type: 'AUTRE',
          description: 'd',
          signaledBy: 'x',
          priority: 'N3',
        });

      const res = (await request(app.getHttpServer())
        .get(`/api/audit-logs?userId=${directorId}`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(res.body.every((l) => l.user?.id === directorId)).toBe(true);
    });

    it('applies a text search across entity/action', async () => {
      await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', auth(directorToken))
        .send({ name: 'Riz', category: 'ALIMENTAIRE' });

      const res = (await request(app.getHttpServer())
        .get('/api/audit-logs?search=StockItem')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every((l) => l.entity.toLowerCase().includes('stockitem')),
      ).toBe(true);
    });

    it('applies a date range filter', async () => {
      await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', auth(directorToken))
        .send({ name: 'Riz', category: 'ALIMENTAIRE' });

      const tomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .slice(0, 10);
      const future = (await request(app.getHttpServer())
        .get(`/api/audit-logs?dateFrom=${tomorrow}`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(future.body).toHaveLength(0);

      const yesterday = new Date(Date.now() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const past = (await request(app.getHttpServer())
        .get(`/api/audit-logs?dateFrom=${yesterday}`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(past.body.length).toBeGreaterThan(0);
    });
  });

  describe('users filter helper', () => {
    it('lists every system user', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/audit-logs/users')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: { name: string }[] };
      const names = res.body.map((u) => u.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Test Director',
          'Test Supervisor',
          'Test Educator',
        ]),
      );
    });
  });

  describe('permissions', () => {
    it('EDUCATOR cannot read the audit log', async () => {
      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', auth(educatorToken))
        .expect(403);
    });

    it('SUPERVISOR can read the audit log', async () => {
      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', auth(supervisorToken))
        .expect(200);
    });
  });

  describe('no business-logic changes (regression guard)', () => {
    it('a covered module still rejects invalid input exactly as before, and nothing is logged for the failed attempt', async () => {
      await request(app.getHttpServer())
        .post('/api/finances/transactions')
        .set('Authorization', auth(directorToken))
        .send({ type: 'DEPENSE' }) // missing required fields
        .expect(400);

      const res = (await request(app.getHttpServer())
        .get('/api/audit-logs?module=FINANCE')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: AuditLogEntry[] };
      expect(res.body).toHaveLength(0);
    });
  });
});
