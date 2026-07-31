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

describe('Stock, Inventory & Register modules (e2e)', () => {
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

  describe('Stock', () => {
    it('creates an item, records an entry and an exit, and tracks quantity correctly', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Riz local 25kg', category: 'ALIMENTAIRE', unit: 'SAC' })
        .expect(201);
      const itemId = createRes.body.id as string;
      expect(createRes.body.currentQuantity).toBe(0);

      await request(app.getHttpServer())
        .post(`/api/stock-items/${itemId}/entries`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ quantity: 50 })
        .expect(201);

      const afterExit = await request(app.getHttpServer())
        .post(`/api/stock-items/${itemId}/exits`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ quantity: 10, destination: 'Cuisine' })
        .expect(201);

      expect(afterExit.body.currentQuantity).toBe(40);
    });

    it('rejects an exit larger than the available quantity (409)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Savon', category: 'HYGIENE' })
        .expect(201);
      const itemId = createRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/api/stock-items/${itemId}/exits`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ quantity: 5 })
        .expect(409);
    });

    it('routes a large-quantity exit through validation instead of applying it directly', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Riz local', category: 'ALIMENTAIRE', unit: 'SAC' })
        .expect(201);
      const itemId = createRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/api/stock-items/${itemId}/entries`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ quantity: 200 })
        .expect(201);

      const exitRes = await request(app.getHttpServer())
        .post(`/api/stock-items/${itemId}/exits`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ quantity: 80 }) // > large-quantity threshold (50)
        .expect(201);

      expect(exitRes.body.pendingValidationAction).toBe('LARGE_STOCK_EXIT');
      expect(exitRes.body.currentQuantity).toBe(200); // unchanged until approved

      await request(app.getHttpServer())
        .patch(`/api/stock-items/${itemId}/approve`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({})
        .expect(200);

      const afterApproval = await request(app.getHttpServer())
        .get(`/api/stock-items/${itemId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(afterApproval.body.currentQuantity).toBe(120);
    });

    it('SUPERVISOR cannot record a stock entry (operational, DIRECTOR-only)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/stock-items')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'x', category: 'AUTRE' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/stock-items/${createRes.body.id}/entries`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ quantity: 10 })
        .expect(403);
    });
  });

  describe('Inventory', () => {
    it('creates an asset and transfers it (low value -> direct)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/inventory-assets')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Chaise', category: 'MOBILIER', acquisitionCost: 5_000 })
        .expect(201);
      const assetId = createRes.body.id as string;

      const spaceRes = await request(app.getHttpServer())
        .post('/api/spaces')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Nouvelle salle', type: 'SALLE_CLASSE' })
        .expect(201);

      const transferRes = await request(app.getHttpServer())
        .patch(`/api/inventory-assets/${assetId}/transfer`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ spaceId: spaceRes.body.id })
        .expect(200);

      expect(transferRes.body.spaceId).toBe(spaceRes.body.id);
      expect(transferRes.body.validationStatus).toBeNull();
    });

    it('routes a high-value asset transfer through validation', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/inventory-assets')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Ordinateur', category: 'INFORMATIQUE', acquisitionCost: 300_000 })
        .expect(201);
      const assetId = createRes.body.id as string;

      const transferRes = await request(app.getHttpServer())
        .patch(`/api/inventory-assets/${assetId}/transfer`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ assignedTo: 'Jean' })
        .expect(200);

      expect(transferRes.body.pendingValidationAction).toBe('ASSET_TRANSFER');

      await request(app.getHttpServer())
        .patch(`/api/inventory-assets/${assetId}/approve`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({})
        .expect(200);
    });
  });

  describe('Register (entry logs)', () => {
    it('creates an immediate visitor entry, checks them out, and masks the identity document number in list views', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/entry-logs')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          entryType: 'VISITE_IMPREVUE',
          visitorCategory: 'VISITEUR',
          fullName: 'Marie Test',
          purpose: 'Réunion',
          identityDocumentType: 'CNI',
          identityDocumentNumber: '1234567890123',
        })
        .expect(201);
      const entryId = createRes.body.id as string;
      expect(createRes.body.status).toBe('PRESENT');

      const listRes = await request(app.getHttpServer())
        .get('/api/entry-logs')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      const listed = listRes.body.find((e: { id: string }) => e.id === entryId);
      expect(listed.identityDocumentNumber).toBe('*********0123');

      const oneRes = await request(app.getHttpServer())
        .get(`/api/entry-logs/${entryId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(oneRes.body.identityDocumentNumber).toBe('1234567890123');

      const checkOutRes = await request(app.getHttpServer())
        .patch(`/api/entry-logs/${entryId}/check-out`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({})
        .expect(200);
      expect(checkOutRes.body.status).toBe('SORTI');
    });

    it('SUPERVISOR has read-only access to the register', async () => {
      await request(app.getHttpServer())
        .get('/api/entry-logs')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/entry-logs')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ entryType: 'VISITE_IMPREVUE', visitorCategory: 'VISITEUR', fullName: 'x', purpose: 'x' })
        .expect(403);
    });
  });
});
