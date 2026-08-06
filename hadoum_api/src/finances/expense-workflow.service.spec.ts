import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseWorkflowStatus } from '@prisma/client';
import { ExpenseWorkflowService } from './expense-workflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationsService } from '../validations/validations.service';
import { BudgetService } from './budget.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  const prisma = {
    transaction: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  // Every ExpenseWorkflowService method that mutates state runs inside
  // prisma.$transaction(async (tx) => {...}) so submit/approve/reject/
  // resubmit persist the Transaction row and the ValidationRequest
  // atomically. The mock simulates that by invoking the callback with the
  // SAME mock client — real atomicity (rollback-on-throw, row locking) is
  // covered by the e2e suite against a real Postgres instance.
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

function createMockValidations() {
  return {
    create: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };
}

function createMockNotifications() {
  return {
    create: jest.fn(),
    createForRole: jest.fn(),
  };
}

function createMockBudget() {
  // Generous defaults (a large budgetXof, nothing reserved/consumed yet) so
  // every pre-existing approve() test — none of which cares about budget —
  // sails through the PR 5C gate unchanged. Budget-specific tests below
  // override these per case.
  return {
    lockBudgetLine: jest
      .fn()
      .mockResolvedValue({ id: 'budget-1', budgetXof: 1_000_000 }),
    getCategoryAvailability: jest
      .fn()
      .mockResolvedValue({ reservedXof: 0, consumedXof: 0 }),
  };
}

const ALL_STATUSES: ExpenseWorkflowStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
];

describe('ExpenseWorkflowService', () => {
  let service: ExpenseWorkflowService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validations: ReturnType<typeof createMockValidations>;
  let budget: ReturnType<typeof createMockBudget>;
  let notifications: ReturnType<typeof createMockNotifications>;

  const baseExpense = {
    id: 'txn-1',
    type: 'DEPENSE',
    category: 'ENTRETIEN',
    label: 'Réparation plomberie',
    amountXof: 25000,
    date: new Date('2026-08-01'),
    status: 'EN_ATTENTE',
    expenseWorkflowStatus: null as ExpenseWorkflowStatus | null,
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    validations = createMockValidations();
    budget = createMockBudget();
    notifications = createMockNotifications();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: ValidationsService, useValue: validations },
        { provide: BudgetService, useValue: budget },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(ExpenseWorkflowService);
  });

  // ─── Pure state machine (canTransition / validateTransition) ────────────
  // Untouched by PR 5B — same rules as PR 5A, only how the write is
  // persisted (atomically, alongside a ValidationRequest) changed.

  describe('canTransition — every allowed transition', () => {
    it.each([
      [null, 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['PENDING_APPROVAL', 'REJECTED'],
      ['REJECTED', 'PENDING_APPROVAL'],
      ['APPROVED', 'COMPLETED'],
      ['APPROVED', 'CANCELLED'],
    ] as [ExpenseWorkflowStatus | null, ExpenseWorkflowStatus][])(
      '%s -> %s is allowed',
      (from, to) => {
        expect(service.canTransition(from, to)).toBe(true);
      },
    );
  });

  describe('canTransition — every forbidden transition', () => {
    const allowed = new Set([
      'null->PENDING_APPROVAL',
      'PENDING_APPROVAL->APPROVED',
      'PENDING_APPROVAL->REJECTED',
      'REJECTED->PENDING_APPROVAL',
      'APPROVED->COMPLETED',
      'APPROVED->CANCELLED',
    ]);
    const fromStates: (ExpenseWorkflowStatus | null)[] = [
      null,
      ...ALL_STATUSES,
    ];

    for (const from of fromStates) {
      for (const to of ALL_STATUSES) {
        const key = `${from ?? 'null'}->${to}`;
        if (allowed.has(key)) continue;
        it(`${from ?? 'NULL'} -> ${to} is forbidden`, () => {
          expect(service.canTransition(from, to)).toBe(false);
        });
      }
    }
  });

  describe('terminal states', () => {
    it('COMPLETED has no outgoing transitions', () => {
      for (const to of ALL_STATUSES) {
        expect(service.canTransition('COMPLETED', to)).toBe(false);
      }
    });

    it('CANCELLED has no outgoing transitions', () => {
      for (const to of ALL_STATUSES) {
        expect(service.canTransition('CANCELLED', to)).toBe(false);
      }
    });
  });

  // ─── submit() — NULL -> PENDING_APPROVAL + ValidationRequest ────────────

  describe('submit', () => {
    it('creates a pending ValidationRequest and persists the workflow state atomically', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });

      const result = await service.submit(
        'txn-1',
        'director-1',
        'Please review',
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'txn-1', expenseWorkflowStatus: null },
        data: { expenseWorkflowStatus: 'PENDING_APPROVAL' },
      });
      expect(validations.create).toHaveBeenCalledWith(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          submittedById: 'director-1',
          comment: 'Please review',
        },
        prisma,
      );
      // Atomic ordering: the Transaction row is guarded/written before the
      // ValidationRequest is created, both inside the same $transaction.
      const updateManyOrder =
        prisma.transaction.updateMany.mock.invocationCallOrder[0];
      const createOrder = validations.create.mock.invocationCallOrder[0];
      expect(updateManyOrder).toBeLessThan(createOrder);
      expect(result.expenseWorkflowStatus).toBe('PENDING_APPROVAL');
    });

    it('rejects submitting a RECETTE', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
      });
      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('blocks a sequential duplicate submit (already PENDING_APPROVAL)', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('blocks a racing duplicate submit (updateMany matches 0 rows despite a stale NULL read)', async () => {
      // Simulates two concurrent submit() calls: both read NULL, but by the
      // time this one's guarded write runs, the other has already committed
      // PENDING_APPROVAL, so the conditional updateMany matches nothing.
      prisma.transaction.findUnique
        .mockResolvedValueOnce(baseExpense) // initial read, still NULL
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'PENDING_APPROVAL',
        }); // re-read after the failed guarded write
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(
        service.submit('missing', 'director-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rolls back (propagates) when ValidationRequest creation fails', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockRejectedValue(new ConflictException('duplicate'));

      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── approve() — PENDING_APPROVAL -> APPROVED + ValidationRequest ───────

  describe('approve', () => {
    it('marks the ValidationRequest approved and persists the workflow state atomically', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.approve.mockResolvedValue({ id: 'v1', status: 'APPROVED' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });

      const result = await service.approve(
        'txn-1',
        'supervisor-1',
        'Looks good',
      );

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'txn-1', expenseWorkflowStatus: 'PENDING_APPROVAL' },
        data: { expenseWorkflowStatus: 'APPROVED' },
      });
      expect(validations.approve).toHaveBeenCalledWith(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          reviewedById: 'supervisor-1',
          comment: 'Looks good',
        },
        prisma,
      );
      expect(result.expenseWorkflowStatus).toBe('APPROVED');
    });

    it('blocks approval from a state other than PENDING_APPROVAL', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense); // NULL
      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.approve).not.toHaveBeenCalled();
    });

    it('blocks double approval', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });
      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.approve).not.toHaveBeenCalled();
    });

    it('blocks approval after rejection', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks approval when a racing decision already won (updateMany matches 0 rows)', async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'PENDING_APPROVAL',
        })
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'REJECTED',
        });
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.approve).not.toHaveBeenCalled();
    });

    it('propagates a ConflictException when there is no active pending ValidationRequest', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.approve.mockRejectedValue(
        new ConflictException(
          'Aucune validation en attente pour cette ressource.',
        ),
      );

      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── approve() budget reservation (PR 5C) ───────────────────────────────
  // Pure reserved/consumed/available *calculation* is covered exhaustively
  // in budget.service.spec.ts — these tests only prove ExpenseWorkflowService
  // wires the lock + check + failure/success paths correctly.

  describe('approve — budget reservation', () => {
    const pendingExpense = {
      ...baseExpense,
      expenseWorkflowStatus: 'PENDING_APPROVAL' as ExpenseWorkflowStatus,
    };

    it('reserves the requested amount when it fits the available budget', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      budget.lockBudgetLine.mockResolvedValue({
        id: 'budget-1',
        budgetXof: 100000,
      });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });
      validations.approve.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...pendingExpense,
        expenseWorkflowStatus: 'APPROVED',
      });

      const result = await service.approve('txn-1', 'supervisor-1');

      expect(budget.lockBudgetLine).toHaveBeenCalledWith(
        prisma,
        'ENTRETIEN',
        8,
        2026,
      );
      expect(prisma.transaction.updateMany).toHaveBeenCalled();
      expect(result.expenseWorkflowStatus).toBe('APPROVED');
    });

    it('succeeds when the requested amount exactly equals the available amount', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense); // amountXof: 25000
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      budget.lockBudgetLine.mockResolvedValue({
        id: 'budget-1',
        budgetXof: 25000,
      });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });
      validations.approve.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...pendingExpense,
        expenseWorkflowStatus: 'APPROVED',
      });

      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).resolves.toBeDefined();
    });

    it('rejects approval when the requested amount exceeds availability by even 1 XOF', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense); // amountXof: 25000
      budget.lockBudgetLine.mockResolvedValue({
        id: 'budget-1',
        budgetXof: 24999,
      });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });

      const error = await service
        .approve('txn-1', 'supervisor-1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_BUDGET',
        budgetXof: 24999,
        reservedXof: 0,
        consumedXof: 0,
        availableXof: 24999,
        requestedXof: 25000,
      });
    });

    it('leaves the workflow state and ValidationRequest unchanged on insufficient budget', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense);
      budget.lockBudgetLine.mockResolvedValue({
        id: 'budget-1',
        budgetXof: 100,
      });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });

      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
      expect(validations.approve).not.toHaveBeenCalled();
    });

    it('rejects approval with a clear error when no BudgetLine exists for the category/period', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense);
      budget.lockBudgetLine.mockResolvedValue(null);

      const error = await service
        .approve('txn-1', 'supervisor-1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'NO_BUDGET_LINE',
      });
      expect(budget.getCategoryAvailability).not.toHaveBeenCalled();
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('treats a zero BudgetLine as no available budget', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingExpense);
      budget.lockBudgetLine.mockResolvedValue({ id: 'budget-1', budgetXof: 0 });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });

      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('derives the budget period from transaction.date, not the approval timestamp', async () => {
      // Dated 31 August, "approved" conceptually on some other day — the
      // mock doesn't model real time, but the lock call's arguments prove
      // the period comes from `date` alone.
      prisma.transaction.findUnique.mockResolvedValue({
        ...pendingExpense,
        date: new Date('2026-08-31'),
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.approve.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue(pendingExpense);

      await service.approve('txn-1', 'supervisor-1');

      expect(budget.lockBudgetLine).toHaveBeenCalledWith(
        prisma,
        'ENTRETIEN',
        8,
        2026,
      );
    });
  });

  // ─── reject() — PENDING_APPROVAL -> REJECTED, comment required ──────────

  describe('reject', () => {
    it('marks the ValidationRequest rejected and persists the workflow state atomically', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.reject.mockResolvedValue({ id: 'v1', status: 'REJECTED' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });

      const result = await service.reject(
        'txn-1',
        'supervisor-1',
        'Missing invoice',
      );

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'txn-1', expenseWorkflowStatus: 'PENDING_APPROVAL' },
        data: { expenseWorkflowStatus: 'REJECTED' },
      });
      expect(validations.reject).toHaveBeenCalledWith(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          reviewedById: 'supervisor-1',
          comment: 'Missing invoice',
        },
        prisma,
      );
      expect(result.expenseWorkflowStatus).toBe('REJECTED');
    });

    it('requires a non-empty comment', async () => {
      await expect(
        service.reject('txn-1', 'supervisor-1', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.reject('txn-1', 'supervisor-1', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('blocks rejection from a state other than PENDING_APPROVAL', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });
      await expect(
        service.reject('txn-1', 'supervisor-1', 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.reject).not.toHaveBeenCalled();
    });

    it('blocks double rejection', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      await expect(
        service.reject('txn-1', 'supervisor-1', 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates a ConflictException when there is no active pending ValidationRequest', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.reject.mockRejectedValue(
        new ConflictException(
          'Aucune validation en attente pour cette ressource.',
        ),
      );

      await expect(
        service.reject('txn-1', 'supervisor-1', 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── resubmit() — REJECTED -> PENDING_APPROVAL, NEW ValidationRequest ───

  describe('resubmit', () => {
    it('creates a brand-new ValidationRequest without touching the previous one', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v2' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });

      const result = await service.resubmit('txn-1', 'director-1', 'Fixed it');

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'txn-1', expenseWorkflowStatus: 'REJECTED' },
        data: { expenseWorkflowStatus: 'PENDING_APPROVAL' },
      });
      // create() — never update()/approve()/reject() — so the prior REJECTED
      // ValidationRequest row is left completely untouched.
      expect(validations.create).toHaveBeenCalledWith(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          submittedById: 'director-1',
          comment: 'Fixed it',
        },
        prisma,
      );
      expect(validations.approve).not.toHaveBeenCalled();
      expect(validations.reject).not.toHaveBeenCalled();
      expect(result.expenseWorkflowStatus).toBe('PENDING_APPROVAL');
    });

    it('rejects resubmitting a transaction that was never submitted (NULL)', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      await expect(
        service.resubmit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('rejects resubmitting an approved or pending expense', async () => {
      for (const status of ['APPROVED', 'PENDING_APPROVAL'] as const) {
        prisma.transaction.findUnique.mockResolvedValue({
          ...baseExpense,
          expenseWorkflowStatus: status,
        });
        await expect(
          service.resubmit('txn-1', 'director-1'),
        ).rejects.toBeInstanceOf(ConflictException);
      }
      expect(validations.create).not.toHaveBeenCalled();
    });
  });

  // ─── complete() / cancel() — no ValidationRequest involvement ───────────

  describe('complete', () => {
    it('completes an approved expense without touching ValidationRequest history', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'COMPLETED',
      });

      const result = await service.complete('txn-1');

      expect(result.expenseWorkflowStatus).toBe('COMPLETED');
      expect(validations.create).not.toHaveBeenCalled();
      expect(validations.approve).not.toHaveBeenCalled();
      expect(validations.reject).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects completing a non-approved expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await expect(service.complete('txn-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels an approved expense without touching ValidationRequest history', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'CANCELLED',
      });

      const result = await service.cancel('txn-1');

      expect(result.expenseWorkflowStatus).toBe('CANCELLED');
      expect(validations.create).not.toHaveBeenCalled();
      expect(validations.approve).not.toHaveBeenCalled();
      expect(validations.reject).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects cancelling a non-approved expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await expect(service.cancel('txn-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // ─── Legacy compatibility ────────────────────────────────────────────────

  describe('legacy NULL transactions', () => {
    it('a legacy transaction (expenseWorkflowStatus null) can only ever move to PENDING_APPROVAL via submit', () => {
      expect(service.canTransition(null, 'PENDING_APPROVAL')).toBe(true);
      expect(service.canTransition(null, 'APPROVED')).toBe(false);
      expect(service.canTransition(null, 'REJECTED')).toBe(false);
      expect(service.canTransition(null, 'COMPLETED')).toBe(false);
      expect(service.canTransition(null, 'CANCELLED')).toBe(false);
    });

    it('never calls ValidationsService except via an explicit submit() call', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });

      await service.submit('txn-1', 'director-1');
      expect(validations.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Notifications (PR 5D) ────────────────────────────────────────────────

  describe('notifications', () => {
    const approvedExpense = {
      ...baseExpense,
      label: 'Réparation plomberie',
      amountXof: 25000,
      expenseWorkflowStatus: 'APPROVED' as ExpenseWorkflowStatus,
      supplierContact: null,
    };

    it('submit notifies SUPERVISOR with label, amount, and no supplier mention when absent', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
        supplierContact: null,
      });

      await service.submit('txn-1', 'director-1');

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({
          type: 'VALIDATION_SUBMITTED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Nouvelle dépense à valider',
        }),
      );
      const [, notifiedSubmit] = notifications.createForRole.mock.calls[0] as [
        string,
        { message: string },
      ];
      expect(notifiedSubmit.message).toContain('Réparation plomberie');
      expect(notifiedSubmit.message).toContain('25000');
      expect(notifiedSubmit.message).not.toContain('fournisseur');
    });

    it('submit notification mentions the supplier when present', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v1' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
        supplierContact: { fullName: 'Ets Diop' },
      });

      await service.submit('txn-1', 'director-1');

      const [, notifiedSupplier] = notifications.createForRole.mock
        .calls[0] as [string, { message: string }];
      expect(notifiedSupplier.message).toContain('Ets Diop');
    });

    it('submit does not notify when the transaction fails (RECETTE)', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
      });
      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });

    it('submit does not notify when a racing duplicate submit loses', async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(baseExpense)
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'PENDING_APPROVAL',
        });
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.submit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });

    it('approve notifies the submitting DIRECTOR', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.approve.mockResolvedValue({
        id: 'v1',
        submittedById: 'director-1',
      });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue(approvedExpense);

      await service.approve('txn-1', 'supervisor-1');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'director-1',
          type: 'VALIDATION_APPROVED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Dépense approuvée',
        }),
      );
      const [approveNotif] = notifications.create.mock.calls[0] as [
        { message: string },
      ];
      expect(approveNotif.message).toContain('a été approuvée');
    });

    it('approve does not notify when the budget is insufficient', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      budget.lockBudgetLine.mockResolvedValue({ id: 'b1', budgetXof: 100 });
      budget.getCategoryAvailability.mockResolvedValue({
        reservedXof: 0,
        consumedXof: 0,
      });
      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('approve does not notify when a racing decision already won', async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'PENDING_APPROVAL',
        })
        .mockResolvedValueOnce({
          ...baseExpense,
          expenseWorkflowStatus: 'REJECTED',
        });
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.approve('txn-1', 'supervisor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('reject notifies the submitting DIRECTOR with the rejection comment', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.reject.mockResolvedValue({
        id: 'v1',
        submittedById: 'director-1',
      });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
        supplierContact: null,
      });

      await service.reject('txn-1', 'supervisor-1', 'Justificatif manquant');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'director-1',
          type: 'VALIDATION_REJECTED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Dépense refusée',
        }),
      );
      const [rejectNotif] = notifications.create.mock.calls[0] as [
        { message: string },
      ];
      expect(rejectNotif.message).toContain('Justificatif manquant');
    });

    it('reject does not notify when the comment is empty (no transition attempted at all)', async () => {
      await expect(
        service.reject('txn-1', 'supervisor-1', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notifications.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resubmit notifies SUPERVISOR', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      validations.create.mockResolvedValue({ id: 'v2' });
      prisma.transaction.findUniqueOrThrow.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
        supplierContact: null,
      });

      await service.resubmit('txn-1', 'director-1');

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({
          type: 'VALIDATION_SUBMITTED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Dépense soumise à nouveau',
        }),
      );
    });

    it('resubmit does not notify from a non-REJECTED state', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      await expect(
        service.resubmit('txn-1', 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });

    it('complete notifies SUPERVISOR', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      prisma.transaction.update.mockResolvedValue({
        ...approvedExpense,
        expenseWorkflowStatus: 'COMPLETED',
      });

      await service.complete('txn-1');

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({
          type: 'EXPENSE_COMPLETED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Dépense clôturée',
        }),
      );
    });

    it('complete does not notify a non-approved expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await expect(service.complete('txn-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });

    it('cancel notifies SUPERVISOR', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      prisma.transaction.update.mockResolvedValue({
        ...approvedExpense,
        expenseWorkflowStatus: 'CANCELLED',
      });

      await service.cancel('txn-1');

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({
          type: 'EXPENSE_CANCELLED',
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: 'txn-1',
          title: 'Dépense annulée',
        }),
      );
    });

    it('cancel does not notify a non-approved expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await expect(service.cancel('txn-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });
  });
});
