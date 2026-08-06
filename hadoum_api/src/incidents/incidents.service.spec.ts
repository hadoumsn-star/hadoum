import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { matchAnything, matching } from '../test-utils/jest-matchers';

// PR 11: Incident workflow improvements — statuses (EN_COURS/EN_ATTENTE/RESOLU
// + legacy PLANIFIE/EN_RETARD preserved read-only), priority (N1/N2/N3),
// SECURITE category, Child/StaffMember links, and the mandatory-note status
// history.

function createMockPrisma() {
  return {
    incident: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    incidentStatusHistory: {
      create: jest.fn(),
    },
    child: {
      findMany: jest.fn(),
    },
    staffMember: {
      findMany: jest.fn(),
    },
    space: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let upload: {
    upload: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const baseIncident = {
    id: 'incident-1',
    title: 'Chute dans la cour',
    type: 'COMPORTEMENT',
    description: 'Un enfant est tombé pendant la récréation.',
    signaledBy: 'Fatou Sow',
    date: new Date('2026-08-04'),
    status: 'EN_COURS',
    priority: 'N3',
    createdById: 'director-1',
    attachmentKey: null,
    attachmentMime: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
      ],
    }).compile();
    service = module.get(IncidentsService);
  });

  describe('create', () => {
    it('creates an incident with a priority and no persons concerned', async () => {
      prisma.incident.create.mockResolvedValue(baseIncident);

      const result = await service.create(
        {
          title: 'Chute dans la cour',
          type: 'COMPORTEMENT',
          description: 'Un enfant est tombé pendant la récréation.',
          signaledBy: 'Fatou Sow',
          priority: 'N3',
        } as any,
        'director-1',
      );

      expect(result.title).toBe('Chute dans la cour');
      expect(prisma.incident.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            priority: 'N3',
            createdById: 'director-1',
          }),
        }),
      );
      expect(prisma.child.findMany).not.toHaveBeenCalled();
      expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
    });

    it('creates an incident with the SECURITE category', async () => {
      prisma.incident.create.mockResolvedValue({
        ...baseIncident,
        type: 'SECURITE',
      });

      const result = await service.create(
        {
          title: 'Intrusion',
          type: 'SECURITE',
          description: 'Personne non identifiée près du portail.',
          signaledBy: 'Gardien',
          priority: 'N1',
        } as any,
        'director-1',
      );

      expect(result.type).toBe('SECURITE');
      expect(prisma.incident.create).toHaveBeenCalledWith(
        matching({
          data: matching({ type: 'SECURITE' }),
        }),
      );
    });

    it.each(['N1', 'N2', 'N3'])('accepts priority %s', async (priority) => {
      prisma.incident.create.mockResolvedValue({ ...baseIncident, priority });
      await service.create(
        {
          title: 'x',
          type: 'AUTRE',
          description: 'desc',
          signaledBy: 'x',
          priority,
        } as any,
        'director-1',
      );
      expect(prisma.incident.create).toHaveBeenCalledWith(
        matching({
          data: matching({ priority }),
        }),
      );
    });

    it('links real children and staff by id, validated up front', async () => {
      prisma.child.findMany.mockResolvedValue([
        { id: 'child-1' },
        { id: 'child-2' },
      ]);
      prisma.staffMember.findMany.mockResolvedValue([{ id: 'staff-1' }]);
      prisma.incident.create.mockResolvedValue(baseIncident);

      await service.create(
        {
          title: 'x',
          type: 'MEDICAL',
          description: 'desc',
          signaledBy: 'x',
          priority: 'N2',
          childIds: ['child-1', 'child-2'],
          staffIds: ['staff-1'],
        } as any,
        'director-1',
      );

      expect(prisma.incident.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            children: {
              create: [{ childId: 'child-1' }, { childId: 'child-2' }],
            },
            staffLinks: { create: [{ staffId: 'staff-1' }] },
          }),
        }),
      );
    });

    it('rejects an unknown child id without creating the incident', async () => {
      prisma.child.findMany.mockResolvedValue([{ id: 'child-1' }]);
      prisma.staffMember.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          {
            title: 'x',
            type: 'MEDICAL',
            description: 'desc',
            signaledBy: 'x',
            priority: 'N2',
            childIds: ['child-1', 'missing-child'],
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.incident.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown staff id without creating the incident', async () => {
      prisma.child.findMany.mockResolvedValue([]);
      prisma.staffMember.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          {
            title: 'x',
            type: 'MEDICAL',
            description: 'desc',
            signaledBy: 'x',
            priority: 'N2',
            staffIds: ['missing-staff'],
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.incident.create).not.toHaveBeenCalled();
    });

    it('links real spaces by id, validated up front — same pattern as children/staff', async () => {
      prisma.child.findMany.mockResolvedValue([]);
      prisma.staffMember.findMany.mockResolvedValue([]);
      prisma.space.findMany.mockResolvedValue([
        { id: 'space-1' },
        { id: 'space-2' },
      ]);
      prisma.incident.create.mockResolvedValue(baseIncident);

      await service.create(
        {
          title: 'x',
          type: 'LOGISTIQUE',
          description: 'desc',
          signaledBy: 'x',
          priority: 'N2',
          spaceIds: ['space-1', 'space-2'],
        } as any,
        'director-1',
      );

      expect(prisma.incident.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            spaces: {
              create: [{ spaceId: 'space-1' }, { spaceId: 'space-2' }],
            },
          }),
        }),
      );
    });

    it('rejects an unknown space id without creating the incident', async () => {
      prisma.child.findMany.mockResolvedValue([]);
      prisma.staffMember.findMany.mockResolvedValue([]);
      prisma.space.findMany.mockResolvedValue([{ id: 'space-1' }]);

      await expect(
        service.create(
          {
            title: 'x',
            type: 'LOGISTIQUE',
            description: 'desc',
            signaledBy: 'x',
            priority: 'N2',
            spaceIds: ['space-1', 'missing-space'],
          } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.incident.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('replaces the linked children/staff when arrays are provided', async () => {
      prisma.incident.findUnique.mockResolvedValue(baseIncident);
      prisma.child.findMany.mockResolvedValue([{ id: 'child-9' }]);
      prisma.incident.update.mockResolvedValue(baseIncident);

      await service.update('incident-1', { childIds: ['child-9'] });

      expect(prisma.incident.update).toHaveBeenCalledWith(
        matching({
          data: matching({
            children: { deleteMany: {}, create: [{ childId: 'child-9' }] },
          }),
        }),
      );
    });

    it('replaces the linked spaces when an array is provided', async () => {
      prisma.incident.findUnique.mockResolvedValue(baseIncident);
      prisma.space.findMany.mockResolvedValue([{ id: 'space-9' }]);
      prisma.incident.update.mockResolvedValue(baseIncident);

      await service.update('incident-1', { spaceIds: ['space-9'] });

      expect(prisma.incident.update).toHaveBeenCalledWith(
        matching({
          data: matching({
            spaces: { deleteMany: {}, create: [{ spaceId: 'space-9' }] },
          }),
        }),
      );
    });

    it('leaves persons/spaces concerned untouched when childIds/staffIds/spaceIds are omitted', async () => {
      prisma.incident.findUnique.mockResolvedValue(baseIncident);
      prisma.incident.update.mockResolvedValue(baseIncident);

      await service.update('incident-1', { title: 'Nouveau titre' });

      const updateCalls = prisma.incident.update.mock.calls as [
        { data: Record<string, unknown> },
      ][];
      const call = updateCalls[0][0];
      expect(call.data).not.toHaveProperty('children');
      expect(call.data).not.toHaveProperty('staffLinks');
      expect(call.data).not.toHaveProperty('spaces');
      expect(prisma.child.findMany).not.toHaveBeenCalled();
      expect(prisma.space.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing incident', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', {} as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('changeStatus (mandatory note + history)', () => {
    it('records previous/new status, note, user and timestamp, then applies the new status', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        status: 'EN_COURS',
      });
      prisma.incidentStatusHistory.create.mockResolvedValue({ id: 'hist-1' });
      prisma.incident.update.mockResolvedValue({
        ...baseIncident,
        status: 'EN_ATTENTE',
      });

      await service.changeStatus(
        'incident-1',
        { status: 'EN_ATTENTE', note: 'En attente du médecin.' } as any,
        'director-1',
      );

      expect(prisma.incidentStatusHistory.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            incidentId: 'incident-1',
            previousStatus: 'EN_COURS',
            newStatus: 'EN_ATTENTE',
            note: 'En attente du médecin.',
            userId: 'director-1',
          }),
        }),
      );
      expect(prisma.incident.update).toHaveBeenCalledWith(
        matching({
          where: { id: 'incident-1' },
          data: { status: 'EN_ATTENTE' },
        }),
      );
    });

    it('resolves an incident through the same status-change path', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        status: 'EN_ATTENTE',
      });
      prisma.incidentStatusHistory.create.mockResolvedValue({ id: 'hist-2' });
      prisma.incident.update.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLU',
      });

      await service.changeStatus(
        'incident-1',
        { status: 'RESOLU', note: 'Résolu après consultation.' } as any,
        'director-1',
      );

      expect(prisma.incident.update).toHaveBeenCalledWith(
        matching({ data: { status: 'RESOLU' } }),
      );
    });

    it('allows moving a legacy PLANIFIE incident into the new workflow', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        status: 'PLANIFIE',
      });
      prisma.incidentStatusHistory.create.mockResolvedValue({ id: 'hist-3' });
      prisma.incident.update.mockResolvedValue({
        ...baseIncident,
        status: 'EN_COURS',
      });

      await service.changeStatus(
        'incident-1',
        { status: 'EN_COURS', note: 'Reprise du suivi.' } as any,
        'director-1',
      );

      expect(prisma.incidentStatusHistory.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            previousStatus: 'PLANIFIE',
            newStatus: 'EN_COURS',
          }),
        }),
      );
    });

    it('refuses a no-op status change (already at that status)', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        status: 'EN_COURS',
      });
      await expect(
        service.changeStatus(
          'incident-1',
          { status: 'EN_COURS', note: 'x' } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.incidentStatusHistory.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing incident', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);
      await expect(
        service.changeStatus(
          'missing',
          { status: 'RESOLU', note: 'x' } as any,
          'director-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll (search and filters)', () => {
    it('applies status/priority/type filters', async () => {
      prisma.incident.findMany.mockResolvedValue([baseIncident]);
      await service.findAll({
        status: 'EN_COURS',
        priority: 'N1',
        type: 'SECURITE',
      } as any);
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({
            status: 'EN_COURS',
            priority: 'N1',
            type: 'SECURITE',
          }),
        }),
      );
    });

    it('filters by a linked child', async () => {
      prisma.incident.findMany.mockResolvedValue([]);
      await service.findAll({ childId: 'child-1' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({
            children: { some: { childId: 'child-1' } },
          }),
        }),
      );
    });

    it('filters by a linked staff member', async () => {
      prisma.incident.findMany.mockResolvedValue([]);
      await service.findAll({ staffId: 'staff-1' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({
            staffLinks: { some: { staffId: 'staff-1' } },
          }),
        }),
      );
    });

    it('filters by a linked space (location)', async () => {
      prisma.incident.findMany.mockResolvedValue([]);
      await service.findAll({ spaceId: 'space-1' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        matching({
          where: matching({
            spaces: { some: { spaceId: 'space-1' } },
          }),
        }),
      );
    });

    it('applies a case-insensitive text search across title and description', async () => {
      prisma.incident.findMany.mockResolvedValue([]);
      await service.findAll({ search: 'cour' });
      const findManyCalls = prisma.incident.findMany.mock.calls as [
        { where: { OR: Record<string, unknown>[] } },
      ][];
      const call = findManyCalls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: 'cour', mode: 'insensitive' } },
        { description: { contains: 'cour', mode: 'insensitive' } },
      ]);
    });

    it('includes createdBy, children, staffLinks, spaces and statusHistory in every list response', async () => {
      prisma.incident.findMany.mockResolvedValue([baseIncident]);
      await service.findAll({});
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        matching({
          include: matching({
            createdBy: matchAnything(),
            children: matchAnything(),
            staffLinks: matchAnything(),
            spaces: matchAnything(),
            statusHistory: matchAnything(),
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('deletes an existing incident and cleans up its attachment', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        attachmentKey: 'key-1',
      });
      await service.delete('incident-1');
      expect(upload.deleteFile).toHaveBeenCalledWith('key-1');
      expect(prisma.incident.delete).toHaveBeenCalledWith({
        where: { id: 'incident-1' },
      });
    });

    it('throws NotFoundException for a missing incident', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('attachments', () => {
    it('uploads an attachment for an existing incident', async () => {
      prisma.incident.findUnique.mockResolvedValue(baseIncident);
      upload.upload.mockResolvedValue('incidents/incident-1/file.pdf');
      prisma.incident.update.mockResolvedValue({
        ...baseIncident,
        attachmentKey: 'incidents/incident-1/file.pdf',
      });

      const file = { mimetype: 'application/pdf' } as Express.Multer.File;
      const result = await service.uploadAttachment('incident-1', file);

      expect(result.attachmentKey).toBe('incidents/incident-1/file.pdf');
    });

    it('gets a presigned url for an existing attachment', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        ...baseIncident,
        attachmentKey: 'key-1',
      });
      upload.getPresignedUrl.mockResolvedValue(
        'https://fake-signed-url.test/key-1',
      );

      const result = await service.getAttachmentUrl('incident-1');
      expect(result.url).toBe('https://fake-signed-url.test/key-1');
    });

    it('throws NotFoundException when no attachment exists', async () => {
      prisma.incident.findUnique.mockResolvedValue(baseIncident);
      await expect(
        service.getAttachmentUrl('incident-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
