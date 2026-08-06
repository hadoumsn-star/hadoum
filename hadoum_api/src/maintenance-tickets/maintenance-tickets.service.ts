import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketStatus,
  TicketUrgency,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

interface FindAllFilters {
  spaceId?: string;
  status?: TicketStatus;
  urgency?: TicketUrgency;
  validationStatus?: ValidationStatus;
  search?: string;
}

@Injectable()
export class MaintenanceTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Contact assignment helpers ────────────────────────────────────────────

  /**
   * A new assignment must point at a real, currently-active Contact — an
   * inactive one can still be *read* (see findOne/findAll), it just can't be
   * newly attached. Kept private/internal: this is not a general Contact
   * lookup, it's specifically "is this id usable for a fresh assignment".
   */
  private async assertContactAssignable(contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      throw new BadRequestException('Contact introuvable.');
    }
    if (!contact.active) {
      throw new BadRequestException(
        'Ce contact est désactivé et ne peut pas être assigné à un nouveau ticket.',
      );
    }
    return contact;
  }

  private readonly assignedContactInclude = {
    assignedContact: { include: { category: true } },
  };

  async create(dto: CreateMaintenanceTicketDto) {
    // assignedContactId is create/update's source of truth for the relation;
    // assignedTo is derived from it as a readable snapshot so existing
    // reads/exports of the flat string field keep working unchanged. If no
    // contact is selected, assignedTo falls back to whatever free text the
    // caller sent — the pre-PR-3 legacy path, untouched.
    let assignedTo = dto.assignedTo;
    let assignedContactId: string | undefined;

    if (dto.assignedContactId) {
      const contact = await this.assertContactAssignable(dto.assignedContactId);
      assignedContactId = contact.id;
      assignedTo = contact.fullName;
    }

    return this.prisma.maintenanceTicket.create({
      data: {
        title: dto.title,
        spaceId: dto.spaceId,
        description: dto.description,
        problemType: dto.problemType,
        urgency: dto.urgency,
        reportedBy: dto.reportedBy,
        assignedTo,
        assignedContactId,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        estimatedCost: dto.estimatedCost,
      },
      include: {
        space: { select: { id: true, name: true } },
        ...this.assignedContactInclude,
      },
    });
  }

  findAll(filters: FindAllFilters) {
    const where: Prisma.MaintenanceTicketWhereInput = {
      ...(filters.spaceId !== undefined ? { spaceId: filters.spaceId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.urgency !== undefined ? { urgency: filters.urgency } : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.search
        ? {
            title: {
              contains: filters.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
    };

    return this.prisma.maintenanceTicket.findMany({
      where,
      include: {
        space: { select: { id: true, name: true } },
        ...this.assignedContactInclude,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    // No `active` filter on the included Contact — deliberately: a ticket
    // referencing a since-deactivated contact must stay fully readable (same
    // rule ContactsService.findOne already applies to Contact itself).
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id },
      include: {
        space: { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: 'desc' } },
        ...this.assignedContactInclude,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async findRaw(id: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async update(id: string, dto: UpdateMaintenanceTicketDto) {
    const existing = await this.findRaw(id);

    if (dto.status !== undefined) {
      const routineStates: TicketStatus[] = [
        'OUVERT',
        'ASSIGNE',
        'EN_COURS',
        'EN_ATTENTE',
      ];
      if (
        !routineStates.includes(existing.status) ||
        !routineStates.includes(dto.status)
      ) {
        throw new ConflictException(
          'Ce changement de statut doit passer par le circuit approprié (affectation, clôture ou validation).',
        );
      }
    }

    // Three distinct states for assignedContactId, per the dual-write
    // contract: omitted (key absent from the request body) leaves the
    // existing relation and assignedTo snapshot untouched; an id validates
    // and refreshes both; explicit `null` (present, JSON null — distinct
    // from "absent" since class-validator's @IsOptional lets null through
    // too) disconnects the contact and clears assignedTo with it. The
    // legacy `dto.assignedTo` passthrough only applies when the caller isn't
    // touching the relation at all, so it can never race with the snapshot
    // this derives.
    let contactUpdate: {
      assignedContactId?: string | null;
      assignedTo?: string | null;
    } = {};
    if (dto.assignedContactId !== undefined) {
      if (dto.assignedContactId === null) {
        contactUpdate = { assignedContactId: null, assignedTo: null };
      } else {
        const contact = await this.assertContactAssignable(
          dto.assignedContactId,
        );
        contactUpdate = {
          assignedContactId: contact.id,
          assignedTo: contact.fullName,
        };
      }
    }

    return this.prisma.maintenanceTicket.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.problemType !== undefined
          ? { problemType: dto.problemType }
          : {}),
        ...(dto.urgency !== undefined ? { urgency: dto.urgency } : {}),
        ...(dto.assignedTo !== undefined && dto.assignedContactId === undefined
          ? { assignedTo: dto.assignedTo }
          : {}),
        ...contactUpdate,
        ...(dto.plannedDate !== undefined
          ? { plannedDate: new Date(dto.plannedDate) }
          : {}),
        ...(dto.estimatedCost !== undefined
          ? { estimatedCost: dto.estimatedCost }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.resolutionNotes !== undefined
          ? { resolutionNotes: dto.resolutionNotes }
          : {}),
        ...(dto.actualCost !== undefined ? { actualCost: dto.actualCost } : {}),
      },
      include: {
        space: { select: { id: true, name: true } },
        ...this.assignedContactInclude,
      },
    });
  }

  async assign(id: string, dto: AssignTicketDto) {
    const ticket = await this.findRaw(id);
    return this.prisma.maintenanceTicket.update({
      where: { id },
      data: {
        assignedTo: dto.assignedTo,
        status: ticket.status === 'OUVERT' ? 'ASSIGNE' : ticket.status,
      },
    });
  }

  async close(id: string) {
    const ticket = await this.findRaw(id);
    if (ticket.urgency === 'CRITIQUE') {
      throw new ConflictException(
        'Un ticket critique doit être clôturé via le circuit de validation (soumettre pour validation).',
      );
    }
    return this.prisma.maintenanceTicket.update({
      where: { id },
      data: { status: 'FERME', resolvedDate: new Date() },
    });
  }

  async submitValidation(id: string, userId: string, dto: SubmitValidationDto) {
    const ticket = await this.findRaw(id);

    await this.validationsService.create({
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      submittedById: userId,
      previousStatus: ticket.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.maintenanceTicket.update({
      where: { id },
      data: { validationStatus: 'PENDING_VALIDATION' },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      title: 'Validation requise',
      message: `Le ticket "${ticket.title}" nécessite une validation.`,
    });

    return updated;
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const ticket = await this.findRaw(id);

    const validation = await this.validationsService.approve({
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.maintenanceTicket.update({
      where: { id },
      data: {
        status: 'FERME',
        resolvedDate: new Date(),
        validationStatus: 'APPROVED',
      },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      title: 'Validation approuvée',
      message: `Le ticket "${ticket.title}" a été approuvé et clôturé.`,
    });

    return updated;
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const ticket = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.maintenanceTicket.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      title: 'Validation refusée',
      message: `La clôture du ticket "${ticket.title}" a été refusée.`,
    });

    return updated;
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const ticket = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.maintenanceTicket.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'MAINTENANCE_TICKET',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour le ticket "${ticket.title}".`,
    });

    return updated;
  }

  history(id: string) {
    return this.validationsService.findHistory('MAINTENANCE_TICKET', id);
  }

  async uploadAttachment(id: string, file: Express.Multer.File) {
    await this.findRaw(id);
    const fileKey = await this.uploadService.upload(
      file,
      `maintenance-tickets/${id}`,
    );
    return this.prisma.ticketAttachment.create({
      data: { ticketId: id, fileKey, fileMime: file.mimetype },
    });
  }

  async listAttachments(id: string) {
    await this.findRaw(id);
    return this.prisma.ticketAttachment.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAttachmentUrl(
    id: string,
    attachmentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.ticketId !== id)
      throw new NotFoundException('Attachment not found');
    const url = await this.uploadService.getPresignedUrl(attachment.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteAttachment(id: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.ticketId !== id)
      throw new NotFoundException('Attachment not found');
    await this.uploadService.deleteFile(attachment.fileKey);
    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });
  }
}
