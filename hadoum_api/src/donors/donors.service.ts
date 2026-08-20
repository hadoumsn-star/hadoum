import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonorProfile, DonorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { CreateDonorProfileDto } from './dto/create-donor-profile.dto';
import { UpdateDonorProfileDto } from './dto/update-donor-profile.dto';
import { QueryDonorProfilesDto } from './dto/query-donor-profiles.dto';

// Curated projection — never `include: true` / a bare relation. Contact
// carries no auth data of its own, but keeping this explicit (rather than
// returning every Contact/User column) is what keeps the donor registry
// response free of unrelated internal metadata, and is what makes it safe
// to extend User's own relations later without silently widening this
// response. `select` (not `include`) throughout — Prisma rejects mixing
// the two, and `select` is what forces every new column added to Contact/
// User in the future to be an opt-in addition here, not an accidental leak.
const DONOR_PROFILE_SELECT = {
  id: true,
  type: true,
  country: true,
  engagementStartDate: true,
  monthlyContributionXof: true,
  active: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  contact: {
    select: {
      id: true,
      fullName: true,
      organization: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      photoKey: true,
      photoMime: true,
      active: true,
    },
  },
  createdBy: {
    select: { id: true, name: true, initials: true, roleLabel: true },
  },
} satisfies Prisma.DonorProfileSelect;

export type DonorProfileResponse = Prisma.DonorProfileGetPayload<{
  select: typeof DONOR_PROFILE_SELECT;
}>;

@Injectable()
export class DonorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Trims a string and turns an empty result into `undefined` ("not set"). */
  private cleanOptional(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * A DONATEUR_PONCTUEL never carries a recurring commitment. Rather than
   * rejecting a create/update that still has engagementStartDate/
   * monthlyContributionXof set (or inherited from a prior PARRAIN state),
   * they're cleared automatically — the simplest, most predictable option
   * of the two named in the approved plan: a caller switching a donor's
   * type never has to make a second call first to clear stale fields, and
   * a DonorProfile can never end up DONATEUR_PONCTUEL with a monthly
   * amount still attached.
   */
  private resolveRecurringFields(
    type: DonorType,
    input: {
      engagementStartDate?: string | null;
      monthlyContributionXof?: number | null;
    },
  ): {
    engagementStartDate: Date | null;
    monthlyContributionXof: number | null;
  } {
    if (type === 'DONATEUR_PONCTUEL') {
      return { engagementStartDate: null, monthlyContributionXof: null };
    }
    return {
      engagementStartDate: input.engagementStartDate
        ? new Date(input.engagementStartDate)
        : null,
      monthlyContributionXof: input.monthlyContributionXof ?? null,
    };
  }

  private async findRaw(id: string): Promise<DonorProfile> {
    const donor = await this.prisma.donorProfile.findUnique({ where: { id } });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');
    return donor;
  }

  // ─── DonorProfile ───────────────────────────────────────────────────────

  async create(
    dto: CreateDonorProfileDto,
    createdById: string,
  ): Promise<DonorProfileResponse> {
    // Reuses ContactsService as-is (throws NotFoundException itself if the
    // Contact doesn't exist) — DonorsService never re-implements Contact
    // lookup/validation.
    await this.contactsService.findOne(dto.contactId);

    const existing = await this.prisma.donorProfile.findUnique({
      where: { contactId: dto.contactId },
    });
    if (existing) {
      throw new ConflictException(
        'Ce contact est déjà associé à un profil donateur.',
      );
    }

    const recurring = this.resolveRecurringFields(dto.type, dto);

    return this.prisma.donorProfile.create({
      data: {
        contactId: dto.contactId,
        type: dto.type,
        country: this.cleanOptional(dto.country) ?? null,
        notes: this.cleanOptional(dto.notes) ?? null,
        engagementStartDate: recurring.engagementStartDate,
        monthlyContributionXof: recurring.monthlyContributionXof,
        createdById,
      },
      select: DONOR_PROFILE_SELECT,
    });
  }

  async findAll(query: QueryDonorProfilesDto): Promise<{
    data: DonorProfileResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const active = query.active ?? true;

    const where: Prisma.DonorProfileWhereInput = {
      active,
      ...(query.type ? { type: query.type } : {}),
      ...(query.country
        ? {
            country: {
              equals: query.country,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(query.search
        ? {
            contact: {
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
                  phone: {
                    contains: query.search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  email: {
                    contains: query.search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              ],
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.donorProfile.findMany({
        where,
        select: DONOR_PROFILE_SELECT,
        // Contact.fullName alone isn't unique — `id` is a stable tiebreaker
        // so pagination never reorders/duplicates rows between pages, same
        // convention as ContactsService.findAll.
        orderBy: [{ contact: { fullName: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.donorProfile.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<DonorProfileResponse> {
    const donor = await this.prisma.donorProfile.findUnique({
      where: { id },
      select: DONOR_PROFILE_SELECT,
    });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');
    return donor;
  }

  async update(
    id: string,
    dto: UpdateDonorProfileDto,
  ): Promise<DonorProfileResponse> {
    const existing = await this.findRaw(id);
    const nextType = dto.type ?? existing.type;

    const recurring = this.resolveRecurringFields(nextType, {
      engagementStartDate:
        dto.engagementStartDate !== undefined
          ? dto.engagementStartDate
          : existing.engagementStartDate?.toISOString(),
      monthlyContributionXof:
        dto.monthlyContributionXof !== undefined
          ? dto.monthlyContributionXof
          : existing.monthlyContributionXof,
    });

    return this.prisma.donorProfile.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.country !== undefined
          ? { country: this.cleanOptional(dto.country) ?? null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: this.cleanOptional(dto.notes) ?? null }
          : {}),
        engagementStartDate: recurring.engagementStartDate,
        monthlyContributionXof: recurring.monthlyContributionXof,
      },
      select: DONOR_PROFILE_SELECT,
    });
  }

  async deactivate(id: string): Promise<DonorProfileResponse> {
    await this.findRaw(id);
    return this.prisma.donorProfile.update({
      where: { id },
      data: { active: false },
      select: DONOR_PROFILE_SELECT,
    });
  }

  async reactivate(id: string): Promise<DonorProfileResponse> {
    await this.findRaw(id);
    return this.prisma.donorProfile.update({
      where: { id },
      data: { active: true },
      select: DONOR_PROFILE_SELECT,
    });
  }
}
