import { Injectable, NotFoundException } from '@nestjs/common';
import { ValidationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFundRequestDto } from './dto/create-fund-request.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Injectable()
export class FundRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async findRaw(id: string) {
    const request = await this.prisma.fundRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Fund request not found');
    return request;
  }

  async create(dto: CreateFundRequestDto, requestedById: string) {
    const request = await this.prisma.fundRequest.create({
      data: {
        amountXof: dto.amountXof,
        motif: dto.motif,
        requestedById,
        validationStatus: 'PENDING_VALIDATION',
      },
    });

    await this.validationsService.create({
      resourceType: 'FUND_REQUEST',
      resourceId: request.id,
      submittedById: requestedById,
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'FUND_REQUEST',
      resourceId: request.id,
      title: 'Demande de fonds à valider',
      message: `Une demande de fonds de ${dto.amountXof} FCFA nécessite une validation.`,
    });

    return request;
  }

  findAll(validationStatus?: ValidationStatus) {
    return this.prisma.fundRequest.findMany({
      where: validationStatus !== undefined ? { validationStatus } : {},
      include: {
        requestedBy: { select: { id: true, name: true, initials: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.fundRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, initials: true } },
      },
    });
    if (!request) throw new NotFoundException('Fund request not found');
    return request;
  }

  // NOTE: approving a fund request does NOT create a Transaction — actual
  // disbursement stays a manual step on the Finances page (/app/finances).
  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const request = await this.findRaw(id);

    const validation = await this.validationsService.approve({
      resourceType: 'FUND_REQUEST',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.fundRequest.update({
      where: { id },
      data: { validationStatus: 'APPROVED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'FUND_REQUEST',
      resourceId: id,
      title: 'Demande de fonds approuvée',
      message: `Votre demande de fonds de ${request.amountXof} FCFA a été approuvée.`,
    });

    return updated;
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const request = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'FUND_REQUEST',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.fundRequest.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'FUND_REQUEST',
      resourceId: id,
      title: 'Demande de fonds refusée',
      message: `Votre demande de fonds de ${request.amountXof} FCFA a été refusée.`,
    });

    return updated;
  }

  history(id: string) {
    return this.validationsService.findHistory('FUND_REQUEST', id);
  }
}
