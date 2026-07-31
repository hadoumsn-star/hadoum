import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractCategory,
  ContractStatus,
  Prisma,
  ValidationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSupplierContractDto } from './dto/create-supplier-contract.dto';
import { UpdateSupplierContractDto } from './dto/update-supplier-contract.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { RequestTerminationDto } from './dto/request-termination.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import {
  CONTRACT_EXPIRY_WARNING_DAYS,
  CONTRACT_VALIDATION_AMOUNT_THRESHOLD_XOF,
} from './supplier-contracts.constants';

interface FindAllFilters {
  category?: ContractCategory;
  status?: ContractStatus;
  validationStatus?: ValidationStatus;
  expiringSoon?: boolean;
  expired?: boolean;
  search?: string;
}

@Injectable()
export class SupplierContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private effectiveStatus(contract: {
    status: ContractStatus;
    endDate: Date | null;
  }): ContractStatus {
    if (
      contract.status === 'ARCHIVE' ||
      contract.status === 'RESILIE' ||
      contract.status === 'BROUILLON'
    ) {
      return contract.status;
    }
    if (!contract.endDate) return contract.status;

    const now = new Date();
    if (contract.endDate < now) return 'EXPIRE';

    const warnFrom = new Date(
      contract.endDate.getTime() -
        CONTRACT_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
    );
    if (now >= warnFrom) return 'EXPIRE_BIENTOT';

    return contract.status;
  }

  private withEffectiveStatus<
    T extends { status: ContractStatus; endDate: Date | null },
  >(contract: T) {
    return { ...contract, effectiveStatus: this.effectiveStatus(contract) };
  }

  private async notifyExpiryOnce(contract: {
    id: string;
    contractName: string;
    supplierName: string;
    status: ContractStatus;
    endDate: Date | null;
  }) {
    const effective = this.effectiveStatus(contract);
    if (effective !== 'EXPIRE_BIENTOT' && effective !== 'EXPIRE') return;

    const type =
      effective === 'EXPIRE' ? 'CONTRACT_EXPIRED' : 'CONTRACT_EXPIRING_SOON';
    const alreadyNotified = await this.prisma.notification.findFirst({
      where: {
        resourceType: 'SUPPLIER_CONTRACT',
        resourceId: contract.id,
        type,
      },
    });
    if (alreadyNotified) return;

    await this.notificationsService.createForRole('DIRECTOR', {
      type,
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: contract.id,
      title:
        type === 'CONTRACT_EXPIRED'
          ? 'Contrat expiré'
          : 'Contrat bientôt expiré',
      message:
        type === 'CONTRACT_EXPIRED'
          ? `Le contrat "${contract.contractName}" (${contract.supplierName}) a expiré.`
          : `Le contrat "${contract.contractName}" (${contract.supplierName}) expire bientôt.`,
    });
  }

  async create(dto: CreateSupplierContractDto) {
    const requiresValidation =
      dto.amount !== undefined &&
      dto.amount > CONTRACT_VALIDATION_AMOUNT_THRESHOLD_XOF;

    const created = await this.prisma.supplierContract.create({
      data: {
        supplierName: dto.supplierName,
        contractName: dto.contractName,
        category: dto.category,
        description: dto.description,
        contractNumber: dto.contractNumber,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : undefined,
        renewalType: dto.renewalType,
        noticePeriod: dto.noticePeriod,
        amount: dto.amount,
        billingFrequency: dto.billingFrequency,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
        status: requiresValidation ? 'BROUILLON' : 'ACTIF',
      },
    });

    return this.withEffectiveStatus(created);
  }

  async findAll(filters: FindAllFilters) {
    const where: Prisma.SupplierContractWhereInput = {
      ...(filters.category !== undefined ? { category: filters.category } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.validationStatus !== undefined
        ? { validationStatus: filters.validationStatus }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                supplierName: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                contractName: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const contracts = await this.prisma.supplierContract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    await Promise.all(contracts.map((c) => this.notifyExpiryOnce(c)));

    let result = contracts.map((c) => this.withEffectiveStatus(c));
    if (filters.expiringSoon)
      result = result.filter((c) => c.effectiveStatus === 'EXPIRE_BIENTOT');
    if (filters.expired)
      result = result.filter((c) => c.effectiveStatus === 'EXPIRE');

    return result;
  }

  async findOne(id: string) {
    const contract = await this.prisma.supplierContract.findUnique({
      where: { id },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return this.withEffectiveStatus(contract);
  }

  private async findRaw(id: string) {
    const contract = await this.prisma.supplierContract.findUnique({
      where: { id },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async update(id: string, dto: UpdateSupplierContractDto) {
    await this.findRaw(id);

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: {
        ...(dto.supplierName !== undefined
          ? { supplierName: dto.supplierName }
          : {}),
        ...(dto.contractName !== undefined
          ? { contractName: dto.contractName }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.contractNumber !== undefined
          ? { contractNumber: dto.contractNumber }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: new Date(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: new Date(dto.endDate) }
          : {}),
        ...(dto.renewalDate !== undefined
          ? { renewalDate: new Date(dto.renewalDate) }
          : {}),
        ...(dto.renewalType !== undefined
          ? { renewalType: dto.renewalType }
          : {}),
        ...(dto.noticePeriod !== undefined
          ? { noticePeriod: dto.noticePeriod }
          : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.billingFrequency !== undefined
          ? { billingFrequency: dto.billingFrequency }
          : {}),
        ...(dto.contactPerson !== undefined
          ? { contactPerson: dto.contactPerson }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.withEffectiveStatus(updated);
  }

  async archive(id: string) {
    await this.findRaw(id);
    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: { status: 'ARCHIVE' },
    });
    return this.withEffectiveStatus(updated);
  }

  private assertNoPendingValidation(contract: {
    validationStatus: ValidationStatus | null;
  }) {
    if (contract.validationStatus === 'PENDING_VALIDATION') {
      throw new ConflictException(
        'Une validation est déjà en attente pour ce contrat.',
      );
    }
  }

  async submitValidation(id: string, userId: string, dto: SubmitValidationDto) {
    const contract = await this.findRaw(id);
    if (contract.status !== 'BROUILLON') {
      throw new ConflictException(
        'Seul un contrat en brouillon peut être soumis pour activation.',
      );
    }
    this.assertNoPendingValidation(contract);

    await this.validationsService.create({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      submittedById: userId,
      previousStatus: contract.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'CREATION',
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Validation requise',
      message: `Le contrat "${contract.contractName}" (${contract.supplierName}) nécessite une validation.`,
    });

    return this.withEffectiveStatus(updated);
  }

  async requestRenewal(id: string, userId: string, dto: RequestRenewalDto) {
    const contract = await this.findRaw(id);
    if (contract.status === 'RESILIE' || contract.status === 'ARCHIVE') {
      throw new ConflictException(
        "Ce contrat ne peut plus faire l'objet d'un renouvellement.",
      );
    }
    this.assertNoPendingValidation(contract);

    await this.validationsService.create({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      submittedById: userId,
      previousStatus: contract.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'RENEWAL',
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Demande de renouvellement',
      message: `Renouvellement demandé pour le contrat "${contract.contractName}" (${contract.supplierName}).`,
    });

    return this.withEffectiveStatus(updated);
  }

  async requestTermination(
    id: string,
    userId: string,
    dto: RequestTerminationDto,
  ) {
    const contract = await this.findRaw(id);
    if (contract.status === 'RESILIE' || contract.status === 'ARCHIVE') {
      throw new ConflictException('Ce contrat est déjà résilié ou archivé.');
    }
    this.assertNoPendingValidation(contract);

    await this.validationsService.create({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      submittedById: userId,
      previousStatus: contract.validationStatus,
      comment: dto.comment,
    });

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: {
        validationStatus: 'PENDING_VALIDATION',
        pendingValidationAction: 'TERMINATION',
      },
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Demande de résiliation',
      message: `Résiliation demandée pour le contrat "${contract.contractName}" (${contract.supplierName}).`,
    });

    return this.withEffectiveStatus(updated);
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const contract = await this.findRaw(id);

    const validation = await this.validationsService.approve({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const action = contract.pendingValidationAction;
    const statusUpdate: ContractStatus =
      action === 'TERMINATION' ? 'RESILIE' : 'ACTIF';

    const data: Prisma.SupplierContractUpdateInput = {
      status: statusUpdate,
      validationStatus: 'APPROVED',
      pendingValidationAction: null,
    };

    if (action === 'RENEWAL') {
      const newEndDate =
        contract.renewalDate ??
        new Date(
          (contract.endDate ?? new Date()).getTime() +
            365 * 24 * 60 * 60 * 1000,
        );
      data.endDate = newEndDate;
      data.renewalDate = null;
    }

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Validation approuvée',
      message: `La demande pour le contrat "${contract.contractName}" (${contract.supplierName}) a été approuvée.`,
    });

    return this.withEffectiveStatus(updated);
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const contract = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Validation refusée',
      message: `La demande pour le contrat "${contract.contractName}" (${contract.supplierName}) a été refusée.`,
    });

    return this.withEffectiveStatus(updated);
  }

  async requestChanges(id: string, userId: string, dto: RejectValidationDto) {
    const contract = await this.findRaw(id);

    const validation = await this.validationsService.requestChanges({
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: { validationStatus: 'CHANGES_REQUESTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour le contrat "${contract.contractName}" (${contract.supplierName}).`,
    });

    return this.withEffectiveStatus(updated);
  }

  history(id: string) {
    return this.validationsService.findHistory('SUPPLIER_CONTRACT', id);
  }

  async uploadDocument(id: string, file: Express.Multer.File, label?: string) {
    await this.findRaw(id);
    const fileKey = await this.uploadService.upload(
      file,
      `supplier-contracts/${id}`,
    );
    return this.prisma.contractDocument.create({
      data: { contractId: id, fileKey, fileMime: file.mimetype, label },
    });
  }

  async listDocuments(id: string) {
    await this.findRaw(id);
    return this.prisma.contractDocument.findMany({
      where: { contractId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.contractId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.contractId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.contractDocument.delete({ where: { id: documentId } });
  }
}
