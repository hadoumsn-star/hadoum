import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  ValidationResourceType,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Every method below optionally accepts a Prisma transaction client so a
// caller (e.g. ExpenseWorkflowService, PR 5B) can atomically persist a
// ValidationRequest alongside its own resource's status change in one
// database transaction. Omitting it (every pre-existing caller) is
// identical to today's behavior — it just falls back to the injected
// PrismaService.
type Db = Prisma.TransactionClient;

interface CreateValidationInput {
  resourceType: ValidationResourceType;
  resourceId: string;
  submittedById: string;
  previousStatus?: ValidationStatus | null;
  comment?: string;
}

interface ReviewValidationInput {
  resourceType: ValidationResourceType;
  resourceId: string;
  reviewedById: string;
  comment?: string;
}

@Injectable()
export class ValidationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateValidationInput, tx?: Db) {
    const db = tx ?? this.prisma;
    const existingPending = await this.findPendingFor(
      input.resourceType,
      input.resourceId,
      db,
    );
    if (existingPending) {
      throw new ConflictException(
        'Une validation est déjà en attente pour cette ressource.',
      );
    }

    return db.validationRequest.create({
      data: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        status: 'PENDING_VALIDATION',
        previousStatus: input.previousStatus ?? null,
        submittedById: input.submittedById,
        comment: input.comment,
      },
    });
  }

  private findPendingFor(
    resourceType: ValidationResourceType,
    resourceId: string,
    tx?: Db,
  ) {
    const db = tx ?? this.prisma;
    return db.validationRequest.findFirst({
      where: { resourceType, resourceId, status: 'PENDING_VALIDATION' },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private async reviewPending(
    input: ReviewValidationInput,
    resultingStatus: ValidationStatus,
    tx?: Db,
  ) {
    const db = tx ?? this.prisma;
    const pending = await this.findPendingFor(
      input.resourceType,
      input.resourceId,
      db,
    );
    if (!pending) {
      throw new ConflictException(
        'Aucune validation en attente pour cette ressource.',
      );
    }
    if (pending.submittedById === input.reviewedById) {
      throw new ForbiddenException(
        'Vous ne pouvez pas valider votre propre soumission.',
      );
    }

    return db.validationRequest.update({
      where: { id: pending.id },
      data: {
        status: resultingStatus,
        previousStatus: pending.status,
        reviewedById: input.reviewedById,
        reviewedAt: new Date(),
        comment: input.comment ?? pending.comment,
      },
    });
  }

  approve(input: ReviewValidationInput, tx?: Db) {
    return this.reviewPending(input, 'APPROVED', tx);
  }

  reject(input: ReviewValidationInput, tx?: Db) {
    return this.reviewPending(input, 'REJECTED', tx);
  }

  requestChanges(input: ReviewValidationInput, tx?: Db) {
    return this.reviewPending(input, 'CHANGES_REQUESTED', tx);
  }

  async findPending() {
    const pending = await this.prisma.validationRequest.findMany({
      where: { status: 'PENDING_VALIDATION' },
      include: {
        submittedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return Promise.all(
      pending.map(async (request) => {
        let resource: unknown = null;
        switch (request.resourceType) {
          case 'MAINTENANCE_TICKET':
            resource = await this.prisma.maintenanceTicket.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                title: true,
                urgency: true,
                status: true,
                space: { select: { name: true } },
                // Supervisor validation queue: the assigned Contact, same
                // dual-write relation MaintenanceTicketsService already
                // reads/writes elsewhere — `assignedTo` (legacy free text)
                // is included too so the frontend can fall back to it only
                // when no Contact is linked, never showing both.
                assignedTo: true,
                assignedContact: { select: { id: true, fullName: true } },
              },
            });
            break;
          case 'SUPPLIER_CONTRACT':
            resource = await this.prisma.supplierContract.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                contractName: true,
                supplierName: true,
                category: true,
                status: true,
                // Supplier Contracts workflow: the Supervisor queue needs
                // enough to triage a pending contract without opening it —
                // start/end dates and amount, alongside the submitter/
                // submission date already carried on the ValidationRequest
                // itself (submittedBy/submittedAt, above).
                startDate: true,
                endDate: true,
                amount: true,
              },
            });
            break;
          case 'ADMINISTRATIVE_PROCEDURE':
            resource = await this.prisma.administrativeProcedure.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                title: true,
                authority: true,
                procedureType: true,
                priority: true,
                status: true,
                pendingValidationAction: true,
                // Supervisor validation queue: the assigned responsible
                // person — reuses the existing Contact relation
                // (assignedContact), same dual-write pattern as
                // MaintenanceTicket. `assignedTo` (legacy free text) is
                // included too so the frontend can fall back to it only
                // when no Contact is linked.
                assignedTo: true,
                assignedContact: { select: { id: true, fullName: true } },
              },
            });
            break;
          case 'STOCK_ITEM':
            resource = await this.prisma.stockItem.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                name: true,
                category: true,
                unit: true,
                currentQuantity: true,
                pendingValidationAction: true,
                pendingValidationPayload: true,
              },
            });
            break;
          case 'INVENTORY_ASSET':
            resource = await this.prisma.inventoryAsset.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                name: true,
                assetCode: true,
                category: true,
                status: true,
                pendingValidationAction: true,
                pendingValidationPayload: true,
              },
            });
            break;
          case 'ENTRY_LOG':
            resource = await this.prisma.entryLog.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                fullName: true,
                organization: true,
                visitorCategory: true,
                status: true,
                pendingValidationAction: true,
              },
            });
            break;
          case 'GOODS_MOVEMENT_LOG':
            resource = await this.prisma.goodsMovementLog.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                description: true,
                movementType: true,
                destination: true,
                status: true,
                pendingValidationAction: true,
              },
            });
            break;
          case 'ACTIVITY':
            resource = await this.prisma.activity.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                title: true,
                type: true,
                className: true,
                date: true,
                educator: { select: { firstName: true, lastName: true } },
              },
            });
            break;
          case 'LEAVE_REQUEST': {
            const attendance = await this.prisma.staffAttendance.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                staffId: true,
                type: true,
                motif: true,
                dateDebut: true,
                dateFin: true,
              },
            });
            const staffMember = attendance
              ? await this.prisma.staffMember.findUnique({
                  where: { id: attendance.staffId },
                  select: { firstName: true, lastName: true },
                })
              : null;
            resource = attendance ? { ...attendance, staffMember } : null;
            break;
          }
          case 'FUND_REQUEST':
            resource = await this.prisma.fundRequest.findUnique({
              where: { id: request.resourceId },
              select: { id: true, amountXof: true, motif: true, date: true },
            });
            break;
          case 'EXPENSE_TRANSACTION':
            resource = await this.prisma.transaction.findUnique({
              where: { id: request.resourceId },
              select: {
                id: true,
                label: true,
                amountXof: true,
                category: true,
                date: true,
                expenseWorkflowStatus: true,
                supplierContact: { select: { id: true, fullName: true } },
              },
            });
            break;
        }
        return { ...request, resource };
      }),
    );
  }

  findHistory(resourceType: ValidationResourceType, resourceId: string) {
    return this.prisma.validationRequest.findMany({
      where: { resourceType, resourceId },
      include: {
        submittedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
        reviewedBy: {
          select: { id: true, name: true, initials: true, roleLabel: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
