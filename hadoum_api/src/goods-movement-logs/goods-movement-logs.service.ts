import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GoodsMovementLog,
  GoodsMovementStatus,
  GoodsMovementType,
  GoodsValidationAction,
  Prisma,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGoodsMovementDto } from './dto/create-goods-movement.dto';
import { UpdateGoodsMovementDto } from './dto/update-goods-movement.dto';
import { RecordGoodsReturnDto } from './dto/record-goods-return.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import {
  ASSET_HIGH_VALUE_EXIT_THRESHOLD_XOF,
  GOODS_EXIT_LARGE_QUANTITY_THRESHOLD,
  GOODS_EXIT_LARGE_VALUE_THRESHOLD_XOF,
} from './goods-movement-logs.constants';

const CHECKOUT_TYPES: GoodsMovementType[] = [
  'PRET_EQUIPEMENT',
  'SORTIE_TEMPORAIRE',
];
const CONTROLLED_EXIT_TYPES: GoodsMovementType[] = [
  'SORTIE_MARCHANDISE',
  'DON_DISTRIBUE',
  'REFORME',
];

interface FindAllFilters {
  search?: string;
  movementType?: GoodsMovementType;
  status?: GoodsMovementStatus;
  stockItemId?: string;
  inventoryAssetId?: string;
  source?: string;
  destination?: string;
  overdueReturn?: boolean;
  validationStatus?: ValidationStatus;
  dateFrom?: string;
  dateTo?: string;
}

type GoodsMovementWithDerived = GoodsMovementLog & {
  isOverdueReturn: boolean;
};

@Injectable()
export class GoodsMovementLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Derived fields ─────────────────────────────────────────────────────────

  private withComputedFields<T extends GoodsMovementLog>(
    movement: T,
  ): T & GoodsMovementWithDerived {
    const now = new Date();
    const isOverdueReturn =
      movement.status === 'SORTI' &&
      movement.expectedReturnDate !== null &&
      movement.expectedReturnDate < now;

    return { ...movement, isOverdueReturn };
  }

  private async notifyGoodsAlertsOnce(movement: GoodsMovementWithDerived) {
    const checks: Array<{
      trigger: boolean;
      type: 'GOODS_RETURN_OVERDUE' | 'REGISTER_INCIDENT_UNRESOLVED';
      title: string;
      message: string;
    }> = [
      {
        trigger: movement.isOverdueReturn,
        type: 'GOODS_RETURN_OVERDUE',
        title: 'Retour de matériel en retard',
        message: `Le retour attendu pour "${movement.description}" est en retard.`,
      },
      {
        trigger: movement.incidentReported,
        type: 'REGISTER_INCIDENT_UNRESOLVED',
        title: 'Incident signalé',
        message: `Un incident a été signalé pour le mouvement "${movement.description}".`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          resourceType: 'GOODS_MOVEMENT_LOG',
          resourceId: movement.id,
          type: check.type,
        },
      });
      if (alreadyNotified) continue;

      await this.notificationsService.createForRole('DIRECTOR', {
        type: check.type,
        resourceType: 'GOODS_MOVEMENT_LOG',
        resourceId: movement.id,
        title: check.title,
        message: check.message,
      });
    }
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  private assertNotArchived(movement: { status: GoodsMovementStatus }) {
    if (movement.status === 'ARCHIVE') {
      throw new ConflictException(
        'Cet enregistrement est archivé et ne peut plus être modifié.',
      );
    }
  }

  private async determineSensitiveAction(
    dto: CreateGoodsMovementDto,
    isCheckoutType: boolean,
  ): Promise<GoodsValidationAction | null> {
    if (isCheckoutType) {
      if (dto.inventoryAssetId) {
        const asset = await this.prisma.inventoryAsset.findUnique({
          where: { id: dto.inventoryAssetId },
        });
        if (!asset) throw new NotFoundException('Inventory asset not found');
        if (
          asset.acquisitionCost != null &&
          asset.acquisitionCost > ASSET_HIGH_VALUE_EXIT_THRESHOLD_XOF
        ) {
          return 'HIGH_VALUE_ASSET_EXIT';
        }
      }
      return 'TEMPORARY_ASSET_EXIT';
    }

    if (CONTROLLED_EXIT_TYPES.includes(dto.movementType)) {
      let value: number | null = null;
      if (dto.stockItemId && dto.quantity) {
        const item = await this.prisma.stockItem.findUnique({
          where: { id: dto.stockItemId },
        });
        if (!item) throw new NotFoundException('Stock item not found');
        value = item.unitCost != null ? item.unitCost * dto.quantity : null;
      }
      const largeQuantity =
        dto.quantity !== undefined &&
        dto.quantity > GOODS_EXIT_LARGE_QUANTITY_THRESHOLD;
      const largeValue =
        value !== null && value > GOODS_EXIT_LARGE_VALUE_THRESHOLD_XOF;
      if (largeQuantity || largeValue) return 'CONTROLLED_GOODS_EXIT';
    }

    return null;
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateGoodsMovementDto, userId: string) {
    const isCheckoutType = CHECKOUT_TYPES.includes(dto.movementType);

    if (isCheckoutType && !dto.expectedReturnDate) {
      throw new BadRequestException(
        'Une date de retour prévue est requise pour une sortie temporaire.',
      );
    }

    if (dto.inventoryAssetId && isCheckoutType) {
      const openExit = await this.prisma.goodsMovementLog.findFirst({
        where: { inventoryAssetId: dto.inventoryAssetId, status: 'SORTI' },
      });
      if (openExit) {
        throw new ConflictException(
          'Ce bien est déjà sorti et non encore retourné.',
        );
      }
    }

    const action = await this.determineSensitiveAction(dto, isCheckoutType);
    const status: GoodsMovementStatus = action
      ? 'EN_ATTENTE_VALIDATION'
      : isCheckoutType
        ? 'SORTI'
        : 'ENREGISTRE';

    const created = await this.prisma.goodsMovementLog.create({
      data: {
        movementType: dto.movementType,
        description: dto.description,
        itemReference: dto.itemReference,
        stockItemId: dto.stockItemId,
        inventoryAssetId: dto.inventoryAssetId,
        quantity: dto.quantity,
        unit: dto.unit,
        source: dto.source,
        destination: dto.destination,
        personInCharge: dto.personInCharge,
        vehicleRegistration: dto.vehicleRegistration,
        deliveryNoteNumber: dto.deliveryNoteNumber,
        authorizationReference: dto.authorizationReference,
        reason: dto.reason,
        movementDateTime: dto.movementDateTime
          ? new Date(dto.movementDateTime)
          : undefined,
        expectedReturnDate: dto.expectedReturnDate
          ? new Date(dto.expectedReturnDate)
          : undefined,
        authorizedByUserId: dto.authorizedByUserId,
        notes: dto.notes,
        recordedById: userId,
        status,
        validationStatus: action ? 'PENDING_VALIDATION' : undefined,
        pendingValidationAction: action ?? undefined,
      },
    });

    if (action) {
      await this.validationsService.create({
        resourceType: 'GOODS_MOVEMENT_LOG',
        resourceId: created.id,
        submittedById: userId,
      });
      await this.notificationsService.createForRole('SUPERVISOR', {
        type: 'VALIDATION_SUBMITTED',
        resourceType: 'GOODS_MOVEMENT_LOG',
        resourceId: created.id,
        title: 'Validation requise',
        message: `Le mouvement "${created.description}" nécessite une validation.`,
      });
    }

    return this.withComputedFields(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.GoodsMovementLogWhereInput = {
      ...(filters.movementType !== undefined
        ? { movementType: filters.movementType }
        : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.stockItemId ? { stockItemId: filters.stockItemId } : {}),
      ...(filters.inventoryAssetId
        ? { inventoryAssetId: filters.inventoryAssetId }
        : {}),
      ...(filters.source
        ? {
            source: {
              contains: filters.source,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.destination
        ? {
            destination: {
              contains: filters.destination,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            movementDateTime: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                description: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                itemReference: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                personInCharge: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                deliveryNoteNumber: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const movements = await this.prisma.goodsMovementLog.findMany({
      where,
      orderBy: { movementDateTime: 'desc' },
    });

    const computed = movements.map((m) => this.withComputedFields(m));
    await Promise.all(computed.map((m) => this.notifyGoodsAlertsOnce(m)));

    let result = computed;
    if (filters.overdueReturn) result = result.filter((m) => m.isOverdueReturn);

    return result.sort((a, b) => this.urgencyRank(a) - this.urgencyRank(b));
  }

  private urgencyRank(m: GoodsMovementWithDerived): number {
    if (m.status === 'ARCHIVE') return 1000;
    if (m.isOverdueReturn) return 0;
    if (m.status === 'EN_ATTENTE_VALIDATION') return 1;
    if (m.status === 'SORTI') return 2;
    return 3;
  }

  async findOne(id: string) {
    const movement = await this.prisma.goodsMovementLog.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        stockItem: { select: { id: true, name: true, unit: true } },
        inventoryAsset: { select: { id: true, name: true, assetCode: true } },
        recordedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        authorizedByUser: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        incident: { select: { id: true, title: true, status: true } },
      },
    });
    if (!movement) throw new NotFoundException('Goods movement not found');
    return this.withComputedFields(movement);
  }

  private async findRaw(id: string) {
    const movement = await this.prisma.goodsMovementLog.findUnique({
      where: { id },
    });
    if (!movement) throw new NotFoundException('Goods movement not found');
    return movement;
  }

  async update(id: string, dto: UpdateGoodsMovementDto) {
    const existing = await this.findRaw(id);
    this.assertNotArchived(existing);

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.itemReference !== undefined
          ? { itemReference: dto.itemReference }
          : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.destination !== undefined
          ? { destination: dto.destination }
          : {}),
        ...(dto.personInCharge !== undefined
          ? { personInCharge: dto.personInCharge }
          : {}),
        ...(dto.vehicleRegistration !== undefined
          ? { vehicleRegistration: dto.vehicleRegistration }
          : {}),
        ...(dto.deliveryNoteNumber !== undefined
          ? { deliveryNoteNumber: dto.deliveryNoteNumber }
          : {}),
        ...(dto.authorizationReference !== undefined
          ? { authorizationReference: dto.authorizationReference }
          : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.expectedReturnDate !== undefined
          ? { expectedReturnDate: new Date(dto.expectedReturnDate) }
          : {}),
        ...(dto.authorizedByUserId !== undefined
          ? { authorizedByUserId: dto.authorizedByUserId }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.withComputedFields(updated);
  }

  async recordReturn(id: string, dto: RecordGoodsReturnDto) {
    const movement = await this.findRaw(id);
    this.assertNotArchived(movement);
    if (movement.status === 'RETOURNE') {
      throw new ConflictException('Ce bien a déjà été retourné.');
    }
    if (movement.status !== 'SORTI') {
      throw new ConflictException(
        "Ce mouvement n'est pas en attente de retour.",
      );
    }

    const actualReturnDate = dto.actualReturnDate
      ? new Date(dto.actualReturnDate)
      : new Date();
    if (actualReturnDate < movement.movementDateTime) {
      throw new BadRequestException(
        'La date de retour ne peut pas précéder la date de sortie.',
      );
    }

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data: {
        status: 'RETOURNE',
        actualReturnDate,
        notes: dto.notes
          ? `${movement.notes ? `${movement.notes}\n` : ''}Retour : ${dto.notes}`
          : movement.notes,
      },
    });

    return this.withComputedFields(updated);
  }

  async archive(id: string, userId: string) {
    const movement = await this.findRaw(id);
    this.assertNotArchived(movement);
    if (movement.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour cet enregistrement.',
      );
    }

    const terminalStates: GoodsMovementStatus[] = [
      'ENREGISTRE',
      'RETOURNE',
      'ANNULE',
    ];
    if (terminalStates.includes(movement.status)) {
      const updated = await this.prisma.goodsMovementLog.update({
        where: { id },
        data: { status: 'ARCHIVE', archivedAt: new Date() },
      });
      return this.withComputedFields(updated);
    }

    await this.validationsService.create({
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      submittedById: userId,
      previousStatus: movement.validationStatus,
    });

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'RECORD_ARCHIVE',
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      title: 'Validation requise',
      message: `L'archivage de "${movement.description}" nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  // ─── Validation workflow ────────────────────────────────────────────────────

  async submitValidation(id: string) {
    const movement = await this.findRaw(id);
    if (
      movement.validationStatus !== 'PENDING_VALIDATION' ||
      !movement.pendingValidationAction
    ) {
      throw new ConflictException(
        "Aucune opération sensible n'est en attente pour cet enregistrement.",
      );
    }
    return this.withComputedFields(movement);
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const movement = await this.findRaw(id);
    if (!movement.pendingValidationAction) {
      throw new ConflictException(
        'Aucune action en attente pour cet enregistrement.',
      );
    }

    const validation = await this.validationsService.approve({
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = movement.pendingValidationAction;
    const data: Prisma.GoodsMovementLogUpdateInput = {
      validationStatus: 'APPROVED',
      pendingValidationAction: null,
    };

    switch (action) {
      case 'HIGH_VALUE_ASSET_EXIT':
      case 'TEMPORARY_ASSET_EXIT':
        data.status = 'SORTI';
        break;
      case 'CONTROLLED_GOODS_EXIT':
        data.status = 'ENREGISTRE';
        break;
      case 'RECORD_ARCHIVE':
        data.status = 'ARCHIVE';
        data.archivedAt = new Date();
        break;
      default:
        break;
    }

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      title: 'Validation approuvée',
      message: `Le mouvement "${movement.description}" a été approuvé.`,
    });

    return this.withComputedFields(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const movement = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data: {
        validationStatus: 'REJECTED',
        pendingValidationAction: null,
        status:
          movement.status === 'EN_ATTENTE_VALIDATION'
            ? 'ANNULE'
            : movement.status,
      },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      title: 'Validation refusée',
      message: `Le mouvement "${movement.description}" a été refusé.`,
    });

    return this.withComputedFields(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const movement = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.goodsMovementLog.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'GOODS_MOVEMENT_LOG',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour "${movement.description}".`,
    });

    return this.withComputedFields(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('GOODS_MOVEMENT_LOG', id);
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
    const fileKey = await this.uploadService.upload(
      file,
      `goods-movement-logs/${id}`,
    );
    return this.prisma.goodsMovementDocument.create({
      data: {
        movementId: id,
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
    return this.prisma.goodsMovementDocument.findMany({
      where: { movementId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.goodsMovementDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.movementId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.goodsMovementDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.movementId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.goodsMovementDocument.delete({
      where: { id: documentId },
    });
  }
}
