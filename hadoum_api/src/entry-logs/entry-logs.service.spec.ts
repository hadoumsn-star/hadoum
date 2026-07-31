import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntryLogsService } from './entry-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';

function createMockPrisma() {
  return {
    entryLog: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    entryLogDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    notification: { findFirst: jest.fn() },
  };
}

describe('EntryLogsService', () => {
  let service: EntryLogsService;
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

  const baseEntry = {
    id: 'entry-1',
    entryType: 'VISITE_IMPREVUE',
    visitorCategory: 'VISITEUR',
    fullName: 'Marie Test',
    organization: null,
    phone: null,
    email: null,
    identityDocumentType: 'CNI',
    identityDocumentNumber: '1234567890123',
    purpose: 'Réunion',
    personVisited: null,
    personVisitedUserId: null,
    spaceId: null,
    arrivalDateTime: new Date('2026-01-01T10:00:00'),
    expectedDepartureDateTime: null,
    actualDepartureDateTime: null,
    status: 'PRESENT',
    accessBadgeNumber: null,
    vehicleRegistration: null,
    accompanyingPersonsCount: 0,
    authorizedBy: null,
    authorizedByUserId: null,
    recordedById: 'director-1',
    notes: null,
    incidentReported: false,
    incidentId: null,
    incidentDescription: null,
    validationStatus: null,
    pendingValidationAction: null,
    pendingValidationPayload: null,
    archivedAt: null,
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
        EntryLogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: ValidationsService, useValue: validations },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(EntryLogsService);
  });

  describe('create', () => {
    it('creates an immediate entry type as PRESENT', async () => {
      prisma.entryLog.create.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      const result = await service.create(
        { entryType: 'VISITE_IMPREVUE', visitorCategory: 'VISITEUR', fullName: 'x', purpose: 'x' } as any,
        'director-1',
      );
      expect(result.status).toBe('PRESENT');
      expect(prisma.entryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PRESENT' }) }),
      );
    });

    it('creates a planned entry type as PREVUE', async () => {
      prisma.entryLog.create.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      await service.create(
        { entryType: 'VISITE_PREVUE', visitorCategory: 'VISITEUR', fullName: 'x', purpose: 'x' } as any,
        'director-1',
      );
      expect(prisma.entryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PREVUE' }) }),
      );
    });

    it('rejects an expected departure earlier than the arrival', async () => {
      await expect(
        service.create(
          {
            entryType: 'VISITE_IMPREVUE',
            visitorCategory: 'VISITEUR',
            fullName: 'x',
            purpose: 'x',
            arrivalDateTime: '2026-01-01T10:00:00',
            expectedDepartureDateTime: '2026-01-01T09:00:00',
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('privacy masking (§20)', () => {
    it('masks the identity document number in list views but not in findOne', async () => {
      prisma.entryLog.findMany.mockResolvedValue([baseEntry]);
      const list = await service.findAll({});
      expect(list[0].identityDocumentNumber).toBe('*********0123');

      prisma.entryLog.findUnique.mockResolvedValue(baseEntry);
      const one = await service.findOne('entry-1');
      expect(one.identityDocumentNumber).toBe('1234567890123');
    });
  });

  describe('durationOnSiteMinutes (regression: must not compute for not-yet-arrived visits)', () => {
    it('is null for a PREVUE (planned, not yet arrived) entry', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        status: 'PREVUE',
        arrivalDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // future planned arrival
      });
      const result = await service.findOne('entry-1');
      expect(result.durationOnSiteMinutes).toBeNull();
    });

    it('is computed for a PRESENT entry', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        status: 'PRESENT',
        arrivalDateTime: new Date(Date.now() - 30 * 60 * 1000),
      });
      const result = await service.findOne('entry-1');
      expect(result.durationOnSiteMinutes).toBeGreaterThanOrEqual(29);
    });
  });

  describe('checkIn', () => {
    it('checks in a planned visit directly during business hours', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      prisma.entryLog.update.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });

      const result = await service.checkIn('entry-1', 'director-1', {
        arrivalDateTime: '2026-01-01T10:00:00',
      } as any);

      expect(result.status).toBe('PRESENT');
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('routes a check-in on a previously refused entry through ACCESS_OVERRIDE validation', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'REFUSEE' });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ACCESS_OVERRIDE',
      });

      const result = await service.checkIn('entry-1', 'director-1', {
        arrivalDateTime: '2026-01-01T10:00:00',
      } as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('ACCESS_OVERRIDE');
    });

    it('routes an after-hours check-in through AFTER_HOURS_ACCESS validation', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'AFTER_HOURS_ACCESS',
      });

      const result = await service.checkIn('entry-1', 'director-1', {
        arrivalDateTime: '2026-01-01T23:00:00', // 11pm, outside 7-20
      } as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('AFTER_HOURS_ACCESS');
    });

    it('rejects checking in someone already present', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      await expect(
        service.checkIn('entry-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects checking in a cancelled visit', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'ANNULEE' });
      await expect(
        service.checkIn('entry-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('checkOut', () => {
    it('checks out a present visitor directly on the happy path', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      prisma.entryLog.update.mockResolvedValue({ ...baseEntry, status: 'SORTI' });

      const result = await service.checkOut('entry-1', 'director-1', {} as any);

      expect(result.status).toBe('SORTI');
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('routes an exceptional exit type through EXCEPTIONAL_EXIT validation', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        status: 'PRESENT',
        entryType: 'SORTIE_EXCEPTIONNELLE',
      });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'EXCEPTIONAL_EXIT',
      });

      const result = await service.checkOut('entry-1', 'director-1', {} as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('EXCEPTIONAL_EXIT');
    });

    it('rejects checking out someone not currently present', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      await expect(
        service.checkOut('entry-1', 'director-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a departure time earlier than the arrival', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        status: 'PRESENT',
        arrivalDateTime: new Date('2026-01-01T10:00:00'),
      });
      await expect(
        service.checkOut('entry-1', 'director-1', {
          actualDepartureDateTime: '2026-01-01T09:00:00',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel / refuse (invalid transitions)', () => {
    it('cancels a planned visit', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      prisma.entryLog.update.mockResolvedValue({ ...baseEntry, status: 'ANNULEE' });

      const result = await service.cancel('entry-1', { reason: 'x' } as any);
      expect(result.status).toBe('ANNULEE');
    });

    it('refuses to cancel a visit that is not planned', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      await expect(
        service.cancel('entry-1', { reason: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses access for a planned visit not yet checked in', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PREVUE' });
      prisma.entryLog.update.mockResolvedValue({ ...baseEntry, status: 'REFUSEE' });

      const result = await service.refuse('entry-1', { reason: 'Not identifiable' } as any);
      expect(result.status).toBe('REFUSEE');
    });

    it('refuses to mark as refused someone already admitted', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      await expect(
        service.refuse('entry-1', { reason: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('archive (smart gating)', () => {
    it('archives directly from a terminal state (SORTI)', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'SORTI' });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        status: 'ARCHIVEE',
        archivedAt: new Date(),
      });

      const result = await service.archive('entry-1', 'director-1');

      expect(result.status).toBe('ARCHIVEE');
      expect(validations.create).not.toHaveBeenCalled();
    });

    it('routes archiving a non-terminal record through validation', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'PRESENT' });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        pendingValidationAction: 'RECORD_ARCHIVE',
      });

      const result = await service.archive('entry-1', 'director-1');

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('RECORD_ARCHIVE');
    });
  });

  describe('approve (per-action state application)', () => {
    it('applies ACCESS_OVERRIDE by setting status PRESENT', async () => {
      const pending = {
        ...baseEntry,
        status: 'REFUSEE',
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ACCESS_OVERRIDE',
        pendingValidationPayload: { arrivalDateTime: '2026-01-01T10:00:00' },
      };
      prisma.entryLog.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.entryLog.update.mockResolvedValue({ ...pending, status: 'PRESENT' });

      const result = await service.approve('entry-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('PRESENT');
    });

    it('applies RECORD_ARCHIVE by setting status ARCHIVEE', async () => {
      const pending = {
        ...baseEntry,
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'RECORD_ARCHIVE',
        pendingValidationPayload: {},
      };
      prisma.entryLog.findUnique.mockResolvedValue(pending);
      validations.approve.mockResolvedValue({ submittedById: 'director-1' });
      prisma.entryLog.update.mockResolvedValue({ ...pending, status: 'ARCHIVEE' });

      const result = await service.approve('entry-1', 'supervisor-1', {} as any);

      expect(result.status).toBe('ARCHIVEE');
    });

    it('throws a conflict when nothing is pending', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        pendingValidationAction: null,
      });
      await expect(
        service.approve('entry-1', 'supervisor-1', {} as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll / currentPresence / expectedVisits', () => {
    it('applies search and status filters, masking identity numbers throughout', async () => {
      prisma.entryLog.findMany.mockResolvedValue([baseEntry]);
      const result = await service.findAll({ search: 'Marie', status: 'PRESENT' } as any);
      expect(prisma.entryLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PRESENT' }) }),
      );
      expect(result[0].identityDocumentNumber).toBe('*********0123');
    });

    it('returns only currently-present entries from currentPresence()', async () => {
      const present = { ...baseEntry, id: 'e1', status: 'PRESENT' };
      const planned = { ...baseEntry, id: 'e2', status: 'PREVUE' };
      prisma.entryLog.findMany.mockResolvedValue([present, planned]);

      const result = await service.currentPresence();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });

    it('returns only expected (planned) visits from expectedVisits()', async () => {
      const present = { ...baseEntry, id: 'e1', status: 'PRESENT' };
      const planned = { ...baseEntry, id: 'e2', status: 'PREVUE' };
      prisma.entryLog.findMany.mockResolvedValue([present, planned]);

      const result = await service.expectedVisits();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e2');
    });

    it('sends an incident-reported notification once (dedup guard)', async () => {
      prisma.entryLog.findMany.mockResolvedValue([{ ...baseEntry, incidentReported: true }]);
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.findAll({});

      expect(notifications.createForRole).toHaveBeenCalledWith(
        'DIRECTOR',
        expect.objectContaining({ type: 'REGISTER_INCIDENT_UNRESOLVED' }),
      );
    });
  });

  describe('update', () => {
    it('updates editable fields on an active entry', async () => {
      prisma.entryLog.findUnique.mockResolvedValue(baseEntry);
      prisma.entryLog.update.mockResolvedValue({ ...baseEntry, purpose: 'Nouveau motif' });

      const result = await service.update('entry-1', 'director-1', {
        purpose: 'Nouveau motif',
      } as any);

      expect(result.purpose).toBe('Nouveau motif');
    });

    it('routes a manual checkout-time correction through MANUAL_CHECKOUT_OVERRIDE validation', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({
        ...baseEntry,
        status: 'SORTI',
        actualDepartureDateTime: new Date('2026-01-01T12:00:00'),
      });
      prisma.entryLog.update.mockResolvedValue({
        ...baseEntry,
        pendingValidationAction: 'MANUAL_CHECKOUT_OVERRIDE',
      });

      const result = await service.update('entry-1', 'director-1', {
        actualDepartureDateTime: '2026-01-01T13:00:00',
      } as any);

      expect(validations.create).toHaveBeenCalled();
      expect(result.pendingValidationAction).toBe('MANUAL_CHECKOUT_OVERRIDE');
    });

    it('refuses to update an archived entry', async () => {
      prisma.entryLog.findUnique.mockResolvedValue({ ...baseEntry, status: 'ARCHIVEE' });
      await expect(
        service.update('entry-1', 'director-1', { purpose: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('documents (upload/list)', () => {
    it('uploads a document and records the uploader', async () => {
      prisma.entryLog.findUnique.mockResolvedValue(baseEntry);
      upload.upload.mockResolvedValue('entry-logs/entry-1/file.pdf');
      prisma.entryLogDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { mimetype: 'application/pdf' } as any;
      await service.uploadDocument('entry-1', 'director-1', file, 'PIECE_IDENTITE', 'CNI');

      expect(prisma.entryLogDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entryLogId: 'entry-1', uploadedById: 'director-1' }),
        }),
      );
    });

    it('lists documents for an existing entry', async () => {
      prisma.entryLog.findUnique.mockResolvedValue(baseEntry);
      prisma.entryLogDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const result = await service.listDocuments('entry-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('history passthrough', () => {
    it('delegates to ValidationsService with the correct resource type', () => {
      validations.findHistory.mockReturnValue([{ id: 'v1' }]);
      const result = service.history('entry-1');
      expect(validations.findHistory).toHaveBeenCalledWith('ENTRY_LOG', 'entry-1');
      expect(result).toEqual([{ id: 'v1' }]);
    });
  });

  describe('document permissions (cross-resource IDOR guard)', () => {
    it('blocks fetching a document that belongs to a different entry log', async () => {
      prisma.entryLogDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        entryLogId: 'some-other-entry',
        fileKey: 'x',
      });
      await expect(service.getDocumentUrl('entry-1', 'doc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows fetching a document that belongs to the given entry log', async () => {
      prisma.entryLogDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        entryLogId: 'entry-1',
        fileKey: 'entry-logs/entry-1/doc-1.pdf',
      });
      upload.getPresignedUrl.mockResolvedValue('https://signed-url');
      const result = await service.getDocumentUrl('entry-1', 'doc-1');
      expect(result.url).toBe('https://signed-url');
    });
  });
});
