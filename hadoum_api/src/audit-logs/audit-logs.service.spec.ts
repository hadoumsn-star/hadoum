import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { matching } from '../test-utils/jest-matchers';

// PR 13: generic audit logging — the service is the only thing that ever
// writes/reads AuditLog rows; the interceptor tests cover how it gets called.

function createMockPrisma() {
  return {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };
}

interface AuditLogCreateArgs {
  data: {
    before?: unknown;
    userId?: string;
  };
}

interface AuditLogFindManyArgs {
  where: {
    createdAt: { gte: Date; lte: Date };
    OR: unknown[];
  };
}

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AuditLogsService);
  });

  describe('record', () => {
    it('writes a row with module/action/entity/entityId/before/after/user', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.record({
        module: 'FINANCE',
        action: 'CREATE',
        entity: 'Transaction',
        entityId: 'tx-1',
        before: null,
        after: { id: 'tx-1', label: 'Achat' },
        userId: 'user-1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: matching({
          module: 'FINANCE',
          action: 'CREATE',
          entity: 'Transaction',
          entityId: 'tx-1',
          after: { id: 'tx-1', label: 'Achat' },
          userId: 'user-1',
        }),
      });
    });

    it('normalizes Date values in before/after to plain JSON', async () => {
      prisma.auditLog.create.mockResolvedValue({});
      const date = new Date('2026-01-01T00:00:00.000Z');

      await service.record({
        module: 'INCIDENTS',
        action: 'UPDATE',
        entity: 'Incident',
        entityId: 'inc-1',
        before: { id: 'inc-1', date },
        after: { id: 'inc-1', date },
        userId: 'user-1',
      });

      const createCalls = prisma.auditLog.create.mock.calls as [
        AuditLogCreateArgs,
      ][];
      const call = createCalls[0][0];
      expect(call.data.before).toEqual({
        id: 'inc-1',
        date: date.toISOString(),
      });
    });

    it('stores Prisma.JsonNull when before/after is null (create/delete)', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.record({
        module: 'CONTACTS',
        action: 'CREATE',
        entity: 'Contact',
        entityId: 'c-1',
        before: null,
        after: { id: 'c-1' },
        userId: 'user-1',
      });

      const createCalls = prisma.auditLog.create.mock.calls as [
        AuditLogCreateArgs,
      ][];
      const call = createCalls[0][0];
      expect(call.data.before).toEqual(Prisma.JsonNull);
    });

    it('never throws when the write itself fails (fire-and-forget)', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.record({
          module: 'STOCK',
          action: 'CREATE',
          entity: 'StockItem',
          entityId: 's-1',
          userId: 'user-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('records without a user for system/anonymous actions', async () => {
      prisma.auditLog.create.mockResolvedValue({});
      await service.record({
        module: 'MAINTENANCE',
        action: 'CREATE',
        entity: 'MaintenanceTicket',
        entityId: 't-1',
      });
      const createCalls = prisma.auditLog.create.mock.calls as [
        AuditLogCreateArgs,
      ][];
      const call = createCalls[0][0];
      expect(call.data.userId).toBeUndefined();
    });
  });

  describe('findAll (search and filters)', () => {
    it('applies the module filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findAll({ module: 'FINANCE' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({ module: 'FINANCE' }),
        }),
      );
    });

    it('applies the user filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findAll({ userId: 'user-1' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({ userId: 'user-1' }),
        }),
      );
    });

    it('applies a date range filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findAll({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
      const findManyCalls = prisma.auditLog.findMany.mock.calls as [
        AuditLogFindManyArgs,
      ][];
      const call = findManyCalls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2026-01-01'));
      expect(call.where.createdAt.lte).toEqual(new Date('2026-01-31'));
    });

    it('applies a case-insensitive text search across entity/action/entityId/user name', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findAll({ search: 'transaction' });
      const findManyCalls = prisma.auditLog.findMany.mock.calls as [
        AuditLogFindManyArgs,
      ][];
      const call = findManyCalls[0][0];
      expect(call.where.OR).toEqual([
        { entity: { contains: 'transaction', mode: 'insensitive' } },
        { action: { contains: 'transaction', mode: 'insensitive' } },
        { entityId: { contains: 'transaction', mode: 'insensitive' } },
        {
          user: {
            is: { name: { contains: 'transaction', mode: 'insensitive' } },
          },
        },
      ]);
    });

    it('includes the user relation and orders by most recent first', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findAll({});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        matching({
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('listUsers', () => {
    it('returns every system user, not just ones with existing log entries', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'A', role: 'DIRECTOR' },
      ]);
      const result = await service.listUsers();
      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        matching({
          select: { id: true, name: true, role: true },
        }),
      );
    });
  });
});
