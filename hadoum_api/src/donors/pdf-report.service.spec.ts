import { Test, TestingModule } from '@nestjs/testing';
import { PdfReportService } from './pdf-report.service';
import { UploadService } from '../upload/upload.service';
import { SafeDonorReportData } from './report-data.service';
import { extractPdfText } from '../../test/utils/pdf-text';

// Same minimal valid 1x1 PNG used by the e2e photo-upload spec.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function baseData(
  overrides: Partial<SafeDonorReportData> = {},
): SafeDonorReportData {
  return {
    donorName: 'Fatou Diop',
    periodType: 'TRIMESTRIEL',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-31'),
    generatedAt: new Date('2026-04-01'),
    financialSummary: {
      donorContributionXof: 45_000,
      donorContributionCount: 3,
      orphanageTotalReceivedXof: 1_250_000,
      campaignContributions: [],
    },
    activitiesSummary: {
      childrenWelcomed: 42,
      entriesInPeriod: 3,
      exitsInPeriod: 1,
      activitiesCount: 12,
      narrative: null,
    },
    approvedPhotos: [],
    ...overrides,
  };
}

describe('PdfReportService', () => {
  let service: PdfReportService;
  let uploadService: { downloadFile: jest.Mock };

  beforeEach(async () => {
    uploadService = { downloadFile: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfReportService,
        { provide: UploadService, useValue: uploadService },
      ],
    }).compile();
    service = module.get(PdfReportService);
  });

  it('produces a valid, single-page PDF with no approved photos', async () => {
    const buffer = await service.render(baseData());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const { pageCount, text } = extractPdfText(buffer);
    expect(pageCount).toBe(1);
    expect(text).toContain('Fatou Diop');
    expect(text).toContain('45');
    expect(text).toContain('42');
    expect(uploadService.downloadFile).not.toHaveBeenCalled();
  });

  it('embeds each approved photo on its own page, fetched by fileKey via UploadService', async () => {
    uploadService.downloadFile.mockResolvedValue(ONE_PIXEL_PNG);
    const buffer = await service.render(
      baseData({
        approvedPhotos: [
          {
            fileKey: 'donor-reports/r1/photos/a.png',
            fileMime: 'image/png',
            caption: 'Photo A',
          },
          {
            fileKey: 'donor-reports/r1/photos/b.png',
            fileMime: 'image/png',
            caption: 'Photo B',
          },
        ],
      }),
    );
    const { pageCount, text } = extractPdfText(buffer);
    expect(pageCount).toBe(3); // 1 content page + 2 photo pages
    expect(text).toContain('Photo A');
    expect(text).toContain('Photo B');
    expect(uploadService.downloadFile).toHaveBeenCalledWith(
      'donor-reports/r1/photos/a.png',
    );
    expect(uploadService.downloadFile).toHaveBeenCalledWith(
      'donor-reports/r1/photos/b.png',
    );
  });

  it('propagates a download failure rather than silently omitting the photo', async () => {
    uploadService.downloadFile.mockRejectedValue(new Error('S3 unreachable'));
    await expect(
      service.render(
        baseData({
          approvedPhotos: [
            { fileKey: 'missing.png', fileMime: 'image/png', caption: null },
          ],
        }),
      ),
    ).rejects.toThrow('S3 unreachable');
  });

  it('includes campaign contributions and the Director-provided narrative when present', async () => {
    const buffer = await service.render(
      baseData({
        financialSummary: {
          donorContributionXof: 20_000,
          donorContributionCount: 1,
          orphanageTotalReceivedXof: 500_000,
          campaignContributions: [
            { campaignTitle: 'Rentrée scolaire', amountXof: 20_000 },
          ],
        },
        activitiesSummary: {
          childrenWelcomed: 10,
          entriesInPeriod: 0,
          exitsInPeriod: 0,
          activitiesCount: 2,
          narrative: 'Un trimestre riche en activités sportives.',
        },
      }),
    );
    const { text } = extractPdfText(buffer);
    expect(text).toContain('Rentrée scolaire');
    expect(text).toContain('Un trimestre riche en activités sportives.');
  });
});
