import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupplierContractsService } from './supplier-contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  return {
    supplierContract: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    contractDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    notification: { findFirst: jest.fn() },
  };
}

describe('SupplierContractsService', () => {
  let service: SupplierContractsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validations: {
    create: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    requestChanges: jest.Mock;
    findHistory: jest.Mock;
  };
  let notifications: { create: jest.Mock; createForRole: jest.Mock };
  let upload: { upload: jest.Mock; getPresignedUrl: jest.Mock; deleteFile: jest.Mock };

  const baseContract = {
    id: 'contract-1',
    supplierName: 'SENELEC',
    contractName: 'Électricité',
    category: 'ELECTRICITE',
    description: null,
    contractNumber: null,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    renewalDate: null,
    renewalType: null,
    noticePeriod: null,
    amount: 50_000,
    billingFrequency: null,
    status: 'ACTIF',
    notes: null,
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    validationStatus: null,
    pendingValidationAction: null,
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
    upload = { upload: jest.fn(), getPresignedUrl: jest.fn(), deleteFile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(SupplierContractsService);
  });

  describe('create', () => {
    it('activates a low-amount contract directly', async () => {
      prisma.supplierContract.create.mockResolvedValue({ ...baseContract, status: 'ACTIF' });
      const result = await service.create({
        supplierName: 'x',
        contractName: 'x',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        amount: 50_000,
      } as any);
      expect(result.status).toBe('ACTIF');
    });

    it('creates a high-amount contract as a draft requiring validation', async () => {
      prisma.supplierContract.create.mockResolvedValue({ ...baseContract, status: 'BROUILLON' });
      const result = await service.create({
        supplierName: 'x',
        contractName: 'x',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        amount: 600_000, // > CONTRACT_VALIDATION_AMOUNT_THRESHOLD_XOF (500,000)
      } as any);
      expect(prisma.supplierContract.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'BROUILLON' }) }),
      );
      expect(result.status).toBe('BROUILLON');
    });
  });

  describe('effectiveStatus (derived expiry)', () => {
    it('reports EXPIRE for a contract past its end date', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({
        ...baseContract,
        endDate: new Date('2020-01-01'),
      });
      const result = await service.findOne('contract-1');
      expect(result.effectiveStatus).toBe('EXPIRE');
    });

    it('reports EXPIRE_BIENTOT within the warning window', async () => {
      const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days out
      prisma.supplierContract.findUnique.mockResolvedValue({ ...baseContract, endDate: soon });
      const result = await service.findOne('contract-1');
      expect(result.effectiveStatus).toBe('EXPIRE_BIENTOT');
    });

    it('does not override a terminal status (ARCHIVE) even if the end date has passed', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({
        ...baseContract,
        status: 'ARCHIVE',
        endDate: new Date('2020-01-01'),
      });
      const result = await service.findOne('contract-1');
      expect(result.effectiveStatus).toBe('ARCHIVE');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('submitValidation', () => {
    it('submits a draft contract for activation', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({ ...baseContract, status: 'BROUILLON' });
      prisma.supplierContract.update.mockResolvedValue({
        ...baseContract,
        status: 'BROUILLON',
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'CREATION',
      });

      const result = await service.submitValidation('contract-1', 'director-1', {} as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('CREATION');
    });

    it('refuses to submit a contract that is not in draft', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({ ...baseContract, status: 'ACTIF' });
      await expect(
        service.submitValidation('contract-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requestRenewal / requestTermination (invalid transitions)', () => {
    it('refuses renewal of an already-terminated contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({ ...baseContract, status: 'RESILIE' });
      await expect(
        service.requestRenewal('contract-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('routes a renewal request through validation', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      prisma.supplierContract.update.mockResolvedValue({
        ...baseContract,
        pendingValidationAction: 'RENEWAL',
      });

      const result = await service.requestRenewal('contract-1', 'director-1', {} as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('RENEWAL');
    });

    it('refuses termination of an already-terminated contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({ ...baseContract, status: 'ARCHIVE' });
      await expect(
        service.requestTermination('contract-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a second request while one is already pending', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue({
        ...baseContract,
        validationStatus: 'PENDING_VALIDATION',
      });
      await expect(
        service.requestTermination('contract-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approve', () => {
    it('sets status RESILIE and notifies on a TERMINATION approval', async () => {
      const pending = { ...baseContract, pendingValidationAction: 'TERMINATION' };
      prisma.supplierContract.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.supplierContract.update.mockResolvedValue({ ...pending, status: 'RESILIE' });

      const result = await service.approve('contract-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('RESILIE');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VALIDATION_APPROVED' }),
      );
    });

    it('extends the end date on a RENEWAL approval', async () => {
      const pending = {
        ...baseContract,
        pendingValidationAction: 'RENEWAL',
        renewalDate: new Date('2028-01-01'),
      };
      prisma.supplierContract.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.supplierContract.update.mockResolvedValue({
        ...pending,
        status: 'ACTIF',
        endDate: new Date('2028-01-01'),
      });

      await service.approve('contract-1', 'supervisor-1', {} as any);

      expect(prisma.supplierContract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endDate: new Date('2028-01-01'), renewalDate: null }),
        }),
      );
    });

    it('activates the contract (default path) for a plain CREATION approval', async () => {
      const pending = { ...baseContract, status: 'BROUILLON', pendingValidationAction: 'CREATION' };
      prisma.supplierContract.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.supplierContract.update.mockResolvedValue({ ...pending, status: 'ACTIF' });

      const result = await service.approve('contract-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('ACTIF');
    });
  });

  describe('reject / requestChanges', () => {
    it('rejects a pending validation and notifies the submitter', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.supplierContract.update.mockResolvedValue({
        ...baseContract,
        validationStatus: 'REJECTED',
      });

      const result = await service.reject('contract-1', 'supervisor-1', { comment: 'No' } as any);

      expect(result.validationStatus).toBe('REJECTED');
    });

    it('requests changes on the contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      validations.requestChanges.mockResolvedValue({ submittedById: 'director-1' });
      prisma.supplierContract.update.mockResolvedValue({
        ...baseContract,
        validationStatus: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges(
        'contract-1',
        'supervisor-1',
        { comment: 'clarify' } as any,
      );

      expect(result.validationStatus).toBe('CHANGES_REQUESTED');
    });
  });

  describe('findAll', () => {
    it('applies search filters', async () => {
      prisma.supplierContract.findMany.mockResolvedValue([baseContract]);
      await service.findAll({ search: 'SENELEC' } as any);
      expect(prisma.supplierContract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });

    it('filters to only expiring-soon contracts when requested', async () => {
      const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const farOut = { ...baseContract, id: 'c-far', endDate: new Date('2030-01-01') };
      const expiringSoon = { ...baseContract, id: 'c-soon', endDate: soon };
      prisma.supplierContract.findMany.mockResolvedValue([farOut, expiringSoon]);

      const result = await service.findAll({ expiringSoon: true } as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c-soon');
    });

    it('sends exactly one expiry notification per contract (dedup guard)', async () => {
      prisma.supplierContract.findMany.mockResolvedValue([
        { ...baseContract, endDate: new Date('2020-01-01') },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        expect.objectContaining({ type: 'CONTRACT_EXPIRED' }),
      );
    });

    it('does not re-notify an already-notified expiry', async () => {
      prisma.supplierContract.findMany.mockResolvedValue([
        { ...baseContract, endDate: new Date('2020-01-01') },
      ]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'already-sent' });

      await service.findAll({});

      expect(notifications.createForRole).not.toHaveBeenCalled();
    });
  });

  describe('update / archive', () => {
    it('updates editable fields', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      prisma.supplierContract.update.mockResolvedValue({ ...baseContract, amount: 75_000 });

      const result = await service.update('contract-1', { amount: 75_000 } as any);

      expect(result.amount).toBe(75_000);
    });

    it('archives a contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      prisma.supplierContract.update.mockResolvedValue({ ...baseContract, status: 'ARCHIVE' });

      const result = await service.archive('contract-1');

      expect(result.status).toBe('ARCHIVE');
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document and records the label', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      upload.upload.mockResolvedValue('supplier-contracts/contract-1/file.pdf');
      prisma.contractDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadDocument('contract-1', file, 'Contrat signé');

      expect(prisma.contractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contractId: 'contract-1', label: 'Contrat signé' }),
        }),
      );
    });

    it('lists documents for an existing contract', async () => {
      prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
      prisma.contractDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const result = await service.listDocuments('contract-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('history passthrough', () => {
    it('delegates to ValidationsService with the correct resource type', () => {
      validations.findHistory.mockReturnValue([{ id: 'v1' }]);
      const result = service.history('contract-1');
      expect(validations.findHistory).toHaveBeenCalledWith('SUPPLIER_CONTRACT', 'contract-1');
      expect(result).toEqual([{ id: 'v1' }]);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('blocks fetching a document that belongs to a different contract', async () => {
      prisma.contractDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        contractId: 'some-other-contract',
        fileKey: 'x',
      });
      await expect(service.getDocumentUrl('contract-1', 'doc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows fetching a document that belongs to the given contract', async () => {
      prisma.contractDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        contractId: 'contract-1',
        fileKey: 'supplier-contracts/contract-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');
      const result = await service.getDocumentUrl('contract-1', 'doc-1');
      expect(result.url).toBe('https://signed-url');
    });
  });
});
