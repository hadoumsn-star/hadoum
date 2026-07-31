import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type MockPrisma = {
  notification: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  user: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findMany: jest.fn() },
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe('create', () => {
    it('creates a notification for a single recipient', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });

      const result = await service.create({
        recipientId: 'u1',
        type: 'VALIDATION_SUBMITTED',
        title: 'Validation requise',
        message: 'Un ticket attend votre validation.',
      });

      expect(result).toEqual({ id: 'n1' });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ recipientId: 'u1' }),
      });
    });
  });

  describe('createForRole', () => {
    it('fans out a notification to every user with the given role', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'sup1' },
        { id: 'sup2' },
      ]);
      prisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.createForRole('SUPERVISOR', {
        type: 'VALIDATION_SUBMITTED',
        title: 'Validation requise',
        message: 'x',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'SUPERVISOR' },
        select: { id: true },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ recipientId: 'sup1' }),
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ recipientId: 'sup2' }),
      });
    });

    it('creates nothing when no user has the given role', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.createForRole('SUPERVISOR', {
        type: 'VALIDATION_SUBMITTED',
        title: 'x',
        message: 'x',
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('findForUser / unreadCount', () => {
    it('lists only the requesting user notifications, newest first', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);

      await service.findForUser('u1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipientId: 'u1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('counts only unread notifications for the requesting user', async () => {
      prisma.notification.count.mockResolvedValue(3);

      const result = await service.unreadCount('u1');

      expect(result).toEqual({ count: 3 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { recipientId: 'u1', isRead: false },
      });
    });
  });

  describe('markRead (object-level authorization)', () => {
    it('marks a notification read on the happy path (owner matches)', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n1',
        recipientId: 'u1',
      });
      prisma.notification.update.mockResolvedValue({
        id: 'n1',
        isRead: true,
      });

      const result = await service.markRead('n1', 'u1');

      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead('missing', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException (IDOR guard) when the notification belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n1',
        recipientId: 'someone-else',
      });

      await expect(service.markRead('n1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('only updates the requesting user unread notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await service.markAllRead('u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'u1', isRead: false },
        data: { isRead: true },
      });
    });
  });
});
