import { Injectable, NotFoundException } from '@nestjs/common';
import { ValidationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationsService } from '../validations/validations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

const EDUCATOR_SELECT = {
  educator: { select: { id: true, firstName: true, lastName: true } },
};

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationsService: ValidationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async findRaw(id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async create(dto: CreateActivityDto, submittedById: string) {
    await this.prisma.staffMember.findUniqueOrThrow({
      where: { id: dto.educatorId },
    });

    const activity = await this.prisma.activity.create({
      data: {
        title: dto.title,
        type: dto.type,
        className: dto.className,
        educatorId: dto.educatorId,
        date: new Date(dto.date),
        validationStatus: 'PENDING_VALIDATION',
      },
      include: EDUCATOR_SELECT,
    });

    await this.validationsService.create({
      resourceType: 'ACTIVITY',
      resourceId: activity.id,
      submittedById,
    });

    await this.notificationsService.createForRole('DIRECTOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'ACTIVITY',
      resourceId: activity.id,
      title: 'Activité à valider',
      message: `L'activité "${activity.title}" nécessite une validation.`,
    });

    return activity;
  }

  findAll(validationStatus?: ValidationStatus) {
    return this.prisma.activity.findMany({
      where: validationStatus !== undefined ? { validationStatus } : {},
      include: EDUCATOR_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: EDUCATOR_SELECT,
    });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async approve(id: string, userId: string, dto: ReviewValidationDto) {
    const activity = await this.findRaw(id);

    const validation = await this.validationsService.approve({
      resourceType: 'ACTIVITY',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.activity.update({
      where: { id },
      data: { validationStatus: 'APPROVED' },
      include: EDUCATOR_SELECT,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'ACTIVITY',
      resourceId: id,
      title: 'Activité validée',
      message: `L'activité "${activity.title}" a été validée.`,
    });

    return updated;
  }

  async reject(id: string, userId: string, dto: RejectValidationDto) {
    const activity = await this.findRaw(id);

    const validation = await this.validationsService.reject({
      resourceType: 'ACTIVITY',
      resourceId: id,
      reviewedById: userId,
      comment: dto.comment,
    });

    const updated = await this.prisma.activity.update({
      where: { id },
      data: { validationStatus: 'REJECTED' },
      include: EDUCATOR_SELECT,
    });

    await this.notificationsService.create({
      recipientId: validation.submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'ACTIVITY',
      resourceId: id,
      title: 'Activité refusée',
      message: `L'activité "${activity.title}" a été refusée.`,
    });

    return updated;
  }

  history(id: string) {
    return this.validationsService.findHistory('ACTIVITY', id);
  }
}
