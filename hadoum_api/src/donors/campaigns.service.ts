import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, FundraisingCampaign, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { computeCampaignAlerts } from './campaign-alerts.util';

const CAMPAIGN_SELECT = {
  id: true,
  title: true,
  description: true,
  targetAmountXof: true,
  startDate: true,
  endDate: true,
  status: true,
  utilizationReport: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, initials: true, roleLabel: true },
  },
  _count: { select: { donations: true } },
} satisfies Prisma.FundraisingCampaignSelect;

type CampaignRow = Prisma.FundraisingCampaignGetPayload<{
  select: typeof CAMPAIGN_SELECT;
}>;

export interface CampaignResponse extends Omit<CampaignRow, '_count'> {
  collectedAmountXof: number;
  remainingAmountXof: number;
  progressPercentage: number | null;
  donationsCount: number;
  // PR 19: lazy compute-on-read alert flags — same convention as
  // StockItemsService's isLowStock/isExpiringSoon. Both only ever apply to
  // an ACTIVE campaign; a campaign that's already TERMINEE/ANNULEE (or
  // BROUILLON with no start yet) is never flagged, and neither flag ever
  // mutates campaign.status itself — termination stays a DIRECTOR action
  // via the existing lifecycle endpoints, this is a surfaced alert only.
  isEndingSoon: boolean;
  isEndDatePassed: boolean;
}

// BROUILLON -> ACTIVE ("activate/start") or ANNULEE ("cancel", a draft that
// never launched). ACTIVE -> TERMINEE ("terminate") or ANNULEE ("cancel", a
// running campaign called off). TERMINEE/ANNULEE are terminal — no route
// out. Lifecycle endpoints only (CampaignsController); no generic "PATCH
// status" exists anywhere.
const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  BROUILLON: ['ACTIVE', 'ANNULEE'],
  ACTIVE: ['TERMINEE', 'ANNULEE'],
  TERMINEE: [],
  ANNULEE: [],
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private cleanOptional(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Collected/remaining/progress are always derived from Donation rows at
   * read time — never a stored, independently-mutable column (see
   * FundraisingCampaign's own schema comment) — so they can never drift
   * from what was actually recorded. `Math.max(0, ...)` clamps
   * remainingAmountXof at 0 for an overfunded campaign rather than showing
   * a negative "remaining"; progressPercentage is left uncapped so
   * overfunding is still visible (e.g. 134%). Division only ever happens
   * on the already-integer XOF sums for a display percentage — same
   * rounding convention as FinancesService.getDashboard's own
   * `percentage()` helper, not a new one.
   */
  private withComputed(
    campaign: CampaignRow,
    collectedAmountXof: number,
  ): CampaignResponse {
    const { _count, ...rest } = campaign;
    const remainingAmountXof = Math.max(
      0,
      campaign.targetAmountXof - collectedAmountXof,
    );
    const progressPercentage =
      campaign.targetAmountXof === 0
        ? null
        : Math.round((collectedAmountXof / campaign.targetAmountXof) * 10000) /
          100;

    const { isEndingSoon, isEndDatePassed } = computeCampaignAlerts(campaign);

    return {
      ...rest,
      collectedAmountXof,
      remainingAmountXof,
      progressPercentage,
      donationsCount: _count.donations,
      isEndingSoon,
      isEndDatePassed,
    };
  }

  /**
   * PR 19: same dedup convention as StockItemsService.notifyStockAlertsOnce
   * — a findFirst check for an existing Notification of this exact (type,
   * resourceType, resourceId) before creating a new one, so DIRECTOR gets
   * notified once per condition, not once per list read. Called from
   * findAll() below (lazy compute-on-read, no cron); errors are swallowed
   * per-campaign so one notification failure can't break the list response
   * itself.
   */
  private async notifyCampaignAlertsOnce(campaign: CampaignResponse) {
    const checks: Array<{
      trigger: boolean;
      type: 'CAMPAIGN_ENDING_SOON' | 'CAMPAIGN_END_DATE_PASSED';
      title: string;
      message: string;
    }> = [
      {
        trigger: campaign.isEndingSoon,
        type: 'CAMPAIGN_ENDING_SOON',
        title: 'Cagnotte bientôt terminée',
        message: `La cagnotte « ${campaign.title} » se termine bientôt.`,
      },
      {
        trigger: campaign.isEndDatePassed,
        type: 'CAMPAIGN_END_DATE_PASSED',
        title: 'Cagnotte à clôturer',
        message: `La cagnotte « ${campaign.title} » a dépassé sa date de fin et attend d'être terminée ou annulée.`,
      },
    ];

    for (const check of checks) {
      if (!check.trigger) continue;
      try {
        const alreadyNotified = await this.prisma.notification.findFirst({
          where: {
            resourceType: 'CAMPAIGN',
            resourceId: campaign.id,
            type: check.type,
          },
        });
        if (alreadyNotified) continue;
        await this.notificationsService.createForRole('DIRECTOR', {
          type: check.type,
          resourceType: 'CAMPAIGN',
          resourceId: campaign.id,
          title: check.title,
          message: check.message,
        });
      } catch {
        // Never let a notification failure break the campaigns list itself.
      }
    }
  }

  private async collectedAmount(campaignId: string): Promise<number> {
    const result = await this.prisma.donation.aggregate({
      where: { campaignId },
      _sum: { amountXof: true },
    });
    return result._sum.amountXof ?? 0;
  }

  private async findRaw(id: string): Promise<FundraisingCampaign> {
    const campaign = await this.prisma.fundraisingCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Cagnotte introuvable.');
    return campaign;
  }

  async create(
    dto: CreateCampaignDto,
    createdById: string,
  ): Promise<CampaignResponse> {
    const campaign = await this.prisma.fundraisingCampaign.create({
      data: {
        title: dto.title.trim(),
        description: this.cleanOptional(dto.description) ?? null,
        targetAmountXof: dto.targetAmountXof,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        utilizationReport: this.cleanOptional(dto.utilizationReport) ?? null,
        createdById,
      },
      select: CAMPAIGN_SELECT,
    });
    return this.withComputed(campaign, 0);
  }

  async findAll(query: QueryCampaignsDto): Promise<{
    data: CampaignResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.FundraisingCampaignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            title: {
              contains: query.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.fundraisingCampaign.findMany({
        where,
        select: CAMPAIGN_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fundraisingCampaign.count({ where }),
    ]);

    const sums = await this.prisma.donation.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: rows.map((r) => r.id) } },
      _sum: { amountXof: true },
    });
    const sumByCampaign = new Map(
      sums.map((s) => [s.campaignId as string, s._sum.amountXof ?? 0]),
    );

    const data = rows.map((row) =>
      this.withComputed(row, sumByCampaign.get(row.id) ?? 0),
    );
    await Promise.all(data.map((c) => this.notifyCampaignAlertsOnce(c)));

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<CampaignResponse> {
    const campaign = await this.prisma.fundraisingCampaign.findUnique({
      where: { id },
      select: CAMPAIGN_SELECT,
    });
    if (!campaign) throw new NotFoundException('Cagnotte introuvable.');
    return this.withComputed(campaign, await this.collectedAmount(id));
  }

  async update(id: string, dto: UpdateCampaignDto): Promise<CampaignResponse> {
    await this.findRaw(id);
    const campaign = await this.prisma.fundraisingCampaign.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: this.cleanOptional(dto.description) ?? null }
          : {}),
        ...(dto.targetAmountXof !== undefined
          ? { targetAmountXof: dto.targetAmountXof }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: new Date(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.utilizationReport !== undefined
          ? {
              utilizationReport:
                this.cleanOptional(dto.utilizationReport) ?? null,
            }
          : {}),
      },
      select: CAMPAIGN_SELECT,
    });
    return this.withComputed(campaign, await this.collectedAmount(id));
  }

  private async transition(
    id: string,
    to: CampaignStatus,
  ): Promise<CampaignResponse> {
    const existing = await this.findRaw(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed.includes(to)) {
      throw new ConflictException(
        `Transition de statut non autorisée : ${existing.status} → ${to}.`,
      );
    }
    const campaign = await this.prisma.fundraisingCampaign.update({
      where: { id },
      data: { status: to },
      select: CAMPAIGN_SELECT,
    });
    return this.withComputed(campaign, await this.collectedAmount(id));
  }

  activate(id: string): Promise<CampaignResponse> {
    return this.transition(id, 'ACTIVE');
  }

  terminate(id: string): Promise<CampaignResponse> {
    return this.transition(id, 'TERMINEE');
  }

  cancel(id: string): Promise<CampaignResponse> {
    return this.transition(id, 'ANNULEE');
  }

  // ─── Documents (PR 17 — deferred in PR 16, implemented here) ────────────
  // Same shape as SupplierContractsService's own document methods —
  // reused convention, not a second upload implementation.

  async uploadDocument(id: string, file: Express.Multer.File, label?: string) {
    await this.findRaw(id);
    const fileKey = await this.uploadService.upload(file, `campaigns/${id}`);
    return this.prisma.campaignDocument.create({
      data: {
        campaignId: id,
        fileKey,
        fileMime: file.mimetype,
        label: this.cleanOptional(label) ?? null,
      },
    });
  }

  async listDocuments(id: string) {
    await this.findRaw(id);
    return this.prisma.campaignDocument.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.campaignDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.campaignId !== id) {
      throw new NotFoundException('Document introuvable.');
    }
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, documentId: string): Promise<void> {
    const doc = await this.prisma.campaignDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.campaignId !== id) {
      throw new NotFoundException('Document introuvable.');
    }
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.campaignDocument.delete({ where: { id: documentId } });
  }
}
