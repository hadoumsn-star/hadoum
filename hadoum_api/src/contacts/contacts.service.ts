import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contact, ContactCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from './contacts.utils';

export interface CompactContact {
  id: string;
  fullName: string;
  organization: string | null;
  functionTitle: string | null;
  category: { id: string; key: string; label: string; color: string | null };
  phone: string | null;
  email: string | null;
  active: boolean;
}

type ContactWithCategory = Contact & { category: ContactCategory };

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Trims a string and turns an empty result into `undefined` ("not set"). */
  private cleanOptional(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  toCompact(contact: ContactWithCategory): CompactContact {
    return {
      id: contact.id,
      fullName: contact.fullName,
      organization: contact.organization,
      functionTitle: contact.functionTitle,
      category: {
        id: contact.category.id,
        key: contact.category.key,
        label: contact.category.label,
        color: contact.category.color,
      },
      phone: contact.phone,
      email: contact.email,
      active: contact.active,
    };
  }

  private async findRaw(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact introuvable.');
    return contact;
  }

  private async assertCategoryActive(
    categoryId: string,
  ): Promise<ContactCategory> {
    const category = await this.prisma.contactCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('Catégorie de contact introuvable.');
    }
    if (!category.active) {
      throw new BadRequestException(
        'Cette catégorie de contact est désactivée et ne peut plus être assignée.',
      );
    }
    return category;
  }

  /**
   * Exact-match (post-normalization) duplicate scan among active contacts —
   * see contacts.utils.ts for why this is deliberately not fuzzy. Scans in
   * application code rather than pushing the comparison into SQL, since
   * normalization (digit-only phone, case-folded name) can't be expressed as
   * a plain column match — acceptable at this directory's expected scale
   * (low hundreds of rows), not something to optimize prematurely.
   */
  private async findDuplicate(input: {
    fullName: string;
    organization?: string | null;
    phone?: string | null;
    email?: string | null;
  }): Promise<ContactWithCategory | null> {
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedFullName = normalizeName(input.fullName);
    const normalizedOrganization = normalizeName(input.organization);

    const activeContacts = await this.prisma.contact.findMany({
      where: { active: true },
      include: { category: true },
    });

    return (
      activeContacts.find((c) => {
        if (normalizedPhone && normalizePhone(c.phone) === normalizedPhone) {
          return true;
        }
        if (normalizedEmail && normalizeEmail(c.email) === normalizedEmail) {
          return true;
        }
        if (
          normalizedFullName &&
          normalizedOrganization &&
          normalizeName(c.fullName) === normalizedFullName &&
          normalizeName(c.organization) === normalizedOrganization
        ) {
          return true;
        }
        return false;
      }) ?? null
    );
  }

  // ─── Contacts ───────────────────────────────────────────────────────────

  async create(
    dto: CreateContactDto,
    force = false,
  ): Promise<ContactWithCategory | { possibleDuplicate: CompactContact }> {
    await this.assertCategoryActive(dto.categoryId);

    if (!force) {
      const duplicate = await this.findDuplicate(dto);
      if (duplicate) {
        // Deterministic, documented shape: a possible-duplicate response is
        // always a 409 with the candidate contact attached, never a silent
        // pick of either option — the caller decides (§4 of the plan).
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Un contact similaire existe déjà.',
          possibleDuplicate: this.toCompact(duplicate),
        });
      }
    }

    return this.prisma.contact.create({
      data: {
        fullName: dto.fullName.trim(),
        organization: this.cleanOptional(dto.organization),
        functionTitle: this.cleanOptional(dto.functionTitle),
        categoryId: dto.categoryId,
        phone: this.cleanOptional(dto.phone),
        whatsappEnabled: dto.whatsappEnabled ?? false,
        email: this.cleanOptional(dto.email),
        address: this.cleanOptional(dto.address),
        city: this.cleanOptional(dto.city),
        notes: this.cleanOptional(dto.notes),
      },
      include: { category: true },
    });
  }

  async findAll(query: QueryContactsDto): Promise<{
    data: ContactWithCategory[] | CompactContact[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const active = query.active ?? true;

    const where: Prisma.ContactWhereInput = {
      active,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                fullName: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                organization: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                functionTitle: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                phone: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                notes: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { category: true },
        // fullName alone isn't unique — `id` is a stable tiebreaker so
        // pagination never reorders/duplicates rows between pages.
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data: query.compact ? rows.map((c) => this.toCompact(c)) : rows,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<ContactWithCategory> {
    // Deliberately not filtered by `active` — a contact referenced by an
    // existing record must stay readable after being deactivated.
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!contact) throw new NotFoundException('Contact introuvable.');
    return contact;
  }

  async update(
    id: string,
    dto: UpdateContactDto,
  ): Promise<ContactWithCategory> {
    await this.findRaw(id);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryActive(dto.categoryId);
    }

    return this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined
          ? { fullName: dto.fullName.trim() }
          : {}),
        ...(dto.organization !== undefined
          ? { organization: this.cleanOptional(dto.organization) ?? null }
          : {}),
        ...(dto.functionTitle !== undefined
          ? { functionTitle: this.cleanOptional(dto.functionTitle) ?? null }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.phone !== undefined
          ? { phone: this.cleanOptional(dto.phone) ?? null }
          : {}),
        ...(dto.whatsappEnabled !== undefined
          ? { whatsappEnabled: dto.whatsappEnabled }
          : {}),
        ...(dto.email !== undefined
          ? { email: this.cleanOptional(dto.email) ?? null }
          : {}),
        ...(dto.address !== undefined
          ? { address: this.cleanOptional(dto.address) ?? null }
          : {}),
        ...(dto.city !== undefined
          ? { city: this.cleanOptional(dto.city) ?? null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: this.cleanOptional(dto.notes) ?? null }
          : {}),
        // `active` is never in `dto` — see UpdateContactDto.
      },
      include: { category: true },
    });
  }

  async deactivate(id: string): Promise<ContactWithCategory> {
    await this.findRaw(id);
    // Soft delete only. PR 1 adds no relation from any other table to
    // Contact, so there is nothing yet that a deactivation could break —
    // this is still a real, permanent-shaped operation (never a hard
    // delete) so later PRs that do add references stay safe by construction.
    return this.prisma.contact.update({
      where: { id },
      data: { active: false },
      include: { category: true },
    });
  }

  async reactivate(id: string): Promise<ContactWithCategory> {
    await this.findRaw(id);
    return this.prisma.contact.update({
      where: { id },
      data: { active: true },
      include: { category: true },
    });
  }

  // ─── Photo ──────────────────────────────────────────────────────────────

  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
  ): Promise<ContactWithCategory> {
    const existing = await this.findRaw(id);

    // Upload the new file and point the row at it *before* removing the old
    // one, so a mid-operation failure never leaves photoKey pointing at an
    // already-deleted object.
    const photoKey = await this.uploadService.upload(file, `contacts/${id}`);
    const updated = await this.prisma.contact.update({
      where: { id },
      data: { photoKey, photoMime: file.mimetype },
      include: { category: true },
    });

    if (existing.photoKey) {
      await this.uploadService.deleteFile(existing.photoKey).catch(() => {
        // Best-effort cleanup of the old object — losing this race leaves an
        // orphaned S3 object, never a broken contact.
      });
    }

    return updated;
  }

  async getPhotoUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const contact = await this.findRaw(id);
    if (!contact.photoKey) {
      throw new NotFoundException("Ce contact n'a pas de photo.");
    }
    const url = await this.uploadService.getPresignedUrl(contact.photoKey);
    return { url, expiresIn: 900 };
  }

  async deletePhoto(id: string): Promise<ContactWithCategory> {
    const contact = await this.findRaw(id);
    if (contact.photoKey) {
      await this.uploadService.deleteFile(contact.photoKey);
    }
    return this.prisma.contact.update({
      where: { id },
      data: { photoKey: null, photoMime: null },
      include: { category: true },
    });
  }
}
