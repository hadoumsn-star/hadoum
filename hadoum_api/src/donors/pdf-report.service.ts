import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { UploadService } from '../upload/upload.service';
import { SafeDonorReportData } from './report-data.service';

// A4 in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.42, 0.46);
const ACCENT = rgb(0.243, 0.353, 0.471); // #3E5A78 — matches the app's own accent

function formatXof(amountXof: number): string {
  return `${amountXof.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const PERIOD_LABEL: Record<SafeDonorReportData['periodType'], string> = {
  MENSUEL: 'Rapport mensuel',
  TRIMESTRIEL: 'Rapport trimestriel',
};

/**
 * PR 17 §5/§6 — the rendering half of the report pipeline. Pure: given a
 * SafeDonorReportData (already privacy-checked by ReportDataService) and a
 * pre-fetched set of approved photo bytes, produces a PDF Buffer. Never
 * touches Prisma. The one S3 call it does make (downloading the approved
 * photos' own bytes, via UploadService.downloadFile) is part of turning
 * already-vetted data into pixels, not the "store the finished PDF" step —
 * that upload happens in DonorReportsService, after this returns.
 *
 * Uses pdf-lib — pure JS/TS, no native bindings, no headless-browser
 * runtime — deliberately, so the existing `node:22-alpine` production
 * image (see hadoum_api/Dockerfile) needs no changes at all. See the PR 17
 * report for the Puppeteer/Chromium alternative considered and rejected.
 */
@Injectable()
export class PdfReportService {
  constructor(private readonly uploadService: UploadService) {}

  async render(data: SafeDonorReportData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`${PERIOD_LABEL[data.periodType]} — ${data.donorName}`);
    pdfDoc.setProducer('Hadoum');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const newPage = () => {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    };
    const ensureSpace = (needed: number) => {
      if (y - needed < MARGIN) newPage();
    };
    const heading = (text: string) => {
      ensureSpace(28);
      page.drawText(text, {
        x: MARGIN,
        y,
        size: 13,
        font: bold,
        color: ACCENT,
      });
      y -= 20;
    };
    const line = (
      text: string,
      opts: { size?: number; color?: typeof INK; bold?: boolean } = {},
    ) => {
      const size = opts.size ?? 11;
      for (const wrapped of wrapText(
        text,
        opts.bold ? bold : font,
        size,
        CONTENT_WIDTH,
      )) {
        ensureSpace(size + 6);
        page.drawText(wrapped, {
          x: MARGIN,
          y,
          size,
          font: opts.bold ? bold : font,
          color: opts.color ?? INK,
        });
        y -= size + 6;
      }
    };

    // ─── Header ──────────────────────────────────────────────────────────
    page.drawText('Hadoum', {
      x: MARGIN,
      y,
      size: 22,
      font: bold,
      color: ACCENT,
    });
    y -= 30;
    page.drawText(PERIOD_LABEL[data.periodType], {
      x: MARGIN,
      y,
      size: 15,
      font: bold,
      color: INK,
    });
    y -= 22;
    line(
      `Période du ${formatDate(data.periodStart)} au ${formatDate(data.periodEnd)}`,
      { color: MUTED },
    );
    line(`Généré le ${formatDate(data.generatedAt)}`, { color: MUTED });
    y -= 6;
    line(`Cher(e) ${data.donorName},`, { bold: true });
    y -= 6;

    // ─── Financial summary ──────────────────────────────────────────────
    heading('Résumé financier');
    line(
      `Votre contribution sur la période : ${formatXof(data.financialSummary.donorContributionXof)} (${data.financialSummary.donorContributionCount} don(s))`,
    );
    if (data.financialSummary.campaignContributions.length > 0) {
      line('Répartition par cagnotte :');
      for (const c of data.financialSummary.campaignContributions) {
        line(`  •  ${c.campaignTitle} : ${formatXof(c.amountXof)}`);
      }
    }
    line(
      `Total des recettes de l'orphelinat sur la période (toutes sources) : ${formatXof(data.financialSummary.orphanageTotalReceivedXof)}`,
      { color: MUTED },
    );
    y -= 6;

    // ─── Activities summary ─────────────────────────────────────────────
    heading('Vie de l’orphelinat');
    line(
      `Enfants actuellement accueillis : ${data.activitiesSummary.childrenWelcomed}`,
    );
    line(
      `Nouvelles arrivées sur la période : ${data.activitiesSummary.entriesInPeriod}`,
    );
    line(`Départs sur la période : ${data.activitiesSummary.exitsInPeriod}`);
    line(
      `Activités pédagogiques organisées : ${data.activitiesSummary.activitiesCount}`,
    );
    if (data.activitiesSummary.narrative) {
      y -= 4;
      line(data.activitiesSummary.narrative);
    }

    // ─── Photos — one per page, kept deliberately simple ───────────────
    for (const photo of data.approvedPhotos) {
      newPage();
      heading('Photo');
      await this.drawPhoto(pdfDoc, page, photo);
    }

    this.drawFooters(pdfDoc, font);

    // useObjectStreams: false — trades a slightly larger file for the
    // classic xref-table PDF structure every reader (including older
    // parsers a donor's own PDF viewer might use) understands, rather than
    // the newer PDF 1.5+ compressed object streams pdf-lib defaults to.
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return Buffer.from(bytes);
  }

  /**
   * One photo, one page — drawn directly below the "Photo" heading
   * render() already placed near the top of `page`. Deliberately not
   * multi-photo-per-page layout logic: simple and predictable beats a
   * denser grid for a backend PDF (see this file's own module comment).
   */
  private async drawPhoto(
    pdfDoc: PDFDocument,
    page: PDFPage,
    photo: SafeDonorReportData['approvedPhotos'][number],
  ): Promise<void> {
    const bytes = await this.uploadService.downloadFile(photo.fileKey);
    const isPng = photo.fileMime === 'image/png';
    const image = isPng
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const maxWidth = CONTENT_WIDTH;
    const maxHeight = PAGE_HEIGHT - MARGIN * 2 - 80;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const top = PAGE_HEIGHT - MARGIN - 40;

    page.drawImage(image, { x: MARGIN, y: top - height, width, height });
    if (photo.caption) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText(photo.caption, {
        x: MARGIN,
        y: top - height - 16,
        size: 9,
        font,
        color: MUTED,
      });
    }
  }

  private drawFooters(pdfDoc: PDFDocument, font: PDFFont): void {
    const pages = pdfDoc.getPages();
    pages.forEach((page, index) => {
      page.drawText(`Page ${index + 1} / ${pages.length}`, {
        x: PAGE_WIDTH - MARGIN - 70,
        y: MARGIN / 2,
        size: 9,
        font,
        color: MUTED,
      });
      page.drawText('Hadoum — Rapport donateur confidentiel', {
        x: MARGIN,
        y: MARGIN / 2,
        size: 9,
        font,
        color: MUTED,
      });
    });
  }
}

/** No text-wrapping primitive in pdf-lib — this is the minimal greedy version. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
