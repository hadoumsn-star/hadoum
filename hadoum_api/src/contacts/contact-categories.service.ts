import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactCategoryDto } from './dto/create-contact-category.dto';
import { UpdateContactCategoryDto } from './dto/update-contact-category.dto';

@Injectable()
export class ContactCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(active = true): Promise<ContactCategory[]> {
    return this.prisma.contactCategory.findMany({
      where: { active },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  private async findRaw(id: string): Promise<ContactCategory> {
    const category = await this.prisma.contactCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Catégorie introuvable.');
    return category;
  }

  create(dto: CreateContactCategoryDto): Promise<ContactCategory> {
    return this.prisma.contactCategory.create({
      data: {
        key: dto.key.trim(),
        label: dto.label.trim(),
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateContactCategoryDto,
  ): Promise<ContactCategory> {
    await this.findRaw(id);
    return this.prisma.contactCategory.update({
      where: { id },
      data: {
        ...(dto.key !== undefined ? { key: dto.key.trim() } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deactivate(id: string): Promise<ContactCategory> {
    await this.findRaw(id);

    // The DB's onDelete: Restrict only guards against a hard delete — a
    // status flip needs its own explicit check so a category can't be
    // silently hidden while contacts still rely on it being selectable.
    const stillInUse = await this.prisma.contact.count({
      where: { categoryId: id, active: true },
    });
    if (stillInUse > 0) {
      throw new ConflictException(
        `Cette catégorie est encore utilisée par ${stillInUse} contact(s) actif(s) et ne peut pas être désactivée.`,
      );
    }

    return this.prisma.contactCategory.update({
      where: { id },
      data: { active: false },
    });
  }
}
