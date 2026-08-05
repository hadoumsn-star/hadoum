import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierContractsService } from './supplier-contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  const supplierContract = {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  };
  const contact = { findUnique: jest.fn() };
  const contractDocument = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  };
  const notification = { findFirst: jest.fn() };

  // Self-referencing so `create()`'s `this.prisma.$transaction(async (tx) =>
  // ...)` receives this same mock as `tx` — `tx.supplierContract.create(...)`
  // then resolves through the exact same `supplierContract.create` mock
  // assertions below already target (same pattern as
  // stock-items.service.spec.ts).
  const prisma: any = {
    supplierContract,
    contact,
    contractDocument,
    notification,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return prisma;
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

  const activeContact = {
    id: 'contact-1',
    fullName: 'Awa Diop',
    organization: 'SENELEC',
    functionTitle: 'Responsable comptes',
    categoryId: 'cat-1',
    phone: '+221 77 000 00 00',
    whatsappEnabled: false,
    email: 'awa.diop@senelec.sn',
    address: 'Dakar',
    city: null,
    notes: null,
    photoKey: null,
    photoMime: null,
    active: true,
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
    // Supplier Contracts workflow: every new contract now enters the
    // validation workflow automatically — no more amount threshold, no more
    // "direct to ACTIF" path, and no separate submit step for the DIRECTOR.
    it('always creates a new contract as BROUILLON, pending validation — regardless of amount', async () => {
      prisma.supplierContract.create.mockResolvedValue({
        ...baseContract,
        status: 'BROUILLON',
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'CREATION',
      });

      const result = await service.create({
        supplierName: 'x',
        contractName: 'x',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
        amount: 50_000, // low amount — used to go straight to ACTIF; no longer does
      } as any, 'director-1');

      expect(prisma.supplierContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'BROUILLON',
            validationStatus: 'PENDING_VALIDATION',
            pendingValidationAction: 'CREATION',
          }),
        }),
      );
      expect(result.status).toBe('BROUILLON');
      expect(result.validationStatus).toBe('PENDING_VALIDATION');
    });

    it('also requires validation with no amount at all', async () => {
      prisma.supplierContract.create.mockResolvedValue({
        ...baseContract,
        status: 'BROUILLON',
        validationStatus: 'PENDING_VALIDATION',
      });

      await service.create({
        supplierName: 'x',
        contractName: 'x',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
      } as any, 'director-1');

      expect(prisma.supplierContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'BROUILLON', validationStatus: 'PENDING_VALIDATION' }),
        }),
      );
    });

    it('creates the ValidationRequest atomically (same transaction, tx passed through), submitted by the creating DIRECTOR', async () => {
      prisma.supplierContract.create.mockResolvedValue({ ...baseContract, id: 'contract-9' });

      await service.create({
        supplierName: 'x',
        contractName: 'x',
        category: 'ELECTRICITE',
        startDate: '2026-01-01',
      } as any, 'director-42');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(validations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'SUPPLIER_CONTRACT',
          resourceId: 'contract-9',
          submittedById: 'director-42',
          previousStatus: null,
        }),
        prisma, // the tx client — this mock's $transaction hands back itself
      );
      // The generic engine's own duplicate-pending guard (already exercised
      // in validations.service.spec.ts) is what `validations.create` reuses
      // here — not re-implemented for this resource type.
    });

    it('rolls back the contract when ValidationRequest creation fails (atomicity)', async () => {
      prisma.supplierContract.create.mockResolvedValue({ ...baseContract, id: 'contract-9' });
      validations.create.mockRejectedValue(new ConflictException('boom'));

      await expect(
        service.create({
          supplierName: 'x',
          contractName: 'x',
          category: 'ELECTRICITE',
          startDate: '2026-01-01',
        } as any, 'director-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      // The transaction callback threw, so the notification (issued only
      // after the transaction resolves) must never have fired — no
      // notification for a contract that doesn't durably exist.
      expect(notifications.createForRole).not.toHaveBeenCalled();
    });

    it('notifies SUPERVISOR exactly once with the required title', async () => {
      prisma.supplierContract.create.mockResolvedValue({
        ...baseContract,
        contractName: 'Fourniture eau',
      });

      await service.create({
        supplierName: 'SDE',
        contractName: 'Fourniture eau',
        category: 'EAU',
        startDate: '2026-01-01',
      } as any, 'director-1');

      expect(notifications.createForRole).toHaveBeenCalledTimes(1);
      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({
          type: 'VALIDATION_SUBMITTED',
          resourceType: 'SUPPLIER_CONTRACT',
          title: 'Nouveau contrat fournisseur à valider',
        }),
      );
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

  describe('Contact directory integration (PR 8)', () => {
    describe('create', () => {
      it('creates a contract with a Contact, deriving the legacy snapshot fields', async () => {
        prisma.contact.findUnique.mockResolvedValue(activeContact);
        prisma.supplierContract.create.mockResolvedValue({
          ...baseContract,
          supplierContactId: 'contact-1',
          supplierContact: activeContact,
        });

        await service.create({
          supplierContactId: 'contact-1',
          contractName: 'Électricité',
          category: 'ELECTRICITE',
          startDate: '2026-01-01',
        } as any, 'director-1');

        expect(prisma.supplierContract.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              supplierContactId: 'contact-1',
              // organization is set on the fixture, so it becomes the
              // supplier/company name and fullName becomes the contact person.
              supplierName: 'SENELEC',
              contactPerson: 'Awa Diop',
              phone: '+221 77 000 00 00',
              email: 'awa.diop@senelec.sn',
              address: 'Dakar',
            }),
          }),
        );
      });

      it('falls back to fullName as supplierName when the Contact has no organization', async () => {
        prisma.contact.findUnique.mockResolvedValue({ ...activeContact, organization: null });
        prisma.supplierContract.create.mockResolvedValue(baseContract);

        await service.create({
          supplierContactId: 'contact-1',
          contractName: 'Électricité',
          category: 'ELECTRICITE',
          startDate: '2026-01-01',
        } as any, 'director-1');

        expect(prisma.supplierContract.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ supplierName: 'Awa Diop', contactPerson: null }),
          }),
        );
      });

      it('rejects an unknown Contact for a new assignment', async () => {
        prisma.contact.findUnique.mockResolvedValue(null);
        await expect(
          service.create({
            supplierContactId: 'missing',
            contractName: 'Électricité',
            category: 'ELECTRICITE',
            startDate: '2026-01-01',
          } as any, 'director-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.supplierContract.create).not.toHaveBeenCalled();
      });

      it('rejects an inactive Contact for a new assignment', async () => {
        prisma.contact.findUnique.mockResolvedValue({ ...activeContact, active: false });
        await expect(
          service.create({
            supplierContactId: 'contact-1',
            contractName: 'Électricité',
            category: 'ELECTRICITE',
            startDate: '2026-01-01',
          } as any, 'director-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.supplierContract.create).not.toHaveBeenCalled();
      });

      it('still supports the legacy free-text path when no Contact is selected', async () => {
        prisma.supplierContract.create.mockResolvedValue(baseContract);
        await service.create({
          supplierName: 'SENELEC (texte libre)',
          contractName: 'Électricité',
          category: 'ELECTRICITE',
          startDate: '2026-01-01',
        } as any, 'director-1');
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
        expect(prisma.supplierContract.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ supplierName: 'SENELEC (texte libre)' }),
          }),
        );
      });

      it('rejects creation when neither a Contact nor a supplierName is given', async () => {
        await expect(
          service.create({
            contractName: 'Électricité',
            category: 'ELECTRICITE',
            startDate: '2026-01-01',
          } as any, 'director-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.supplierContract.create).not.toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('replaces a legacy free-text supplier with a Contact, deriving the snapshot', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          supplierContactId: null,
          supplierContact: null,
        });
        prisma.contact.findUnique.mockResolvedValue(activeContact);
        prisma.supplierContract.update.mockResolvedValue({
          ...baseContract,
          supplierContactId: 'contact-1',
          supplierContact: activeContact,
          supplierName: 'SENELEC',
        });

        const result = await service.update('contract-1', {
          supplierContactId: 'contact-1',
        } as any);

        expect(prisma.supplierContract.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              supplierContactId: 'contact-1',
              supplierName: 'SENELEC',
              contactPerson: 'Awa Diop',
            }),
          }),
        );
        expect(result.supplierContact?.fullName).toBe('Awa Diop');
      });

      it('disconnecting the Contact (explicit null) does not clear the legacy snapshot fields', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          supplierContactId: 'contact-1',
          supplierContact: activeContact,
        });
        prisma.supplierContract.update.mockResolvedValue({
          ...baseContract,
          supplierContactId: null,
          supplierContact: null,
        });

        await service.update('contract-1', { supplierContactId: null } as any);

        const call = prisma.supplierContract.update.mock.calls[0][0];
        expect(call.data.supplierContactId).toBeNull();
        // supplierName is NOT NULL in the DB — disconnecting must never
        // attempt to null it out.
        expect(call.data).not.toHaveProperty('supplierName');
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      });

      it('omitting supplierContactId leaves the existing relation and legacy snapshot untouched', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          supplierContactId: 'contact-1',
          supplierContact: activeContact,
        });
        prisma.supplierContract.update.mockResolvedValue(baseContract);

        await service.update('contract-1', { amount: 99_000 } as any);

        const call = prisma.supplierContract.update.mock.calls[0][0];
        expect(call.data).not.toHaveProperty('supplierContactId');
        expect(call.data).not.toHaveProperty('supplierName');
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      });

      it('rejects assigning an inactive Contact on update', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue(baseContract);
        prisma.contact.findUnique.mockResolvedValue({ ...activeContact, active: false });
        await expect(
          service.update('contract-1', { supplierContactId: 'contact-1' } as any),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.supplierContract.update).not.toHaveBeenCalled();
      });
    });

    describe('findOne / findAll include the Contact relation', () => {
      it('findOne includes an inactive referenced Contact without filtering it out', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          documents: [],
          supplierContactId: 'contact-1',
          supplierContact: { ...activeContact, active: false },
        });

        const result = await service.findOne('contract-1');

        expect(result.supplierContact?.active).toBe(false);
        expect(prisma.supplierContract.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              supplierContact: expect.objectContaining({ include: { category: true } }),
            }),
          }),
        );
      });

      it('findAll requests the supplierContact include', async () => {
        prisma.supplierContract.findMany.mockResolvedValue([baseContract]);
        await service.findAll({});
        expect(prisma.supplierContract.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({ supplierContact: expect.anything() }),
          }),
        );
      });
    });

    describe('notification messages prefer the Contact name, falling back to supplierName', () => {
      it('uses supplierContact.fullName when the contract is linked', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          status: 'BROUILLON',
          supplierName: 'STALE LEGACY NAME',
          supplierContact: activeContact,
        });
        prisma.supplierContract.update.mockResolvedValue({
          ...baseContract,
          status: 'BROUILLON',
          validationStatus: 'PENDING_VALIDATION',
        });

        await service.submitValidation('contract-1', 'director-1', {} as any);

        expect(notifications.createForRole).toHaveBeenCalledWith(
          'SUPERVISOR',
          expect.objectContaining({ message: expect.stringContaining('Awa Diop') }),
        );
        expect(notifications.createForRole).not.toHaveBeenCalledWith(
          'SUPERVISOR',
          expect.objectContaining({ message: expect.stringContaining('STALE LEGACY NAME') }),
        );
      });

      it('falls back to supplierName when no Contact is linked', async () => {
        prisma.supplierContract.findUnique.mockResolvedValue({
          ...baseContract,
          status: 'BROUILLON',
          supplierContact: null,
        });
        prisma.supplierContract.update.mockResolvedValue({
          ...baseContract,
          status: 'BROUILLON',
          validationStatus: 'PENDING_VALIDATION',
        });

        await service.submitValidation('contract-1', 'director-1', {} as any);

        expect(notifications.createForRole).toHaveBeenCalledWith(
          'SUPERVISOR',
          expect.objectContaining({ message: expect.stringContaining('SENELEC') }),
        );
      });
    });
  });
});
