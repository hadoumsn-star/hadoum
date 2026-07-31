import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType, ValidationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

interface RecordMovementInput {
  stockItemId: string;
  type: StockMovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number | null;
  source?: string | null;
  destination?: string | null;
  reason?: string | null;
  referenceDocument?: string | null;
  batchNumber?: string | null;
  expirationDate?: Date | null;
  performedById?: string | null;
  approvedById?: string | null;
  movementDate?: Date;
  validationStatus?: ValidationStatus | null;
}

interface FindAllFilters {
  stockItemId?: string;
  movementType?: StockMovementType;
  performedBy?: string;
  batchNumber?: string;
  validationStatus?: ValidationStatus;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called from StockItemsService within an existing $transaction so the
  // quantity update and the immutable movement record commit atomically.
  record(tx: Tx, input: RecordMovementInput) {
    const totalValue =
      input.unitCost != null
        ? Math.round(input.unitCost * input.quantity)
        : null;

    return tx.stockMovement.create({
      data: {
        stockItemId: input.stockItemId,
        type: input.type,
        quantity: input.quantity,
        quantityBefore: input.quantityBefore,
        quantityAfter: input.quantityAfter,
        unitCost: input.unitCost ?? undefined,
        totalValue: totalValue ?? undefined,
        source: input.source ?? undefined,
        destination: input.destination ?? undefined,
        reason: input.reason ?? undefined,
        referenceDocument: input.referenceDocument ?? undefined,
        batchNumber: input.batchNumber ?? undefined,
        expirationDate: input.expirationDate ?? undefined,
        performedById: input.performedById ?? undefined,
        approvedById: input.approvedById ?? undefined,
        movementDate: input.movementDate ?? new Date(),
        validationStatus: input.validationStatus ?? undefined,
      },
    });
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.StockMovementWhereInput = {
      ...(filters.stockItemId ? { stockItemId: filters.stockItemId } : {}),
      ...(filters.movementType ? { type: filters.movementType } : {}),
      ...(filters.batchNumber ? { batchNumber: filters.batchNumber } : {}),
      ...(filters.validationStatus
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.performedBy ? { performedById: filters.performedBy } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            movementDate: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.stockMovement.findMany({
      where,
      include: {
        performedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        approvedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
      orderBy: { movementDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id },
      include: {
        stockItem: { select: { id: true, name: true, unit: true } },
        performedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        approvedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
    });
    if (!movement) throw new NotFoundException('Movement not found');
    return movement;
  }
}
