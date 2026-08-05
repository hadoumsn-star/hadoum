import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MaintenanceTicketsService } from './maintenance-tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  return {
    maintenanceTicket: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    ticketAttachment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
  };
}

describe('MaintenanceTicketsService', () => {
  let service: MaintenanceTicketsService;
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

  const baseTicket = {
    id: 'ticket-1',
    title: 'Fuite d\'eau',
    spaceId: 'space-1',
    description: null,
    problemType: null,
    urgency: 'MOYENNE',
    status: 'OUVERT',
    reportedDate: new Date(),
    reportedBy: 'Jean',
    assignedTo: null,
    assignedContactId: null,
    plannedDate: null,
    resolvedDate: null,
    resolutionNotes: null,
    estimatedCost: null,
    actualCost: null,
    validationStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeContact = {
    id: 'contact-1',
    fullName: 'Ousmane Diop',
    active: true,
  };
  const inactiveContact = { ...activeContact, id: 'contact-2', active: false };

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
        MaintenanceTicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(MaintenanceTicketsService);
  });

  describe('create', () => {
    it('creates a ticket on the happy path', async () => {
      prisma.maintenanceTicket.create.mockResolvedValue(baseTicket);
      const result = await service.create({
        title: 'x',
        spaceId: 'space-1',
        urgency: 'MOYENNE',
        reportedBy: 'Jean',
      } as any);
      expect(result.title).toBe("Fuite d'eau");
    });
  });

  describe('create — Contact assignment (PR 3)', () => {
    it('creates a ticket without a contact exactly as before (no Contact lookup)', async () => {
      prisma.maintenanceTicket.create.mockResolvedValue(baseTicket);
      await service.create({
        title: 'x',
        spaceId: 'space-1',
        urgency: 'MOYENNE',
        reportedBy: 'Jean',
      } as any);
      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.maintenanceTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedContactId: undefined }),
        }),
      );
    });

    it('creates a ticket with an active contact and derives the assignedTo snapshot from it', async () => {
      prisma.contact.findUnique.mockResolvedValue(activeContact);
      prisma.maintenanceTicket.create.mockResolvedValue({
        ...baseTicket,
        assignedContactId: activeContact.id,
        assignedTo: activeContact.fullName,
      });

      await service.create({
        title: 'x',
        spaceId: 'space-1',
        urgency: 'MOYENNE',
        reportedBy: 'Jean',
        assignedContactId: activeContact.id,
      } as any);

      expect(prisma.maintenanceTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedContactId: activeContact.id,
            assignedTo: activeContact.fullName,
          }),
        }),
      );
    });

    it('rejects an unknown contact id', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          title: 'x',
          spaceId: 'space-1',
          urgency: 'MOYENNE',
          reportedBy: 'Jean',
          assignedContactId: 'missing',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.maintenanceTicket.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive contact for a new assignment', async () => {
      prisma.contact.findUnique.mockResolvedValue(inactiveContact);
      await expect(
        service.create({
          title: 'x',
          spaceId: 'space-1',
          urgency: 'MOYENNE',
          reportedBy: 'Jean',
          assignedContactId: inactiveContact.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.maintenanceTicket.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('includes assignedContact (with category) in the query', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      await service.findOne('ticket-1');
      expect(prisma.maintenanceTicket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            assignedContact: { include: { category: true } },
          }),
        }),
      );
    });

    it('returns a legacy assignedTo-only ticket unchanged (no linked contact)', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        assignedTo: 'Paul (texte libre)',
        assignedContactId: null,
        assignedContact: null,
      });
      const result = await service.findOne('ticket-1');
      expect(result.assignedTo).toBe('Paul (texte libre)');
      expect(result.assignedContact).toBeNull();
    });

    it('returns a ticket whose linked contact has since been deactivated (no active filter applied)', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        assignedContactId: inactiveContact.id,
        assignedContact: inactiveContact,
      });
      const result = await service.findOne('ticket-1');
      expect(result.assignedContact).toEqual(inactiveContact);
      // Guards against a future regression where an `active: true` filter
      // gets added to the include — that would hide the reference instead
      // of surfacing it as inactive, which is the one thing this must not do.
      const call = prisma.maintenanceTicket.findUnique.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'ticket-1' });
    });
  });

  describe('update (workflow-bypass regression guard)', () => {
    it('allows a routine status change (OUVERT -> EN_COURS)', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      prisma.maintenanceTicket.update.mockResolvedValue({ ...baseTicket, status: 'EN_COURS' });

      const result = await service.update('ticket-1', { status: 'EN_COURS' } as any);

      expect(result.status).toBe('EN_COURS');
    });

    it('refuses to close a ticket (FERME) via the generic update route, even for a routine ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);

      await expect(
        service.update('ticket-1', { status: 'FERME' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.maintenanceTicket.update).not.toHaveBeenCalled();
    });

    it('refuses to cancel a ticket (ANNULE) via the generic update route', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      await expect(
        service.update('ticket-1', { status: 'ANNULE' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses any status change starting from an already-terminal state', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({ ...baseTicket, status: 'FERME' });
      await expect(
        service.update('ticket-1', { status: 'OUVERT' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update — Contact assignment (PR 3)', () => {
    it('updates the ticket to another contact and refreshes the assignedTo snapshot', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        assignedContactId: 'contact-old',
        assignedTo: 'Ancien prestataire',
      });
      prisma.contact.findUnique.mockResolvedValue(activeContact);
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        assignedContactId: activeContact.id,
        assignedTo: activeContact.fullName,
      });

      await service.update('ticket-1', { assignedContactId: activeContact.id } as any);

      expect(prisma.maintenanceTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedContactId: activeContact.id,
            assignedTo: activeContact.fullName,
          }),
        }),
      );
    });

    it('rejects updating to an inactive contact', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      prisma.contact.findUnique.mockResolvedValue(inactiveContact);
      await expect(
        service.update('ticket-1', { assignedContactId: inactiveContact.id } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.maintenanceTicket.update).not.toHaveBeenCalled();
    });

    it('clears the assigned contact when assignedContactId is explicitly null, clearing assignedTo too', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        assignedContactId: activeContact.id,
        assignedTo: activeContact.fullName,
      });
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        assignedContactId: null,
        assignedTo: null,
      });

      await service.update('ticket-1', { assignedContactId: null } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.maintenanceTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedContactId: null, assignedTo: null }),
        }),
      );
    });

    it('leaves the existing relation and assignedTo snapshot unchanged when assignedContactId is omitted', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        assignedContactId: activeContact.id,
        assignedTo: activeContact.fullName,
      });
      prisma.maintenanceTicket.update.mockResolvedValue(baseTicket);

      await service.update('ticket-1', { title: 'Nouveau titre' } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      const call = prisma.maintenanceTicket.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('assignedContactId');
      expect(call.data).not.toHaveProperty('assignedTo');
    });

    it('does not touch validationStatus when only the assigned contact changes', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        validationStatus: 'PENDING_VALIDATION',
      });
      prisma.contact.findUnique.mockResolvedValue(activeContact);
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        validationStatus: 'PENDING_VALIDATION',
        assignedContactId: activeContact.id,
      });

      await service.update('ticket-1', { assignedContactId: activeContact.id } as any);

      const call = prisma.maintenanceTicket.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('validationStatus');
    });
  });

  describe('assign', () => {
    it('assigns an open ticket and moves it to ASSIGNE', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        assignedTo: 'Paul',
        status: 'ASSIGNE',
      });

      const result = await service.assign('ticket-1', { assignedTo: 'Paul' } as any);

      expect(result.status).toBe('ASSIGNE');
    });

    it('does not change status when assigning a ticket that is already in progress', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({ ...baseTicket, status: 'EN_COURS' });
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        status: 'EN_COURS',
        assignedTo: 'Paul',
      });

      await service.assign('ticket-1', { assignedTo: 'Paul' } as any);

      expect(prisma.maintenanceTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'EN_COURS' }) }),
      );
    });
  });

  describe('close (business rule: critical tickets must go through validation)', () => {
    it('closes a non-critical ticket directly', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({ ...baseTicket, urgency: 'MOYENNE' });
      prisma.maintenanceTicket.update.mockResolvedValue({ ...baseTicket, status: 'FERME' });

      const result = await service.close('ticket-1');

      expect(result.status).toBe('FERME');
    });

    it('refuses to close a CRITIQUE-urgency ticket directly', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue({ ...baseTicket, urgency: 'CRITIQUE' });

      await expect(service.close('ticket-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.maintenanceTicket.update).not.toHaveBeenCalled();
    });
  });

  describe('validation workflow', () => {
    it('submits a ticket for validation and notifies supervisors', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        validationStatus: 'PENDING_VALIDATION',
      });

      const result = await service.submitValidation('ticket-1', 'director-1', {} as any);

      expect(validations.create).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'MAINTENANCE_TICKET', submittedById: 'director-1' }),
      );
      expect(notifications.createForRole).toHaveBeenCalledWith(
        'SUPERVISOR',
        expect.objectContaining({ type: 'VALIDATION_SUBMITTED' }),
      );
      expect(result.validationStatus).toBe('PENDING_VALIDATION');
    });

    it('approves and closes the ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        status: 'FERME',
        validationStatus: 'APPROVED',
      });

      const result = await service.approve('ticket-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('FERME');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VALIDATION_APPROVED', recipientId: 'director-1' }),
      );
    });

    it('rejects the ticket closure and notifies the submitter', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      validations.reject.mockResolvedValue({ submittedById: 'director-1' });
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        validationStatus: 'REJECTED',
      });

      const result = await service.reject('ticket-1', 'supervisor-1', { comment: 'No' } as any);

      expect(result.validationStatus).toBe('REJECTED');
    });

    it('requests changes on the ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      validations.requestChanges.mockResolvedValue({ submittedById: 'director-1' });
      prisma.maintenanceTicket.update.mockResolvedValue({
        ...baseTicket,
        validationStatus: 'CHANGES_REQUESTED',
      });

      const result = await service.requestChanges(
        'ticket-1',
        'supervisor-1',
        { comment: 'clarify' } as any,
      );

      expect(result.validationStatus).toBe('CHANGES_REQUESTED');
    });
  });

  describe('findAll', () => {
    it('applies spaceId/status/search filters', async () => {
      prisma.maintenanceTicket.findMany.mockResolvedValue([baseTicket]);
      await service.findAll({ spaceId: 'space-1', status: 'OUVERT', search: 'eau' } as any);
      expect(prisma.maintenanceTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ spaceId: 'space-1', status: 'OUVERT' }),
        }),
      );
    });

    it('includes assignedContact (with category) alongside space in every list response', async () => {
      prisma.maintenanceTicket.findMany.mockResolvedValue([baseTicket]);
      await service.findAll({} as any);
      expect(prisma.maintenanceTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            space: { select: { id: true, name: true } },
            assignedContact: { include: { category: true } },
          }),
        }),
      );
    });
  });

  describe('attachments (upload/list)', () => {
    it('uploads an attachment for an existing ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      upload.upload.mockResolvedValue('maintenance-tickets/ticket-1/file.pdf');
      prisma.ticketAttachment.create.mockResolvedValue({ id: 'att-1' });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadAttachment('ticket-1', file);

      expect(prisma.ticketAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ticketId: 'ticket-1' }) }),
      );
    });

    it('lists attachments for an existing ticket', async () => {
      prisma.maintenanceTicket.findUnique.mockResolvedValue(baseTicket);
      prisma.ticketAttachment.findMany.mockResolvedValue([{ id: 'att-1' }]);
      const result = await service.listAttachments('ticket-1');
      expect(result).toHaveLength(1);
    });

    it('deletes an attachment that belongs to the given ticket', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        ticketId: 'ticket-1',
        fileKey: 'x',
      });
      await service.deleteAttachment('ticket-1', 'att-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('x');
      expect(prisma.ticketAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });
  });

  describe('history passthrough', () => {
    it('delegates to ValidationsService with the correct resource type', () => {
      validations.findHistory.mockReturnValue([{ id: 'v1' }]);
      const result = service.history('ticket-1');
      expect(validations.findHistory).toHaveBeenCalledWith('MAINTENANCE_TICKET', 'ticket-1');
      expect(result).toEqual([{ id: 'v1' }]);
    });
  });

  describe('attachment permissions (cross-resource IDOR guard)', () => {
    it('blocks fetching an attachment that belongs to a different ticket', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        ticketId: 'some-other-ticket',
        fileKey: 'x',
      });
      await expect(service.getAttachmentUrl('ticket-1', 'att-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows fetching an attachment that belongs to the given ticket', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        ticketId: 'ticket-1',
        fileKey: 'maintenance-tickets/ticket-1/att-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');
      const result = await service.getAttachmentUrl('ticket-1', 'att-1');
      expect(result.url).toBe('https://signed-url');
    });
  });
});
