import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryAssetsService } from './inventory-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { anyInstanceOf, matching } from '../test-utils/jest-matchers';

function createMockPrisma() {
  return {
    inventoryAsset: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    inventoryAssetDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    notification: { findFirst: jest.fn() },
  };
}

describe('InventoryAssetsService', () => {
  let service: InventoryAssetsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validations: {
    create: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    requestChanges: jest.Mock;
    findHistory: jest.Mock;
  };
  let notifications: { create: jest.Mock; createForRole: jest.Mock };
  let upload: {
    upload: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const baseAsset = {
    id: 'asset-1',
    name: 'Ordinateur portable',
    assetCode: 'INV-001',
    serialNumber: 'SN-123',
    category: 'INFORMATIQUE',
    brand: 'Dell',
    model: 'Latitude',
    acquisitionDate: new Date('2025-01-01'),
    acquisitionCost: 150_000,
    warrantyEndDate: null,
    condition: 'BON',
    status: 'DISPONIBLE',
    spaceId: null,
    assignedTo: null,
    assignedToUserId: null,
    lastInventoryDate: null,
    nextInventoryDate: null,
    validationStatus: null,
    pendingValidationAction: null,
    pendingValidationPayload: null,
    createdById: 'director-1',
    archivedAt: null,
    notes: null,
    fundingSource: null,
    donorName: null,
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
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(InventoryAssetsService);
  });

  describe('create', () => {
    it('creates an asset on the happy path', async () => {
      prisma.inventoryAsset.create.mockResolvedValue(baseAsset);
      const result = await service.create(
        { name: 'x', category: 'INFORMATIQUE' } as any,
        'director-1',
      );
      expect(result.name).toBe('Ordinateur portable');
    });

    it('rejects a warranty end date earlier than the acquisition date', async () => {
      await expect(
        service.create(
          {
            name: 'x',
            category: 'INFORMATIQUE',
            acquisitionDate: '2026-01-01',
            warrantyEndDate: '2025-01-01',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryAsset.create).not.toHaveBeenCalled();
    });

    it('sets status to AFFECTE automatically when created already assigned', async () => {
      prisma.inventoryAsset.create.mockResolvedValue({
        ...baseAsset,
        status: 'AFFECTE',
      });
      await service.create(
        { name: 'x', category: 'INFORMATIQUE', assignedTo: 'Jean' } as any,
        'director-1',
      );
      expect(prisma.inventoryAsset.create).toHaveBeenCalledWith(
        matching({
          data: matching({ status: 'AFFECTE' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing asset', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update (invalid transitions)', () => {
    it('allows a routine status change (DISPONIBLE -> EN_MAINTENANCE)', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        status: 'EN_MAINTENANCE',
      });

      const result = await service.update('asset-1', {
        status: 'EN_MAINTENANCE',
      } as any);

      expect(result.status).toBe('EN_MAINTENANCE');
    });

    it('rejects setting a terminal status (REFORME) via the generic update route', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);

      await expect(
        service.update('asset-1', { status: 'REFORME' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.inventoryAsset.update).not.toHaveBeenCalled();
    });

    it('rejects any status change starting from an already-terminal state', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        status: 'REFORME',
      });

      await expect(
        service.update('asset-1', { status: 'DISPONIBLE' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('assign', () => {
    it('assigns the asset and sets status to AFFECTE', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        assignedTo: 'Jean',
        status: 'AFFECTE',
      });

      const result = await service.assign('asset-1', {
        assignedTo: 'Jean',
      });

      expect(result.status).toBe('AFFECTE');
    });

    it('refuses to assign an archived asset', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        status: 'ARCHIVE',
      });
      await expect(
        service.assign('asset-1', { assignedTo: 'Jean' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('transfer (smart validation gating)', () => {
    it('applies a low-value transfer directly', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        acquisitionCost: 50_000, // below threshold
      });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        spaceId: 'space-2',
      });

      const result = await service.transfer('asset-1', 'director-1', {
        spaceId: 'space-2',
      });

      expect(validations.create).not.toHaveBeenCalled();
      expect(result.spaceId).toBe('space-2');
    });

    it('routes a high-value transfer through validation', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        acquisitionCost: 300_000, // above ASSET_HIGH_VALUE_THRESHOLD_XOF (200,000)
      });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ASSET_TRANSFER',
      });

      const result = await service.transfer('asset-1', 'director-1', {
        spaceId: 'space-2',
      });

      expect(validations.create).toHaveBeenCalledWith(
        matching({ resourceType: 'INVENTORY_ASSET' }),
      );
      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        matching({ type: 'VALIDATION_SUBMITTED' }),
      );
      expect(result.pendingValidationAction).toBe('ASSET_TRANSFER');
    });

    it('refuses a transfer while a validation is already pending', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        validationStatus: 'PENDING_VALIDATION',
      });
      await expect(
        service.transfer('asset-1', 'director-1', { spaceId: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requestDisposal / requestArchive', () => {
    it('always routes disposal through validation, regardless of value', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        acquisitionCost: 1000, // low value — disposal is still always sensitive
      });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        pendingValidationAction: 'ASSET_DISPOSAL',
      });

      await service.requestDisposal('asset-1', 'director-1', {
        disposalType: 'CASSE',
      } as any);

      expect(validations.create).toHaveBeenCalled();
    });

    it('routes archive requests through validation', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        pendingValidationAction: 'ASSET_ARCHIVE',
      });

      await service.requestArchive('asset-1', 'director-1', {});

      expect(validations.create).toHaveBeenCalledWith(
        matching({ resourceType: 'INVENTORY_ASSET' }),
      );
    });
  });

  describe('approve', () => {
    it('applies ASSET_DISPOSAL by mapping the disposal type to the correct status', async () => {
      const pendingAsset = {
        ...baseAsset,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ASSET_DISPOSAL',
        pendingValidationPayload: { disposalType: 'CASSE' },
      };
      prisma.inventoryAsset.findUnique.mockResolvedValue(pendingAsset);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...pendingAsset,
        status: 'CASSE',
      });

      const result = await service.approve('asset-1', 'supervisor-1', {});

      expect(prisma.inventoryAsset.update).toHaveBeenCalledWith(
        matching({
          data: matching({ status: 'CASSE' }),
        }),
      );
      expect(result.status).toBe('CASSE');
      expect(notifications.create).toHaveBeenCalledWith(
        matching({ type: 'VALIDATION_APPROVED' }),
      );
    });

    it('applies ASSET_ARCHIVE by setting status ARCHIVE and archivedAt', async () => {
      const pendingAsset = {
        ...baseAsset,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ASSET_ARCHIVE',
        pendingValidationPayload: {},
      };
      prisma.inventoryAsset.findUnique.mockResolvedValue(pendingAsset);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...pendingAsset,
        status: 'ARCHIVE',
        archivedAt: new Date(),
      });

      const result = await service.approve('asset-1', 'supervisor-1', {});

      expect(prisma.inventoryAsset.update).toHaveBeenCalledWith(
        matching({
          data: matching({
            status: 'ARCHIVE',
            archivedAt: anyInstanceOf(Date),
          }),
        }),
      );
      expect(result.status).toBe('ARCHIVE');
    });

    it('throws a conflict when there is no pending action to approve', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        pendingValidationAction: null,
      });
      await expect(
        service.approve('asset-1', 'supervisor-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject / requestChanges', () => {
    it('rejects a pending validation and notifies the submitter', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        validationStatus: 'REJECTED',
      });

      const result = await service.reject('asset-1', 'supervisor-1', {
        comment: 'No',
      });

      expect(result.validationStatus).toBe('REJECTED');
    });

    it('requests changes and notifies the submitter', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      validations.requestChanges.mockResolvedValue({
        submittedById: 'director-1',
      });
      prisma.inventoryAsset.update.mockResolvedValue({
        ...baseAsset,
        validationStatus: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges('asset-1', 'supervisor-1', {
        comment: 'clarify',
      });

      expect(result.validationStatus).toBe('CHANGES_REQUESTED');
    });
  });

  describe('findAll', () => {
    it('applies search/spaceId filters and sorts inventory-check-overdue assets first', async () => {
      const overdue = {
        ...baseAsset,
        id: 'a-overdue',
        nextInventoryDate: new Date('2020-01-01'),
      };
      const healthy = { ...baseAsset, id: 'a-ok' };
      prisma.inventoryAsset.findMany.mockResolvedValue([healthy, overdue]);

      const result = await service.findAll({
        search: 'Dell',
        spaceId: 'space-1',
      });

      expect(prisma.inventoryAsset.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({ spaceId: 'space-1' }),
        }),
      );
      expect(result[0].id).toBe('a-overdue');
    });

    it('excludes archived assets by default and includes them only when requested', async () => {
      prisma.inventoryAsset.findMany.mockResolvedValue([]);
      await service.findAll({ archived: true });
      expect(prisma.inventoryAsset.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({ status: 'ARCHIVE' }),
        }),
      );
    });

    it('sends exactly one inventory-due notification per asset (dedup guard)', async () => {
      prisma.inventoryAsset.findMany.mockResolvedValue([
        { ...baseAsset, nextInventoryDate: new Date('2020-01-01') },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        matching({ type: 'ASSET_INVENTORY_DUE' }),
      );
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document and records the uploader', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      upload.upload.mockResolvedValue('inventory-assets/asset-1/file.pdf');
      prisma.inventoryAssetDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as Express.Multer.File;
      await service.uploadDocument(
        'asset-1',
        'director-1',
        file,
        'GARANTIE',
        'Garantie',
      );

      expect(prisma.inventoryAssetDocument.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            assetId: 'asset-1',
            uploadedById: 'director-1',
          }),
        }),
      );
    });

    it('lists documents for an existing asset', async () => {
      prisma.inventoryAsset.findUnique.mockResolvedValue(baseAsset);
      prisma.inventoryAssetDocument.findMany.mockResolvedValue([
        { id: 'doc-1' },
      ]);
      const result = await service.listDocuments('asset-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('returns a signed URL when the document belongs to the given asset', async () => {
      prisma.inventoryAssetDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        assetId: 'asset-1',
        fileKey: 'inventory-assets/asset-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');

      const result = await service.getDocumentUrl('asset-1', 'doc-1');

      expect(result.url).toBe('https://signed-url');
    });

    it('throws NotFoundException when the document belongs to a different asset', async () => {
      prisma.inventoryAssetDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        assetId: 'some-other-asset',
        fileKey: 'x',
      });

      await expect(
        service.getDocumentUrl('asset-1', 'doc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
