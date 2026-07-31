import {
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

  create(dto: CreateMaintenanceTicketDto) {
    return this.prisma.maintenanceTicket.create({
      data: {
        title: dto.title,
        spaceId: dto.spaceId,
        description: dto.description,
        problemType: dto.problemType,
        urgency: dto.urgency,
        reportedBy: dto.reportedBy,
        assignedTo: dto.assignedTo,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        estimatedCost: dto.estimatedCost,
      },
      include: { space: { select: { id: true, name: true } } },
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
      include: { space: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id },
      include: {
        space: { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: 'desc' } },
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
        ...(dto.assignedTo !== undefined ? { assignedTo: dto.assignedTo } : {}),
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
      include: { space: { select: { id: true, name: true } } },
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
