import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonorReport, DonorReportPeriodType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportDataService } from './report-data.service';
import { PdfReportService } from './pdf-report.service';
import { CreateDonorReportDto } from './dto/create-donor-report.dto';
import { GenerateDonorReportDto } from './dto/generate-donor-report.dto';
import { QueryDonorReportsDto } from './dto/query-donor-reports.dto';

const PERIOD_LABEL: Record<DonorReportPeriodType, string> = {
  MENSUEL: 'mensuel',
  TRIMESTRIEL: 'trimestriel',
};

const DONOR_REPORT_SELECT = {
  id: true,
  periodType: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  generatedAt: true,
  sentAt: true,
  fileKey: true,
  fileMime: true,
  activitiesNarrative: true,
  financialSummarySnapshot: true,
  createdAt: true,
  updatedAt: true,
  donorProfile: {
    select: {
      id: true,
      type: true,
      contact: { select: { id: true, fullName: true } },
    },
  },
  createdBy: {
    select: { id: true, name: true, initials: true, roleLabel: true },
  },
  photos: {
    select: {
      id: true,
      fileKey: true,
      fileMime: true,
      caption: true,
      approvedForDonorReport: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.DonorReportSelect;

export type DonorReportResponse = Prisma.DonorReportGetPayload<{
  select: typeof DONOR_REPORT_SELECT;
}>;

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

@Injectable()
export class DonorReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly reportDataService: ReportDataService,
    private readonly pdfReportService: PdfReportService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * PR 19: "reports to prepare" alert — deliberately narrow. The only
   * deterministic, zero-false-positive signal available from the current
   * data model is "this active PARRAIN has never had a single DonorReport
   * created" (DonorProfile carries no explicit reporting-cadence field, and
   * periodType lives per-report, not per-donor — so inferring "a monthly
   * report is now late" from report history would be a guess about intent,
   * not a fact; that's deferred rather than risking a false alert here, per
   * the same reasoning applied to sponsor-payment follow-up in the Module 5
   * plan). Same lazy compute-on-read + findFirst dedup convention as
   * CampaignsService.notifyCampaignAlertsOnce, called from findAll() below.
   */
  private async notifyMissingDonorReportsOnce(): Promise<void> {
    const parrainsWithoutReports = await this.prisma.donorProfile.findMany({
      where: { type: 'PARRAIN', active: true, reports: { none: {} } },
      select: { id: true, contact: { select: { fullName: true } } },
    });
    for (const donor of parrainsWithoutReports) {
      try {
        const alreadyNotified = await this.prisma.notification.findFirst({
          where: {
            resourceType: 'DONOR_PROFILE',
            resourceId: donor.id,
            type: 'DONOR_REPORT_MISSING',
          },
        });
        if (alreadyNotified) continue;
        await this.notificationsService.createForRole('DIRECTOR', {
          type: 'DONOR_REPORT_MISSING',
          resourceType: 'DONOR_PROFILE',
          resourceId: donor.id,
          title: 'Rapport donateur à préparer',
          message: `Aucun rapport n'a encore été préparé pour le parrain « ${donor.contact.fullName} ».`,
        });
      } catch {
        // Never let a notification failure break the reports list itself.
      }
    }
  }

  private async findRaw(id: string): Promise<DonorReport> {
    const report = await this.prisma.donorReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Rapport donateur introuvable.');
    return report;
  }

  private async assertParrain(donorProfileId: string) {
    const donor = await this.prisma.donorProfile.findUnique({
      where: { id: donorProfileId },
    });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');
    // §3/§2 of the PR 17 plan: periodic reports are for PARRAIN only. A
    // DONATEUR_PONCTUEL is never silently enrolled into recurring
    // reporting — re-checked here (not just at create time) since a
    // profile's type can change between creating a DRAFT and generating
    // it.
    if (donor.type !== 'PARRAIN') {
      throw new BadRequestException(
        'Les rapports périodiques sont réservés aux parrains (PARRAIN).',
      );
    }
    return donor;
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────

  async create(
    dto: CreateDonorReportDto,
    createdById: string,
  ): Promise<DonorReportResponse> {
    await this.assertParrain(dto.donorProfileId);

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    // Proactive check for a clean 409 — the @@unique constraint below is
    // the real, DB-level backstop against a race (see Donation's own
    // dedup precedent in DonorsService.create).
    const existing = await this.prisma.donorReport.findUnique({
      where: {
        donorProfileId_periodType_periodStart_periodEnd: {
          donorProfileId: dto.donorProfileId,
          periodType: dto.periodType,
          periodStart,
          periodEnd,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Un rapport existe déjà pour ce donateur, ce type et cette période.',
      );
    }

    const report = await this.prisma.donorReport.create({
      data: {
        donorProfileId: dto.donorProfileId,
        periodType: dto.periodType,
        periodStart,
        periodEnd,
        activitiesNarrative: dto.activitiesNarrative?.trim() || null,
        createdById,
      },
      select: DONOR_REPORT_SELECT,
    });
    return report;
  }

  async findAll(query: QueryDonorReportsDto): Promise<{
    data: DonorReportResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DonorReportWhereInput = {
      ...(query.donorProfileId ? { donorProfileId: query.donorProfileId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodType ? { periodType: query.periodType } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.donorReport.findMany({
        where,
        select: DONOR_REPORT_SELECT,
        orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.donorReport.count({ where }),
    ]);

    await this.notifyMissingDonorReportsOnce();

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<DonorReportResponse> {
    const report = await this.prisma.donorReport.findUnique({
      where: { id },
      select: DONOR_REPORT_SELECT,
    });
    if (!report) throw new NotFoundException('Rapport donateur introuvable.');
    return report;
  }

  // ─── Lifecycle: DRAFT -> GENERATED -> SENT ────────────────────────────

  /**
   * The whole PDF pipeline (PR 17 §6): aggregate → render → upload → only
   * *then* persist. Every step before the final `update()` can throw
   * without any DB write happening — a failed render or a failed S3
   * upload leaves the report exactly as it was (DRAFT, or the previous
   * GENERATED state on a regenerate), never falsely marked GENERATED.
   */
  async generate(
    id: string,
    dto: GenerateDonorReportDto,
  ): Promise<DonorReportResponse> {
    const existing = await this.findRaw(id);
    if (existing.status === 'SENT') {
      throw new ConflictException(
        'Un rapport déjà envoyé ne peut plus être régénéré.',
      );
    }
    await this.assertParrain(existing.donorProfileId);

    const activitiesNarrative =
      dto.activitiesNarrative !== undefined
        ? dto.activitiesNarrative.trim() || null
        : existing.activitiesNarrative;

    const generatedAt = new Date();
    const safeData = await this.reportDataService.build({
      donorProfileId: existing.donorProfileId,
      donorReportId: id,
      periodType: existing.periodType,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      generatedAt,
      activitiesNarrative,
    });

    const pdfBuffer = await this.pdfReportService.render(safeData);

    const fileKey = await this.uploadService.upload(
      {
        buffer: pdfBuffer,
        originalname: `rapport-${PERIOD_LABEL[existing.periodType]}.pdf`,
        mimetype: 'application/pdf',
      } as Express.Multer.File,
      `donor-reports/${id}`,
    );

    return this.prisma.donorReport.update({
      where: { id },
      data: {
        status: 'GENERATED',
        generatedAt,
        fileKey,
        fileMime: 'application/pdf',
        activitiesNarrative,
        financialSummarySnapshot: safeData.financialSummary,
      },
      select: DONOR_REPORT_SELECT,
    });
  }

  /**
   * GENERATED -> SENT, atomically alongside the REPORT_SENT communication
   * it creates (PR 17 §11) — one `prisma.$transaction`, so a report is
   * never left SENT without its communication row, or vice versa. The
   * state guard below (only GENERATED may transition) is also what
   * prevents a duplicate REPORT_SENT communication on a repeated call —
   * the second call never reaches the transaction at all (test §16.21).
   */
  async markSent(id: string, userId: string): Promise<DonorReportResponse> {
    const existing = await this.findRaw(id);
    if (existing.status !== 'GENERATED') {
      throw new ConflictException(
        'Seul un rapport généré (statut GENERATED) peut être marqué comme envoyé.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const sentAt = new Date();
      await tx.donorReport.update({
        where: { id },
        data: { status: 'SENT', sentAt },
      });
      await tx.donorCommunication.create({
        data: {
          donorProfileId: existing.donorProfileId,
          type: 'REPORT_SENT',
          direction: 'OUTGOING',
          date: sentAt,
          subject: `Rapport ${PERIOD_LABEL[existing.periodType]} envoyé`,
          donorReportId: id,
          createdById: userId,
        },
      });
    });

    return this.findOne(id);
  }

  async getFileUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const report = await this.findRaw(id);
    if (!report.fileKey) {
      throw new NotFoundException("Ce rapport n'a pas encore été généré.");
    }
    const url = await this.uploadService.getPresignedUrl(report.fileKey);
    return { url, expiresIn: 900 };
  }

  // ─── Photos ─────────────────────────────────────────────────────────────

  private assertMutablePhotos(report: DonorReport) {
    // Same "immutable once sent" reasoning as Donation's own lock (PR 16)
    // applied here — a report's photo evidence must not change silently
    // after it's already been sent to the donor.
    if (report.status === 'SENT') {
      throw new ConflictException(
        'Les photos d’un rapport déjà envoyé ne peuvent plus être modifiées.',
      );
    }
  }

  async uploadPhoto(
    reportId: string,
    file: Express.Multer.File,
    caption: string | undefined,
    approved: boolean,
  ) {
    const report = await this.findRaw(reportId);
    this.assertMutablePhotos(report);
    // pdf-lib only embeds JPEG/PNG (PdfReportService.drawPhoto) — rejected
    // here, at upload time, rather than failing later at generate() time.
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Seules les images JPEG ou PNG sont acceptées pour les photos de rapport.',
      );
    }

    const fileKey = await this.uploadService.upload(
      file,
      `donor-reports/${reportId}/photos`,
    );
    return this.prisma.donorReportPhoto.create({
      data: {
        donorReportId: reportId,
        fileKey,
        fileMime: file.mimetype,
        caption: caption?.trim() || null,
        approvedForDonorReport: approved,
      },
    });
  }

  private async findRawPhoto(reportId: string, photoId: string) {
    const photo = await this.prisma.donorReportPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.donorReportId !== reportId) {
      throw new NotFoundException('Photo introuvable.');
    }
    return photo;
  }

  async getPhotoUrl(
    reportId: string,
    photoId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const photo = await this.findRawPhoto(reportId, photoId);
    const url = await this.uploadService.getPresignedUrl(photo.fileKey);
    return { url, expiresIn: 900 };
  }

  async approvePhoto(reportId: string, photoId: string) {
    const report = await this.findRaw(reportId);
    this.assertMutablePhotos(report);
    await this.findRawPhoto(reportId, photoId);
    return this.prisma.donorReportPhoto.update({
      where: { id: photoId },
      data: { approvedForDonorReport: true },
    });
  }

  async deletePhoto(reportId: string, photoId: string): Promise<void> {
    const report = await this.findRaw(reportId);
    this.assertMutablePhotos(report);
    const photo = await this.findRawPhoto(reportId, photoId);
    await this.uploadService.deleteFile(photo.fileKey);
    await this.prisma.donorReportPhoto.delete({ where: { id: photoId } });
  }
}
