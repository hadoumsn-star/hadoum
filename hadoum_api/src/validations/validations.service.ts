import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ValidationResourceType, ValidationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  async create(input: CreateValidationInput) {
    const existingPending = await this.findPendingFor(
      input.resourceType,
      input.resourceId,
    );
    if (existingPending) {
      throw new ConflictException(
        'Une validation est déjà en attente pour cette ressource.',
      );
    }

    return this.prisma.validationRequest.create({
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
  ) {
    return this.prisma.validationRequest.findFirst({
      where: { resourceType, resourceId, status: 'PENDING_VALIDATION' },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private async reviewPending(
    input: ReviewValidationInput,
    resultingStatus: ValidationStatus,
  ) {
    const pending = await this.findPendingFor(
      input.resourceType,
      input.resourceId,
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

    return this.prisma.validationRequest.update({
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

  approve(input: ReviewValidationInput) {
    return this.reviewPending(input, 'APPROVED');
  }

  reject(input: ReviewValidationInput) {
    return this.reviewPending(input, 'REJECTED');
  }

  requestChanges(input: ReviewValidationInput) {
    return this.reviewPending(input, 'CHANGES_REQUESTED');
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
