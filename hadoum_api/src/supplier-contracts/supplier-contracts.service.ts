import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Contact,
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
import { CONTRACT_EXPIRY_WARNING_DAYS } from './supplier-contracts.constants';

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

  // ─── Contact assignment helpers (PR 8) ─────────────────────────────────────

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
        'Ce contact est désactivé et ne peut pas être assigné à un nouveau contrat.',
      );
    }
    return contact;
  }

  private readonly supplierContactInclude = {
    supplierContact: { include: { category: true } },
  };

  // Contact has no separate "company name" vs "person name" fields — just
  // fullName + optional organization. When organization is set, treat it as
  // the supplier/company name and fullName as the person to contact there;
  // when it isn't, the contact itself *is* the supplier (contactPerson stays
  // null rather than awkwardly duplicating supplierName).
  private supplierSnapshotFromContact(contact: Contact) {
    return {
      supplierName: contact.organization ?? contact.fullName,
      contactPerson: contact.organization ? contact.fullName : null,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
    };
  }

  // Notification messages prefer the linked Contact's current name over the
  // (possibly stale) legacy snapshot, falling back to it when unlinked.
  private supplierDisplayName(contract: {
    supplierName: string;
    supplierContact?: { fullName: string } | null;
  }): string {
    return contract.supplierContact?.fullName ?? contract.supplierName;
  }

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
    supplierContact?: { fullName: string } | null;
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

    const supplierName = this.supplierDisplayName(contract);
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
          ? `Le contrat "${contract.contractName}" (${supplierName}) a expiré.`
          : `Le contrat "${contract.contractName}" (${supplierName}) expire bientôt.`,
    });
  }

  // Every new contract now enters the validation workflow automatically —
  // there is no more amount threshold or "direct to ACTIF" path. Contract
  // row + ValidationRequest are created in one transaction (`$transaction`
  // below) so a failure creating either one rolls back both; the SUPERVISOR
  // notification fires once, after that transaction has actually committed,
  // so it can never fire for a contract that ended up not existing.
  async create(dto: CreateSupplierContractDto, userId: string) {
    // Either a Contact or a legacy free-text supplierName must identify the
    // supplier — supplierName stays NOT NULL in the DB, so one of the two
    // sources has to supply it. The frontend's create form only offers the
    // Contact path (see SupplierContractsPage); the free-text path exists so
    // any other API client — and existing legacy contracts being edited —
    // keeps working.
    let supplierContactId: string | undefined;
    let snapshot:
      | ReturnType<typeof this.supplierSnapshotFromContact>
      | undefined;

    if (dto.supplierContactId) {
      const contact = await this.assertContactAssignable(dto.supplierContactId);
      supplierContactId = contact.id;
      snapshot = this.supplierSnapshotFromContact(contact);
    } else if (!dto.supplierName || !dto.supplierName.trim()) {
      throw new BadRequestException(
        'Un fournisseur est requis : sélectionnez un contact ou renseignez un nom.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.supplierContract.create({
        data: {
          supplierName: snapshot?.supplierName ?? (dto.supplierName as string),
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
          contactPerson: snapshot ? snapshot.contactPerson : dto.contactPerson,
          phone: snapshot ? snapshot.phone : dto.phone,
          email: snapshot ? snapshot.email : dto.email,
          address: snapshot ? snapshot.address : dto.address,
          notes: dto.notes,
          // The same end-state `submitValidation()` already reaches in two
          // steps (create as BROUILLON, then submit) — collapsed into one
          // atomic step here so a DIRECTOR never has to click a separate
          // "Soumettre pour validation" action for a brand-new contract.
          status: 'BROUILLON',
          validationStatus: 'PENDING_VALIDATION',
          pendingValidationAction: 'CREATION',
          supplierContactId,
        },
        include: this.supplierContactInclude,
      });

      // Can never find an existing pending request for this resourceId —
      // the contract (and therefore this id) didn't exist a moment ago —
      // but reuses the same guarded, generic engine call as every other
      // resource type rather than inserting a bespoke ValidationRequest row
      // by hand.
      await this.validationsService.create(
        {
          resourceType: 'SUPPLIER_CONTRACT',
          resourceId: contract.id,
          submittedById: userId,
          previousStatus: null,
        },
        tx,
      );

      return contract;
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: created.id,
      title: 'Nouveau contrat fournisseur à valider',
      message: `Le contrat "${created.contractName}" (${this.supplierDisplayName(created)}) nécessite une validation.`,
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
      include: this.supplierContactInclude,
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
    // No `active` filter on the included Contact — deliberately: a contract
    // referencing a since-deactivated supplier must stay fully readable
    // (same rule MaintenanceTicketsService.findOne already applies).
    const contract = await this.prisma.supplierContract.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        ...this.supplierContactInclude,
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return this.withEffectiveStatus(contract);
  }

  private async findRaw(id: string) {
    const contract = await this.prisma.supplierContract.findUnique({
      where: { id },
      include: this.supplierContactInclude,
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async update(id: string, dto: UpdateSupplierContractDto) {
    await this.findRaw(id);

    // Three distinct states for supplierContactId, per the dual-write
    // contract: omitted (key absent) leaves the existing relation and legacy
    // snapshot untouched; an id validates and refreshes the snapshot from
    // the Contact; explicit `null` disconnects the contact WITHOUT clearing
    // the snapshot fields — unlike MaintenanceTicket.assignedTo,
    // supplierName is NOT NULL, so disconnecting just freezes the
    // last-known values as plain editable legacy text instead of destroying
    // required data.
    let contactUpdate: {
      supplierContactId?: string | null;
      supplierName?: string;
      contactPerson?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    } = {};
    if (dto.supplierContactId !== undefined) {
      if (dto.supplierContactId === null) {
        contactUpdate = { supplierContactId: null };
      } else {
        const contact = await this.assertContactAssignable(
          dto.supplierContactId,
        );
        contactUpdate = {
          supplierContactId: contact.id,
          ...this.supplierSnapshotFromContact(contact),
        };
      }
    }

    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: {
        ...(dto.supplierName !== undefined &&
        dto.supplierContactId === undefined
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
        ...(dto.contactPerson !== undefined &&
        dto.supplierContactId === undefined
          ? { contactPerson: dto.contactPerson }
          : {}),
        ...(dto.phone !== undefined && dto.supplierContactId === undefined
          ? { phone: dto.phone }
          : {}),
        ...(dto.email !== undefined && dto.supplierContactId === undefined
          ? { email: dto.email }
          : {}),
        ...(dto.address !== undefined && dto.supplierContactId === undefined
          ? { address: dto.address }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...contactUpdate,
      },
      include: this.supplierContactInclude,
    });

    return this.withEffectiveStatus(updated);
  }

  async archive(id: string) {
    await this.findRaw(id);
    const updated = await this.prisma.supplierContract.update({
      where: { id },
      data: { status: 'ARCHIVE' },
      include: this.supplierContactInclude,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Validation requise',
      message: `Le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}) nécessite une validation.`,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Demande de renouvellement',
      message: `Renouvellement demandé pour le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}).`,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Demande de résiliation',
      message: `Résiliation demandée pour le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}).`,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Contrat fournisseur approuvé',
      message: `La demande pour le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}) a été approuvée.`,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Contrat fournisseur refusé',
      // Includes the rejection comment itself, not just a pointer to go
      // look it up — `dto.comment` is mandatory (RejectValidationDto).
      message: `Le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}) a été refusé : ${dto.comment}`,
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
      include: this.supplierContactInclude,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_CHANGES_REQUESTED',
      resourceType: 'SUPPLIER_CONTRACT',
      resourceId: id,
      title: 'Modifications demandées',
      message: `Des modifications ont été demandées pour le contrat "${contract.contractName}" (${this.supplierDisplayName(contract)}).`,
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
