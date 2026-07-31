import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GoodsMovementLogsService } from './goods-movement-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  return {
    goodsMovementLog: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    goodsMovementDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    inventoryAsset: { findUnique: jest.fn() },
    stockItem: { findUnique: jest.fn() },
    notification: { findFirst: jest.fn() },
  };
}

describe('GoodsMovementLogsService', () => {
  let service: GoodsMovementLogsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validations: { create: jest.Mock; approve: jest.Mock; reject: jest.Mock; requestChanges: jest.Mock };
  let notifications: { create: jest.Mock; createForRole: jest.Mock };
  let upload: { upload: jest.Mock; getPresignedUrl: jest.Mock; deleteFile: jest.Mock };

  const baseMovement = {
    id: 'movement-1',
    movementType: 'LIVRAISON',
    description: 'Livraison fournitures',
    itemReference: null,
    stockItemId: null,
    inventoryAssetId: null,
    quantity: null,
    unit: null,
    source: null,
    destination: null,
    personInCharge: null,
    vehicleRegistration: null,
    deliveryNoteNumber: null,
    authorizationReference: null,
    reason: null,
    movementDateTime: new Date('2026-01-01T10:00:00'),
    expectedReturnDate: null,
    actualReturnDate: null,
    status: 'ENREGISTRE',
    recordedById: 'director-1',
    authorizedByUserId: null,
    validationStatus: null,
    pendingValidationAction: null,
    pendingValidationPayload: null,
    incidentReported: false,
    incidentId: null,
    incidentDescription: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    validations = {
      create: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      requestChanges: jest.fn(),
    };
    notifications = { create: jest.fn(), createForRole: jest.fn() };
    upload = { upload: jest.fn(), getPresignedUrl: jest.fn(), deleteFile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsMovementLogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(GoodsMovementLogsService);
  });

  describe('create', () => {
    it('registers a routine movement directly', async () => {
      prisma.goodsMovementLog.create.mockResolvedValue({ ...baseMovement, status: 'ENREGISTRE' });

      const result = await service.create(
        { movementType: 'LIVRAISON', description: 'x' } as any,
        'director-1',
      );

      expect(result.status).toBe('ENREGISTRE');
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('requires an expected return date for checkout-type movements', async () => {
      await expect(
        service.create({ movementType: 'PRET_EQUIPEMENT', description: 'x' } as any, 'director-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks a checkout movement as SORTI and pending on TEMPORARY_ASSET_EXIT', async () => {
      prisma.goodsMovementLog.create.mockResolvedValue({
        ...baseMovement,
        movementType: 'PRET_EQUIPEMENT',
        status: 'EN_ATTENTE_VALIDATION',
        pendingValidationAction: 'TEMPORARY_ASSET_EXIT',
      });

      const result = await service.create(
        {
          movementType: 'PRET_EQUIPEMENT',
          description: 'Prêt vidéoprojecteur',
          expectedReturnDate: '2026-02-01',
        } as any,
        'director-1',
      );

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('TEMPORARY_ASSET_EXIT');
    });

    it('routes checkout of a high-value asset through HIGH_VALUE_ASSET_EXIT', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({ id: 'a1', acquisitionCost: 300_000 });
      prisma.goodsMovementLog.create.mockResolvedValue({
        ...baseMovement,
        movementType: 'PRET_EQUIPEMENT',
        pendingValidationAction: 'HIGH_VALUE_ASSET_EXIT',
      });

      const result = await service.create(
        {
          movementType: 'PRET_EQUIPEMENT',
          description: 'x',
          inventoryAssetId: 'a1',
          expectedReturnDate: '2026-02-01',
        } as any,
        'director-1',
      );

      expect(result.pendingValidationAction).toBe('HIGH_VALUE_ASSET_EXIT');
    });

    it('refuses to check out an asset that already has an open (unreturned) exit', async () => {
      prisma.goodsMovementLog.findFirst.mockResolvedValue({ id: 'existing', status: 'SORTI' });

      await expect(
        service.create(
          {
            movementType: 'PRET_EQUIPEMENT',
            description: 'x',
            inventoryAssetId: 'a1',
            expectedReturnDate: '2026-02-01',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('routes a large-quantity controlled exit through CONTROLLED_GOODS_EXIT', async () => {
      prisma.goodsMovementLog.create.mockResolvedValue({
        ...baseMovement,
        movementType: 'SORTIE_MARCHANDISE',
        pendingValidationAction: 'CONTROLLED_GOODS_EXIT',
      });

      const result = await service.create(
        { movementType: 'SORTIE_MARCHANDISE', description: 'x', quantity: 80 } as any,
        'director-1',
      );

      expect(result.pendingValidationAction).toBe('CONTROLLED_GOODS_EXIT');
    });

    it('routes a high-value controlled exit (small quantity, high unit cost) through validation', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ id: 's1', unitCost: 20_000 });
      prisma.goodsMovementLog.create.mockResolvedValue({
        ...baseMovement,
        movementType: 'SORTIE_MARCHANDISE',
        pendingValidationAction: 'CONTROLLED_GOODS_EXIT',
      });

      const result = await service.create(
        {
          movementType: 'SORTIE_MARCHANDISE',
          description: 'x',
          stockItemId: 's1',
          quantity: 10, // 10 * 20,000 = 200,000 > 100,000 threshold
        } as any,
        'director-1',
      );

      expect(result.pendingValidationAction).toBe('CONTROLLED_GOODS_EXIT');
    });
  });

  describe('recordReturn', () => {
    it('records a return on the happy path', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        status: 'SORTI',
        movementDateTime: new Date('2026-01-01T10:00:00'),
      });
      prisma.goodsMovementLog.update.mockResolvedValue({ ...baseMovement, status: 'RETOURNE' });

      const result = await service.recordReturn('movement-1', {
        actualReturnDate: '2026-01-05T10:00:00',
      } as any);

      expect(result.status).toBe('RETOURNE');
    });

    it('rejects recording a return that already happened', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({ ...baseMovement, status: 'RETOURNE' });
      await expect(
        service.recordReturn('movement-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects recording a return for a movement not currently out', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({ ...baseMovement, status: 'ENREGISTRE' });
      await expect(
        service.recordReturn('movement-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a return date earlier than the exit date', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        status: 'SORTI',
        movementDateTime: new Date('2026-01-10T10:00:00'),
      });
      await expect(
        service.recordReturn('movement-1', { actualReturnDate: '2026-01-01T10:00:00' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('archive (smart gating)', () => {
    it('archives directly from a terminal state (ENREGISTRE)', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({ ...baseMovement, status: 'ENREGISTRE' });
      prisma.goodsMovementLog.update.mockResolvedValue({
        ...baseMovement,
        status: 'ARCHIVE',
        archivedAt: new Date(),
      });

      const result = await service.archive('movement-1', 'director-1');

      expect(result.status).toBe('ARCHIVE');
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('routes archiving a non-terminal record (SORTI) through validation', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({ ...baseMovement, status: 'SORTI' });
      prisma.goodsMovementLog.update.mockResolvedValue({
        ...baseMovement,
        pendingValidationAction: 'RECORD_ARCHIVE',
      });

      const result = await service.archive('movement-1', 'director-1');

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('RECORD_ARCHIVE');
    });
  });

  describe('approve (per-action state application)', () => {
    it('sets status SORTI on TEMPORARY_ASSET_EXIT approval', async () => {
      const pending = {
        ...baseMovement,
        status: 'EN_ATTENTE_VALIDATION',
        pendingValidationAction: 'TEMPORARY_ASSET_EXIT',
      };
      prisma.goodsMovementLog.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.goodsMovementLog.update.mockResolvedValue({ ...pending, status: 'SORTI' });

      const result = await service.approve('movement-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('SORTI');
    });

    it('sets status ENREGISTRE on CONTROLLED_GOODS_EXIT approval', async () => {
      const pending = {
        ...baseMovement,
        status: 'EN_ATTENTE_VALIDATION',
        pendingValidationAction: 'CONTROLLED_GOODS_EXIT',
      };
      prisma.goodsMovementLog.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.goodsMovementLog.update.mockResolvedValue({ ...pending, status: 'ENREGISTRE' });

      const result = await service.approve('movement-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('ENREGISTRE');
    });

    it('throws a conflict when nothing is pending', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        pendingValidationAction: null,
      });
      await expect(
        service.approve('movement-1', 'supervisor-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject (regression: status must not stay stuck at EN_ATTENTE_VALIDATION)', () => {
    it('resets status to ANNULE when rejecting a creation-time pending movement', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        status: 'EN_ATTENTE_VALIDATION',
        pendingValidationAction: 'CONTROLLED_GOODS_EXIT',
      });
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.goodsMovementLog.update.mockResolvedValue({
        ...baseMovement,
        status: 'ANNULE',
        validationStatus: 'REJECTED',
      });

      const result = await service.reject('movement-1', 'supervisor-1', { comment: 'No' } as any);

      expect(prisma.goodsMovementLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ANNULE',
            pendingValidationAction: null,
            validationStatus: 'REJECTED',
          }),
        }),
      );
      expect(result.status).toBe('ANNULE');
    });

    it('leaves status untouched when rejecting an archive request (status was not EN_ATTENTE_VALIDATION)', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        status: 'SORTI',
        pendingValidationAction: 'RECORD_ARCHIVE',
      });
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.goodsMovementLog.update.mockResolvedValue({
        ...baseMovement,
        status: 'SORTI',
        validationStatus: 'REJECTED',
      });

      await service.reject('movement-1', 'supervisor-1', { comment: 'No' } as any);

      expect(prisma.goodsMovementLog.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SORTI' }) }),
      );
    });
  });

  describe('findAll', () => {
    it('applies search, status and overdue filters, and sorts by urgency', async () => {
      const overdue = {
        ...baseMovement,
        id: 'm-overdue',
        status: 'SORTI',
        expectedReturnDate: new Date('2020-01-01'),
      };
      const routine = { ...baseMovement, id: 'm-routine', status: 'ENREGISTRE' };
      prisma.goodsMovementLog.findMany.mockResolvedValue([routine, overdue]);

      const result = await service.findAll({
        search: 'Livraison',
        status: 'ENREGISTRE',
        overdueReturn: false,
      } as any);

      expect(prisma.goodsMovementLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ENREGISTRE' }),
        }),
      );
      // overdue movement sorts first regardless of insertion order
      expect(result[0].id).toBe('m-overdue');
    });

    it('filters to only overdue returns when requested', async () => {
      const overdue = {
        ...baseMovement,
        id: 'm-overdue',
        status: 'SORTI',
        expectedReturnDate: new Date('2020-01-01'),
      };
      const routine = { ...baseMovement, id: 'm-routine' };
      prisma.goodsMovementLog.findMany.mockResolvedValue([routine, overdue]);

      const result = await service.findAll({ overdueReturn: true } as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m-overdue');
    });

    it('sends exactly one overdue-return notification per movement (dedup guard)', async () => {
      const overdue = {
        ...baseMovement,
        id: 'm-overdue',
        status: 'SORTI',
        expectedReturnDate: new Date('2020-01-01'),
      };
      prisma.goodsMovementLog.findMany.mockResolvedValue([overdue]);
      prisma.notification.findFirst.mockResolvedValue(null); // not yet notified

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        expect.objectContaining({ type: 'GOODS_RETURN_OVERDUE' }),
      );
    });

    it('does not re-notify when already notified for this movement', async () => {
      const overdue = {
        ...baseMovement,
        id: 'm-overdue',
        status: 'SORTI',
        expectedReturnDate: new Date('2020-01-01'),
      };
      prisma.goodsMovementLog.findMany.mockResolvedValue([overdue]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'already-sent' });

      await service.findAll({});

      expect(notifications.createForRole).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates editable fields on an active movement', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue(baseMovement);
      prisma.goodsMovementLog.update.mockResolvedValue({
        ...baseMovement,
        destination: 'Nouvel entrepôt',
      });

      const result = await service.update('movement-1', {
        destination: 'Nouvel entrepôt',
      } as any);

      expect(result.destination).toBe('Nouvel entrepôt');
    });

    it('refuses to update an archived movement', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        ...baseMovement,
        status: 'ARCHIVE',
      });
      await expect(
        service.update('movement-1', { destination: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document under the movement folder and records the uploader', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue(baseMovement);
      upload.upload.mockResolvedValue('goods-movement-logs/movement-1/file.pdf');
      prisma.goodsMovementDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadDocument('movement-1', 'director-1', file, 'BON_LIVRAISON', 'Bon');

      expect(upload.upload).toHaveBeenCalledWith(file, 'goods-movement-logs/movement-1');
      expect(prisma.goodsMovementDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ movementId: 'movement-1', uploadedById: 'director-1' }),
        }),
      );
    });

    it('lists documents for an existing movement', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue(baseMovement);
      prisma.goodsMovementDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);

      const result = await service.listDocuments('movement-1');

      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException when listing documents for a missing movement', async () => {
      prisma.goodsMovementLog.findUnique.mockResolvedValue(null);
      await expect(service.listDocuments('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('blocks fetching a document that belongs to a different movement', async () => {
      prisma.goodsMovementDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        movementId: 'some-other-movement',
        fileKey: 'x',
      });
      await expect(service.getDocumentUrl('movement-1', 'doc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows fetching a document that belongs to the given movement', async () => {
      prisma.goodsMovementDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        movementId: 'movement-1',
        fileKey: 'goods-movement-logs/movement-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');
      const result = await service.getDocumentUrl('movement-1', 'doc-1');
      expect(result.url).toBe('https://signed-url');
    });
  });
});
