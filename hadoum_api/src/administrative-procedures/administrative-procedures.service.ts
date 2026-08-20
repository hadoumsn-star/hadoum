import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdministrativeProcedure,
  Contact,
  Prisma,
  ProcedurePriority,
  ProcedureStatus,
  ProcedureType,
  ProcedureDocumentType,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAdministrativeProcedureDto } from './dto/create-administrative-procedure.dto';
import { UpdateAdministrativeProcedureDto } from './dto/update-administrative-procedure.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { RequestArchiveDto } from './dto/request-archive.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { computeProcedureAlerts } from './administrative-procedure-alerts.util';

const DAY_MS = 24 * 60 * 60 * 1000;

// Statuses a DIRECTOR can set directly (create, or update's generic PATCH)
// without going through the validation workflow — pure operational
// tracking, pre-submission. EN_ATTENTE_REPONSE joins A_PREPARER/EN_COURS
// here specifically so a procedure can be marked as waiting on an external
// authority's response without that being a validation event. Every other
// status (SOUMIS, APPROUVE, REFUSE, EXPIRE, ARCHIVE) stays reachable only
// through submitValidation/approve/reject/archive — untouched by this list.
const MANUALLY_SETTABLE_STATUSES: ProcedureStatus[] = [
  'A_PREPARER',
  'EN_COURS',
  'EN_ATTENTE_REPONSE',
];

interface FindAllFilters {
  search?: string;
  procedureType?: ProcedureType;
  authority?: string;
  status?: ProcedureStatus;
  priority?: ProcedurePriority;
  validationStatus?: ValidationStatus;
  assignedTo?: string;
  expiringSoon?: boolean;
  expired?: boolean;
  renewalDueSoon?: boolean;
  responseOverdue?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

type ProcedureWithDeadlines = AdministrativeProcedure & {
  effectiveStatus: ProcedureStatus;
  isExpiringSoon: boolean;
  isRenewalDueSoon: boolean;
  isResponseOverdue: boolean;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  daysUntilRenewal: number | null;
  daysWaitingForResponse: number | null;
  // PR 22 — additive: the authoritative "requiring attention" union (see
  // administrative-procedure-alerts.util.ts). Existing consumers that
  // don't know about this field are unaffected.
  requiresAttention: boolean;
};

@Injectable()
export class AdministrativeProceduresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Contact assignment helpers (PR 9) ─────────────────────────────────────

  /**
   * A new assignment must point at a real, currently-active Contact — an
   * inactive one can still be *read* (see findOne/findAll), it just can't be
   * newly attached. Mirrors MaintenanceTicketsService.assertContactAssignable.
   */
  private async assertContactAssignable(contactId: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      throw new BadRequestException('Contact introuvable.');
    }
    if (!contact.active) {
      throw new BadRequestException(
        'Ce contact est désactivé et ne peut pas être assigné à une nouvelle démarche.',
      );
    }
    return contact;
  }

  private readonly assignedContactInclude = {
    assignedContact: { include: { category: true } },
  };

  // ─── Derived / computed fields ────────────────────────────────────────────
  // PR 22: the actual formulas now live in administrative-procedure-
  // alerts.util.ts's computeProcedureAlerts (extracted verbatim, unchanged
  // behavior) — reused by DashboardService too, so the two never disagree.

  private withComputedFields<T extends AdministrativeProcedure>(
    procedure: T,
  ): T & ProcedureWithDeadlines {
    return {
      ...procedure,
      ...computeProcedureAlerts(procedure),
    };
  }

  private async notifyDeadlinesOnce(procedure: ProcedureWithDeadlines) {
    const checks: Array<{
      trigger: boolean;
      type:
        | 'PROCEDURE_EXPIRED'
        | 'PROCEDURE_EXPIRING_SOON'
        | 'PROCEDURE_RENEWAL_DUE'
        | 'PROCEDURE_RESPONSE_OVERDUE';
      title: string;
      message: string;
    }> = [
      {
        trigger: procedure.isExpired,
        type: 'PROCEDURE_EXPIRED',
        title: 'Démarche expirée',
        message: `La démarche "${procedure.title}" (${procedure.authority}) a expiré.`,
      },
      {
        trigger: procedure.isExpiringSoon,
        type: 'PROCEDURE_EXPIRING_SOON',
        title: 'Démarche bientôt expirée',
        message: `La démarche "${procedure.title}" (${procedure.authority}) expire bientôt.`,
      },
      {
        trigger: procedure.isRenewalDueSoon,
        type: 'PROCEDURE_RENEWAL_DUE',
        title: 'Renouvellement à prévoir',
        message: `Le renouvellement de la démarche "${procedure.title}" (${procedure.authority}) approche.`,
      },
      {
        trigger: procedure.isResponseOverdue,
        type: 'PROCEDURE_RESPONSE_OVERDUE',
        title: 'Réponse administrative en retard',
        message: `La démarche "${procedure.title}" (${procedure.authority}) attend une réponse au-delà du délai prévu.`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          resourceType: 'ADMINISTRATIVE_PROCEDURE',
          resourceId: procedure.id,
          type: check.type,
        },
      });
      if (alreadyNotified) continue;

      await this.notificationsService.createForRole('DIRECTOR', {
        type: check.type,
        resourceType: 'ADMINISTRATIVE_PROCEDURE',
        resourceId: procedure.id,
        title: check.title,
        message: check.message,
      });
    }
  }

  // ─── Validation guards ─────────────────────────────────────────────────────

  private assertNoPendingValidation(procedure: {
    validationStatus: ValidationStatus | null;
  }) {
    if (procedure.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour cette démarche.',
      );
    }
  }

  private validateDateCoherence(input: {
    submissionDate?: string;
    expectedResponseDate?: string;
    expirationDate?: string;
    renewalDate?: string;
  }) {
    const submission = input.submissionDate
      ? new Date(input.submissionDate)
      : null;
    const expectedResponse = input.expectedResponseDate
      ? new Date(input.expectedResponseDate)
      : null;
    const expiration = input.expirationDate
      ? new Date(input.expirationDate)
      : null;
    const renewal = input.renewalDate ? new Date(input.renewalDate) : null;

    if (submission && expectedResponse && expectedResponse < submission) {
      throw new BadRequestException(
        'La date de réponse attendue ne peut pas précéder la date de soumission.',
      );
    }
    if (submission && expiration && expiration < submission) {
      throw new BadRequestException(
        "La date d'expiration ne peut pas précéder la date de soumission.",
      );
    }
    if (renewal && expiration && renewal > expiration) {
      throw new BadRequestException(
        "La date de renouvellement doit être antérieure ou égale à la date d'expiration.",
      );
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateAdministrativeProcedureDto, userId: string) {
    this.validateDateCoherence(dto);

    if (
      dto.status !== undefined &&
      !MANUALLY_SETTABLE_STATUSES.includes(dto.status)
    ) {
      throw new ConflictException(
        'Ce statut ne peut pas être défini directement ; il est géré par le circuit de validation.',
      );
    }

    // assignedContactId is create/update's source of truth for the
    // relation; assignedTo is derived from it as a readable snapshot so
    // existing reads/exports of the flat string field keep working
    // unchanged. If no contact is selected, assignedTo falls back to
    // whatever free text the caller sent — the pre-PR-9 legacy path,
    // untouched.
    let assignedTo = dto.assignedTo;
    let assignedContactId: string | undefined;

    if (dto.assignedContactId) {
      const contact = await this.assertContactAssignable(dto.assignedContactId);
      assignedContactId = contact.id;
      assignedTo = contact.fullName;
    }

    const created = await this.prisma.administrativeProcedure.create({
      data: {
        title: dto.title,
        procedureType: dto.procedureType,
        authority: dto.authority,
        description: dto.description,
        referenceNumber: dto.referenceNumber,
        submissionDate: dto.submissionDate
          ? new Date(dto.submissionDate)
          : undefined,
        expectedResponseDate: dto.expectedResponseDate
          ? new Date(dto.expectedResponseDate)
          : undefined,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : undefined,
        renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : undefined,
        status: dto.status,
        priority: dto.priority,
        assignedTo,
        assignedContactId,
        notes: dto.notes,
        pendingResponseOrganization: dto.pendingResponseOrganization,
        createdById: userId,
      },
      include: this.assignedContactInclude,
    });

    return this.withComputedFields(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.AdministrativeProcedureWhereInput = {
      ...(filters.procedureType !== undefined
        ? { procedureType: filters.procedureType }
        : {}),
      ...(filters.authority
        ? {
            authority: {
              contains: filters.authority,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.assignedTo
        ? {
            assignedTo: {
              contains: filters.assignedTo,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
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
                referenceNumber: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                authority: {
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
              {
                assignedTo: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const procedures = await this.prisma.administrativeProcedure.findMany({
      where,
      include: this.assignedContactInclude,
      orderBy: { createdAt: 'desc' },
    });

    const computed = procedures.map((p) => this.withComputedFields(p));
    await Promise.all(computed.map((p) => this.notifyDeadlinesOnce(p)));

    let result = computed;
    if (filters.expiringSoon) result = result.filter((p) => p.isExpiringSoon);
    if (filters.expired) result = result.filter((p) => p.isExpired);
    if (filters.renewalDueSoon)
      result = result.filter((p) => p.isRenewalDueSoon);
    if (filters.responseOverdue)
      result = result.filter((p) => p.isResponseOverdue);

    return result.sort((a, b) => this.urgencyRank(a) - this.urgencyRank(b));
  }

  private urgencyRank(p: ProcedureWithDeadlines): number {
    if (p.status === 'ARCHIVE') return 1000;
    if (p.isExpired || p.isResponseOverdue) return 0;
    if (p.isExpiringSoon || p.isRenewalDueSoon) return 1;
    return 2;
  }

  async findOne(id: string) {
    // No `active` filter on the included Contact — deliberately: a
    // procedure referencing a since-deactivated contact must stay fully
    // readable (same rule MaintenanceTicketsService.findOne already applies).
    const procedure = await this.prisma.administrativeProcedure.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        createdBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        ...this.assignedContactInclude,
      },
    });
    if (!procedure) throw new NotFoundException('Procedure not found');
    return this.withComputedFields(procedure);
  }

  private async findRaw(id: string) {
    const procedure = await this.prisma.administrativeProcedure.findUnique({
      where: { id },
    });
    if (!procedure) throw new NotFoundException('Procedure not found');
    return procedure;
  }

  async update(id: string, dto: UpdateAdministrativeProcedureDto) {
    const existing = await this.findRaw(id);
    this.validateDateCoherence({
      submissionDate:
        dto.submissionDate ?? existing.submissionDate?.toISOString(),
      expectedResponseDate:
        dto.expectedResponseDate ??
        existing.expectedResponseDate?.toISOString(),
      expirationDate:
        dto.expirationDate ?? existing.expirationDate?.toISOString(),
      renewalDate: dto.renewalDate ?? existing.renewalDate?.toISOString(),
    });

    if (dto.status !== undefined) {
      if (
        !MANUALLY_SETTABLE_STATUSES.includes(existing.status) ||
        !MANUALLY_SETTABLE_STATUSES.includes(dto.status)
      ) {
        throw new ConflictException(
          'Ce changement de statut doit passer par le circuit de validation approprié (soumission, renouvellement ou archivage).',
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

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.procedureType !== undefined
          ? { procedureType: dto.procedureType }
          : {}),
        ...(dto.authority !== undefined ? { authority: dto.authority } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.referenceNumber !== undefined
          ? { referenceNumber: dto.referenceNumber }
          : {}),
        ...(dto.submissionDate !== undefined
          ? { submissionDate: new Date(dto.submissionDate) }
          : {}),
        ...(dto.expectedResponseDate !== undefined
          ? { expectedResponseDate: new Date(dto.expectedResponseDate) }
          : {}),
        ...(dto.expirationDate !== undefined
          ? { expirationDate: new Date(dto.expirationDate) }
          : {}),
        ...(dto.renewalDate !== undefined
          ? { renewalDate: new Date(dto.renewalDate) }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.assignedTo !== undefined && dto.assignedContactId === undefined
          ? { assignedTo: dto.assignedTo }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.pendingResponseOrganization !== undefined
          ? { pendingResponseOrganization: dto.pendingResponseOrganization }
          : {}),
        ...contactUpdate,
      },
      include: this.assignedContactInclude,
    });

    return this.withComputedFields(updated);
  }

  async archive(id: string) {
    const procedure = await this.findRaw(id);
    if (procedure.status === 'ARCHIVE') {
      throw new ConflictException('Cette démarche est déjà archivée.');
    }
    this.assertNoPendingValidation(procedure);

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: { status: 'ARCHIVE', archivedAt: new Date() },
      include: this.assignedContactInclude,
    });
    return this.withComputedFields(updated);
  }

  // ─── Validation workflow ────────────────────────────────────────────────────

  async submitValidation(id: string, userId: string, dto: SubmitValidationDto) {
    const procedure = await this.findRaw(id);
    this.assertNoPendingValidation(procedure);

    const action =
      procedure.status === 'SOUMIS' || procedure.status === 'EN_ATTENTE_REPONSE'
        ? 'FINALIZATION'
        : procedure.status === 'A_PREPARER' ||
            procedure.status === 'EN_COURS' ||
            procedure.status === 'REFUSE'
          ? 'SUBMISSION'
          : null;

    if (!action) {
      throw new ConflictException(
        'Cette démarche ne peut pas être soumise pour validation dans son état actuel.',
      );
    }

    await this.validationsService.create({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      submittedById: userId,
      previousStatus: procedure.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: action,
      },
      include: this.assignedContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: 'Validation requise',
      message: `La démarche "${procedure.title}" (${procedure.authority}) nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  async requestRenewal(id: string, userId: string, dto: RequestRenewalDto) {
    const procedure = await this.findRaw(id);
    if (procedure.status === 'ARCHIVE') {
      throw new ConflictException(
        "Cette démarche est archivée et ne peut plus faire l'objet d'un renouvellement.",
      );
    }
    this.assertNoPendingValidation(procedure);

    await this.validationsService.create({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      submittedById: userId,
      previousStatus: procedure.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'RENEWAL',
      },
      include: this.assignedContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: 'Demande de renouvellement',
      message: `Renouvellement demandé pour la démarche "${procedure.title}" (${procedure.authority}).`,
    });

    return this.withComputedFields(updated);
  }

  async requestArchive(id: string, userId: string, dto: RequestArchiveDto) {
    const procedure = await this.findRaw(id);
    if (procedure.status === 'ARCHIVE') {
      throw new ConflictException('Cette démarche est déjà archivée.');
    }
    this.assertNoPendingValidation(procedure);

    await this.validationsService.create({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      submittedById: userId,
      previousStatus: procedure.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'ARCHIVE',
      },
      include: this.assignedContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: "Demande d'archivage",
      message: `Archivage demandé pour la démarche "${procedure.title}" (${procedure.authority}).`,
    });

    return this.withComputedFields(updated);
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const procedure = await this.findRaw(id);

    const validation = await this.validationsService.approve({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = procedure.pendingValidationAction;
    const data: Prisma.AdministrativeProcedureUpdateInput = {
      validationStatus: 'APPROVED',
      pendingValidationAction: null,
    };

    switch (action) {
      case 'SUBMISSION':
        data.status = 'SOUMIS';
        data.submissionDate = procedure.submissionDate ?? new Date();
        break;
      case 'FINALIZATION':
        data.status = 'APPROUVE';
        break;
      case 'RENEWAL': {
        const newExpiration =
          procedure.renewalDate ??
          new Date(
            (procedure.expirationDate ?? new Date()).getTime() + 365 * DAY_MS,
          );
        data.expirationDate = newExpiration;
        data.renewalDate = null;
        data.status = 'EN_COURS';
        break;
      }
      case 'ARCHIVE':
        data.status = 'ARCHIVE';
        data.archivedAt = new Date();
        break;
      default:
        break;
    }

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data,
      include: this.assignedContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: 'Validation approuvée',
      message: `La demande pour la démarche "${procedure.title}" (${procedure.authority}) a été approuvée.`,
    });

    return this.withComputedFields(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const procedure = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
      include: this.assignedContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: 'Validation refusée',
      message: `La demande pour la démarche "${procedure.title}" (${procedure.authority}) a été refusée.`,
    });

    return this.withComputedFields(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const procedure = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.administrativeProcedure.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
      include: this.assignedContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'ADMINISTRATIVE_PROCEDURE',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour la démarche "${procedure.title}" (${procedure.authority}).`,
    });

    return this.withComputedFields(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('ADMINISTRATIVE_PROCEDURE', id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  async uploadDocument(
    id: string,
    userId: string,
    file: Express.Multer.File,
    documentType?: ProcedureDocumentType,
    label?: string,
  ) {
    await this.findRaw(id);
    const fileKey = await this.uploadService.upload(
      file,
      `administrative-procedures/${id}`,
    );
    return this.prisma.procedureDocument.create({
      data: {
        procedureId: id,
        fileKey,
        fileMime: file.mimetype,
        label,
        documentType,
        uploadedById: userId,
      },
    });
  }

  async listDocuments(id: string) {
    await this.findRaw(id);
    return this.prisma.procedureDocument.findMany({
      where: { procedureId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.procedureDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.procedureId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.procedureDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.procedureId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.procedureDocument.delete({ where: { id: documentId } });
  }
}
