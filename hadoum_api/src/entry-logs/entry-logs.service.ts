import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryLog,
  EntryStatus,
  EntryType,
  EntryValidationAction,
  Prisma,
  ValidationStatus,
  VisitorCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEntryLogDto } from './dto/create-entry-log.dto';
import { UpdateEntryLogDto } from './dto/update-entry-log.dto';
import { CheckInEntryDto } from './dto/check-in-entry.dto';
import { CheckOutEntryDto } from './dto/check-out-entry.dto';
import { CancelEntryDto } from './dto/cancel-entry.dto';
import { RefuseEntryDto } from './dto/refuse-entry.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import {
  EXPECTED_VISIT_NO_SHOW_GRACE_HOURS,
  REGISTER_BUSINESS_HOURS_END,
  REGISTER_BUSINESS_HOURS_START,
  VISITOR_LONG_PRESENCE_WARNING_HOURS,
} from './entry-logs.constants';

const HOUR_MS = 60 * 60 * 1000;

const IMMEDIATE_ENTRY_TYPES: EntryType[] = [
  'ENTREE',
  'VISITE_IMPREVUE',
  'LIVRAISON',
  'PRESTATION',
  'RETOUR',
];

interface EntryActionPayload {
  arrivalDateTime?: string;
  actualDepartureDateTime?: string;
  reason?: string;
}

interface FindAllFilters {
  search?: string;
  entryType?: EntryType;
  visitorCategory?: VisitorCategory;
  status?: EntryStatus;
  currentlyPresent?: boolean;
  expectedVisit?: boolean;
  overduePresence?: boolean;
  organization?: string;
  personVisited?: string;
  spaceId?: string;
  incidentReported?: boolean;
  validationStatus?: ValidationStatus;
  dateFrom?: string;
  dateTo?: string;
}

type EntryLogWithDerived = EntryLog & {
  isCurrentlyPresent: boolean;
  isExpectedDepartureOverdue: boolean;
  durationOnSiteMinutes: number | null;
  isVisitExpected: boolean;
  isUnauthorizedOrUnvalidated: boolean;
};

@Injectable()
export class EntryLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Privacy ────────────────────────────────────────────────────────────────

  // Reusable masking helper: keeps only the last 4 characters, per §20 —
  // full identity-document numbers are not shown in list views.
  private maskIdentityDocumentNumber(value: string | null): string | null {
    if (!value) return value;
    if (value.length <= 4) return '*'.repeat(value.length);
    return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
  }

  // ─── Derived / computed fields ────────────────────────────────────────────

  private isOutsideBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    return (
      hour < REGISTER_BUSINESS_HOURS_START ||
      hour >= REGISTER_BUSINESS_HOURS_END
    );
  }

  private withComputedFields<T extends EntryLog>(
    entry: T,
  ): T & EntryLogWithDerived {
    const now = new Date();
    const isCurrentlyPresent =
      entry.status === 'PRESENT' && entry.actualDepartureDateTime === null;
    const isVisitExpected = entry.status === 'PREVUE';

    const hasActuallyArrived =
      entry.status !== 'PREVUE' &&
      entry.status !== 'ANNULEE' &&
      entry.status !== 'REFUSEE';
    const durationOnSiteMinutes =
      entry.arrivalDateTime && hasActuallyArrived
        ? Math.round(
            ((entry.actualDepartureDateTime ?? now).getTime() -
              entry.arrivalDateTime.getTime()) /
              60000,
          )
        : null;

    const isExpectedDepartureOverdue =
      isCurrentlyPresent &&
      (entry.expectedDepartureDateTime
        ? entry.expectedDepartureDateTime < now
        : durationOnSiteMinutes !== null &&
          durationOnSiteMinutes > VISITOR_LONG_PRESENCE_WARNING_HOURS * 60);

    const isUnauthorizedOrUnvalidated =
      isCurrentlyPresent &&
      !entry.authorizedBy &&
      !entry.authorizedByUserId &&
      !entry.personVisitedUserId;

    return {
      ...entry,
      isCurrentlyPresent,
      isExpectedDepartureOverdue,
      durationOnSiteMinutes,
      isVisitExpected,
      isUnauthorizedOrUnvalidated,
    };
  }

  private async notifyOperationalAlertsOnce(entry: EntryLogWithDerived) {
    const now = new Date();
    const isNoShow =
      entry.status === 'PREVUE' &&
      entry.arrivalDateTime !== null &&
      entry.arrivalDateTime.getTime() <
        now.getTime() - EXPECTED_VISIT_NO_SHOW_GRACE_HOURS * HOUR_MS;

    const checks: Array<{
      trigger: boolean;
      type:
        | 'VISITOR_OVERDUE_DEPARTURE'
        | 'VISITOR_LONG_PRESENCE'
        | 'EXPECTED_VISITOR_NO_SHOW'
        | 'REGISTER_INCIDENT_UNRESOLVED';
      title: string;
      message: string;
    }> = [
      {
        trigger:
          entry.isCurrentlyPresent &&
          !!entry.expectedDepartureDateTime &&
          entry.isExpectedDepartureOverdue,
        type: 'VISITOR_OVERDUE_DEPARTURE',
        title: 'Départ en retard',
        message: `"${entry.fullName}" n'a pas quitté les lieux à l'heure prévue.`,
      },
      {
        trigger:
          entry.isCurrentlyPresent &&
          !entry.expectedDepartureDateTime &&
          entry.isExpectedDepartureOverdue,
        type: 'VISITOR_LONG_PRESENCE',
        title: 'Présence prolongée',
        message: `"${entry.fullName}" est sur place depuis plus de ${VISITOR_LONG_PRESENCE_WARNING_HOURS}h.`,
      },
      {
        trigger: isNoShow,
        type: 'EXPECTED_VISITOR_NO_SHOW',
        title: 'Visite non honorée',
        message: `"${entry.fullName}" n'est pas arrivé(e) à l'heure prévue.`,
      },
      {
        trigger: entry.incidentReported,
        type: 'REGISTER_INCIDENT_UNRESOLVED',
        title: 'Incident signalé',
        message: `Un incident a été signalé pour "${entry.fullName}".`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          resourceType: 'ENTRY_LOG',
          resourceId: entry.id,
          type: check.type,
        },
      });
      if (alreadyNotified) continue;

      await this.notificationsService.createForRole('DIRECTOR', {
        type: check.type,
        resourceType: 'ENTRY_LOG',
        resourceId: entry.id,
        title: check.title,
        message: check.message,
      });
    }
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  private assertNoPendingValidation(entry: {
    validationStatus: ValidationStatus | null;
  }) {
    if (entry.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour cet enregistrement.',
      );
    }
  }

  private assertNotArchived(entry: { status: EntryStatus }) {
    if (entry.status === 'ARCHIVEE') {
      throw new ConflictException(
        'Cet enregistrement est archivé et ne peut plus être modifié.',
      );
    }
  }

  private validateDates(input: {
    arrivalDateTime?: string;
    expectedDepartureDateTime?: string;
    actualDepartureDateTime?: string;
  }) {
    const arrival = input.arrivalDateTime
      ? new Date(input.arrivalDateTime)
      : null;
    const expected = input.expectedDepartureDateTime
      ? new Date(input.expectedDepartureDateTime)
      : null;
    const actual = input.actualDepartureDateTime
      ? new Date(input.actualDepartureDateTime)
      : null;

    if (arrival && expected && expected < arrival) {
      throw new BadRequestException(
        "La date de départ prévue ne peut pas précéder la date d'arrivée.",
      );
    }
    if (arrival && actual && actual < arrival) {
      throw new BadRequestException(
        "La date de sortie ne peut pas précéder la date d'arrivée.",
      );
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateEntryLogDto, userId: string) {
    this.validateDates(dto);

    const isImmediate = IMMEDIATE_ENTRY_TYPES.includes(dto.entryType);
    const status: EntryStatus = isImmediate ? 'PRESENT' : 'PREVUE';
    const arrivalDateTime = dto.arrivalDateTime
      ? new Date(dto.arrivalDateTime)
      : isImmediate
        ? new Date()
        : undefined;

    const created = await this.prisma.entryLog.create({
      data: {
        entryType: dto.entryType,
        visitorCategory: dto.visitorCategory,
        fullName: dto.fullName,
        organization: dto.organization,
        phone: dto.phone,
        email: dto.email,
        identityDocumentType: dto.identityDocumentType,
        identityDocumentNumber: dto.identityDocumentNumber,
        purpose: dto.purpose,
        personVisited: dto.personVisited,
        personVisitedUserId: dto.personVisitedUserId,
        spaceId: dto.spaceId,
        arrivalDateTime,
        expectedDepartureDateTime: dto.expectedDepartureDateTime
          ? new Date(dto.expectedDepartureDateTime)
          : undefined,
        accessBadgeNumber: dto.accessBadgeNumber,
        vehicleRegistration: dto.vehicleRegistration,
        accompanyingPersonsCount: dto.accompanyingPersonsCount,
        authorizedBy: dto.authorizedBy,
        authorizedByUserId: dto.authorizedByUserId,
        notes: dto.notes,
        recordedById: userId,
        status,
      },
    });

    return this.withComputedFields(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.EntryLogWhereInput = {
      ...(filters.entryType !== undefined
        ? { entryType: filters.entryType }
        : {}),
      ...(filters.visitorCategory !== undefined
        ? { visitorCategory: filters.visitorCategory }
        : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.organization
        ? {
            organization: {
              contains: filters.organization,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.personVisited
        ? {
            personVisited: {
              contains: filters.personVisited,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
      ...(filters.incidentReported !== undefined
        ? { incidentReported: filters.incidentReported }
        : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
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
                fullName: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                organization: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                phone: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                purpose: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                personVisited: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                vehicleRegistration: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                accessBadgeNumber: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const entries = await this.prisma.entryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const computed = entries.map((e) => this.withComputedFields(e));
    await Promise.all(computed.map((e) => this.notifyOperationalAlertsOnce(e)));

    let result = computed;
    if (filters.currentlyPresent)
      result = result.filter((e) => e.isCurrentlyPresent);
    if (filters.expectedVisit) result = result.filter((e) => e.isVisitExpected);
    if (filters.overduePresence)
      result = result.filter((e) => e.isExpectedDepartureOverdue);

    // Masked for list views (§20) — full value only in findOne().
    return result
      .map((e) => ({
        ...e,
        identityDocumentNumber: this.maskIdentityDocumentNumber(
          e.identityDocumentNumber,
        ),
      }))
      .sort((a, b) => this.urgencyRank(a) - this.urgencyRank(b));
  }

  private urgencyRank(e: EntryLogWithDerived): number {
    if (e.status === 'ARCHIVEE') return 1000;
    if (e.isExpectedDepartureOverdue) return 0;
    if (e.isCurrentlyPresent) return 1;
    if (e.isVisitExpected) return 2;
    return 3;
  }

  async currentPresence() {
    const all = await this.findAll({});
    return all.filter((e) => e.isCurrentlyPresent);
  }

  async expectedVisits() {
    const all = await this.findAll({});
    return all.filter((e) => e.isVisitExpected);
  }

  async findOne(id: string) {
    const entry = await this.prisma.entryLog.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        space: { select: { id: true, name: true } },
        personVisitedUser: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        authorizedByUser: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        recordedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        incident: { select: { id: true, title: true, status: true } },
      },
    });
    if (!entry) throw new NotFoundException('Entry log not found');
    return this.withComputedFields(entry);
  }

  private async findRaw(id: string) {
    const entry = await this.prisma.entryLog.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Entry log not found');
    return entry;
  }

  async update(id: string, userId: string, dto: UpdateEntryLogDto) {
    const existing = await this.findRaw(id);
    this.assertNotArchived(existing);
    this.validateDates({
      arrivalDateTime:
        dto.arrivalDateTime ?? existing.arrivalDateTime?.toISOString(),
      expectedDepartureDateTime:
        dto.expectedDepartureDateTime ??
        existing.expectedDepartureDateTime?.toISOString(),
      actualDepartureDateTime:
        dto.actualDepartureDateTime ??
        existing.actualDepartureDateTime?.toISOString(),
    });

    // Correcting an already-recorded checkout is sensitive — normal
    // checkout goes through checkOut(), not this generic update.
    const isCheckoutCorrection =
      dto.actualDepartureDateTime !== undefined &&
      existing.actualDepartureDateTime !== null;
    if (isCheckoutCorrection) {
      this.assertNoPendingValidation(existing);
      return this.submitPendingOperation(
        existing,
        userId,
        'MANUAL_CHECKOUT_OVERRIDE',
        {
          actualDepartureDateTime: dto.actualDepartureDateTime,
        },
      );
    }

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: {
        ...(dto.entryType !== undefined ? { entryType: dto.entryType } : {}),
        ...(dto.visitorCategory !== undefined
          ? { visitorCategory: dto.visitorCategory }
          : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.organization !== undefined
          ? { organization: dto.organization }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.identityDocumentType !== undefined
          ? { identityDocumentType: dto.identityDocumentType }
          : {}),
        ...(dto.identityDocumentNumber !== undefined
          ? { identityDocumentNumber: dto.identityDocumentNumber }
          : {}),
        ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
        ...(dto.personVisited !== undefined
          ? { personVisited: dto.personVisited }
          : {}),
        ...(dto.personVisitedUserId !== undefined
          ? { personVisitedUserId: dto.personVisitedUserId }
          : {}),
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        ...(dto.arrivalDateTime !== undefined
          ? { arrivalDateTime: new Date(dto.arrivalDateTime) }
          : {}),
        ...(dto.expectedDepartureDateTime !== undefined
          ? {
              expectedDepartureDateTime: new Date(
                dto.expectedDepartureDateTime,
              ),
            }
          : {}),
        ...(dto.accessBadgeNumber !== undefined
          ? { accessBadgeNumber: dto.accessBadgeNumber }
          : {}),
        ...(dto.vehicleRegistration !== undefined
          ? { vehicleRegistration: dto.vehicleRegistration }
          : {}),
        ...(dto.accompanyingPersonsCount !== undefined
          ? { accompanyingPersonsCount: dto.accompanyingPersonsCount }
          : {}),
        ...(dto.authorizedBy !== undefined
          ? { authorizedBy: dto.authorizedBy }
          : {}),
        ...(dto.authorizedByUserId !== undefined
          ? { authorizedByUserId: dto.authorizedByUserId }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.withComputedFields(updated);
  }

  // ─── State transitions ──────────────────────────────────────────────────────

  async checkIn(id: string, userId: string, dto: CheckInEntryDto) {
    const entry = await this.findRaw(id);
    this.assertNotArchived(entry);
    if (entry.status === 'PRESENT') {
      throw new ConflictException(
        'Cette personne est déjà enregistrée comme présente.',
      );
    }
    if (entry.status === 'SORTI') {
      throw new ConflictException('Cette visite est déjà terminée.');
    }
    if (entry.status === 'ANNULEE') {
      throw new ConflictException('Cette visite a été annulée.');
    }
    this.assertNoPendingValidation(entry);

    const arrivalDateTime = dto.arrivalDateTime
      ? new Date(dto.arrivalDateTime)
      : new Date();
    const isOverride = entry.status === 'REFUSEE';
    const isAfterHours = this.isOutsideBusinessHours(arrivalDateTime);

    if (isOverride) {
      return this.submitPendingOperation(entry, userId, 'ACCESS_OVERRIDE', {
        arrivalDateTime: arrivalDateTime.toISOString(),
      });
    }
    if (isAfterHours) {
      return this.submitPendingOperation(entry, userId, 'AFTER_HOURS_ACCESS', {
        arrivalDateTime: arrivalDateTime.toISOString(),
      });
    }

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: {
        status: 'PRESENT',
        arrivalDateTime,
        accessBadgeNumber: dto.accessBadgeNumber ?? entry.accessBadgeNumber,
        vehicleRegistration:
          dto.vehicleRegistration ?? entry.vehicleRegistration,
        accompanyingPersonsCount:
          dto.accompanyingPersonsCount ?? entry.accompanyingPersonsCount,
      },
    });

    return this.withComputedFields(updated);
  }

  async checkOut(id: string, userId: string, dto: CheckOutEntryDto) {
    const entry = await this.findRaw(id);
    this.assertNotArchived(entry);
    if (entry.status === 'SORTI') {
      throw new ConflictException('Cette personne est déjà sortie.');
    }
    if (entry.status !== 'PRESENT') {
      throw new ConflictException(
        "Cette personne n'est pas actuellement présente.",
      );
    }
    this.assertNoPendingValidation(entry);

    const actualDepartureDateTime = dto.actualDepartureDateTime
      ? new Date(dto.actualDepartureDateTime)
      : new Date();
    if (
      entry.arrivalDateTime &&
      actualDepartureDateTime < entry.arrivalDateTime
    ) {
      throw new BadRequestException(
        "La date de sortie ne peut pas précéder la date d'arrivée.",
      );
    }

    if (entry.entryType === 'SORTIE_EXCEPTIONNELLE') {
      return this.submitPendingOperation(entry, userId, 'EXCEPTIONAL_EXIT', {
        actualDepartureDateTime: actualDepartureDateTime.toISOString(),
      });
    }

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: { status: 'SORTI', actualDepartureDateTime },
    });

    return this.withComputedFields(updated);
  }

  async cancel(id: string, dto: CancelEntryDto) {
    const entry = await this.findRaw(id);
    this.assertNotArchived(entry);
    if (entry.status !== 'PREVUE') {
      throw new ConflictException('Seule une visite prévue peut être annulée.');
    }
    this.assertNoPendingValidation(entry);

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: {
        status: 'ANNULEE',
        notes: dto.reason
          ? `${entry.notes ? `${entry.notes}\n` : ''}Annulée : ${dto.reason}`
          : entry.notes,
      },
    });

    return this.withComputedFields(updated);
  }

  async refuse(id: string, dto: RefuseEntryDto) {
    const entry = await this.findRaw(id);
    this.assertNotArchived(entry);
    if (entry.status === 'PRESENT' || entry.status === 'SORTI') {
      throw new ConflictException(
        'Cette personne a déjà été admise ; utilisez la sortie ou un signalement.',
      );
    }
    this.assertNoPendingValidation(entry);

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: {
        status: 'REFUSEE',
        notes: `${entry.notes ? `${entry.notes}\n` : ''}Accès refusé : ${dto.reason}`,
      },
    });

    return this.withComputedFields(updated);
  }

  // ─── Archive (smart: direct when terminal, validation-gated otherwise) ─────

  async archive(id: string, userId: string) {
    const entry = await this.findRaw(id);
    this.assertNotArchived(entry);
    this.assertNoPendingValidation(entry);

    const terminalStates: EntryStatus[] = ['SORTI', 'ANNULEE', 'REFUSEE'];
    if (terminalStates.includes(entry.status)) {
      const updated = await this.prisma.entryLog.update({
        where: { id },
        data: { status: 'ARCHIVEE', archivedAt: new Date() },
      });
      return this.withComputedFields(updated);
    }

    return this.submitPendingOperation(entry, userId, 'RECORD_ARCHIVE', {});
  }

  private async submitPendingOperation(
    entry: EntryLog,
    userId: string,
    action: EntryValidationAction,
    payload: EntryActionPayload,
  ) {
    this.assertNoPendingValidation(entry);

    await this.validationsService.create({
      resourceType: 'ENTRY_LOG',
      resourceId: entry.id,
      submittedById: userId,
      previousStatus: entry.validationStatus,
    });

    const updated = await this.prisma.entryLog.update({
      where: { id: entry.id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: action,
        pendingValidationPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'ENTRY_LOG',
      resourceId: entry.id,
      title: 'Validation requise',
      message: `Une opération sensible sur "${entry.fullName}" nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  // ─── Validation workflow ────────────────────────────────────────────────────

  async submitValidation(id: string) {
    const entry = await this.findRaw(id);
    if (
      entry.validationStatus !== 'PENDING_VALIDATION' ||
      !entry.pendingValidationAction
    ) {
      throw new ConflictException(
        "Aucune opération sensible n'est en attente pour cet enregistrement.",
      );
    }
    return this.withComputedFields(entry);
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const entry = await this.findRaw(id);
    if (!entry.pendingValidationAction) {
      throw new ConflictException(
        'Aucune action en attente pour cet enregistrement.',
      );
    }

    const validation = await this.validationsService.approve({
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = entry.pendingValidationAction;
    const payload = (entry.pendingValidationPayload ??
      {}) as unknown as EntryActionPayload;

    const data: Prisma.EntryLogUpdateInput = {
      validationStatus: 'APPROVED',
      pendingValidationAction: null,
      pendingValidationPayload: Prisma.JsonNull,
    };

    switch (action) {
      case 'ACCESS_OVERRIDE':
      case 'AFTER_HOURS_ACCESS':
        data.status = 'PRESENT';
        data.arrivalDateTime = payload.arrivalDateTime
          ? new Date(payload.arrivalDateTime)
          : new Date();
        break;
      case 'EXCEPTIONAL_EXIT':
        data.status = 'SORTI';
        data.actualDepartureDateTime = payload.actualDepartureDateTime
          ? new Date(payload.actualDepartureDateTime)
          : new Date();
        break;
      case 'MANUAL_CHECKOUT_OVERRIDE':
        data.actualDepartureDateTime = payload.actualDepartureDateTime
          ? new Date(payload.actualDepartureDateTime)
          : new Date();
        break;
      case 'RECORD_ARCHIVE':
        data.status = 'ARCHIVEE';
        data.archivedAt = new Date();
        break;
      default:
        break;
    }

    const updated = await this.prisma.entryLog.update({ where: { id }, data });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      title: 'Validation approuvée',
      message: `L'opération sur "${entry.fullName}" a été approuvée.`,
    });

    return this.withComputedFields(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const entry = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      title: 'Validation refusée',
      message: `L'opération sur "${entry.fullName}" a été refusée.`,
    });

    return this.withComputedFields(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const entry = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.entryLog.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'ENTRY_LOG',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour l'enregistrement de "${entry.fullName}".`,
    });

    return this.withComputedFields(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('ENTRY_LOG', id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  async uploadDocument(
    id: string,
    userId: string,
    file: Express.Multer.File,
    documentType?: string,
    label?: string,
  ) {
    await this.findRaw(id);
    const fileKey = await this.uploadService.upload(file, `entry-logs/${id}`);
    return this.prisma.entryLogDocument.create({
      data: {
        entryLogId: id,
        fileKey,
        fileMime: file.mimetype,
        label,
        documentType: documentType as never,
        uploadedById: userId,
      },
    });
  }

  async listDocuments(id: string) {
    await this.findRaw(id);
    return this.prisma.entryLogDocument.findMany({
      where: { entryLogId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.entryLogDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.entryLogId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.entryLogDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.entryLogId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.entryLogDocument.delete({ where: { id: documentId } });
  }
}
