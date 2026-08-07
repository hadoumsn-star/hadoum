import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-incident-status.dto';

interface FindAllFilters {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  type?: IncidentType;
  childId?: string;
  staffId?: string;
  spaceId?: string;
  search?: string;
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  // Shared across every response so the frontend always gets the same
  // detail shape, whether it just created, listed, or updated an incident.
  private readonly include = {
    createdBy: { select: { id: true, name: true, role: true } },
    children: {
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fileNumber: true,
          },
        },
      },
    },
    staffLinks: {
      include: {
        staffMember: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    },
    spaces: {
      include: {
        space: {
          select: {
            id: true,
            name: true,
            type: true,
            building: true,
            floor: true,
          },
        },
      },
    },
    statusHistory: {
      orderBy: { createdAt: 'desc' as const },
      include: { user: { select: { id: true, name: true, role: true } } },
    },
    notes: { orderBy: { createdAt: 'asc' as const } },
  } satisfies Prisma.IncidentInclude;

  // ─── Persons-concerned validation ──────────────────────────────────────────
  // A link must point at a real Child/StaffMember — never accepted as free
  // text. Rejected up front as a 400 rather than surfacing as a raw FK
  // constraint failure.

  private async assertChildIdsExist(childIds: string[]): Promise<void> {
    if (childIds.length === 0) return;
    const found = await this.prisma.child.findMany({
      where: { id: { in: childIds } },
      select: { id: true },
    });
    if (found.length !== new Set(childIds).size) {
      throw new BadRequestException(
        'Un ou plusieurs enfants sélectionnés sont introuvables.',
      );
    }
  }

  private async assertStaffIdsExist(staffIds: string[]): Promise<void> {
    if (staffIds.length === 0) return;
    const found = await this.prisma.staffMember.findMany({
      where: { id: { in: staffIds } },
      select: { id: true },
    });
    if (found.length !== new Set(staffIds).size) {
      throw new BadRequestException(
        'Un ou plusieurs membres du personnel sélectionnés sont introuvables.',
      );
    }
  }

  private async assertSpaceIdsExist(spaceIds: string[]): Promise<void> {
    if (spaceIds.length === 0) return;
    const found = await this.prisma.space.findMany({
      where: { id: { in: spaceIds } },
      select: { id: true },
    });
    if (found.length !== new Set(spaceIds).size) {
      throw new BadRequestException(
        'Un ou plusieurs locaux sélectionnés sont introuvables.',
      );
    }
  }

  async create(dto: CreateIncidentDto, createdById: string) {
    const childIds = dto.childIds ?? [];
    const staffIds = dto.staffIds ?? [];
    const spaceIds = dto.spaceIds ?? [];
    await Promise.all([
      this.assertChildIdsExist(childIds),
      this.assertStaffIdsExist(staffIds),
      this.assertSpaceIdsExist(spaceIds),
    ]);

    return this.prisma.incident.create({
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description,
        signaledBy: dto.signaledBy,
        priority: dto.priority,
        date: dto.date ? new Date(dto.date) : new Date(),
        createdById,
        children: { create: childIds.map((childId) => ({ childId })) },
        staffLinks: { create: staffIds.map((staffId) => ({ staffId })) },
        spaces: { create: spaceIds.map((spaceId) => ({ spaceId })) },
      },
      include: this.include,
    });
  }

  findAll(filters: FindAllFilters) {
    const where: Prisma.IncidentWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.childId
        ? { children: { some: { childId: filters.childId } } }
        : {}),
      ...(filters.staffId
        ? { staffLinks: { some: { staffId: filters.staffId } } }
        : {}),
      ...(filters.spaceId
        ? { spaces: { some: { spaceId: filters.spaceId } } }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                title: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    return this.prisma.incident.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findRaw(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async findOne(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: this.include,
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    await this.findRaw(id);

    let linksUpdate: Prisma.IncidentUpdateInput = {};
    if (dto.childIds !== undefined) {
      await this.assertChildIdsExist(dto.childIds);
      linksUpdate = {
        ...linksUpdate,
        children: {
          deleteMany: {},
          create: dto.childIds.map((childId) => ({ childId })),
        },
      };
    }
    if (dto.staffIds !== undefined) {
      await this.assertStaffIdsExist(dto.staffIds);
      linksUpdate = {
        ...linksUpdate,
        staffLinks: {
          deleteMany: {},
          create: dto.staffIds.map((staffId) => ({ staffId })),
        },
      };
    }
    if (dto.spaceIds !== undefined) {
      await this.assertSpaceIdsExist(dto.spaceIds);
      linksUpdate = {
        ...linksUpdate,
        spaces: {
          deleteMany: {},
          create: dto.spaceIds.map((spaceId) => ({ spaceId })),
        },
      };
    }

    return this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.signaledBy !== undefined ? { signaledBy: dto.signaledBy } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...linksUpdate,
      },
      include: this.include,
    });
  }

  // PR 11 — the only way an incident's status ever changes; the note is
  // mandatory (enforced by ChangeIncidentStatusDto) and every transition is
  // recorded in IncidentStatusHistory, atomically with the status update.
  async changeStatus(id: string, dto: ChangeIncidentStatusDto, userId: string) {
    const incident = await this.findRaw(id);
    if (incident.status === dto.status) {
      throw new ConflictException(
        `L'incident est déjà au statut ${dto.status}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.incidentStatusHistory.create({
        data: {
          incidentId: id,
          previousStatus: incident.status,
          newStatus: dto.status,
          note: dto.note,
          userId,
        },
      }),
      this.prisma.incident.update({
        where: { id },
        data: { status: dto.status },
      }),
    ]);

    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const incident = await this.findRaw(id);
    if (incident.attachmentKey)
      await this.uploadService.deleteFile(incident.attachmentKey);
    await this.prisma.incident.delete({ where: { id } });
  }

  async uploadAttachment(id: string, file: Express.Multer.File) {
    const incident = await this.findRaw(id);
    if (incident.attachmentKey)
      await this.uploadService.deleteFile(incident.attachmentKey);
    const attachmentKey = await this.uploadService.upload(
      file,
      `incidents/${id}`,
    );
    return this.prisma.incident.update({
      where: { id },
      data: { attachmentKey, attachmentMime: file.mimetype },
      include: this.include,
    });
  }

  async getAttachmentUrl(
    id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const incident = await this.findRaw(id);
    if (!incident.attachmentKey)
      throw new NotFoundException('No attachment uploaded');
    const url = await this.uploadService.getPresignedUrl(
      incident.attachmentKey,
    );
    return { url, expiresIn: 900 };
  }
}
