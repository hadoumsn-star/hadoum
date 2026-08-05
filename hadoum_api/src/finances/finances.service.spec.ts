import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FinancesService } from './finances.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ExpenseWorkflowService } from './expense-workflow.service';
import { BudgetService } from './budget.service';

function createMockPrisma() {
  return {
    transaction: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    budgetLine: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
  };
}

describe('FinancesService', () => {
  let service: FinancesService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let upload: {
    upload: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };
  let workflow: {
    submit: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    resubmit: jest.Mock;
    complete: jest.Mock;
    cancel: jest.Mock;
  };
  let budget: { getAllCategoriesAvailability: jest.Mock };

  const baseExpense = {
    id: 'txn-1',
    type: 'DEPENSE',
    category: 'ENTRETIEN',
    label: 'Réparation plomberie',
    amountXof: 25000,
    date: new Date('2026-08-01'),
    status: 'EN_ATTENTE',
    justifKey: null,
    justifMime: null,
    donorName: null,
    isAnonymousDonor: null,
    supplierContactId: null,
    paymentMethod: null,
    purchaseOrderKey: null,
    purchaseOrderMime: null,
    invoiceKey: null,
    invoiceMime: null,
    deliveryNoteKey: null,
    deliveryNoteMime: null,
    createdBy: null,
    expenseWorkflowStatus: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeSupplier = {
    id: 'contact-1',
    fullName: 'Ets Diop',
    active: true,
  };
  const inactiveSupplier = {
    ...activeSupplier,
    id: 'contact-2',
    active: false,
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };
    // FinancesService only ever delegates to this (see its "Expense approval
    // workflow" section) — the state machine itself is covered by
    // expense-workflow.service.spec.ts, so a plain jest.fn() mock is enough
    // here to prove the delegation wiring, not re-test transition rules.
    workflow = {
      submit: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      resubmit: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    };
    // PR 5C — FinancesService only needs this for the dashboard's
    // reserved/consumed extension; updateTransaction's financial-field lock
    // reads expenseWorkflowStatus straight off the Transaction row, not
    // through BudgetService at all.
    budget = {
      getAllCategoriesAvailability: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ExpenseWorkflowService, useValue: workflow },
        { provide: BudgetService, useValue: budget },
      ],
    }).compile();
    service = module.get(FinancesService);
  });

  // ─── Create ─────────────────────────────────────────────────────────────

  describe('createTransaction — expense without supplier', () => {
    it('creates an expense with no Contact lookup when supplierContactId is absent', async () => {
      prisma.transaction.create.mockResolvedValue(baseExpense);
      await service.createTransaction({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'x',
        amountXof: 1000,
        date: '2026-08-01',
      } as any);
      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supplierContactId: undefined }),
        }),
      );
    });
  });

  describe('createTransaction — expense with active supplier', () => {
    it('connects the supplier when it exists and is active', async () => {
      prisma.contact.findUnique.mockResolvedValue(activeSupplier);
      prisma.transaction.create.mockResolvedValue({
        ...baseExpense,
        supplierContactId: activeSupplier.id,
      });

      await service.createTransaction({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'x',
        amountXof: 1000,
        date: '2026-08-01',
        supplierContactId: activeSupplier.id,
      } as any);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierContactId: activeSupplier.id,
          }),
        }),
      );
    });
  });

  describe('createTransaction — supplier validation', () => {
    it('rejects an unknown contact id', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(
        service.createTransaction({
          type: 'DEPENSE',
          category: 'ENTRETIEN',
          label: 'x',
          amountXof: 1000,
          date: '2026-08-01',
          supplierContactId: 'missing',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive contact for a new assignment', async () => {
      prisma.contact.findUnique.mockResolvedValue(inactiveSupplier);
      await expect(
        service.createTransaction({
          type: 'DEPENSE',
          category: 'ENTRETIEN',
          label: 'x',
          amountXof: 1000,
          date: '2026-08-01',
          supplierContactId: inactiveSupplier.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('createTransaction — payment method', () => {
    it('stores the selected payment method', async () => {
      prisma.transaction.create.mockResolvedValue({
        ...baseExpense,
        paymentMethod: 'VIREMENT',
      });
      await service.createTransaction({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'x',
        amountXof: 1000,
        date: '2026-08-01',
        paymentMethod: 'VIREMENT',
      } as any);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentMethod: 'VIREMENT' }),
        }),
      );
    });
  });

  describe('createTransaction — income (RECETTE) behavior unchanged', () => {
    it('still creates a RECETTE with donor fields, no Contact lookup performed', async () => {
      prisma.transaction.create.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
        category: 'DON',
        donorName: 'Amina',
        isAnonymousDonor: false,
      });
      const result = await service.createTransaction({
        type: 'RECETTE',
        category: 'DON',
        label: 'Don',
        amountXof: 5000,
        date: '2026-08-01',
        donorName: 'Amina',
        isAnonymousDonor: false,
      } as any);
      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(result.donorName).toBe('Amina');
    });

    it('rejects supplierContactId on a RECETTE', async () => {
      await expect(
        service.createTransaction({
          type: 'RECETTE',
          category: 'DON',
          label: 'Don',
          amountXof: 5000,
          date: '2026-08-01',
          supplierContactId: activeSupplier.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  // ─── Reads ──────────────────────────────────────────────────────────────

  describe('findAllTransactions / findOneTransaction', () => {
    it('includes supplierContact (with category) in the list query', async () => {
      prisma.transaction.findMany.mockResolvedValue([baseExpense]);
      await service.findAllTransactions({});
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { supplierContact: { include: { category: true } } },
        }),
      );
    });

    it('includes supplierContact in the detail query', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      await service.findOneTransaction('txn-1');
      expect(prisma.transaction.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { supplierContact: { include: { category: true } } },
        }),
      );
    });

    it('throws NotFoundException for a missing transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(
        service.findOneTransaction('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a transaction whose supplier has since been deactivated, without filtering it out', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        supplierContactId: inactiveSupplier.id,
        supplierContact: inactiveSupplier,
      });
      const result = await service.findOneTransaction('txn-1');
      expect(result.supplierContact).toEqual(inactiveSupplier);
    });
  });

  // ─── Update ─────────────────────────────────────────────────────────────

  describe('updateTransaction — supplier', () => {
    it('updates to a different active supplier', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        supplierContactId: 'old-contact',
      });
      prisma.contact.findUnique.mockResolvedValue(activeSupplier);
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        supplierContactId: activeSupplier.id,
      });

      await service.updateTransaction('txn-1', {
        supplierContactId: activeSupplier.id,
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierContactId: activeSupplier.id,
          }),
        }),
      );
    });

    it('rejects updating to an inactive supplier', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.contact.findUnique.mockResolvedValue(inactiveSupplier);
      await expect(
        service.updateTransaction('txn-1', {
          supplierContactId: inactiveSupplier.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('clears the supplier when supplierContactId is explicitly null', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        supplierContactId: activeSupplier.id,
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        supplierContactId: null,
      });

      await service.updateTransaction('txn-1', {
        supplierContactId: null,
      });

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supplierContactId: null }),
        }),
      );
    });

    it('leaves the existing supplier relation untouched when supplierContactId is omitted', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        supplierContactId: activeSupplier.id,
      });
      prisma.transaction.update.mockResolvedValue(baseExpense);

      await service.updateTransaction('txn-1', {
        label: 'Nouveau libellé',
      });

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      const call = prisma.transaction.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('supplierContactId');
    });

    it('rejects assigning a supplier while switching a transaction to RECETTE', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      await expect(
        service.updateTransaction('txn-1', {
          type: 'RECETTE',
          supplierContactId: activeSupplier.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not alter status as a side effect of a supplier change', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        status: 'VALIDE',
      });
      prisma.contact.findUnique.mockResolvedValue(activeSupplier);
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        status: 'VALIDE',
        supplierContactId: activeSupplier.id,
      });

      await service.updateTransaction('txn-1', {
        supplierContactId: activeSupplier.id,
      });

      const call = prisma.transaction.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('status');
    });
  });

  describe('updateTransaction — payment method', () => {
    it('updates the payment method', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        paymentMethod: 'CARTE',
      });
      await service.updateTransaction('txn-1', {
        paymentMethod: 'CARTE',
      } as any);
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentMethod: 'CARTE' }),
        }),
      );
    });
  });

  // ─── updateTransaction — financial-field lock (PR 5C) ──────────────────

  describe('updateTransaction — financial-field lock once approved', () => {
    const approvedExpense = {
      ...baseExpense,
      expenseWorkflowStatus: 'APPROVED',
    };

    it('blocks an amount change once APPROVED', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', { amountXof: 99999 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('blocks a category change once APPROVED', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', { category: 'ALIMENTATION' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks a date change once APPROVED', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', { date: '2026-09-01' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks a type change once APPROVED', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', { type: 'RECETTE' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('still allows descriptive changes (label, supplier, payment method) once APPROVED', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      prisma.transaction.update.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', {
          label: 'Updated label',
          paymentMethod: 'CARTE',
        } as any),
      ).resolves.toBeDefined();
      expect(prisma.transaction.update).toHaveBeenCalled();
    });

    it('does not block a PATCH that resends the same amount/category/date/type unchanged', async () => {
      prisma.transaction.findUnique.mockResolvedValue(approvedExpense);
      prisma.transaction.update.mockResolvedValue(approvedExpense);
      await expect(
        service.updateTransaction('txn-1', {
          amountXof: approvedExpense.amountXof,
          category: approvedExpense.category,
          type: approvedExpense.type,
          label: 'Still allowed',
        } as any),
      ).resolves.toBeDefined();
    });

    it('blocks a financial edit once COMPLETED', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'COMPLETED',
      });
      await expect(
        service.updateTransaction('txn-1', { amountXof: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks a financial edit once CANCELLED', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'CANCELLED',
      });
      await expect(
        service.updateTransaction('txn-1', { amountXof: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows financial edits while PENDING_APPROVAL (pre-approval correction)', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      prisma.transaction.update.mockResolvedValue(baseExpense);
      await expect(
        service.updateTransaction('txn-1', { amountXof: 30000 } as any),
      ).resolves.toBeDefined();
    });

    it('allows financial edits while REJECTED (fixing before resubmit)', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      prisma.transaction.update.mockResolvedValue(baseExpense);
      await expect(
        service.updateTransaction('txn-1', { amountXof: 30000 } as any),
      ).resolves.toBeDefined();
    });

    it('legacy transaction (expenseWorkflowStatus null) editing is completely unaffected', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense); // null
      prisma.transaction.update.mockResolvedValue(baseExpense);
      await expect(
        service.updateTransaction('txn-1', {
          amountXof: 999,
          category: 'ALIMENTATION',
          date: '2026-09-01',
        } as any),
      ).resolves.toBeDefined();
    });
  });

  // ─── Dedicated expense documents ────────────────────────────────────────

  describe('purchase order document', () => {
    it('uploads a purchase order for an expense, replacing any previous file', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        purchaseOrderKey: 'old-key',
      });
      upload.upload.mockResolvedValue('finances/txn-1/purchase-order/new.pdf');
      upload.deleteFile.mockResolvedValue(undefined);
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        purchaseOrderKey: 'finances/txn-1/purchase-order/new.pdf',
      });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadPurchaseOrder('txn-1', file);

      expect(upload.upload).toHaveBeenCalled();
      expect(upload.deleteFile).toHaveBeenCalledWith('old-key');
    });

    it('rejects uploading a purchase order to a RECETTE', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
      });
      await expect(
        service.uploadPurchaseOrder('txn-1', {
          mimetype: 'application/pdf',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload.upload).not.toHaveBeenCalled();
    });

    it('gets a presigned url for an uploaded purchase order', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        purchaseOrderKey: 'key-1',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed/po');
      const result = await service.getPurchaseOrderUrl('txn-1');
      expect(result.url).toBe('https://signed/po');
    });

    it('throws NotFoundException when no purchase order has been uploaded', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      await expect(service.getPurchaseOrderUrl('txn-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes a purchase order, clearing only that field', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        purchaseOrderKey: 'key-1',
        invoiceKey: 'key-2',
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        purchaseOrderKey: null,
        invoiceKey: 'key-2',
      });
      await service.deletePurchaseOrder('txn-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('key-1');
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { purchaseOrderKey: null, purchaseOrderMime: null },
        }),
      );
    });
  });

  describe('invoice document', () => {
    it('uploads an invoice for an expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      upload.upload.mockResolvedValue('finances/txn-1/invoice/new.pdf');
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        invoiceKey: 'finances/txn-1/invoice/new.pdf',
      });
      await service.uploadInvoice('txn-1', {
        mimetype: 'application/pdf',
      } as any);
      expect(upload.upload).toHaveBeenCalled();
    });

    it('gets a presigned url for an uploaded invoice', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        invoiceKey: 'key-1',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed/invoice');
      const result = await service.getInvoiceUrl('txn-1');
      expect(result.url).toBe('https://signed/invoice');
    });

    it('deletes an invoice', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        invoiceKey: 'key-1',
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        invoiceKey: null,
      });
      await service.deleteInvoice('txn-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('key-1');
    });
  });

  describe('delivery note document', () => {
    it('uploads a delivery note for an expense', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      upload.upload.mockResolvedValue('finances/txn-1/delivery-note/new.pdf');
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        deliveryNoteKey: 'finances/txn-1/delivery-note/new.pdf',
      });
      await service.uploadDeliveryNote('txn-1', {
        mimetype: 'application/pdf',
      } as any);
      expect(upload.upload).toHaveBeenCalled();
    });

    it('gets a presigned url for an uploaded delivery note', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        deliveryNoteKey: 'key-1',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed/dn');
      const result = await service.getDeliveryNoteUrl('txn-1');
      expect(result.url).toBe('https://signed/dn');
    });

    it('deletes a delivery note', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        deliveryNoteKey: 'key-1',
      });
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        deliveryNoteKey: null,
      });
      await service.deleteDeliveryNote('txn-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('key-1');
    });
  });

  describe('expense documents rejected for income', () => {
    it('rejects an invoice upload for a RECETTE', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
      });
      await expect(
        service.uploadInvoice('txn-1', { mimetype: 'application/pdf' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a delivery note upload for a RECETTE', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        type: 'RECETTE',
      });
      await expect(
        service.uploadDeliveryNote('txn-1', {
          mimetype: 'application/pdf',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Legacy justificatif — unchanged ────────────────────────────────────

  describe('legacy justificatif endpoint', () => {
    it('still uploads a justificatif exactly as before (works for either transaction type)', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseExpense);
      upload.upload.mockResolvedValue('finances/txn-1/justificatif/f.pdf');
      prisma.transaction.update.mockResolvedValue({
        ...baseExpense,
        justifKey: 'finances/txn-1/justificatif/f.pdf',
      });
      const result = await service.uploadJustificatif('txn-1', {
        mimetype: 'application/pdf',
      } as any);
      expect(result.justifKey).toBe('finances/txn-1/justificatif/f.pdf');
    });

    it('still gets a presigned url for the legacy justificatif', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        justifKey: 'key-1',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed/justif');
      const result = await service.getJustificatifUrl('txn-1');
      expect(result.url).toBe('https://signed/justif');
    });
  });

  // ─── Delete transaction — cleans up new document keys too ──────────────

  describe('deleteTransaction', () => {
    it('deletes every uploaded file (legacy + new documents) before removing the row', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseExpense,
        justifKey: 'j',
        purchaseOrderKey: 'po',
        invoiceKey: 'inv',
        deliveryNoteKey: 'dn',
      });
      await service.deleteTransaction('txn-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('j');
      expect(upload.deleteFile).toHaveBeenCalledWith('po');
      expect(upload.deleteFile).toHaveBeenCalledWith('inv');
      expect(upload.deleteFile).toHaveBeenCalledWith('dn');
      expect(prisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'txn-1' },
      });
    });
  });

  // ─── ensureDefaultBudgetLines (PR 6) ────────────────────────────────────

  describe('ensureDefaultBudgetLines', () => {
    it('seeds all 9 default categories for the current month via one atomic createMany', async () => {
      const now = new Date();
      prisma.budgetLine.createMany.mockResolvedValue({ count: 9 });
      prisma.budgetLine.findMany.mockResolvedValue([]);

      await service.ensureDefaultBudgetLines();

      expect(prisma.budgetLine.createMany).toHaveBeenCalledWith({
        data: [
          {
            category: 'ALIMENTATION',
            budgetXof: 250_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'SANTE',
            budgetXof: 36_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'VETEMENTS',
            budgetXof: 20_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'TRANSPORT',
            budgetXof: 18_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'ETUDES',
            budgetXof: 10_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'SPORT',
            budgetXof: 30_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'LOISIRS',
            budgetXof: 30_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'BUREAU_FACTURES',
            budgetXof: 20_000,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
          {
            category: 'SALAIRES',
            budgetXof: 0,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
        ],
        skipDuplicates: true,
      });
    });

    it('never touches a row that already exists (skipDuplicates, not update) — custom amounts are preserved', async () => {
      // The whole "don't overwrite a user-modified budget" guarantee comes
      // from skipDuplicates + the DB's own @@unique([category,month,year])
      // constraint — this pins that no `update`/`upsert` call is ever made.
      prisma.budgetLine.createMany.mockResolvedValue({ count: 0 });
      prisma.budgetLine.findMany.mockResolvedValue([
        { id: 'b1', category: 'ALIMENTATION', budgetXof: 999_999 },
      ]);

      const result = await service.ensureDefaultBudgetLines();

      expect(prisma.budgetLine.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
      expect(result).toEqual([
        { id: 'b1', category: 'ALIMENTATION', budgetXof: 999_999 },
      ]);
    });

    it("returns the current month's budget lines after seeding", async () => {
      const now = new Date();
      prisma.budgetLine.createMany.mockResolvedValue({ count: 9 });
      const seeded = [{ id: 'b1', category: 'SALAIRES', budgetXof: 0 }];
      prisma.budgetLine.findMany.mockResolvedValue(seeded);

      const result = await service.ensureDefaultBudgetLines();

      expect(prisma.budgetLine.findMany).toHaveBeenCalledWith({
        where: { year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      expect(result).toEqual(seeded);
    });
  });

  // ─── Aggregation regression — unaffected by the new fields ──────────────

  describe('getDashboard — unaffected by supplier/payment/document additions', () => {
    it('still aggregates realized totals using only type/status/amount, no new fields referenced', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountXof: 100000 },
      });
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.budgetLine.findMany.mockResolvedValue([]);

      const dashboard = await service.getDashboard(2026, 8);

      // Every aggregate/groupBy call's `where` only ever references type,
      // status, category, and date — asserting this pins the aggregation
      // semantics so a future change accidentally scoping by
      // supplierContactId/paymentMethod would fail this test.
      const allWhereKeys = [
        ...prisma.transaction.aggregate.mock.calls.map((c: any) =>
          Object.keys(c[0].where),
        ),
        ...prisma.transaction.groupBy.mock.calls.map((c: any) =>
          Object.keys(c[0].where),
        ),
      ].flat();
      expect(new Set(allWhereKeys)).toEqual(
        new Set(['type', 'status', 'date']),
      );
      expect(dashboard.soldeCaisseXof).toBe(0);
    });
  });

  // ─── getDashboard — budget reservation/consumption (PR 5C) ─────────────

  describe('getDashboard — reserved/consumed/available additions', () => {
    beforeEach(() => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountXof: 0 },
      });
      prisma.transaction.groupBy.mockResolvedValue([]);
    });

    it('preserves every existing byCategory field untouched', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([
        { category: 'ENTRETIEN', budgetXof: 100000 },
      ]);
      budget.getAllCategoriesAvailability.mockResolvedValue(
        new Map([['ENTRETIEN', { reservedXof: 0, consumedXof: 0 }]]),
      );

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien).toMatchObject({
        category: 'ENTRETIEN',
        realizedXof: 0,
        budgetXof: 100000,
        ecartXof: 100000,
        overBudget: false,
      });
    });

    it('adds correct reserved/consumed/available and committed percentages', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([
        { category: 'ENTRETIEN', budgetXof: 100000 },
      ]);
      budget.getAllCategoriesAvailability.mockResolvedValue(
        new Map([['ENTRETIEN', { reservedXof: 30000, consumedXof: 20000 }]]),
      );

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien.reservedXof).toBe(30000);
      expect(entretien.consumedXof).toBe(20000);
      expect(entretien.availableXof).toBe(50000);
      expect(entretien.reservedPercentage).toBe(30);
      expect(entretien.consumedPercentage).toBe(20);
      expect(entretien.totalCommittedPercentage).toBe(50);
      expect(entretien.committedOverBudget).toBe(false);
    });

    it('flags committedOverBudget when reserved + consumed exceeds budget, independent of legacy overBudget', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([
        { category: 'ENTRETIEN', budgetXof: 40000 },
      ]);
      budget.getAllCategoriesAvailability.mockResolvedValue(
        new Map([['ENTRETIEN', { reservedXof: 30000, consumedXof: 20000 }]]),
      );

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien.committedOverBudget).toBe(true);
      // Legacy overBudget is realizedXof-based and untouched — realizedXof
      // is 0 here (mocked), so it stays false even though committed isn't.
      expect(entretien.overBudget).toBe(false);
    });

    it('percentages are null (not NaN/Infinity) when budgetXof is 0', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([
        { category: 'ENTRETIEN', budgetXof: 0 },
      ]);
      budget.getAllCategoriesAvailability.mockResolvedValue(
        new Map([['ENTRETIEN', { reservedXof: 10000, consumedXof: 0 }]]),
      );

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien.reservedPercentage).toBeNull();
      expect(entretien.consumedPercentage).toBeNull();
      expect(entretien.totalCommittedPercentage).toBeNull();
      expect(entretien.availableXof).toBe(-10000);
    });

    it('percentages and availableXof are null when there is no BudgetLine at all', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([]);
      budget.getAllCategoriesAvailability.mockResolvedValue(
        new Map([['ENTRETIEN', { reservedXof: 10000, consumedXof: 5000 }]]),
      );

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien.budgetXof).toBeNull();
      expect(entretien.availableXof).toBeNull();
      expect(entretien.reservedPercentage).toBeNull();
    });

    it('preserves visibility of legacy over-budget data (realizedXof-based) unchanged', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        { category: 'ENTRETIEN', _sum: { amountXof: 150000 } },
      ]);
      prisma.budgetLine.findMany.mockResolvedValue([
        { category: 'ENTRETIEN', budgetXof: 100000 },
      ]);
      budget.getAllCategoriesAvailability.mockResolvedValue(new Map());

      const dashboard = await service.getDashboard(2026, 8);
      const entretien = dashboard.byCategory.find(
        (c: any) => c.category === 'ENTRETIEN',
      );
      expect(entretien.overBudget).toBe(true);
      expect(entretien.realizedXof).toBe(150000);
      expect(dashboard.alerts).toHaveLength(1);
    });
  });

  describe('existing status behavior unchanged', () => {
    it('still defaults a new transaction to EN_ATTENTE when status is omitted', async () => {
      prisma.transaction.create.mockResolvedValue(baseExpense);
      await service.createTransaction({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'x',
        amountXof: 1000,
        date: '2026-08-01',
      } as any);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EN_ATTENTE' }),
        }),
      );
    });

    it('still applies an explicit status on create', async () => {
      prisma.transaction.create.mockResolvedValue({
        ...baseExpense,
        status: 'VALIDE',
      });
      await service.createTransaction({
        type: 'DEPENSE',
        category: 'ENTRETIEN',
        label: 'x',
        amountXof: 1000,
        date: '2026-08-01',
        status: 'VALIDE',
      } as any);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'VALIDE' }),
        }),
      );
    });
  });

  describe('expense workflow delegation (PR 5A/5B)', () => {
    // FinancesService must not contain any transition or ValidationRequest
    // logic itself — these just prove each method forwards to
    // ExpenseWorkflowService with the right arguments and nothing else. The
    // state machine's and validation integration's actual rules are covered
    // exhaustively in expense-workflow.service.spec.ts.
    it('submitExpense delegates to ExpenseWorkflowService.submit', async () => {
      workflow.submit.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await service.submitExpense('txn-1', 'director-1', 'Please review');
      expect(workflow.submit).toHaveBeenCalledWith(
        'txn-1',
        'director-1',
        'Please review',
      );
    });

    it('approveExpense delegates to ExpenseWorkflowService.approve', async () => {
      workflow.approve.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'APPROVED',
      });
      await service.approveExpense('txn-1', 'supervisor-1', 'Looks good');
      expect(workflow.approve).toHaveBeenCalledWith(
        'txn-1',
        'supervisor-1',
        'Looks good',
      );
    });

    it('rejectExpense delegates to ExpenseWorkflowService.reject', async () => {
      workflow.reject.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'REJECTED',
      });
      await service.rejectExpense('txn-1', 'supervisor-1', 'Missing invoice');
      expect(workflow.reject).toHaveBeenCalledWith(
        'txn-1',
        'supervisor-1',
        'Missing invoice',
      );
    });

    it('resubmitExpense delegates to ExpenseWorkflowService.resubmit', async () => {
      workflow.resubmit.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'PENDING_APPROVAL',
      });
      await service.resubmitExpense('txn-1', 'director-1', 'Fixed it');
      expect(workflow.resubmit).toHaveBeenCalledWith(
        'txn-1',
        'director-1',
        'Fixed it',
      );
    });

    it('completeExpense delegates to ExpenseWorkflowService.complete', async () => {
      workflow.complete.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'COMPLETED',
      });
      await service.completeExpense('txn-1');
      expect(workflow.complete).toHaveBeenCalledWith('txn-1');
    });

    it('cancelExpense delegates to ExpenseWorkflowService.cancel', async () => {
      workflow.cancel.mockResolvedValue({
        ...baseExpense,
        expenseWorkflowStatus: 'CANCELLED',
      });
      await service.cancelExpense('txn-1');
      expect(workflow.cancel).toHaveBeenCalledWith('txn-1');
    });
  });
});
