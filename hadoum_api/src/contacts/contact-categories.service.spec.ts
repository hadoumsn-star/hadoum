import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContactCategoriesService } from './contact-categories.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    contactCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    contact: {
      count: jest.fn(),
    },
  };
}

describe('ContactCategoriesService', () => {
  let service: ContactCategoriesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const category = {
    id: 'cat-1',
    key: 'FOURNISSEUR',
    label: 'Fournisseur',
    color: null,
    sortOrder: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactCategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ContactCategoriesService);
  });

  describe('findAll', () => {
    it('orders by sortOrder then label', async () => {
      prisma.contactCategory.findMany.mockResolvedValue([category]);
      await service.findAll(true);
      expect(prisma.contactCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('refuses to deactivate a category still used by active contacts', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(category);
      prisma.contact.count.mockResolvedValue(3);

      await expect(service.deactivate('cat-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.contactCategory.update).not.toHaveBeenCalled();
    });

    it('deactivates a category with no active contacts referencing it', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(category);
      prisma.contact.count.mockResolvedValue(0);
      prisma.contactCategory.update.mockResolvedValue({
        ...category,
        active: false,
      });

      const result = await service.deactivate('cat-1');

      expect(result.active).toBe(false);
    });

    it('throws NotFoundException for a missing category', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
