import { Test, TestingModule } from '@nestjs/testing';
import { BudgetService } from './budget.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    transaction: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
}

function sum(amountXof: number | null) {
  return { _sum: { amountXof } };
}

describe('BudgetService', () => {
  let service: BudgetService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BudgetService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(BudgetService);
  });

  describe('getCategoryAvailability', () => {
    it('returns zero for both when there are no matching transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      const result = await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toEqual({ reservedXof: 0, consumedXof: 0 });
    });

    it('counts only APPROVED expenses as reserved', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce(sum(70000)) // APPROVED
        .mockResolvedValueOnce(sum(null)) // COMPLETED
        .mockResolvedValueOnce(sum(null)); // legacy VALIDE/NULL
      const result = await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toEqual({ reservedXof: 70000, consumedXof: 0 });
    });

    it('counts only COMPLETED (+ legacy realized) expenses as consumed', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce(sum(null)) // APPROVED
        .mockResolvedValueOnce(sum(50000)) // COMPLETED
        .mockResolvedValueOnce(sum(20000)); // legacy VALIDE/NULL
      const result = await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toEqual({ reservedXof: 0, consumedXof: 70000 });
    });

    it('sums reserved and consumed independently (no double counting)', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce(sum(30000)) // APPROVED
        .mockResolvedValueOnce(sum(50000)) // COMPLETED
        .mockResolvedValueOnce(sum(10000)); // legacy
      const result = await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toEqual({ reservedXof: 30000, consumedXof: 60000 });
    });

    it('scopes every sub-query to DEPENSE only (RECETTE excluded structurally)', async () => {
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      for (const call of prisma.transaction.aggregate.mock.calls) {
        expect(call[0].where.type).toBe('DEPENSE');
      }
    });

    it('excludes PENDING_APPROVAL, REJECTED, and CANCELLED from both buckets', async () => {
      // Every sub-query filters expenseWorkflowStatus to exactly one value
      // (APPROVED / COMPLETED / null) — PENDING_APPROVAL, REJECTED, and
      // CANCELLED transactions never match any of the three, so they
      // silently drop out of both reserved and consumed.
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      const statuses = prisma.transaction.aggregate.mock.calls.map(
        (c: any) => c[0].where.expenseWorkflowStatus,
      );
      expect(statuses.sort()).toEqual(['APPROVED', 'COMPLETED', null].sort());
    });

    it('the legacy bucket additionally requires status = VALIDE', async () => {
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      const legacyCall = prisma.transaction.aggregate.mock.calls.find(
        (c: any) => c[0].where.expenseWorkflowStatus === null,
      );
      expect(legacyCall[0].where.status).toBe('VALIDE');
    });

    it('scopes to the given month only (year/month boundary)', async () => {
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        8,
        2026,
      );
      const { gte, lt } =
        prisma.transaction.aggregate.mock.calls[0][0].where.date;
      expect(gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(lt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('December -> January year boundary rolls over correctly', async () => {
      prisma.transaction.aggregate.mockResolvedValue(sum(null));
      await service.getCategoryAvailability(
        prisma as never,
        'ENTRETIEN',
        12,
        2026,
      );
      const { gte, lt } =
        prisma.transaction.aggregate.mock.calls[0][0].where.date;
      expect(gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('getAllCategoriesAvailability', () => {
    it('returns an empty map when there is no data at all', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      const result = await service.getAllCategoriesAvailability(2026, 8);
      expect(result.size).toBe(0);
    });

    it('keeps different categories fully independent', async () => {
      prisma.transaction.groupBy
        .mockResolvedValueOnce([
          { category: 'ENTRETIEN', _sum: { amountXof: 30000 } },
        ]) // reserved
        .mockResolvedValueOnce([
          { category: 'ALIMENTATION', _sum: { amountXof: 50000 } },
        ]) // completed
        .mockResolvedValueOnce([]); // legacy

      const result = await service.getAllCategoriesAvailability(2026, 8);

      expect(result.get('ENTRETIEN')).toEqual({
        reservedXof: 30000,
        consumedXof: 0,
      });
      expect(result.get('ALIMENTATION')).toEqual({
        reservedXof: 0,
        consumedXof: 50000,
      });
    });

    it('merges reserved, completed, and legacy sums for the same category without double counting', async () => {
      prisma.transaction.groupBy
        .mockResolvedValueOnce([
          { category: 'ENTRETIEN', _sum: { amountXof: 30000 } },
        ])
        .mockResolvedValueOnce([
          { category: 'ENTRETIEN', _sum: { amountXof: 50000 } },
        ])
        .mockResolvedValueOnce([
          { category: 'ENTRETIEN', _sum: { amountXof: 10000 } },
        ]);

      const result = await service.getAllCategoriesAvailability(2026, 8);

      expect(result.get('ENTRETIEN')).toEqual({
        reservedXof: 30000,
        consumedXof: 60000,
      });
    });
  });

  describe('lockBudgetLine', () => {
    it('returns the matching BudgetLine row via a locking raw query', async () => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ id: 'b1', budgetXof: 100000 }]),
      };
      const result = await service.lockBudgetLine(
        tx as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toEqual({ id: 'b1', budgetXof: 100000 });
      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it('returns null when no BudgetLine exists for the category/month/year', async () => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
      const result = await service.lockBudgetLine(
        tx as never,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(result).toBeNull();
    });
  });
});
