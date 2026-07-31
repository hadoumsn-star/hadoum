import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StockItemsService } from './stock-items.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';

function createMockPrisma() {
  const stockItem = {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const stockItemDocument = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  };
  const notification = { findFirst: jest.fn() };

  const prisma: any = {
    stockItem,
    stockItemDocument,
    notification,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return prisma;
}

describe('StockItemsService', () => {
  let service: StockItemsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validations: {
    create: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    requestChanges: jest.Mock;
    findHistory: jest.Mock;
  };
  let notifications: { create: jest.Mock; createForRole: jest.Mock };
  let movements: { record: jest.Mock; findAll: jest.Mock };
  let upload: { upload: jest.Mock; getPresignedUrl: jest.Mock; deleteFile: jest.Mock };

  const baseItem = {
    id: 'item-1',
    name: 'Riz local 25kg',
    reference: null,
    barcode: null,
    category: 'ALIMENTAIRE',
    unit: 'SAC',
    currentQuantity: 100,
    minimumQuantity: 10,
    maximumQuantity: null,
    unitCost: 15000,
    isActive: true,
    isPerishable: false,
    expirationDate: null,
    validationStatus: null,
    pendingValidationAction: null,
    pendingValidationPayload: null,
    storageLocation: null,
    spaceId: null,
    supplierName: null,
    supplierContractId: null,
    batchNumber: null,
    notes: null,
    createdById: 'director-1',
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
      findHistory: jest.fn(),
    };
    notifications = { create: jest.fn(), createForRole: jest.fn() };
    movements = { record: jest.fn(), findAll: jest.fn() };
    upload = { upload: jest.fn(), getPresignedUrl: jest.fn(), deleteFile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
        { provide: StockMovementsService, useValue: movements },
      ],
    }).compile();
    service = module.get(StockItemsService);
  });

  describe('create', () => {
    it('creates a stock item without an initial quantity movement', async () => {
      prisma.stockItem.create.mockResolvedValue({ ...baseItem, currentQuantity: 0 });

      const result = await service.create(
        { name: 'x', category: 'ALIMENTAIRE', unit: 'SAC' } as any,
        'director-1',
      );

      expect(result.name).toBe('Riz local 25kg');
      expect(movements.record).not.toHaveBeenCalled();
    });

    it('records an ENTREE movement when an initial quantity is given', async () => {
      prisma.stockItem.create.mockResolvedValue({ ...baseItem, currentQuantity: 0 });
      prisma.stockItem.update.mockResolvedValue({ ...baseItem, currentQuantity: 100 });

      await service.create(
        { name: 'x', category: 'ALIMENTAIRE', unit: 'SAC', initialQuantity: 100 } as any,
        'director-1',
      );

      expect(movements.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ type: 'ENTREE', quantity: 100, quantityBefore: 0 }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing item', async () => {
      prisma.stockItem.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('computes derived fields on the happy path', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 5 });
      const result = await service.findOne('item-1');
      // currentQuantity(5) <= minimumQuantity(10) -> low stock
      expect(result.isLowStock).toBe(true);
      expect(result.isOutOfStock).toBe(false);
    });
  });

  describe('archive (smart gating)', () => {
    it('archives directly when stock is already empty', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 0 });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        currentQuantity: 0,
        isActive: false,
        archivedAt: new Date(),
      });

      const result = await service.archive('item-1', 'director-1');

      expect(result.isActive).toBe(false);
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('routes through validation when stock remains', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 40 });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        currentQuantity: 40,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'STOCK_ITEM_ARCHIVE',
      });

      const result = await service.archive('item-1', 'director-1');

      expect(validations.create).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'STOCK_ITEM', resourceId: 'item-1' }),
      );
      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({ type: 'VALIDATION_SUBMITTED' }),
      );
      expect(result.pendingValidationAction).toBe('STOCK_ITEM_ARCHIVE');
    });

    it('refuses to re-archive an already archived item', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, isActive: false });
      await expect(service.archive('item-1', 'director-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to archive while a validation is already pending', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({
        ...baseItem,
        validationStatus: 'PENDING_VALIDATION',
      });
      await expect(service.archive('item-1', 'director-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('createExit', () => {
    it('performs a routine exit directly (below sensitivity thresholds)', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({
        ...baseItem,
        currentQuantity: 100,
        unitCost: null, // avoid the value-based sensitivity threshold
      });
      prisma.stockItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockItem.findUniqueOrThrow.mockResolvedValue({ ...baseItem, currentQuantity: 90 });

      const result = await service.createExit('item-1', 'director-1', {
        quantity: 10,
        destination: 'Cuisine',
      } as any);

      expect(result.currentQuantity).toBe(90);
      expect(validations.create).not.toHaveBeenCalled();
      expect(movements.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ type: 'SORTIE', quantity: 10 }),
      );
    });

    it('rejects an exit larger than the available quantity', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 5 });
      await expect(
        service.createExit('item-1', 'director-1', { quantity: 10 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.stockItem.updateMany).not.toHaveBeenCalled();
    });

    it('routes a large-quantity exit through validation instead of applying it directly', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 200 });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        currentQuantity: 200,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'LARGE_STOCK_EXIT',
      });

      const result = await service.createExit('item-1', 'director-1', {
        quantity: 80, // > STOCK_EXIT_LARGE_QUANTITY_THRESHOLD (50)
      } as any);

      expect(prisma.stockItem.updateMany).not.toHaveBeenCalled();
      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('LARGE_STOCK_EXIT');
    });

    it('routes a high-value exit through validation even for a small quantity', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({
        ...baseItem,
        currentQuantity: 200,
        unitCost: 20000, // 10 * 20000 = 200,000 > 100,000 threshold
      });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'LARGE_STOCK_EXIT',
      });

      await service.createExit('item-1', 'director-1', { quantity: 10 } as any);

      expect(validations.create).toHaveBeenCalled();
    });

    it('surfaces a concurrency conflict when the atomic guard finds nothing to update', async () => {
      // Passed the pre-check (currentQuantity was fresh when read) but a
      // concurrent request already depleted the stock before this update ran.
      prisma.stockItem.findUnique.mockResolvedValue({
        ...baseItem,
        currentQuantity: 100,
        unitCost: null, // avoid the value-based sensitivity threshold
      });
      prisma.stockItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createExit('item-1', 'director-1', { quantity: 10 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an exit while a validation is already pending', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({
        ...baseItem,
        validationStatus: 'PENDING_VALIDATION',
      });
      await expect(
        service.createExit('item-1', 'director-1', { quantity: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses movement on an archived item', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, isActive: false });
      await expect(
        service.createExit('item-1', 'director-1', { quantity: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createAdjustment (invalid transitions)', () => {
    it('rejects a zero-quantity adjustment', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem });
      await expect(
        service.createAdjustment('item-1', 'director-1', { quantityDelta: 0 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a loss recorded with a positive quantity', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem });
      await expect(
        service.createAdjustment('item-1', 'director-1', {
          quantityDelta: 5,
          lossType: 'PERTE',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an adjustment that would push stock below zero', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 5 });
      await expect(
        service.createAdjustment('item-1', 'director-1', { quantityDelta: -10 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies a small negative adjustment directly (below the sensitive percentage)', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 100 });
      prisma.stockItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockItem.findUniqueOrThrow.mockResolvedValue({ ...baseItem, currentQuantity: 95 });

      await service.createAdjustment('item-1', 'director-1', { quantityDelta: -5 } as any);

      expect(validations.create).not.toHaveBeenCalled();
      expect(prisma.stockItem.updateMany).toHaveBeenCalled();
    });

    it('routes a large negative adjustment (>20%) through validation', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 100 });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'NEGATIVE_ADJUSTMENT',
      });

      const result = await service.createAdjustment('item-1', 'director-1', {
        quantityDelta: -30, // 30% of 100
      } as any);

      expect(prisma.stockItem.updateMany).not.toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('NEGATIVE_ADJUSTMENT');
    });
  });

  describe('approve', () => {
    it('applies a pending stock-decreasing action and records the movement on approval', async () => {
      const pendingItem = {
        ...baseItem,
        currentQuantity: 100,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'LARGE_STOCK_EXIT',
        pendingValidationPayload: { quantity: 80, movementType: 'SORTIE' },
      };
      prisma.stockItem.findUnique.mockResolvedValue(pendingItem);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.stockItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockItem.findUniqueOrThrow.mockResolvedValue({
        ...pendingItem,
        currentQuantity: 20,
      });

      const result = await service.approve('item-1', 'supervisor-1', {} as any);

      expect(prisma.stockItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1', currentQuantity: { gte: 80 } },
        }),
      );
      expect(movements.record).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VALIDATION_APPROVED', recipientId: 'director-1' }),
      );
      expect(result.currentQuantity).toBe(20);
    });

    it('archives the item when the pending action is STOCK_ITEM_ARCHIVE', async () => {
      const pendingItem = {
        ...baseItem,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'STOCK_ITEM_ARCHIVE',
        pendingValidationPayload: { quantity: 0, movementType: 'AJUSTEMENT_POSITIF' },
      };
      prisma.stockItem.findUnique.mockResolvedValue(pendingItem);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.stockItem.update.mockResolvedValue({ ...pendingItem, isActive: false });

      const result = await service.approve('item-1', 'supervisor-1', {} as any);

      expect(result.isActive).toBe(false);
      expect(movements.record).not.toHaveBeenCalled();
    });

    it('throws a conflict if stock dropped below the pending quantity before approval', async () => {
      const pendingItem = {
        ...baseItem,
        currentQuantity: 10,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'LARGE_STOCK_EXIT',
        pendingValidationPayload: { quantity: 80, movementType: 'SORTIE' },
      };
      prisma.stockItem.findUnique.mockResolvedValue(pendingItem);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.stockItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve('item-1', 'supervisor-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws a conflict when there is no pending action to approve', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, pendingValidationAction: null });
      await expect(
        service.approve('item-1', 'supervisor-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject / requestChanges', () => {
    it('rejects a pending validation and notifies the submitter', async () => {
      prisma.stockItem.findUnique.mockResolvedValue(baseItem);
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.stockItem.update.mockResolvedValue({ ...baseItem, validationStatus: 'REJECTED' });

      const result = await service.reject('item-1', 'supervisor-1', { comment: 'No' } as any);

      expect(result.validationStatus).toBe('REJECTED');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VALIDATION_REJECTED' }),
      );
    });

    it('requests changes and notifies the submitter', async () => {
      prisma.stockItem.findUnique.mockResolvedValue(baseItem);
      validations.requestChanges.mockResolvedValue({ submittedById: 'director-1' });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        validationStatus: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges(
        'item-1',
        'supervisor-1',
        { comment: 'clarify' } as any,
      );

      expect(result.validationStatus).toBe('CHANGES_REQUESTED');
    });
  });

  describe('findAll', () => {
    it('applies search/category filters and sorts out-of-stock items first', async () => {
      const outOfStock = { ...baseItem, id: 'i-out', currentQuantity: 0 };
      const healthy = { ...baseItem, id: 'i-ok', currentQuantity: 100 };
      prisma.stockItem.findMany.mockResolvedValue([healthy, outOfStock]);

      const result = await service.findAll({ search: 'riz', category: 'ALIMENTAIRE' } as any);

      expect(prisma.stockItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'ALIMENTAIRE' }),
        }),
      );
      expect(result[0].id).toBe('i-out');
    });

    it('filters to only low-stock items when requested', async () => {
      const low = { ...baseItem, id: 'i-low', currentQuantity: 5, minimumQuantity: 10 };
      const healthy = { ...baseItem, id: 'i-ok', currentQuantity: 100 };
      prisma.stockItem.findMany.mockResolvedValue([healthy, low]);

      const result = await service.findAll({ lowStock: true } as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('i-low');
    });

    it('sends exactly one stock-out notification per item (dedup guard)', async () => {
      prisma.stockItem.findMany.mockResolvedValue([{ ...baseItem, currentQuantity: 0 }]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        expect.objectContaining({ type: 'STOCK_OUT' }),
      );
    });

    it('does not re-notify a stock-out already notified', async () => {
      prisma.stockItem.findMany.mockResolvedValue([{ ...baseItem, currentQuantity: 0 }]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'already-sent' });

      await service.findAll({});

      expect(notifications.createForRole).not.toHaveBeenCalled();
    });
  });

  describe('createTransfer', () => {
    it('moves a routine (non-empty) item to a new location without a quantity change', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, currentQuantity: 100 });
      prisma.stockItem.update.mockResolvedValue({
        ...baseItem,
        storageLocation: 'Nouvel entrepôt',
      });

      const result = await service.createTransfer('item-1', 'director-1', {
        destination: 'Nouvel entrepôt',
      } as any);

      expect(movements.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ type: 'TRANSFERT' }),
      );
      expect(result.storageLocation).toBe('Nouvel entrepôt');
    });

    it('refuses to transfer an archived item', async () => {
      prisma.stockItem.findUnique.mockResolvedValue({ ...baseItem, isActive: false });
      await expect(
        service.createTransfer('item-1', 'director-1', { destination: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document and records the uploader', async () => {
      prisma.stockItem.findUnique.mockResolvedValue(baseItem);
      upload.upload.mockResolvedValue('stock-items/item-1/file.pdf');
      prisma.stockItemDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadDocument('item-1', 'director-1', file, 'FACTURE', 'Facture');

      expect(prisma.stockItemDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stockItemId: 'item-1', uploadedById: 'director-1' }),
        }),
      );
    });

    it('lists documents for an existing item', async () => {
      prisma.stockItem.findUnique.mockResolvedValue(baseItem);
      prisma.stockItemDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const result = await service.listDocuments('item-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('history / movements passthroughs', () => {
    it('delegates history to ValidationsService with the correct resource type', () => {
      validations.findHistory.mockReturnValue([{ id: 'v1' }]);
      const result = service.history('item-1');
      expect(validations.findHistory).toHaveBeenCalledWith('STOCK_ITEM', 'item-1');
      expect(result).toEqual([{ id: 'v1' }]);
    });

    it('delegates movements listing to StockMovementsService', async () => {
      movements.findAll.mockResolvedValue([{ id: 'mv-1' }]);
      const result = await service.movements('item-1');
      expect(movements.findAll).toHaveBeenCalledWith({ stockItemId: 'item-1' });
      expect(result).toHaveLength(1);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('returns a signed URL when the document belongs to the given item', async () => {
      prisma.stockItemDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        stockItemId: 'item-1',
        fileKey: 'stock-items/item-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');

      const result = await service.getDocumentUrl('item-1', 'doc-1');

      expect(result.url).toBe('https://signed-url');
    });

    it('throws NotFoundException when the document belongs to a different item', async () => {
      prisma.stockItemDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        stockItemId: 'some-other-item',
        fileKey: 'x',
      });

      await expect(service.getDocumentUrl('item-1', 'doc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException on delete when the document does not exist at all', async () => {
      prisma.stockItemDocument.findUnique.mockResolvedValue(null);
      await expect(service.deleteDocument('item-1', 'doc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.stockItemDocument.delete).not.toHaveBeenCalled();
    });
  });
});
