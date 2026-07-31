import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  UserRole,
  ValidationResourceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  resourceType?: ValidationResourceType;
  resourceId?: string;
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateNotificationInput) {
    return this.prisma.notification.create({ data: input });
  }

  async createForRole(
    role: UserRole,
    input: Omit<CreateNotificationInput, 'recipientId'>,
  ) {
    const recipients = await this.prisma.user.findMany({
      where: { role },
      select: { id: true },
    });
    await Promise.all(
      recipients.map((r) => this.create({ ...input, recipientId: r.id })),
    );
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('Notification introuvable.');
    if (notification.recipientId !== userId) {
      throw new ForbiddenException(
        'Cette notification ne vous appartient pas.',
      );
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
  }
}
