import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdministrativeProceduresService } from './administrative-procedures.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  matching,
  anyInstanceOf,
  matchAnything,
  stringContaining,
} from '../test-utils/jest-matchers';

function createMockPrisma() {
  return {
    administrativeProcedure: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    procedureDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    notification: { findFirst: jest.fn() },
  };
}

describe('AdministrativeProceduresService', () => {
  let service: AdministrativeProceduresService;
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

  const baseProcedure = {
    id: 'proc-1',
    title: "Agrément d'ouverture",
    procedureType: 'AGREMENT',
    authority: 'Ministère',
    description: null,
    referenceNumber: null,
    submissionDate: null,
    expectedResponseDate: null,
    expirationDate: null,
    renewalDate: null,
    status: 'A_PREPARER',
    priority: 'NORMALE',
    assignedTo: null,
    notes: null,
    validationStatus: null,
    pendingValidationAction: null,
    createdById: 'director-1',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeContact = {
    id: 'contact-1',
    fullName: 'Fatou Sow',
    organization: 'Ministère de la Santé',
    functionTitle: 'Chargée de dossiers',
    categoryId: 'cat-1',
    phone: '+221 77 111 22 33',
    whatsappEnabled: false,
    email: 'fatou.sow@sante.gouv.sn',
    address: null,
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
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdministrativeProceduresService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(AdministrativeProceduresService);
  });

  describe('create', () => {
    it('creates a procedure on the happy path', async () => {
      prisma.administrativeProcedure.create.mockResolvedValue(baseProcedure);
      const result = await service.create(
        { title: 'x', procedureType: 'AGREMENT', authority: 'x' } as any,
        'director-1',
      );
      expect(result.title).toBe("Agrément d'ouverture");
    });

    it('rejects an expected response date earlier than the submission date', async () => {
      await expect(
        service.create(
          {
            title: 'x',
            procedureType: 'AGREMENT',
            authority: 'x',
            submissionDate: '2026-02-01',
            expectedResponseDate: '2026-01-01',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a renewal date later than the expiration date', async () => {
      await expect(
        service.create(
          {
            title: 'x',
            procedureType: 'AGREMENT',
            authority: 'x',
            expirationDate: '2026-01-01',
            renewalDate: '2026-06-01',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a procedure directly as EN_ATTENTE_REPONSE with its organisme concerné', async () => {
      prisma.administrativeProcedure.create.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: 'Mairie',
      });

      const result = await service.create(
        {
          title: 'x',
          procedureType: 'AGREMENT',
          authority: 'x',
          status: 'EN_ATTENTE_REPONSE',
          pendingResponseOrganization: 'Mairie',
        } as any,
        'director-1',
      );

      expect(prisma.administrativeProcedure.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            status: 'EN_ATTENTE_REPONSE',
            pendingResponseOrganization: 'Mairie',
          }),
        }),
      );
      expect(result.status).toBe('EN_ATTENTE_REPONSE');
      expect(result.pendingResponseOrganization).toBe('Mairie');
    });

    it('refuses to create a procedure directly in a workflow-controlled status', async () => {
      await expect(
        service.create(
          {
            title: 'x',
            procedureType: 'AGREMENT',
            authority: 'x',
            status: 'APPROUVE',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.administrativeProcedure.create).not.toHaveBeenCalled();
    });
  });

  describe('computed deadline fields', () => {
    it('flags an expired, non-archived procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        expirationDate: new Date('2020-01-01'),
      });
      const result = await service.findOne('proc-1');
      expect(result.isExpired).toBe(true);
      expect(result.effectiveStatus).toBe('EXPIRE');
    });

    it('never reports an archived procedure as expired', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'ARCHIVE',
        expirationDate: new Date('2020-01-01'),
      });
      const result = await service.findOne('proc-1');
      expect(result.isExpired).toBe(false);
      expect(result.effectiveStatus).toBe('ARCHIVE');
    });

    it('flags an overdue administrative response', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        expectedResponseDate: new Date('2020-01-01'),
      });
      const result = await service.findOne('proc-1');
      expect(result.isResponseOverdue).toBe(true);
    });
  });

  describe('update (workflow-bypass guard, already enforced)', () => {
    it('allows a routine status change (A_PREPARER -> EN_COURS)', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_COURS',
      });

      const result = await service.update('proc-1', {
        status: 'EN_COURS',
      } as any);

      expect(result.status).toBe('EN_COURS');
    });

    it('refuses to set a workflow-controlled status (APPROUVE) via the generic update route', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      await expect(
        service.update('proc-1', { status: 'APPROUVE' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.administrativeProcedure.update).not.toHaveBeenCalled();
    });

    it('refuses any status change starting from SOUMIS (already in the validation circuit)', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'SOUMIS',
      });
      await expect(
        service.update('proc-1', { status: 'EN_COURS' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows manually setting EN_ATTENTE_REPONSE with its organisme concerné (operational tracking, not a validation event)', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_COURS',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: 'Préfecture',
      });

      const result = await service.update('proc-1', {
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: 'Préfecture',
      } as any);

      expect(prisma.administrativeProcedure.update).toHaveBeenCalledWith(
        matching({
          data: matching({
            status: 'EN_ATTENTE_REPONSE',
            pendingResponseOrganization: 'Préfecture',
          }),
        }),
      );
      // No validation-workflow call — this never touches ValidationsService.
      expect(validations.create).not.toHaveBeenCalled();
      expect(result.status).toBe('EN_ATTENTE_REPONSE');
      expect(result.pendingResponseOrganization).toBe('Préfecture');
    });

    it('allows moving back out of EN_ATTENTE_REPONSE to a routine status', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: 'CAF',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        status: 'A_PREPARER',
      });

      const result = await service.update('proc-1', {
        status: 'A_PREPARER',
      } as any);

      expect(result.status).toBe('A_PREPARER');
    });

    it('clears pendingResponseOrganization when explicitly set to null', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: 'Tribunal',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
        pendingResponseOrganization: null,
      });

      await service.update('proc-1', {
        pendingResponseOrganization: null,
      });

      expect(prisma.administrativeProcedure.update).toHaveBeenCalledWith(
        matching({
          data: matching({ pendingResponseOrganization: null }),
        }),
      );
    });
  });

  describe('archive', () => {
    it("archives directly (no validation gating on this resource's archive)", async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        status: 'ARCHIVE',
        archivedAt: new Date(),
      });

      const result = await service.archive('proc-1');

      expect(result.status).toBe('ARCHIVE');
    });

    it('refuses to re-archive an already archived procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'ARCHIVE',
      });
      await expect(service.archive('proc-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('submitValidation (action derivation)', () => {
    it('derives SUBMISSION for a not-yet-submitted procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'A_PREPARER',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        pendingValidationAction: 'SUBMISSION',
      });

      const result = await service.submitValidation('proc-1', 'director-1', {});

      expect(result.pendingValidationAction).toBe('SUBMISSION');
    });

    it('derives FINALIZATION for a procedure awaiting a response', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EN_ATTENTE_REPONSE',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        pendingValidationAction: 'FINALIZATION',
      });

      const result = await service.submitValidation('proc-1', 'director-1', {});

      expect(result.pendingValidationAction).toBe('FINALIZATION');
    });

    it('refuses to submit a procedure in a terminal state (EXPIRE)', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'EXPIRE',
      });
      await expect(
        service.submitValidation('proc-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approve (per-action state application)', () => {
    it('sets status SOUMIS on SUBMISSION approval', async () => {
      const pending = {
        ...baseProcedure,
        pendingValidationAction: 'SUBMISSION',
      };
      prisma.administrativeProcedure.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...pending,
        status: 'SOUMIS',
      });

      const result = await service.approve('proc-1', 'supervisor-1', {});

      expect(result.status).toBe('SOUMIS');
    });

    it('sets status APPROUVE on FINALIZATION approval', async () => {
      const pending = {
        ...baseProcedure,
        pendingValidationAction: 'FINALIZATION',
      };
      prisma.administrativeProcedure.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...pending,
        status: 'APPROUVE',
      });

      const result = await service.approve('proc-1', 'supervisor-1', {});

      expect(result.status).toBe('APPROUVE');
    });

    it('extends the expiration date and reactivates the procedure on RENEWAL approval', async () => {
      const pending = {
        ...baseProcedure,
        pendingValidationAction: 'RENEWAL',
        renewalDate: new Date('2028-01-01'),
      };
      prisma.administrativeProcedure.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...pending,
        status: 'EN_COURS',
        expirationDate: new Date('2028-01-01'),
      });

      const result = await service.approve('proc-1', 'supervisor-1', {});

      expect(prisma.administrativeProcedure.update).toHaveBeenCalledWith(
        matching({
          data: matching({
            status: 'EN_COURS',
            expirationDate: new Date('2028-01-01'),
            renewalDate: null,
          }),
        }),
      );
      expect(result.status).toBe('EN_COURS');
    });

    it('archives the procedure on ARCHIVE approval', async () => {
      const pending = { ...baseProcedure, pendingValidationAction: 'ARCHIVE' };
      prisma.administrativeProcedure.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...pending,
        status: 'ARCHIVE',
        archivedAt: new Date(),
      });

      const result = await service.approve('proc-1', 'supervisor-1', {});

      expect(result.status).toBe('ARCHIVE');
    });
  });

  describe('reject / requestChanges', () => {
    it('rejects a pending validation and notifies the submitter', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        validationStatus: 'REJECTED',
      });

      const result = await service.reject('proc-1', 'supervisor-1', {
        comment: 'No',
      });

      expect(result.validationStatus).toBe('REJECTED');
    });

    it('requests changes on the procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      validations.requestChanges.mockResolvedValue({
        submittedById: 'director-1',
      });
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        validationStatus: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges('proc-1', 'supervisor-1', {
        comment: 'clarify',
      });

      expect(result.validationStatus).toBe('CHANGES_REQUESTED');
    });
  });

  describe('findAll', () => {
    it('applies search/authority filters', async () => {
      prisma.administrativeProcedure.findMany.mockResolvedValue([
        baseProcedure,
      ]);
      await service.findAll({
        search: 'Agrément',
        authority: 'Ministère',
      });
      expect(prisma.administrativeProcedure.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({ authority: anyInstanceOf(Object) }),
        }),
      );
    });

    it('filters to only expired procedures when requested', async () => {
      const expired = {
        ...baseProcedure,
        id: 'p-expired',
        expirationDate: new Date('2020-01-01'),
      };
      const healthy = { ...baseProcedure, id: 'p-ok' };
      prisma.administrativeProcedure.findMany.mockResolvedValue([
        healthy,
        expired,
      ]);

      const result = await service.findAll({ expired: true });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p-expired');
    });

    it('sends exactly one expiry notification per procedure (dedup guard)', async () => {
      prisma.administrativeProcedure.findMany.mockResolvedValue([
        { ...baseProcedure, expirationDate: new Date('2020-01-01') },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        matching({ type: 'PROCEDURE_EXPIRED' }),
      );
    });
  });

  describe('requestRenewal / requestArchive', () => {
    it('routes a renewal request through validation', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        pendingValidationAction: 'RENEWAL',
      });

      const result = await service.requestRenewal('proc-1', 'director-1', {});

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('RENEWAL');
    });

    it('refuses renewal of an archived procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'ARCHIVE',
      });
      await expect(
        service.requestRenewal('proc-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('routes an archive request through validation', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      prisma.administrativeProcedure.update.mockResolvedValue({
        ...baseProcedure,
        pendingValidationAction: 'ARCHIVE',
      });

      const result = await service.requestArchive('proc-1', 'director-1', {});

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('ARCHIVE');
    });

    it('refuses to request archiving an already archived procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue({
        ...baseProcedure,
        status: 'ARCHIVE',
      });
      await expect(
        service.requestArchive('proc-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document and records the uploader', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      upload.upload.mockResolvedValue(
        'administrative-procedures/proc-1/file.pdf',
      );
      prisma.procedureDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as Express.Multer.File;
      await service.uploadDocument(
        'proc-1',
        'director-1',
        file,
        'AGREMENT',
        'Agrément',
      );

      expect(prisma.procedureDocument.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            procedureId: 'proc-1',
            uploadedById: 'director-1',
          }),
        }),
      );
    });

    it('lists documents for an existing procedure', async () => {
      prisma.administrativeProcedure.findUnique.mockResolvedValue(
        baseProcedure,
      );
      prisma.procedureDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const result = await service.listDocuments('proc-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('history passthrough', () => {
    it('delegates to ValidationsService with the correct resource type', () => {
      validations.findHistory.mockReturnValue([{ id: 'v1' }]);
      const result = service.history('proc-1');
      expect(validations.findHistory).toHaveBeenCalledWith(
        'ADMINISTRATIVE_PROCEDURE',
        'proc-1',
      );
      expect(result).toEqual([{ id: 'v1' }]);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('blocks fetching a document that belongs to a different procedure', async () => {
      prisma.procedureDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        procedureId: 'some-other-procedure',
        fileKey: 'x',
      });
      await expect(
        service.getDocumentUrl('proc-1', 'doc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows fetching a document that belongs to the given procedure', async () => {
      prisma.procedureDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        procedureId: 'proc-1',
        fileKey: 'administrative-procedures/proc-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');
      const result = await service.getDocumentUrl('proc-1', 'doc-1');
      expect(result.url).toBe('https://signed-url');
    });
  });

  describe('Contact directory integration (PR 9)', () => {
    describe('create', () => {
      it('creates a procedure with a Contact, deriving the assignedTo snapshot', async () => {
        prisma.contact.findUnique.mockResolvedValue(activeContact);
        prisma.administrativeProcedure.create.mockResolvedValue({
          ...baseProcedure,
          assignedContactId: 'contact-1',
          assignedTo: 'Fatou Sow',
          assignedContact: activeContact,
        });

        await service.create(
          {
            title: 'x',
            procedureType: 'AGREMENT',
            authority: 'x',
            assignedContactId: 'contact-1',
          } as any,
          'director-1',
        );

        expect(prisma.administrativeProcedure.create).toHaveBeenCalledWith(
          matching({
            data: matching({
              assignedContactId: 'contact-1',
              assignedTo: 'Fatou Sow',
            }),
          }),
        );
      });

      it('still supports the legacy free-text path when no Contact is selected', async () => {
        prisma.administrativeProcedure.create.mockResolvedValue(baseProcedure);
        await service.create(
          {
            title: 'x',
            procedureType: 'AGREMENT',
            authority: 'x',
            assignedTo: 'Responsable (texte libre)',
          } as any,
          'director-1',
        );
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
        expect(prisma.administrativeProcedure.create).toHaveBeenCalledWith(
          matching({
            data: matching({
              assignedTo: 'Responsable (texte libre)',
            }),
          }),
        );
      });

      it('rejects an unknown Contact for a new assignment', async () => {
        prisma.contact.findUnique.mockResolvedValue(null);
        await expect(
          service.create(
            {
              title: 'x',
              procedureType: 'AGREMENT',
              authority: 'x',
              assignedContactId: 'missing',
            } as any,
            'director-1',
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.administrativeProcedure.create).not.toHaveBeenCalled();
      });

      it('rejects an inactive Contact for a new assignment', async () => {
        prisma.contact.findUnique.mockResolvedValue({
          ...activeContact,
          active: false,
        });
        await expect(
          service.create(
            {
              title: 'x',
              procedureType: 'AGREMENT',
              authority: 'x',
              assignedContactId: 'contact-1',
            } as any,
            'director-1',
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.administrativeProcedure.create).not.toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('replaces a legacy free-text Responsable with a Contact, deriving the snapshot', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue({
          ...baseProcedure,
          assignedTo: 'Ancien responsable texte',
          assignedContactId: null,
        });
        prisma.contact.findUnique.mockResolvedValue(activeContact);
        prisma.administrativeProcedure.update.mockResolvedValue({
          ...baseProcedure,
          assignedContactId: 'contact-1',
          assignedTo: 'Fatou Sow',
          assignedContact: activeContact,
        });

        const result = await service.update('proc-1', {
          assignedContactId: 'contact-1',
        });

        expect(prisma.administrativeProcedure.update).toHaveBeenCalledWith(
          matching({
            data: matching({
              assignedContactId: 'contact-1',
              assignedTo: 'Fatou Sow',
            }),
          }),
        );
        expect(result.assignedContact?.fullName).toBe('Fatou Sow');
      });

      it('clears the assigned Contact and assignedTo when assignedContactId is explicitly null', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue({
          ...baseProcedure,
          assignedContactId: 'contact-1',
          assignedTo: 'Fatou Sow',
        });
        prisma.administrativeProcedure.update.mockResolvedValue({
          ...baseProcedure,
          assignedContactId: null,
          assignedTo: null,
        });

        const result = await service.update('proc-1', {
          assignedContactId: null,
        });

        const updateCalls = prisma.administrativeProcedure.update.mock
          .calls as [{ data: Record<string, unknown> }][];
        const call = updateCalls[0][0];
        expect(call.data.assignedContactId).toBeNull();
        expect(call.data.assignedTo).toBeNull();
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
        expect(result.assignedContactId).toBeNull();
        expect(result.assignedTo).toBeNull();
      });

      it('omitting assignedContactId leaves the existing relation and assignedTo untouched', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue({
          ...baseProcedure,
          assignedContactId: 'contact-1',
          assignedTo: 'Fatou Sow',
        });
        prisma.administrativeProcedure.update.mockResolvedValue(baseProcedure);

        await service.update('proc-1', { priority: 'HAUTE' } as any);

        const updateCalls = prisma.administrativeProcedure.update.mock
          .calls as [{ data: Record<string, unknown> }][];
        const call = updateCalls[0][0];
        expect(call.data).not.toHaveProperty('assignedContactId');
        expect(call.data).not.toHaveProperty('assignedTo');
        expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      });

      it('rejects assigning an inactive Contact on update', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue(
          baseProcedure,
        );
        prisma.contact.findUnique.mockResolvedValue({
          ...activeContact,
          active: false,
        });
        await expect(
          service.update('proc-1', { assignedContactId: 'contact-1' } as any),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.administrativeProcedure.update).not.toHaveBeenCalled();
      });
    });

    describe('findOne / findAll include the Contact relation', () => {
      it('findOne includes an inactive referenced Contact without filtering it out', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue({
          ...baseProcedure,
          documents: [],
          createdBy: null,
          assignedContactId: 'contact-1',
          assignedContact: { ...activeContact, active: false },
        });

        const result = await service.findOne('proc-1');

        expect(result.assignedContact?.active).toBe(false);
        expect(prisma.administrativeProcedure.findUnique).toHaveBeenCalledWith(
          matching({
            include: matching({
              assignedContact: matching({
                include: { category: true },
              }),
            }),
          }),
        );
      });

      it('findAll requests the assignedContact include', async () => {
        prisma.administrativeProcedure.findMany.mockResolvedValue([
          baseProcedure,
        ]);
        await service.findAll({});
        expect(prisma.administrativeProcedure.findMany).toHaveBeenCalledWith(
          matching({
            include: matching({
              assignedContact: matchAnything(),
            }),
          }),
        );
      });
    });

    describe('notification behavior is unchanged', () => {
      it('never references assignedTo/assignedContact in notification messages', async () => {
        prisma.administrativeProcedure.findUnique.mockResolvedValue({
          ...baseProcedure,
          assignedTo: 'Fatou Sow',
          assignedContact: activeContact,
        });
        prisma.administrativeProcedure.update.mockResolvedValue({
          ...baseProcedure,
          validationStatus: 'PENDING_VALIDATION',
        });

        await service.submitValidation('proc-1', 'director-1', {});

        expect(notifications.createForRole).toHaveBeenCalledWith(
          'SUPERVISOR',
          matching({
            message: stringContaining(baseProcedure.authority),
          }),
        );
        const [, payload] = notifications.createForRole.mock.calls[0] as [
          unknown,
          { message: string },
        ];
        expect(payload.message).not.toContain('Fatou Sow');
      });
    });
  });
});
