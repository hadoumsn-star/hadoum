import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

function createMockPrisma() {
  return {
    contact: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    contactCategory: {
      findUnique: jest.fn(),
    },
  };
}

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let upload: {
    upload: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const activeCategory = {
    id: 'cat-1',
    key: 'FOURNISSEUR',
    label: 'Fournisseur',
    color: null,
    sortOrder: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const inactiveCategory = { ...activeCategory, id: 'cat-2', active: false };

  const baseContact = {
    id: 'contact-1',
    fullName: 'Amadou Diop',
    organization: 'Sénégal Gaz',
    functionTitle: 'Gérant',
    categoryId: 'cat-1',
    phone: '+221 77 123 45 67',
    whatsappEnabled: false,
    email: 'amadou@example.com',
    address: null,
    city: null,
    notes: null,
    photoKey: null,
    photoMime: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
      ],
    }).compile();
    service = module.get(ContactsService);
  });

  describe('create', () => {
    it('creates a contact when the category is active and no duplicate exists', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.findMany.mockResolvedValue([]); // no active contacts to collide with
      prisma.contact.create.mockResolvedValue({
        ...baseContact,
        category: activeCategory,
      });

      const result = await service.create({
        fullName: 'Amadou Diop',
        categoryId: 'cat-1',
      });

      expect(prisma.contact.create).toHaveBeenCalled();
      expect((result as any).fullName).toBe('Amadou Diop');
    });

    it('rejects a categoryId that does not exist', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ fullName: 'x', categoryId: 'missing' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive category', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(inactiveCategory);

      await expect(
        service.create({ fullName: 'x', categoryId: 'cat-2' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it('warns on a duplicate phone match instead of creating', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.findMany.mockResolvedValue([
        { ...baseContact, category: activeCategory },
      ]);

      await expect(
        service.create({
          fullName: 'Someone Else',
          categoryId: 'cat-1',
          phone: '221771234567', // same digits as baseContact.phone once normalized
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it('warns on a duplicate email match instead of creating', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.findMany.mockResolvedValue([
        { ...baseContact, category: activeCategory },
      ]);

      await expect(
        service.create({
          fullName: 'Someone Else',
          categoryId: 'cat-1',
          email: 'AMADOU@example.com', // same email, different case
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('warns on a duplicate fullName + organization match instead of creating', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.findMany.mockResolvedValue([
        { ...baseContact, category: activeCategory },
      ]);

      await expect(
        service.create({
          fullName: '  amadou   diop ',
          organization: 'sénégal gaz',
          categoryId: 'cat-1',
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not flag a duplicate when neither phone, email, nor name+organization match', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.findMany.mockResolvedValue([
        { ...baseContact, category: activeCategory },
      ]);
      prisma.contact.create.mockResolvedValue({
        ...baseContact,
        id: 'contact-2',
        fullName: 'Fatou Ndiaye',
        organization: 'Autre Entreprise',
        phone: null,
        email: null,
        category: activeCategory,
      });

      const result = await service.create({
        fullName: 'Fatou Ndiaye',
        organization: 'Autre Entreprise',
        categoryId: 'cat-1',
      });

      expect((result as any).fullName).toBe('Fatou Ndiaye');
    });

    it('bypasses the duplicate check entirely when force=true', async () => {
      prisma.contactCategory.findUnique.mockResolvedValue(activeCategory);
      prisma.contact.create.mockResolvedValue({
        ...baseContact,
        category: activeCategory,
      });

      await service.create(
        { fullName: 'Amadou Diop', categoryId: 'cat-1' },
        true,
      );

      expect(prisma.contact.findMany).not.toHaveBeenCalled();
      expect(prisma.contact.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('defaults to active-only when no active filter is passed', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.contact.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20 });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('returns inactive contacts when active=false is explicitly requested', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.contact.count.mockResolvedValue(0);

      await service.findAll({ active: false, page: 1, pageSize: 20 });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('filters by categoryId when provided', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.contact.count.mockResolvedValue(0);

      await service.findAll({
        categoryId: 'cat-1',
        page: 1,
        pageSize: 20,
      });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-1' }),
        }),
      );
    });

    it('builds a search OR-clause across fullName, organization, functionTitle, phone, and notes', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.contact.count.mockResolvedValue(0);

      await service.findAll({
        search: 'gaz',
        page: 1,
        pageSize: 20,
      });

      const call = prisma.contact.findMany.mock.calls[0][0];
      const orFields = call.where.OR.map(
        (clause: any) => Object.keys(clause)[0],
      );
      expect(orFields).toEqual([
        'fullName',
        'organization',
        'functionTitle',
        'phone',
        'notes',
      ]);
    });

    it('returns the compact shape when compact=true', async () => {
      prisma.contact.findMany.mockResolvedValue([
        { ...baseContact, category: activeCategory },
      ]);
      prisma.contact.count.mockResolvedValue(1);

      const result = await service.findAll({
        compact: true,
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]).toEqual({
        id: 'contact-1',
        fullName: 'Amadou Diop',
        organization: 'Sénégal Gaz',
        functionTitle: 'Gérant',
        category: {
          id: 'cat-1',
          key: 'FOURNISSEUR',
          label: 'Fournisseur',
          color: null,
        },
        phone: '+221 77 123 45 67',
        email: 'amadou@example.com',
        active: true,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing contact', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns an inactive contact without filtering it out', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        ...baseContact,
        active: false,
        category: activeCategory,
      });
      const result = await service.findOne('contact-1');
      expect(result.active).toBe(false);
    });
  });

  describe('update', () => {
    it('preserves fields that are omitted from the update payload', async () => {
      prisma.contact.findUnique.mockResolvedValue(baseContact);
      prisma.contact.update.mockResolvedValue({
        ...baseContact,
        phone: '+221 78 000 00 00',
        category: activeCategory,
      });

      await service.update('contact-1', { phone: '+221 78 000 00 00' });

      const call = prisma.contact.update.mock.calls[0][0];
      expect(call.data).toEqual({ phone: '+221 78 000 00 00' });
    });

    it('rejects reassignment to an inactive category', async () => {
      prisma.contact.findUnique.mockResolvedValue(baseContact);
      prisma.contactCategory.findUnique.mockResolvedValue(inactiveCategory);

      await expect(
        service.update('contact-1', { categoryId: 'cat-2' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate / reactivate', () => {
    it('sets active=false on deactivate', async () => {
      prisma.contact.findUnique.mockResolvedValue(baseContact);
      prisma.contact.update.mockResolvedValue({
        ...baseContact,
        active: false,
        category: activeCategory,
      });

      const result = await service.deactivate('contact-1');

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(result.active).toBe(false);
    });

    it('sets active=true on reactivate', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        ...baseContact,
        active: false,
      });
      prisma.contact.update.mockResolvedValue({
        ...baseContact,
        active: true,
        category: activeCategory,
      });

      const result = await service.reactivate('contact-1');

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
      expect(result.active).toBe(true);
    });
  });

  describe('photo', () => {
    it('uploads a new photo, points the contact at it, then cleans up the old file', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        ...baseContact,
        photoKey: 'contacts/contact-1/old.jpg',
      });
      upload.upload.mockResolvedValue('contacts/contact-1/new.jpg');
      upload.deleteFile.mockResolvedValue(undefined);
      prisma.contact.update.mockResolvedValue({
        ...baseContact,
        photoKey: 'contacts/contact-1/new.jpg',
        photoMime: 'image/jpeg',
        category: activeCategory,
      });

      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x') } as any;
      await service.uploadPhoto('contact-1', file);

      expect(upload.upload).toHaveBeenCalledWith(file, 'contacts/contact-1');
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            photoKey: 'contacts/contact-1/new.jpg',
            photoMime: 'image/jpeg',
          },
        }),
      );
      expect(upload.deleteFile).toHaveBeenCalledWith(
        'contacts/contact-1/old.jpg',
      );
    });

    it('does not attempt to delete a previous photo when none existed', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        ...baseContact,
        photoKey: null,
      });
      upload.upload.mockResolvedValue('contacts/contact-1/first.jpg');
      prisma.contact.update.mockResolvedValue({
        ...baseContact,
        photoKey: 'contacts/contact-1/first.jpg',
        category: activeCategory,
      });

      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x') } as any;
      await service.uploadPhoto('contact-1', file);

      expect(upload.deleteFile).not.toHaveBeenCalled();
    });

    it('throws when requesting a photo URL for a contact with no photo', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        ...baseContact,
        photoKey: null,
      });
      await expect(service.getPhotoUrl('contact-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
