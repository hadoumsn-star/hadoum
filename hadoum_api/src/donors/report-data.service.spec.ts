import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportDataService } from './report-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { matching } from '../test-utils/jest-matchers';

/**
 * Deliberately does NOT define `child.findMany` (or `activity.findMany`)
 * on this mock at all — only `count`. If ReportDataService.build ever
 * called `this.prisma.child.findMany(...)`, this test would fail with a
 * hard "is not a function" TypeError, not just a wrong assertion. That's
 * the actual architectural proof behind "Prefer aggregate queries that
 * never retrieve unnecessary child PII" (PR 17 §4) — not merely that this
 * particular run happened not to leak a name.
 */
function createMockPrisma() {
  return {
    donorProfile: { findUnique: jest.fn() },
    donation: { aggregate: jest.fn(), groupBy: jest.fn() },
    transaction: { aggregate: jest.fn() },
    child: { count: jest.fn() },
    activity: { count: jest.fn() },
    donorReportPhoto: { findMany: jest.fn() },
    fundraisingCampaign: { findMany: jest.fn() },
  };
}

describe('ReportDataService', () => {
  let service: ReportDataService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const baseInput = {
    donorProfileId: 'donor-1',
    donorReportId: 'report-1',
    periodType: 'TRIMESTRIEL' as const,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-31'),
    generatedAt: new Date('2026-04-01'),
    activitiesNarrative: null,
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    prisma.donorProfile.findUnique.mockResolvedValue({
      contact: { fullName: 'Fatou Diop' },
    });
    prisma.donation.aggregate.mockResolvedValue({
      _sum: { amountXof: 45_000 },
      _count: 3,
    });
    prisma.donation.groupBy.mockResolvedValue([]);
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amountXof: 1_250_000 },
    });
    prisma.child.count.mockResolvedValue(0);
    prisma.activity.count.mockResolvedValue(0);
    prisma.donorReportPhoto.findMany.mockResolvedValue([]);
    prisma.fundraisingCampaign.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportDataService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportDataService);
  });

  it('never calls child.findMany or activity.findMany — only count() (structural privacy proof)', async () => {
    await service.build(baseInput);
    // No assertion needed beyond "this didn't throw" — the mock has no
    // findMany method on child/activity at all, so any such call would
    // have crashed the test with a TypeError.
    expect(prisma.child.count).toHaveBeenCalled();
    expect(prisma.activity.count).toHaveBeenCalled();
  });

  it('scopes every aggregate to the exact period boundaries given', async () => {
    await service.build(baseInput);

    expect(prisma.donation.aggregate).toHaveBeenCalledWith(
      matching({
        where: {
          donorProfileId: 'donor-1',
          date: { gte: baseInput.periodStart, lt: baseInput.periodEnd },
        },
      }),
    );
    expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
      matching({
        where: matching({
          type: 'RECETTE',
          status: 'VALIDE',
          date: { gte: baseInput.periodStart, lt: baseInput.periodEnd },
        }),
      }),
    );
    expect(prisma.child.count).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });

  it('keeps this donor’s own contribution separate from the orphanage-wide total', async () => {
    const data = await service.build(baseInput);
    expect(data.financialSummary.donorContributionXof).toBe(45_000);
    expect(data.financialSummary.donorContributionCount).toBe(3);
    expect(data.financialSummary.orphanageTotalReceivedXof).toBe(1_250_000);
    // The two are never conflated into one figure.
    expect(data.financialSummary.donorContributionXof).not.toBe(
      data.financialSummary.orphanageTotalReceivedXof,
    );
  });

  it('resolves campaign contributions to real campaign titles', async () => {
    prisma.donation.groupBy.mockResolvedValue([
      { campaignId: 'campaign-1', _sum: { amountXof: 20_000 } },
    ]);
    prisma.fundraisingCampaign.findMany.mockResolvedValue([
      { id: 'campaign-1', title: 'Rentrée scolaire' },
    ]);

    const data = await service.build(baseInput);
    expect(data.financialSummary.campaignContributions).toEqual([
      { campaignTitle: 'Rentrée scolaire', amountXof: 20_000 },
    ]);
  });

  it('passes the Director-provided narrative through unchanged — never generates one', async () => {
    const withNarrative = await service.build({
      ...baseInput,
      activitiesNarrative: 'Texte écrit par le Directeur.',
    });
    expect(withNarrative.activitiesSummary.narrative).toBe(
      'Texte écrit par le Directeur.',
    );

    const withoutNarrative = await service.build(baseInput);
    expect(withoutNarrative.activitiesSummary.narrative).toBeNull();
  });

  it('only includes photos explicitly approved for this exact report', async () => {
    await service.build(baseInput);
    expect(prisma.donorReportPhoto.findMany).toHaveBeenCalledWith(
      matching({
        where: { donorReportId: 'report-1', approvedForDonorReport: true },
      }),
    );
  });

  it('rejects an unknown donor', async () => {
    prisma.donorProfile.findUnique.mockResolvedValue(null);
    await expect(service.build(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
