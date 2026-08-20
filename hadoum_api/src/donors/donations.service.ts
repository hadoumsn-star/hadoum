import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  Prisma,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';

// Curated projection — donor identity is limited to id+fullName (full
// donor detail lives at GET /donors/:id, not duplicated here); the linked
// Finance Transaction is exposed only as its bare id (transactionId),
// never the embedded Transaction object — "operationally useful, not
// unrelated Finance internals" per the PR 16 plan.
const DONATION_SELECT = {
  id: true,
  amountXof: true,
  date: true,
  paymentMethod: true,
  reference: true,
  notes: true,
  transactionId: true,
  createdAt: true,
  donorProfile: {
    select: {
      id: true,
      type: true,
      contact: { select: { id: true, fullName: true } },
    },
  },
  campaign: { select: { id: true, title: true, status: true } },
  createdBy: {
    select: { id: true, name: true, initials: true, roleLabel: true },
  },
} satisfies Prisma.DonationSelect;

export type DonationResponse = Prisma.DonationGetPayload<{
  select: typeof DONATION_SELECT;
}>;

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financesService: FinancesService,
  ) {}

  private cleanOptional(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * The critical Finance-integration path (PR 16 §6/§7/§8).
   *
   * Exactly one Transaction is created per recorded Donation, through
   * FinancesService.createTransaction() — never a second accounting
   * implementation. Both writes happen inside one `prisma.$transaction`:
   * the Transaction is created first (Donation.transactionId needs its
   * id), then the Donation referencing it — if either insert fails, both
   * roll back together, so a Donation can never exist without its ledger
   * entry and a Transaction can never be orphaned by a failed Donation
   * insert. No compensating deletes anywhere in this method; the DB
   * transaction is the only safety mechanism, as instructed.
   *
   * Idempotency: `dto.idempotencyKey`, if supplied, is checked *before*
   * attempting the transaction (covers the common sequential retry/double-
   * click case cheaply) and *after* a unique-constraint failure on it
   * (covers two genuinely concurrent requests racing each other) — either
   * path returns the one Donation that actually got created, never a
   * second one. See Donation.idempotencyKey's own schema comment.
   */
  async create(
    dto: CreateDonationDto,
    createdById: string,
  ): Promise<DonationResponse> {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.donation.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    const donor = await this.prisma.donorProfile.findUnique({
      where: { id: dto.donorProfileId },
      include: {
        contact: { select: { id: true, fullName: true, active: true } },
      },
    });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');
    if (!donor.active) {
      throw new BadRequestException('Ce profil donateur est inactif.');
    }
    if (!donor.contact.active) {
      throw new BadRequestException(
        'Le contact associé à ce donateur est désactivé.',
      );
    }

    let campaign: { id: string; title: string; status: CampaignStatus } | null =
      null;
    if (dto.campaignId) {
      campaign = await this.prisma.fundraisingCampaign.findUnique({
        where: { id: dto.campaignId },
        select: { id: true, title: true, status: true },
      });
      if (!campaign) throw new NotFoundException('Cagnotte introuvable.');
      if (campaign.status !== CampaignStatus.ACTIVE) {
        throw new BadRequestException(
          "Cette cagnotte n'accepte pas de nouveaux dons dans son état actuel.",
        );
      }
    }

    const label = campaign
      ? `Don — ${campaign.title} (${donor.contact.fullName})`
      : `Don de ${donor.contact.fullName}`;

    try {
      const donationId = await this.prisma.$transaction(async (tx) => {
        const transaction = await this.financesService.createTransaction(
          {
            type: TransactionType.RECETTE,
            category: TransactionCategory.DON,
            label,
            amountXof: dto.amountXof,
            date: dto.date,
            status: TransactionStatus.VALIDE,
            donorName: donor.contact.fullName,
            isAnonymousDonor: false,
            paymentMethod: dto.paymentMethod,
            createdBy: createdById,
          },
          tx,
        );

        const donation = await tx.donation.create({
          data: {
            donorProfileId: dto.donorProfileId,
            campaignId: dto.campaignId ?? null,
            amountXof: dto.amountXof,
            date: new Date(dto.date),
            paymentMethod: dto.paymentMethod,
            reference: this.cleanOptional(dto.reference) ?? null,
            notes: this.cleanOptional(dto.notes) ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
            transactionId: transaction.id,
            createdById,
          },
        });
        return donation.id;
      });
      return this.findOne(donationId);
    } catch (err) {
      if (
        dto.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // A concurrent duplicate submission with the same idempotency key
        // raced us here — the other request already committed a full
        // Donation + Transaction pair. Return that instead of a 500 or a
        // second one.
        const existing = await this.prisma.donation.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) return this.findOne(existing.id);
      }
      throw err;
    }
  }

  async findAll(query: QueryDonationsDto): Promise<{
    data: DonationResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DonationWhereInput = {
      ...(query.donorProfileId ? { donorProfileId: query.donorProfileId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.minAmountXof !== undefined || query.maxAmountXof !== undefined
        ? {
            amountXof: {
              ...(query.minAmountXof !== undefined
                ? { gte: query.minAmountXof }
                : {}),
              ...(query.maxAmountXof !== undefined
                ? { lte: query.maxAmountXof }
                : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.donation.findMany({
        where,
        select: DONATION_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.donation.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<DonationResponse> {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      select: DONATION_SELECT,
    });
    if (!donation) throw new NotFoundException('Don introuvable.');
    return donation;
  }

  /**
   * notes/reference only — see UpdateDonationDto's own comment for why
   * every financial field is deliberately absent from that DTO rather than
   * guarded here with runtime checks.
   */
  async update(id: string, dto: UpdateDonationDto): Promise<DonationResponse> {
    const existing = await this.prisma.donation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Don introuvable.');

    return this.prisma.donation.update({
      where: { id },
      data: {
        ...(dto.reference !== undefined
          ? { reference: this.cleanOptional(dto.reference) ?? null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: this.cleanOptional(dto.notes) ?? null }
          : {}),
      },
      select: DONATION_SELECT,
    });
  }
}
