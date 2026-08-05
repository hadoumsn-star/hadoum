import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StockCategory,
  StockItem,
  StockMovementType,
  StockUnit,
  StockValidationAction,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { CreateStockExitDto } from './dto/create-stock-exit.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { CreateStockInventoryCountDto } from './dto/create-stock-inventory-count.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import {
  STOCK_EXIT_LARGE_QUANTITY_THRESHOLD,
  STOCK_EXIT_LARGE_VALUE_THRESHOLD_XOF,
  STOCK_EXPIRATION_WARNING_DAYS,
  STOCK_NEGATIVE_ADJUSTMENT_SENSITIVE_PERCENT,
} from './stock-items.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

// Payload captured at submission time for a sensitive stock operation and
// re-applied atomically once the supervisor approves it. Contract/procedure
// validation actions are pure state transitions; stock operations carry a
// numeric delta that must survive until approval, hence this payload.
interface StockActionPayload {
  quantity: number; // magnitude of the movement (always positive)
  movementType: StockMovementType;
  reason?: string;
  source?: string;
  destination?: string;
  referenceDocument?: string;
  movementDate?: string;
  unitCost?: number;
  // PR 12 — every pending action before this one was a removal by
  // definition (LARGE_STOCK_EXIT, NEGATIVE_ADJUSTMENT, STOCK_LOSS all
  // decrement on approval). A physical inventory count can also reveal
  // *more* stock than expected, so a sensitive INVENTORY_CORRECTION now
  // carries its sign explicitly here instead of approve() assuming
  // "decrement" for every action type — see approve() below.
  positive?: boolean;
}

interface FindAllFilters {
  search?: string;
  category?: StockCategory;
  unit?: StockUnit;
  active?: boolean;
  lowStock?: boolean;
  outOfStock?: boolean;
  expiringSoon?: boolean;
  expired?: boolean;
  storageLocation?: string;
  spaceId?: string;
  supplierName?: string;
  validationStatus?: ValidationStatus;
}

type StockItemWithDerived = StockItem & {
  isOutOfStock: boolean;
  isLowStock: boolean;
  isOverstocked: boolean;
  isExpiringSoon: boolean;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  inventoryValue: number | null;
};

@Injectable()
export class StockItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
    private readonly movementsService: StockMovementsService,
  ) {}

  // ─── Derived / computed fields ────────────────────────────────────────────

  private daysUntil(target: Date, from: Date): number {
    return Math.ceil((target.getTime() - from.getTime()) / DAY_MS);
  }

  private withComputedFields<T extends StockItem>(
    item: T,
  ): T & StockItemWithDerived {
    const now = new Date();
    const active = item.isActive;

    const isExpired =
      active && item.expirationDate != null && item.expirationDate < now;
    const daysUntilExpiration = item.expirationDate
      ? this.daysUntil(item.expirationDate, now)
      : null;
    const isExpiringSoon =
      active &&
      !isExpired &&
      daysUntilExpiration !== null &&
      daysUntilExpiration <= STOCK_EXPIRATION_WARNING_DAYS;

    const isOutOfStock = active && item.currentQuantity <= 0;
    const isLowStock =
      active &&
      !isOutOfStock &&
      item.minimumQuantity != null &&
      item.currentQuantity <= item.minimumQuantity;
    const isOverstocked =
      active &&
      item.maximumQuantity != null &&
      item.currentQuantity > item.maximumQuantity;

    const inventoryValue =
      item.unitCost != null
        ? Math.round(item.unitCost * item.currentQuantity)
        : null;

    return {
      ...item,
      isOutOfStock,
      isLowStock,
      isOverstocked,
      isExpiringSoon,
      isExpired: !!isExpired,
      daysUntilExpiration,
      inventoryValue,
    };
  }

  private async notifyStockAlertsOnce(item: StockItemWithDerived) {
    const checks: Array<{
      trigger: boolean;
      type: 'STOCK_OUT' | 'STOCK_LOW' | 'STOCK_EXPIRED' | 'STOCK_EXPIRING_SOON';
      title: string;
      message: string;
    }> = [
      {
        trigger: item.isOutOfStock,
        type: 'STOCK_OUT',
        title: 'Rupture de stock',
        message: `L'article "${item.name}" est en rupture de stock.`,
      },
      {
        trigger: item.isLowStock,
        type: 'STOCK_LOW',
        title: 'Stock faible',
        message: `L'article "${item.name}" atteint son seuil minimum.`,
      },
      {
        trigger: item.isExpired,
        type: 'STOCK_EXPIRED',
        title: 'Article expiré',
        message: `L'article "${item.name}" a expiré.`,
      },
      {
        trigger: item.isExpiringSoon,
        type: 'STOCK_EXPIRING_SOON',
        title: 'Expiration proche',
        message: `L'article "${item.name}" expire bientôt.`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          resourceType: 'STOCK_ITEM',
          resourceId: item.id,
          type: check.type,
        },
      });
      if (alreadyNotified) continue;

      await this.notificationsService.createForRole('DIRECTOR', {
        type: check.type,
        resourceType: 'STOCK_ITEM',
        resourceId: item.id,
        title: check.title,
        message: check.message,
      });
    }
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  private assertNoPendingValidation(item: {
    validationStatus: ValidationStatus | null;
  }) {
    if (item.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour cet article.',
      );
    }
  }

  private assertActive(item: { isActive: boolean }) {
    if (!item.isActive) {
      throw new ConflictException(
        'Cet article est archivé et ne peut plus recevoir de mouvement.',
      );
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateStockItemDto, userId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          name: dto.name,
          reference: dto.reference,
          barcode: dto.barcode,
          category: dto.category,
          description: dto.description,
          unit: dto.unit,
          minimumQuantity: dto.minimumQuantity,
          maximumQuantity: dto.maximumQuantity,
          reorderQuantity: dto.reorderQuantity,
          unitCost: dto.unitCost,
          storageLocation: dto.storageLocation,
          spaceId: dto.spaceId,
          supplierName: dto.supplierName,
          supplierContractId: dto.supplierContractId,
          batchNumber: dto.batchNumber,
          expirationDate: dto.expirationDate
            ? new Date(dto.expirationDate)
            : undefined,
          isPerishable: dto.isPerishable,
          notes: dto.notes,
          createdById: userId,
        },
      });

      if (dto.initialQuantity && dto.initialQuantity > 0) {
        const updated = await tx.stockItem.update({
          where: { id: item.id },
          data: { currentQuantity: { increment: dto.initialQuantity } },
        });
        await this.movementsService.record(tx, {
          stockItemId: item.id,
          type: 'ENTREE',
          quantity: dto.initialQuantity,
          quantityBefore: 0,
          quantityAfter: updated.currentQuantity,
          unitCost: dto.unitCost,
          reason: 'Stock initial',
          batchNumber: dto.batchNumber,
          expirationDate: dto.expirationDate
            ? new Date(dto.expirationDate)
            : undefined,
          performedById: userId,
        });
        return updated;
      }

      return item;
    });

    return this.withComputedFields(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.StockItemWhereInput = {
      isActive: filters.active !== undefined ? filters.active : true,
      ...(filters.category !== undefined ? { category: filters.category } : {}),
      ...(filters.unit !== undefined ? { unit: filters.unit } : {}),
      ...(filters.storageLocation
        ? {
            storageLocation: {
              contains: filters.storageLocation,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
      ...(filters.supplierName
        ? {
            supplierName: {
              contains: filters.supplierName,
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
                reference: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                barcode: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                storageLocation: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const items = await this.prisma.stockItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const computed = items.map((i) => this.withComputedFields(i));
    await Promise.all(computed.map((i) => this.notifyStockAlertsOnce(i)));

    let result = computed;
    if (filters.lowStock) result = result.filter((i) => i.isLowStock);
    if (filters.outOfStock) result = result.filter((i) => i.isOutOfStock);
    if (filters.expiringSoon) result = result.filter((i) => i.isExpiringSoon);
    if (filters.expired) result = result.filter((i) => i.isExpired);

    return result.sort((a, b) => this.urgencyRank(a) - this.urgencyRank(b));
  }

  private urgencyRank(i: StockItemWithDerived): number {
    if (!i.isActive) return 1000;
    if (i.isOutOfStock || i.isExpired) return 0;
    if (i.isLowStock || i.isExpiringSoon) return 1;
    return 2;
  }

  async findOne(id: string) {
    const item = await this.prisma.stockItem.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        space: { select: { id: true, name: true } },
        supplierContract: {
          select: { id: true, contractName: true, supplierName: true },
        },
        createdBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
    });
    if (!item) throw new NotFoundException('Stock item not found');
    return this.withComputedFields(item);
  }

  private async findRaw(id: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Stock item not found');
    return item;
  }

  async update(id: string, dto: UpdateStockItemDto) {
    await this.findRaw(id);

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.minimumQuantity !== undefined
          ? { minimumQuantity: dto.minimumQuantity }
          : {}),
        ...(dto.maximumQuantity !== undefined
          ? { maximumQuantity: dto.maximumQuantity }
          : {}),
        ...(dto.reorderQuantity !== undefined
          ? { reorderQuantity: dto.reorderQuantity }
          : {}),
        ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
        ...(dto.storageLocation !== undefined
          ? { storageLocation: dto.storageLocation }
          : {}),
        ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        ...(dto.supplierName !== undefined
          ? { supplierName: dto.supplierName }
          : {}),
        ...(dto.supplierContractId !== undefined
          ? { supplierContractId: dto.supplierContractId }
          : {}),
        ...(dto.batchNumber !== undefined
          ? { batchNumber: dto.batchNumber }
          : {}),
        ...(dto.expirationDate !== undefined
          ? { expirationDate: new Date(dto.expirationDate) }
          : {}),
        ...(dto.isPerishable !== undefined
          ? { isPerishable: dto.isPerishable }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.withComputedFields(updated);
  }

  // ─── Archive (smart: direct when empty, validation-gated otherwise) ────────

  async archive(id: string, userId: string) {
    const item = await this.findRaw(id);
    if (!item.isActive) {
      throw new ConflictException('Cet article est déjà archivé.');
    }
    this.assertNoPendingValidation(item);

    if (item.currentQuantity <= 0) {
      const updated = await this.prisma.stockItem.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
      });
      return this.withComputedFields(updated);
    }

    // Remaining stock — archiving requires supervisor validation.
    await this.validationsService.create({
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      submittedById: userId,
      previousStatus: item.validationStatus,
    });

    const payload: StockActionPayload = {
      quantity: 0,
      movementType: 'AJUSTEMENT_POSITIF',
    };
    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'STOCK_ITEM_ARCHIVE',
        pendingValidationPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      title: 'Validation requise',
      message: `L'archivage de "${item.name}" (stock restant : ${item.currentQuantity} ${item.unit}) nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  // ─── Movements ──────────────────────────────────────────────────────────────

  async createEntry(id: string, userId: string, dto: CreateStockEntryDto) {
    const item = await this.findRaw(id);
    this.assertActive(item);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.stockItem.update({
        where: { id },
        data: {
          currentQuantity: { increment: dto.quantity },
          ...(dto.batchNumber ? { batchNumber: dto.batchNumber } : {}),
          ...(dto.expirationDate
            ? { expirationDate: new Date(dto.expirationDate) }
            : {}),
        },
      });
      await this.movementsService.record(tx, {
        stockItemId: id,
        type: 'ENTREE',
        quantity: dto.quantity,
        quantityBefore: item.currentQuantity,
        quantityAfter: next.currentQuantity,
        unitCost: dto.unitCost ?? item.unitCost,
        source: dto.source,
        reason: dto.reason,
        referenceDocument: dto.referenceDocument,
        batchNumber: dto.batchNumber,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : undefined,
        performedById: userId,
        movementDate: dto.movementDate ? new Date(dto.movementDate) : undefined,
        validationStatus: null,
      });
      return next;
    });

    return this.withComputedFields(updated);
  }

  async createExit(id: string, userId: string, dto: CreateStockExitDto) {
    const item = await this.findRaw(id);
    this.assertActive(item);
    this.assertNoPendingValidation(item);

    if (dto.quantity > item.currentQuantity) {
      throw new ConflictException(
        `Stock insuffisant : ${item.currentQuantity} ${item.unit} disponible(s), ${dto.quantity} demandé(s).`,
      );
    }

    const value = item.unitCost != null ? item.unitCost * dto.quantity : null;
    const sensitive =
      dto.quantity > STOCK_EXIT_LARGE_QUANTITY_THRESHOLD ||
      (value != null && value > STOCK_EXIT_LARGE_VALUE_THRESHOLD_XOF);

    if (sensitive) {
      return this.submitPendingOperation(item, userId, 'LARGE_STOCK_EXIT', {
        quantity: dto.quantity,
        movementType: 'SORTIE',
        reason: dto.reason,
        destination: dto.destination,
        referenceDocument: dto.referenceDocument,
        movementDate: dto.movementDate,
        unitCost: item.unitCost ?? undefined,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.stockItem.updateMany({
        where: { id, currentQuantity: { gte: dto.quantity }, isActive: true },
        data: { currentQuantity: { decrement: dto.quantity } },
      });
      if (result.count === 0) {
        throw new ConflictException('Stock insuffisant pour cette sortie.');
      }
      const next = await tx.stockItem.findUniqueOrThrow({ where: { id } });
      await this.movementsService.record(tx, {
        stockItemId: id,
        type: 'SORTIE',
        quantity: dto.quantity,
        quantityBefore: next.currentQuantity + dto.quantity,
        quantityAfter: next.currentQuantity,
        unitCost: item.unitCost,
        destination: dto.destination,
        reason: dto.reason,
        referenceDocument: dto.referenceDocument,
        performedById: userId,
        movementDate: dto.movementDate ? new Date(dto.movementDate) : undefined,
        validationStatus: null,
      });
      return next;
    });

    return this.withComputedFields(updated);
  }

  async createAdjustment(
    id: string,
    userId: string,
    dto: CreateStockAdjustmentDto,
  ) {
    const item = await this.findRaw(id);
    this.assertActive(item);
    this.assertNoPendingValidation(item);

    if (dto.quantityDelta === 0) {
      throw new BadRequestException(
        'La quantité ajustée ne peut pas être nulle.',
      );
    }
    if (dto.lossType && dto.quantityDelta > 0) {
      throw new BadRequestException(
        'Une perte doit correspondre à une quantité négative.',
      );
    }

    const quantityAfterIfApplied = item.currentQuantity + dto.quantityDelta;
    if (quantityAfterIfApplied < 0) {
      throw new ConflictException(
        "L'ajustement ferait passer le stock en dessous de zéro.",
      );
    }

    let movementType: StockMovementType;
    let action: StockValidationAction | null = null;

    if (dto.lossType) {
      movementType = dto.lossType;
      action = 'STOCK_LOSS';
    } else if (dto.isInventoryCorrection) {
      movementType = 'INVENTAIRE_CORRECTION';
      const materialPercent =
        item.currentQuantity > 0
          ? (Math.abs(dto.quantityDelta) / item.currentQuantity) * 100
          : 100;
      if (materialPercent > STOCK_NEGATIVE_ADJUSTMENT_SENSITIVE_PERCENT) {
        action = 'INVENTORY_CORRECTION';
      }
    } else {
      movementType =
        dto.quantityDelta > 0 ? 'AJUSTEMENT_POSITIF' : 'AJUSTEMENT_NEGATIF';
      if (dto.quantityDelta < 0) {
        const materialPercent =
          item.currentQuantity > 0
            ? (Math.abs(dto.quantityDelta) / item.currentQuantity) * 100
            : 100;
        if (materialPercent > STOCK_NEGATIVE_ADJUSTMENT_SENSITIVE_PERCENT) {
          action = 'NEGATIVE_ADJUSTMENT';
        }
      }
    }

    if (action) {
      return this.submitPendingOperation(item, userId, action, {
        quantity: Math.abs(dto.quantityDelta),
        movementType,
        reason: dto.reason,
        movementDate: dto.movementDate,
        unitCost: item.unitCost ?? undefined,
        // Only an inventory correction can ever be positive here — the
        // lossType and plain-negative-adjustment branches above only ever
        // reach this point with a negative delta.
        positive: dto.isInventoryCorrection ? dto.quantityDelta > 0 : undefined,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let next: StockItem;
      if (dto.quantityDelta < 0) {
        const result = await tx.stockItem.updateMany({
          where: {
            id,
            currentQuantity: { gte: -dto.quantityDelta },
            isActive: true,
          },
          data: { currentQuantity: { increment: dto.quantityDelta } },
        });
        if (result.count === 0) {
          throw new ConflictException(
            "L'ajustement ferait passer le stock en dessous de zéro.",
          );
        }
        next = await tx.stockItem.findUniqueOrThrow({ where: { id } });
      } else {
        next = await tx.stockItem.update({
          where: { id },
          data: { currentQuantity: { increment: dto.quantityDelta } },
        });
      }
      await this.movementsService.record(tx, {
        stockItemId: id,
        type: movementType,
        quantity: Math.abs(dto.quantityDelta),
        quantityBefore: item.currentQuantity,
        quantityAfter: next.currentQuantity,
        unitCost: item.unitCost,
        reason: dto.reason,
        performedById: userId,
        movementDate: dto.movementDate ? new Date(dto.movementDate) : undefined,
        validationStatus: null,
      });
      return next;
    });

    return this.withComputedFields(updated);
  }

  async createTransfer(
    id: string,
    userId: string,
    dto: CreateStockTransferDto,
  ) {
    const item = await this.findRaw(id);
    this.assertActive(item);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.stockItem.update({
        where: { id },
        data: {
          ...(dto.destination !== undefined
            ? { storageLocation: dto.destination }
            : {}),
          ...(dto.spaceId !== undefined ? { spaceId: dto.spaceId } : {}),
        },
      });
      await this.movementsService.record(tx, {
        stockItemId: id,
        type: 'TRANSFERT',
        quantity: item.currentQuantity,
        quantityBefore: item.currentQuantity,
        quantityAfter: item.currentQuantity,
        source: item.storageLocation,
        destination: dto.destination,
        reason: dto.reason,
        performedById: userId,
        validationStatus: null,
      });
      return next;
    });

    return this.withComputedFields(updated);
  }

  // ─── Physical inventory count (PR 12) ──────────────────────────────────────
  // The caller reports what they physically counted; this computes the
  // variance itself (never trusts a client-computed delta) and, when there
  // is one, delegates to createAdjustment's existing INVENTAIRE_CORRECTION
  // path — same stock-mutation logic, same sensitivity/validation gating,
  // same @Audited coverage on the controller route, nothing duplicated. A
  // count that matches exactly still returns a full expected/actual/
  // difference breakdown but creates no movement — there is nothing to
  // adjust.
  async createInventoryCount(
    id: string,
    userId: string,
    dto: CreateStockInventoryCountDto,
  ) {
    const item = await this.findRaw(id);
    this.assertActive(item);
    this.assertNoPendingValidation(item);

    const expectedQuantity = item.currentQuantity;
    const actualQuantity = dto.actualQuantity;
    const difference = actualQuantity - expectedQuantity;

    if (difference === 0) {
      return {
        item: this.withComputedFields(item),
        expectedQuantity,
        actualQuantity,
        difference,
      };
    }

    const updatedItem = await this.createAdjustment(id, userId, {
      quantityDelta: difference,
      reason:
        dto.comment?.trim() || 'Écart constaté lors de l’inventaire physique.',
      isInventoryCorrection: true,
    });

    return { item: updatedItem, expectedQuantity, actualQuantity, difference };
  }

  private async submitPendingOperation(
    item: StockItem,
    userId: string,
    action: StockValidationAction,
    payload: StockActionPayload,
  ) {
    this.assertNoPendingValidation(item);

    await this.validationsService.create({
      resourceType: 'STOCK_ITEM',
      resourceId: item.id,
      submittedById: userId,
      previousStatus: item.validationStatus,
    });

    const updated = await this.prisma.stockItem.update({
      where: { id: item.id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: action,
        pendingValidationPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'STOCK_ITEM',
      resourceId: item.id,
      title: 'Validation requise',
      message: `Une opération sensible sur "${item.name}" nécessite une validation.`,
    });

    return this.withComputedFields(updated);
  }

  // ─── Validation workflow ────────────────────────────────────────────────────

  async submitValidation(
    id: string,
    _userId: string,
    _dto: SubmitValidationDto,
  ) {
    // Generic entry point kept for interface parity with other Module 4
    // resources; every stock operation on this resource already routes
    // itself through submitPendingOperation() when it is sensitive.
    void _userId;
    void _dto;
    const item = await this.findRaw(id);
    if (
      item.validationStatus !== 'PENDING_VALIDATION' ||
      !item.pendingValidationAction
    ) {
      throw new ConflictException(
        "Aucune opération sensible n'est en attente pour cet article.",
      );
    }
    return this.withComputedFields(item);
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const item = await this.findRaw(id);
    if (!item.pendingValidationAction) {
      throw new ConflictException('Aucune action en attente pour cet article.');
    }

    const validation = await this.validationsService.approve({
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = item.pendingValidationAction;
    const payload = (item.pendingValidationPayload ??
      {}) as unknown as StockActionPayload;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'STOCK_ITEM_ARCHIVE') {
        return tx.stockItem.update({
          where: { id },
          data: {
            isActive: false,
            archivedAt: new Date(),
            validationStatus: 'APPROVED',
            pendingValidationAction: null,
            pendingValidationPayload: Prisma.JsonNull,
          },
        });
      }

      // LARGE_STOCK_EXIT, NEGATIVE_ADJUSTMENT and STOCK_LOSS always remove
      // `payload.quantity` units from stock. INVENTORY_CORRECTION can go
      // either way — a physical count can find more stock than expected,
      // not just less — hence `payload.positive` (PR 12).
      const result = await tx.stockItem.updateMany({
        where: payload.positive
          ? { id }
          : { id, currentQuantity: { gte: payload.quantity } },
        data: {
          currentQuantity: payload.positive
            ? { increment: payload.quantity }
            : { decrement: payload.quantity },
          validationStatus: 'APPROVED',
          pendingValidationAction: null,
          pendingValidationPayload: Prisma.JsonNull,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          "Le stock disponible ne permet plus d'appliquer cette opération.",
        );
      }
      const next = await tx.stockItem.findUniqueOrThrow({ where: { id } });
      await this.movementsService.record(tx, {
        stockItemId: id,
        type: payload.movementType,
        quantity: payload.quantity,
        quantityBefore: payload.positive
          ? next.currentQuantity - payload.quantity
          : next.currentQuantity + payload.quantity,
        quantityAfter: next.currentQuantity,
        unitCost: payload.unitCost,
        source: payload.source,
        destination: payload.destination,
        reason: payload.reason,
        referenceDocument: payload.referenceDocument,
        performedById: validation.submittedById,
        approvedById: userId,
        movementDate: payload.movementDate
          ? new Date(payload.movementDate)
          : undefined,
        validationStatus: 'APPROVED',
      });
      return next;
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      title: 'Validation approuvée',
      message: `L'opération sur "${item.name}" a été approuvée.`,
    });

    return this.withComputedFields(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const item = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      title: 'Validation refusée',
      message: `L'opération sur "${item.name}" a été refusée.`,
    });

    return this.withComputedFields(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const item = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'STOCK_ITEM',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour l'opération sur "${item.name}".`,
    });

    return this.withComputedFields(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('STOCK_ITEM', id);
  }

  movements(id: string) {
    return this.movementsService.findAll({ stockItemId: id });
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
    const fileKey = await this.uploadService.upload(file, `stock-items/${id}`);
    return this.prisma.stockItemDocument.create({
      data: {
        stockItemId: id,
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
    return this.prisma.stockItemDocument.findMany({
      where: { stockItemId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.stockItemDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.stockItemId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.stockItemDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.stockItemId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.stockItemDocument.delete({ where: { id: documentId } });
  }
}
