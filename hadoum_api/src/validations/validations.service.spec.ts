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
      expect(result[1].resource).toEqual({
        id: 'g1',
        description: 'Large exit',
      });
    });

    it('returns null resource when the underlying record no longer exists', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'STOCK_ITEM', resourceId: 'missing' },
      ]);
      prisma.stockItem.findUnique.mockResolvedValue(null);

      const result = await service.findPending();

      expect(result[0].resource).toBeNull();
    });

    // Supervisor validation experience consistency: the assigned responsible
    // (Contact relation) is additive enrichment for the queue's display —
    // reused from the same assignedContact relation each resource's own
    // service already reads/writes, never a new business rule.
    it('requests assignedContact (and the legacy assignedTo) for a pending ADMINISTRATIVE_PROCEDURE', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'ADMINISTRATIVE_PROCEDURE', resourceId: 'p1' },
      ]);
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        id: 'p1',
        title: "Agrément d'ouverture",
        authority: 'Ministère',
        status: 'A_PREPARER',
        assignedTo: null,
        assignedContact: { id: 'contact-1', fullName: 'Awa Diop' },
      });

      const result = await service.findPending();

      expect(prisma.administrativeProcedure.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            assignedTo: true,
            assignedContact: { select: { id: true, fullName: true } },
          }),
        }),
      );
      expect(result[0].resource).toEqual(
        expect.objectContaining({ assignedContact: { id: 'contact-1', fullName: 'Awa Diop' } }),
      );
    });

    it('returns null assignedContact (and the raw assignedTo) for an ADMINISTRATIVE_PROCEDURE with no responsible assigned', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'ADMINISTRATIVE_PROCEDURE', resourceId: 'p1' },
      ]);
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        id: 'p1',
        title: "Agrément d'ouverture",
        authority: 'Ministère',
        status: 'A_PREPARER',
        assignedTo: null,
        assignedContact: null,
      });

      const result = await service.findPending();

      expect(result[0].resource).toEqual(
        expect.objectContaining({ assignedContact: null, assignedTo: null }),
      );
    });

    it('requests assignedContact (and the legacy assignedTo) for a pending MAINTENANCE_TICKET', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v1', resourceType: 'MAINTENANCE_TICKET', resourceId: 't1' },
      ]);
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        id: 't1',
        title: 'Fix door',
        assignedTo: null,
        assignedContact: { id: 'contact-2', fullName: 'Moussa Fall' },
      });

      const result = await service.findPending();

      expect(prisma.maintenanceTicket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            assignedTo: true,
            assignedContact: { select: { id: true, fullName: true } },
          }),
        }),
      );
      expect(result[0].resource).toEqual(
        expect.objectContaining({ assignedContact: { id: 'contact-2', fullName: 'Moussa Fall' } }),
      );
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

    it('is not filtered by status — rejected and approved cycles both stay in history', async () => {
      prisma.validationRequest.findMany.mockResolvedValue([
        { id: 'v2', status: 'PENDING_VALIDATION' },
        { id: 'v1', status: 'REJECTED' },
      ]);

      const result = await service.findHistory('EXPENSE_TRANSACTION', 'txn-1');

      expect(prisma.validationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'EXPENSE_TRANSACTION', resourceId: 'txn-1' },
        }),
      );
      expect(result.map((r) => r.status)).toEqual([
        'PENDING_VALIDATION',
        'REJECTED',
      ]);
    });
  });

  describe('optional transaction-client parameter (PR 5B)', () => {
    // Additive: every method still defaults to the injected PrismaService
    // when no tx is passed (every pre-existing caller, proven by every test
    // above never passing one). Passing one routes every query through it
    // instead, so a caller like ExpenseWorkflowService can wrap a
    // ValidationRequest write in the same DB transaction as its own
    // resource's status write.
    it('create() runs its queries against the provided tx client instead of the default one', async () => {
      const tx = {
        validationRequest: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'v1' }),
        },
      };

      await service.create(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          submittedById: 'director-1',
        },
        tx as never,
      );

      expect(tx.validationRequest.findFirst).toHaveBeenCalled();
      expect(tx.validationRequest.create).toHaveBeenCalled();
      expect(prisma.validationRequest.findFirst).not.toHaveBeenCalled();
      expect(prisma.validationRequest.create).not.toHaveBeenCalled();
    });

    it('approve() runs its queries against the provided tx client instead of the default one', async () => {
      const pending = {
        id: 'v1',
        status: 'PENDING_VALIDATION',
        submittedById: 'director-1',
      };
      const tx = {
        validationRequest: {
          findFirst: jest.fn().mockResolvedValue(pending),
          update: jest
            .fn()
            .mockResolvedValue({ ...pending, status: 'APPROVED' }),
        },
      };

      await service.approve(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          reviewedById: 'supervisor-1',
        },
        tx as never,
      );

      expect(tx.validationRequest.findFirst).toHaveBeenCalled();
      expect(tx.validationRequest.update).toHaveBeenCalled();
      expect(prisma.validationRequest.findFirst).not.toHaveBeenCalled();
      expect(prisma.validationRequest.update).not.toHaveBeenCalled();
    });
  });
});
