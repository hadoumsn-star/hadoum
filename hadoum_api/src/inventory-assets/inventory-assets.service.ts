import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetCondition,
  AssetStatus,
  AssetValidationAction,
  InventoryAsset,
  Prisma,
  StockCategory,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInventoryAssetDto } from './dto/create-inventory-asset.dto';
import { UpdateInventoryAssetDto } from './dto/update-inventory-asset.dto';
import { AssignInventoryAssetDto } from './dto/assign-inventory-asset.dto';
import { TransferInventoryAssetDto } from './dto/transfer-inventory-asset.dto';
import { RequestAssetDisposalDto } from './dto/request-asset-disposal.dto';
import { RequestArchiveDto } from './dto/request-archive.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import {
  ASSET_HIGH_VALUE_THRESHOLD_XOF,
  ASSET_INVENTORY_CHECK_WARNING_DAYS,
  ASSET_WARRANTY_WARNING_DAYS,
} from './inventory-assets.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

const DISPOSAL_STATUS_MAP: Record<
  'PERTE' | 'VOL' | 'CASSE' | 'REFORME',
  AssetStatus
> = {
  PERTE: 'PERDU',
  VOL: 'VOLE',
  CASSE: 'CASSE',
  REFORME: 'REFORME',
};

interface AssetActionPayload {
  spaceId?: string;
  assignedTo?: string;
  assignedToUserId?: string;
  disposalType?: 'PERTE' | 'VOL' | 'CASSE' | 'REFORME';
  reason?: string;
}

interface FindAllFilters {
  search?: string;
  category?: StockCategory;
  condition?: AssetCondition;
  status?: AssetStatus;
  spaceId?: string;
  assignedTo?: string;
  warrantyExpiringSoon?: boolean;
  inventoryCheckDue?: boolean;
  archived?: boolean;
  validationStatus?: ValidationStatus;
}

type AssetWithDerived = InventoryAsset & {
  isWarrantyExpiringSoon: boolean;
  isInventoryCheckDue: boolean;
  isInventoryCheckOverdue: boolean;
  daysUntilWarrantyEnd: number | null;
  daysUntilInventoryCheck: number | null;
};

@Injectable()
export class InventoryAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Derived / computed fields ────────────────────────────────────────────

  private daysUntil(target: Date, from: Date): number {
    return Math.ceil((target.getTime() - from.getTime()) / DAY_MS);
  }

  private withComputedFields<T extends InventoryAsset>(
    asset: T,
  ): T & AssetWithDerived {
    const now = new Date();
    const active = asset.status !== 'ARCHIVE';

    const daysUntilWarrantyEnd = asset.warrantyEndDate
      ? this.daysUntil(asset.warrantyEndDate, now)
      : null;
    const isWarrantyExpiringSoon =
      active &&
      daysUntilWarrantyEnd !== null &&
      daysUntilWarrantyEnd >= 0 &&
      daysUntilWarrantyEnd <= ASSET_WARRANTY_WARNING_DAYS;

    const daysUntilInventoryCheck = asset.nextInventoryDate
      ? this.daysUntil(asset.nextInventoryDate, now)
      : null;
    const isInventoryCheckOverdue =
      active && daysUntilInventoryCheck !== null && daysUntilInventoryCheck < 0;
    const isInventoryCheckDue =
      active &&
      !isInventoryCheckOverdue &&
      daysUntilInventoryCheck !== null &&
      daysUntilInventoryCheck <= ASSET_INVENTORY_CHECK_WARNING_DAYS;

    return {
      ...asset,
      isWarrantyExpiringSoon,
      isInventoryCheckDue,
      isInventoryCheckOverdue,
      daysUntilWarrantyEnd,
      daysUntilInventoryCheck,
    };
  }

  private async notifyAssetAlertsOnce(asset: AssetWithDerived) {
    const checks: Array<{
      trigger: boolean;
      type: 'ASSET_WARRANTY_EXPIRING_SOON' | 'ASSET_INVENTORY_DUE';
      title: string;
      message: string;
    }> = [
      {
        trigger: asset.isWarrantyExpiringSoon,
        type: 'ASSET_WARRANTY_EXPIRING_SOON',
        title: 'Garantie bientôt expirée',
        message: `La garantie du bien "${asset.name}" expire bientôt.`,
      },
      {
        trigger: asset.isInventoryCheckDue || asset.isInventoryCheckOverdue,
        type: 'ASSET_INVENTORY_DUE',
        title: 'Inventaire à réaliser',
        message: `Le bien "${asset.name}" doit être inventorié.`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          resourceType: 'INVENTORY_ASSET',
          resourceId: asset.id,
          type: check.type,
        },
      });
      if (alreadyNotified) continue;

      await this.notificationsService.createForRole('DIRECTOR', {
        type: check.type,
        resourceType: 'INVENTORY_ASSET',
        resourceId: asset.id,
        title: check.title,
        message: check.message,
      });
    }
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  private assertNoPendingValidation(asset: {
    validationStatus: ValidationStatus | null;
  }) {
    if (asset.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour ce bien.',
      );
    }
  }

  private assertNotArchived(asset: { status: AssetStatus }) {
    if (asset.status === 'ARCHIVE') {
      throw new ConflictException('Ce bien est archivé.');
    }
  }

  private validateDates(input: {
    acquisitionDate?: string;
    warrantyEndDate?: string;
    lastInventoryDate?: string;
    nextInventoryDate?: string;
  }) {
    const acquisition = input.acquisitionDate
      ? new Date(input.acquisitionDate)
      : null;
    const warranty = input.warrantyEndDate
      ? new Date(input.warrantyEndDate)
      : null;
    const last = input.lastInventoryDate
      ? new Date(input.lastInventoryDate)
      : null;
    const next = input.nextInventoryDate
      ? new Date(input.nextInventoryDate)
      : null;

    if (acquisition && warranty && warranty < acquisition) {
      throw new BadRequestException(
        "La date de fin de garantie ne peut pas précéder la date d'acquisition.",
      );
    }
    if (last && next && next < last) {
      throw new BadRequestException(
        'La date du prochain inventaire ne peut pas précéder la date du dernier inventaire.',
      );
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateInventoryAssetDto, userId: string) {
    this.validateDates(dto);

    const created = await this.prisma.inventoryAsset.create({
      data: {
        name: dto.name,
        assetCode: dto.assetCode,
        serialNumber: dto.serialNumber,
        category: dto.category,
        description: dto.description,
        brand: dto.brand,
        model: dto.model,
        acquisitionDate: dto.acquisitionDate
          ? new Date(dto.acquisitionDate)
          : undefined,
        acquisitionCost: dto.acquisitionCost,
        fundingSource: dto.fundingSource,
        donorName: dto.donorName,
        warrantyEndDate: dto.warrantyEndDate
          ? new Date(dto.warrantyEndDate)
          : undefined,
        condition: dto.condition,
        spaceId: dto.spaceId,
        assignedTo: dto.assignedTo,
        assignedToUserId: dto.assignedToUserId,
        status: dto.assignedTo ? 'AFFECTE' : undefined,
        lastInventoryDate: dto.lastInventoryDate
          ? new Date(dto.lastInventoryDate)
          : undefined,
        nextInventoryDate: dto.nextInventoryDate
          ? new Date(dto.nextInventoryDate)
          : undefined,
        notes: dto.notes,
        createdById: userId,
      },
    });

    return this.withComputedFields(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.InventoryAssetWhereInput = {
      ...(filters.archived
        ? { status: 'ARCHIVE' }
        : { status: { not: 'ARCHIVE' } }),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.category !== undefined ? { category: filters.category } : {}),
      ...(filters.condition !== undefined
        ? { condition: filters.condition }
        : {}),
      ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
      ...(filters.assignedTo
        ? {
            assignedTo: {
              contains: filters.assignedTo,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                name: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                assetCode: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                serialNumber: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                brand: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                model: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const assets = await this.prisma.inventoryAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const computed = assets.map((a) => this.withComputedFields(a));
    await Promise.all(computed.map((a) => this.notifyAssetAlertsOnce(a)));

    let result = computed;
    if (filters.warrantyExpiringSoon)
      result = result.filter((a) => a.isWarrantyExpiringSoon);
    if (filters.inventoryCheckDue)
      result = result.filter(
        (a) => a.isInventoryCheckDue || a.isInventoryCheckOverdue,
      );

    return result.sort((a, b) => this.urgencyRank(a) - this.urgencyRank(b));
  }

  private urgencyRank(a: AssetWithDerived): number {
    if (a.status === 'ARCHIVE') return 1000;
    if (a.isInventoryCheckOverdue) return 0;
    if (a.isInventoryCheckDue || a.isWarrantyExpiringSoon) return 1;
    return 2;
  }

  async findOne(id: string) {
    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        space: { select: { id: true, name: true } },
        assignedToUser: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        createdBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
    });
    if (!asset) throw new NotFoundException('Inventory asset not found');
    return this.withComputedFields(asset);
  }

  private async findRaw(id: string) {
    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id },
    });
    if (!asset) throw new NotFoundException('Inventory asset not found');
    return asset;
  }

  async update(id: string, dto: UpdateInventoryAssetDto) {
    const existing = await this.findRaw(id);
    this.validateDates({
      acquisitionDate:
        dto.acquisitionDate ?? existing.acquisitionDate?.toISOString(),
      warrantyEndDate:
        dto.warrantyEndDate ?? existing.warrantyEndDate?.toISOString(),
      lastInventoryDate:
        dto.lastInventoryDate ?? existing.lastInventoryDate?.toISOString(),
      nextInventoryDate:
        dto.nextInventoryDate ?? existing.nextInventoryDate?.toISOString(),
    });

    if (dto.status !== undefined) {
      const routineStates: AssetStatus[] = [
        'DISPONIBLE',
        'AFFECTE',
        'EN_MAINTENANCE',
      ];
      if (
        !routineStates.includes(existing.status) ||
        !routineStates.includes(dto.status)
      ) {
        throw new ConflictException(
          'Ce changement de statut doit passer par le circuit de validation approprié (transfert, réforme ou archivage).',
        );
      }
    }

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.assetCode !== undefined ? { assetCode: dto.assetCode } : {}),
        ...(dto.serialNumber !== undefined
          ? { serialNumber: dto.serialNumber }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.acquisitionDate !== undefined
          ? { acquisitionDate: new Date(dto.acquisitionDate) }
          : {}),
        ...(dto.acquisitionCost !== undefined
          ? { acquisitionCost: dto.acquisitionCost }
          : {}),
        ...(dto.fundingSource !== undefined
          ? { fundingSource: dto.fundingSource }
          : {}),
        ...(dto.donorName !== undefined ? { donorName: dto.donorName } : {}),
        ...(dto.warrantyEndDate !== undefined
          ? { warrantyEndDate: new Date(dto.warrantyEndDate) }
          : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        ...(dto.lastInventoryDate !== undefined
          ? { lastInventoryDate: new Date(dto.lastInventoryDate) }
          : {}),
        ...(dto.nextInventoryDate !== undefined
          ? { nextInventoryDate: new Date(dto.nextInventoryDate) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    return this.withComputedFields(updated);
  }

  // ─── Routine actions ────────────────────────────────────────────────────────

  async assign(id: string, dto: AssignInventoryAssetDto) {
    const asset = await this.findRaw(id);
    this.assertNotArchived(asset);
    this.assertNoPendingValidation(asset);

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: {
        assignedTo: dto.assignedTo,
        assignedToUserId: dto.assignedToUserId,
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        status: 'AFFECTE',
      },
    });

    return this.withComputedFields(updated);
  }

  // Smart endpoint: applies directly when low-value, routes through
  // validation when the asset is high-value (per configured threshold).
  async transfer(id: string, userId: string, dto: TransferInventoryAssetDto) {
    const asset = await this.findRaw(id);
    this.assertNotArchived(asset);
    this.assertNoPendingValidation(asset);

    const sensitive =
      asset.acquisitionCost != null &&
      asset.acquisitionCost > ASSET_HIGH_VALUE_THRESHOLD_XOF;

    if (sensitive) {
      return this.submitPendingOperation(
        asset,
        userId,
        'ASSET_TRANSFER',
        dto.comment,
        {
          spaceId: dto.spaceId,
          assignedTo: dto.assignedTo,
          reason: dto.reason,
        },
      );
    }

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: {
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        ...(dto.assignedTo !== undefined ? { assignedTo: dto.assignedTo } : {}),
      },
    });

    return this.withComputedFields(updated);
  }

  async requestDisposal(
    id: string,
    userId: string,
    dto: RequestAssetDisposalDto,
  ) {
    const asset = await this.findRaw(id);
    this.assertNotArchived(asset);

    return this.submitPendingOperation(
      asset,
      userId,
      'ASSET_DISPOSAL',
      dto.comment,
      {
        disposalType: dto.disposalType,
        reason: dto.reason,
      },
    );
  }

  async requestArchive(id: string, userId: string, dto: RequestArchiveDto) {
    const asset = await this.findRaw(id);
    this.assertNotArchived(asset);

    return this.submitPendingOperation(
      asset,
      userId,
      'ASSET_ARCHIVE',
      dto.comment,
      {},
    );
  }

  private async submitPendingOperation(
    asset: InventoryAsset,
    userId: string,
    action: AssetValidationAction,
    comment: string | undefined,
    payload: AssetActionPayload,
  ) {
    this.assertNoPendingValidation(asset);

    await this.validationsService.create({
      resourceType: 'INVENTORY_ASSET',
      resourceId: asset.id,
      submittedById: userId,
      previousStatus: asset.validationStatus,
      comment,
    });

    const updated = await this.prisma.inventoryAsset.update({
      where: { id: asset.id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: action,
        pendingValidationPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'INVENTORY_ASSET',
      resourceId: asset.id,
      title: 'Validation requise',
      message: `Une opération sensible sur "${asset.name}" nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  // ─── Validation workflow ────────────────────────────────────────────────────

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const asset = await this.findRaw(id);
    if (!asset.pendingValidationAction) {
      throw new ConflictException('Aucune action en attente pour ce bien.');
    }

    const validation = await this.validationsService.approve({
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = asset.pendingValidationAction;
    const payload = (asset.pendingValidationPayload ??
      {}) as unknown as AssetActionPayload;

    const data: Prisma.InventoryAssetUpdateInput = {
      validationStatus: 'APPROVED',
      pendingValidationAction: null,
      pendingValidationPayload: Prisma.JsonNull,
    };

    switch (action) {
      case 'ASSET_TRANSFER':
        if (payload.spaceId !== undefined)
          data.space = payload.spaceId
            ? { connect: { id: payload.spaceId } }
            : { disconnect: true };
        if (payload.assignedTo !== undefined)
          data.assignedTo = payload.assignedTo;
        break;
      case 'ASSET_DISPOSAL':
        data.status = payload.disposalType
          ? DISPOSAL_STATUS_MAP[payload.disposalType]
          : 'REFORME';
        break;
      case 'ASSET_ARCHIVE':
        data.status = 'ARCHIVE';
        data.archivedAt = new Date();
        break;
      default:
        break;
    }

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      title: 'Validation approuvée',
      message: `La demande pour le bien "${asset.name}" a été approuvée.`,
    });

    return this.withComputedFields(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const asset = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      title: 'Validation refusée',
      message: `La demande pour le bien "${asset.name}" a été refusée.`,
    });

    return this.withComputedFields(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const asset = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'INVENTORY_ASSET',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour le bien "${asset.name}".`,
    });

    return this.withComputedFields(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('INVENTORY_ASSET', id);
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
      `inventory-assets/${id}`,
    );
    return this.prisma.inventoryAssetDocument.create({
      data: {
        assetId: id,
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
    return this.prisma.inventoryAssetDocument.findMany({
      where: { assetId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.inventoryAssetDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.assetId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.inventoryAssetDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.assetId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.inventoryAssetDocument.delete({
      where: { id: documentId },
    });
  }
}
