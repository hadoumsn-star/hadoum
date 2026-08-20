import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DonorReportPeriodType,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The privacy boundary for donor reports, made an explicit, independently
 * testable data shape (PR 17 §6). Every field here is either a plain
 * aggregate number, a donor's own name, or Director-provided free text —
 * nothing here is, or is derived from, a raw Child/StaffMember/
 * DailyObservation row. See ReportDataService.build for exactly which
 * queries produce each field.
 */
export interface SafeDonorReportData {
  donorName: string;
  periodType: DonorReportPeriodType;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  financialSummary: {
    /** This donor's own contribution in the period — never conflated with the line below. */
    donorContributionXof: number;
    donorContributionCount: number;
    /** Hadoum's overall validated income in the period — organization-wide context, not this donor's money. */
    orphanageTotalReceivedXof: number;
    /** Only campaigns this donor actually gave to in the period, with their own contribution to each. */
    campaignContributions: { campaignTitle: string; amountXof: number }[];
  };
  activitiesSummary: {
    childrenWelcomed: number;
    entriesInPeriod: number;
    exitsInPeriod: number;
    activitiesCount: number;
    /** Director-provided text — never fabricated (see ReportDataService.build's own comment). */
    narrative: string | null;
  };
  approvedPhotos: {
    fileKey: string;
    fileMime: string;
    caption: string | null;
  }[];
}

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the exact, privacy-safe data set a donor report is rendered
   * from. Every child/activity figure below is a `count()`/`aggregate()`
   * call — Prisma's count/aggregate never returns row data, only a number,
   * which makes it structurally impossible for a name, date of birth, or
   * any other child-identifying field to leak through this method,
   * regardless of what's added to Child/Activity in the future. Nothing
   * here ever does `child.findMany()` and strips fields afterwards — see
   * PR 17's report ("Do not fetch detailed Child records and then merely
   * hide their names afterward").
   *
   * `activitiesNarrative` is passed in, never generated — there is no
   * automated narrative summarizer; if the Director hasn't written one,
   * `narrative` is simply `null` rather than invented text.
   */
  async build(input: {
    donorProfileId: string;
    donorReportId: string;
    periodType: DonorReportPeriodType;
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
    activitiesNarrative: string | null;
  }): Promise<SafeDonorReportData> {
    const donor = await this.prisma.donorProfile.findUnique({
      where: { id: input.donorProfileId },
      select: { contact: { select: { fullName: true } } },
    });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');

    const { periodStart, periodEnd, donorProfileId, donorReportId } = input;

    const [
      donorContribution,
      campaignSums,
      orphanageTotal,
      childrenWelcomed,
      entriesInPeriod,
      exitsInPeriod,
      activitiesCount,
      approvedPhotos,
    ] = await Promise.all([
      this.prisma.donation.aggregate({
        where: { donorProfileId, date: { gte: periodStart, lt: periodEnd } },
        _sum: { amountXof: true },
        _count: true,
      }),
      this.prisma.donation.groupBy({
        by: ['campaignId'],
        where: {
          donorProfileId,
          date: { gte: periodStart, lt: periodEnd },
          campaignId: { not: null },
        },
        _sum: { amountXof: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.RECETTE,
          status: TransactionStatus.VALIDE,
          date: { gte: periodStart, lt: periodEnd },
        },
        _sum: { amountXof: true },
      }),
      // Aggregate counts only — see this method's own doc comment.
      this.prisma.child.count({ where: { isActive: true } }),
      this.prisma.child.count({
        where: { entryDate: { gte: periodStart, lt: periodEnd } },
      }),
      this.prisma.child.count({
        where: { exitDate: { gte: periodStart, lt: periodEnd } },
      }),
      this.prisma.activity.count({
        where: { date: { gte: periodStart, lt: periodEnd } },
      }),
      this.prisma.donorReportPhoto.findMany({
        where: { donorReportId, approvedForDonorReport: true },
        select: { fileKey: true, fileMime: true, caption: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const campaignIds = campaignSums
      .map((s) => s.campaignId)
      .filter((id): id is string => id !== null);
    const campaigns = campaignIds.length
      ? await this.prisma.fundraisingCampaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, title: true },
        })
      : [];
    const titleById = new Map(campaigns.map((c) => [c.id, c.title]));

    return {
      donorName: donor.contact.fullName,
      periodType: input.periodType,
      periodStart,
      periodEnd,
      generatedAt: input.generatedAt,
      financialSummary: {
        donorContributionXof: donorContribution._sum.amountXof ?? 0,
        donorContributionCount: donorContribution._count,
        orphanageTotalReceivedXof: orphanageTotal._sum.amountXof ?? 0,
        campaignContributions: campaignSums.map((s) => ({
          campaignTitle: titleById.get(s.campaignId as string) ?? 'Cagnotte',
          amountXof: s._sum.amountXof ?? 0,
        })),
      },
      activitiesSummary: {
        childrenWelcomed,
        entriesInPeriod,
        exitsInPeriod,
        activitiesCount,
        narrative: input.activitiesNarrative,
      },
      approvedPhotos,
    };
  }
}
