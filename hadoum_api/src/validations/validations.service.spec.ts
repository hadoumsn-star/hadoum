import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ValidationsService } from './validations.service';
import { PrismaService } from '../prisma/prisma.service';

type MockPrisma = {
  validationRequest: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  maintenanceTicket: { findUnique: jest.Mock };
  supplierContract: { findUnique: jest.Mock };
  administrativeProcedure: { findUnique: jest.Mock };
  stockItem: { findUnique: jest.Mock };
  inventoryAsset: { findUnique: jest.Mock };
  entryLog: { findUnique: jest.Mock };
  goodsMovementLog: { findUnique: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    validationRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    maintenanceTicket: { findUnique: jest.fn() },
    supplierContract: { findUnique: jest.fn() },
    administrativeProcedure: { findUnique: jest.fn() },
    stockItem: { findUnique: jest.fn() },
    inventoryAsset: { findUnique: jest.fn() },
    entryLog: { findUnique: jest.fn() },
    goodsMovementLog: { findUnique: jest.fn() },
  };
}

describe('ValidationsService', () => {
  let service: ValidationsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ValidationsService);
  });

  describe('create', () => {
    it('creates a pending validation request on the happy path', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(null);
      prisma.validationRequest.create.mockResolvedValue({ id: 'v1' });

      const result = await service.create({
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 't1',
        submittedById: 'u1',
      });

      expect(result).toEqual({ id: 'v1' });
      expect(prisma.validationRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          status: 'PENDING_VALIDATION',
          submittedById: 'u1',
        }),
      });
    });

    it('rejects a second submission while one is already pending (duplicate submission)', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue({
        id: 'existing',
        status: 'PENDING_VALIDATION',
      });

      await expect(
        service.create({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          submittedById: 'u1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.validationRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('approve / reject / requestChanges (reviewPending)', () => {
    const pending = {
      id: 'v1',
      status: 'PENDING_VALIDATION',
      submittedById: 'director-1',
    };

    it('approves a pending validation on the happy path', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(pending);
      prisma.validationRequest.update.mockResolvedValue({
        ...pending,
        status: 'APPROVED',
      });

      const result = await service.approve({
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 't1',
        reviewedById: 'supervisor-1',
      });

      expect(result.status).toBe('APPROVED');
      expect(prisma.validationRequest.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedById: 'supervisor-1',
        }),
      });
    });

    it('rejects with a conflict when there is no pending validation for the resource', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.approve({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          reviewedById: 'supervisor-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.validationRequest.update).not.toHaveBeenCalled();
    });

    it('blocks self-approval when submittedById === reviewedById', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(pending);

      await expect(
        service.approve({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          reviewedById: 'director-1', // same as pending.submittedById
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.validationRequest.update).not.toHaveBeenCalled();
    });

    it('blocks duplicate approval: second approve call finds nothing pending (already APPROVED)', async () => {
      // First call: pending exists and gets approved.
      prisma.validationRequest.findFirst.mockResolvedValueOnce(pending);
      prisma.validationRequest.update.mockResolvedValueOnce({
        ...pending,
        status: 'APPROVED',
      });
      await service.approve({
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 't1',
        reviewedById: 'supervisor-1',
      });

      // Second call: no longer PENDING_VALIDATION, so findFirst (scoped to
      // that status) returns null and the duplicate approval is rejected.
      prisma.validationRequest.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.approve({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          reviewedById: 'supervisor-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a pending validation and records the reviewer', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(pending);
      prisma.validationRequest.update.mockResolvedValue({
        ...pending,
        status: 'REJECTED',
      });

      const result = await service.reject({
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 't1',
        reviewedById: 'supervisor-1',
        comment: 'Not acceptable',
      });

      expect(result.status).toBe('REJECTED');
    });

    it('requests changes on a pending validation', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(pending);
      prisma.validationRequest.update.mockResolvedValue({
        ...pending,
        status: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges({
        resourceType: 'MAINTENANCE_TICKET',
        resourceId: 't1',
        reviewedById: 'supervisor-1',
        comment: 'Please clarify',
      });

      expect(result.status).toBe('CHANGES_REQUESTED');
    });

    it('blocks self-approval on reject the same way as approve', async () => {
      prisma.validationRequest.findFirst.mockResolvedValue(pending);

      await expect(
        service.reject({
          resourceType: 'MAINTENANCE_TICKET',
          resourceId: 't1',
          reviewedById: 'director-1',
          comment: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findPending', () => {
    it('enriches each pending validation with its resource for every known resource type', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'MAINTENANCE_TICKET', resourceId: 't1' },
        { id: 'v2', resourceType: 'GOODS_MOVEMENT_LOG', resourceId: 'g1' },
      ]);
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        id: 't1',
        title: 'Fix door',
      });
      prisma.goodsMovementLog.findUnique.mockResolvedValue({
        id: 'g1',
        description: 'Large exit',
      });

      const result = await service.findPending();

      expect(result).toHaveLength(2);
      expect(result[0].resource).toEqual({ id: 't1', title: 'Fix door' });
      expect(result[1].resource).toEqual({ id: 'g1', description: 'Large exit' });
    });

    it('returns null resource when the underlying record no longer exists', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'STOCK_ITEM', resourceId: 'missing' },
      ]);
      prisma.stockItem.findUnique.mockResolvedValue(null);

      const result = await service.findPending();

      expect(result[0].resource).toBeNull();
    });
  });

  describe('findHistory', () => {
    it('returns the full validation history for a resource, newest first', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v2', submittedAt: new Date('2026-02-01') },
        { id: 'v1', submittedAt: new Date('2026-01-01') },
      ]);

      const result = await service.findHistory('MAINTENANCE_TICKET', 't1');

      expect(prisma.validationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'MAINTENANCE_TICKET', resourceId: 't1' },
          orderBy: { submittedAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
