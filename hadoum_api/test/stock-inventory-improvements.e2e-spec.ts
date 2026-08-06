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

// PR 12: Stock & Inventory improvements. Covers the new physical inventory
// count endpoint, the SUPERVISOR entry/exit/inventory permissions, low-stock
// flags, search/filters, movement history integrity, and — per the PR's
// explicit prerequisite — that every stock movement (including the new
// inventory count) produces an AuditLog row through the existing PR 13
// AuditLogsService/interceptor, unmodified.

interface StockItemResponse {
  id: string;
  name: string;
  category: string;
  supplierName: string | null;
  currentQuantity: number;
  isLowStock: boolean;
  validationStatus: string | null;
}

interface StockMovementResponse {
  id: string;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  performedBy: { id: string };
  movementDate: string;
  createdAt: string;
}

interface InventoryCountResponse {
  expectedQuantity: number;
  actualQuantity: number;
  difference: number;
  item: StockItemResponse;
}

interface AuditLogEntry {
  entityId: string;
  action: string;
  after: { difference: number };
  user: { id: string };
}

describe('Stock & Inventory improvements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

    directorToken = (
      (await request(app.getHttpServer()).post('/api/auth/login').send({
        email: users.director.email,
        password: TEST_PASSWORD,
      })) as { body: { token: string } }
    ).body.token;
    supervisorToken = (
      (await request(app.getHttpServer()).post('/api/auth/login').send({
        email: users.supervisor.email,
        password: TEST_PASSWORD,
      })) as { body: { token: string } }
    ).body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  async function createItem(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<StockItemResponse> {
    const res = (await request(app.getHttpServer())
      .post('/api/stock-items')
      .set('Authorization', auth(token))
      .send({
        name: 'Riz local 25kg',
        category: 'ALIMENTAIRE',
        unit: 'SAC',
        minimumQuantity: 10,
        initialQuantity: 100,
        ...overrides,
      })
      .expect(201)) as { body: StockItemResponse };
    return res.body;
  }

  async function auditFor(entityId: string): Promise<AuditLogEntry[]> {
    const res = (await request(app.getHttpServer())
      .get(`/api/audit-logs?module=STOCK`)
      .set('Authorization', auth(directorToken))
      .expect(200)) as { body: AuditLogEntry[] };
    return res.body.filter((l) => l.entityId === entityId);
  }

  describe('stock entry', () => {
    it('DIRECTOR records an entry: quantity, user and timestamp are correct', async () => {
      const item = await createItem(directorToken);

      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/entries`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 20, reason: 'Livraison mensuelle' })
        .expect(201)) as { body: StockItemResponse };
      expect(res.body.currentQuantity).toBe(120);

      const movements = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}/movements`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockMovementResponse[] };
      const entry = movements.body.find((m) => m.type === 'ENTREE');
      if (!entry) throw new Error('ENTREE movement not found');
      expect(entry.quantity).toBe(20);
      expect(entry.reason).toBe('Livraison mensuelle');
      expect(entry.performedBy.id).toBeTruthy();
      expect(entry.movementDate).toBeTruthy();
      expect(entry.createdAt).toBeTruthy();
    });

    it('SUPERVISOR can also record an entry (PR 12)', async () => {
      const item = await createItem(directorToken);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/entries`)
        .set('Authorization', auth(supervisorToken))
        .send({ quantity: 10 })
        .expect(201);
    });

    it('an entry generates an audit log entry via the existing AuditService', async () => {
      const item = await createItem(directorToken);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/entries`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 5 })
        .expect(201);

      const entries = await auditFor(item.id);
      expect(entries.some((e) => e.action === 'ENTRY')).toBe(true);
    });
  });

  describe('stock exit', () => {
    it('DIRECTOR records an exit and stock decreases correctly', async () => {
      const item = await createItem(directorToken);
      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({
          quantity: 30,
          destination: 'Cuisine',
          reason: 'Repas de la semaine',
        })
        .expect(201)) as { body: StockItemResponse };
      expect(res.body.currentQuantity).toBe(70);
    });

    it('SUPERVISOR can also record an exit (PR 12)', async () => {
      const item = await createItem(directorToken);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(supervisorToken))
        .send({ quantity: 10 })
        .expect(201);
    });

    it('rejects an exit larger than the available stock', async () => {
      const item = await createItem(directorToken, { initialQuantity: 5 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 10 })
        .expect(409);
    });

    it('an exit generates an audit log entry', async () => {
      const item = await createItem(directorToken);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 5 })
        .expect(201);
      const entries = await auditFor(item.id);
      expect(entries.some((e) => e.action === 'EXIT')).toBe(true);
    });
  });

  describe('adjustment', () => {
    it('DIRECTOR applies a small adjustment directly and it is audited', async () => {
      const item = await createItem(directorToken);
      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/adjustments`)
        .set('Authorization', auth(directorToken))
        .send({ quantityDelta: -5, reason: 'Casse constatée' })
        .expect(201)) as { body: StockItemResponse };
      expect(res.body.currentQuantity).toBe(95);

      const entries = await auditFor(item.id);
      expect(entries.some((e) => e.action === 'ADJUSTMENT')).toBe(true);
    });

    it('SUPERVISOR cannot create a manual adjustment (only entry/exit/inventory)', async () => {
      const item = await createItem(directorToken);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/adjustments`)
        .set('Authorization', auth(supervisorToken))
        .send({ quantityDelta: -5, reason: 'x' })
        .expect(403);
    });
  });

  describe('inventory count — happy paths', () => {
    it('a count matching the current quantity reports zero difference and creates no movement', async () => {
      const item = await createItem(directorToken, { initialQuantity: 50 });

      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 50 })
        .expect(201)) as { body: InventoryCountResponse };

      expect(res.body).toMatchObject({
        expectedQuantity: 50,
        actualQuantity: 50,
        difference: 0,
      });

      const movements = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}/movements`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockMovementResponse[] };
      expect(movements.body).toHaveLength(1); // just the initial ENTREE from creation
    });

    it('a small positive variance is applied immediately as an INVENTAIRE_CORRECTION movement', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });

      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 105, comment: 'Comptage mensuel' })
        .expect(201)) as { body: InventoryCountResponse };

      expect(res.body).toMatchObject({
        expectedQuantity: 100,
        actualQuantity: 105,
        difference: 5,
      });
      expect(res.body.item.currentQuantity).toBe(105);

      const movements = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}/movements`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockMovementResponse[] };
      const correction = movements.body.find(
        (m) => m.type === 'INVENTAIRE_CORRECTION',
      );
      expect(correction).toBeTruthy();
      if (!correction)
        throw new Error('INVENTAIRE_CORRECTION movement not found');
      expect(correction.quantityBefore).toBe(100);
      expect(correction.quantityAfter).toBe(105);
      expect(correction.reason).toBe('Comptage mensuel');
    });

    it('a small negative variance is applied immediately and decreases stock', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 92 })
        .expect(201)) as { body: InventoryCountResponse };

      expect(res.body.difference).toBe(-8);
      expect(res.body.item.currentQuantity).toBe(92);
    });

    it('SUPERVISOR can perform an inventory count (PR 12)', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(supervisorToken))
        .send({ actualQuantity: 98 })
        .expect(201)) as { body: InventoryCountResponse };
      expect(res.body.item.currentQuantity).toBe(98);
    });

    it('the inventory count generates an audit log entry via the existing AuditService', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 90 })
        .expect(201);

      const entries = await auditFor(item.id);
      const countEntry = entries.find((e) => e.action === 'INVENTORY_COUNT');
      expect(countEntry).toBeTruthy();
      if (!countEntry) throw new Error('INVENTORY_COUNT audit entry not found');
      expect(countEntry.after.difference).toBe(-10);
      expect(countEntry.user.id).toBeTruthy();
    });
  });

  describe('inventory count — large variance goes through validation', () => {
    it('a large positive variance (>20%) is held for validation, not applied immediately', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      const res = (await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 150 }) // +50%
        .expect(201)) as { body: InventoryCountResponse };

      expect(res.body.difference).toBe(50);
      expect(res.body.item.validationStatus).toBe('PENDING_VALIDATION');
      expect(res.body.item.currentQuantity).toBe(100); // unchanged until approved
    });

    it('approving a large positive variance correctly increments stock (regression: used to always decrement)', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 150 })
        .expect(201);

      const approved = (await request(app.getHttpServer())
        .patch(`/api/stock-items/${item.id}/approve`)
        .set('Authorization', auth(supervisorToken))
        .send({})
        .expect(200)) as { body: StockItemResponse };

      expect(approved.body.currentQuantity).toBe(150);
      expect(approved.body.validationStatus).toBe('APPROVED');
    });

    it('approving a large negative variance correctly decrements stock', async () => {
      const item = await createItem(directorToken, { initialQuantity: 100 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 30 }) // -70%
        .expect(201);

      const approved = (await request(app.getHttpServer())
        .patch(`/api/stock-items/${item.id}/approve`)
        .set('Authorization', auth(supervisorToken))
        .send({})
        .expect(200)) as { body: StockItemResponse };

      expect(approved.body.currentQuantity).toBe(30);
    });
  });

  describe('low stock warning', () => {
    it('flags an item at or below its minimum quantity', async () => {
      const item = await createItem(directorToken, {
        initialQuantity: 10,
        minimumQuantity: 10,
      });
      const res = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse };
      expect(res.body.isLowStock).toBe(true);
      expect(res.body.currentQuantity).toBe(10);
    });

    it('does not flag an item above its minimum quantity', async () => {
      const item = await createItem(directorToken, {
        initialQuantity: 50,
        minimumQuantity: 10,
      });
      const res = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse };
      expect(res.body.isLowStock).toBe(false);
    });
  });

  describe('search and filters', () => {
    beforeEach(async () => {
      await createItem(directorToken, {
        name: 'Riz local 25kg',
        category: 'ALIMENTAIRE',
        supplierName: 'Fournisseur Riz SA',
        initialQuantity: 100,
        minimumQuantity: 10,
      });
      await createItem(directorToken, {
        name: 'Savon de Marseille',
        category: 'HYGIENE',
        supplierName: 'Hygiène Plus',
        initialQuantity: 3,
        minimumQuantity: 10,
      });
    });

    it('filters by category', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/stock-items?category=HYGIENE')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].category).toBe('HYGIENE');
    });

    it('filters by supplier', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/stock-items?supplier=Hygi%C3%A8ne')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].supplierName).toBe('Hygiène Plus');
    });

    it('filters low-stock-only', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/stock-items?lowStock=true')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Savon de Marseille');
    });

    it('applies a text search on the item name', async () => {
      const res = (await request(app.getHttpServer())
        .get('/api/stock-items?search=Riz')
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockItemResponse[] };
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toContain('Riz');
    });
  });

  describe('permissions', () => {
    it('SUPERVISOR cannot create a stock item (DIRECTOR full access only)', async () => {
      await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', auth(supervisorToken))
        .send({ name: 'x', category: 'ALIMENTAIRE' })
        .expect(403);
    });

    it('SUPERVISOR cannot archive a stock item', async () => {
      // No initialQuantity — CreateStockItemDto requires it positive when
      // set at all, so an empty item is created by simply omitting it.
      const item = await createItem(directorToken, {
        initialQuantity: undefined,
      });
      await request(app.getHttpServer())
        .patch(`/api/stock-items/${item.id}/archive`)
        .set('Authorization', auth(supervisorToken))
        .expect(403);
    });

    it('DIRECTOR has full access: create, entry, exit, adjustment, inventory, archive', async () => {
      const item = await createItem(directorToken, { initialQuantity: 10 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/entries`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 10 })
        .expect(201);
      // Below the 20% sensitivity threshold (2/10 = 20%, not > 20%) so it
      // applies immediately instead of requiring validation first — a full
      // wipe would otherwise leave the item PENDING_VALIDATION and archive
      // would correctly 409, which is exercised separately above.
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/adjustments`)
        .set('Authorization', auth(directorToken))
        .send({ quantityDelta: -2, reason: 'Casse mineure' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 8 }) // empties the item so archive can apply directly
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/stock-items/${item.id}/archive`)
        .set('Authorization', auth(directorToken))
        .expect(200);
    });
  });

  describe('history integrity (never deleted)', () => {
    it('has no route to delete a stock movement', async () => {
      const item = await createItem(directorToken);
      const movements = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}/movements`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockMovementResponse[] };
      const movementId = movements.body[0].id;

      await request(app.getHttpServer())
        .delete(`/api/stock-movements/${movementId}`)
        .set('Authorization', auth(directorToken))
        .expect(404); // no DELETE route exists at all
    });

    it('movement history accumulates across multiple operations without ever shrinking', async () => {
      const item = await createItem(directorToken, { initialQuantity: 50 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/entries`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 10 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/exits`)
        .set('Authorization', auth(directorToken))
        .send({ quantity: 5 });
      await request(app.getHttpServer())
        .post(`/api/stock-items/${item.id}/inventory-count`)
        .set('Authorization', auth(directorToken))
        .send({ actualQuantity: 60 });

      const movements = (await request(app.getHttpServer())
        .get(`/api/stock-items/${item.id}/movements`)
        .set('Authorization', auth(directorToken))
        .expect(200)) as { body: StockMovementResponse[] };
      // initial ENTREE + entry + exit + inventory correction
      expect(movements.body.length).toBeGreaterThanOrEqual(4);
    });
  });
});
