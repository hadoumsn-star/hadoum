import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Extracts plain text (and page count) from a PDF buffer, for e2e specs
 * that need to assert on a generated donor report's actual rendered
 * content (donor name present, no child PII, ...) — see
 * test/utils/pdf-text-extractor.mjs for why this shells out to a plain
 * `node` child process instead of importing pdf-parse directly here.
 */
export function extractPdfText(bytes: Buffer): {
  text: string;
  pageCount: number;
} {
  const dir = mkdtempSync(join(tmpdir(), 'hadoum-pdf-'));
  const filePath = join(dir, 'report.pdf');
  writeFileSync(filePath, bytes);
  try {
    const output = execFileSync(
      process.execPath,
      [join(__dirname, 'pdf-text-extractor.mjs'), filePath],
      { encoding: 'utf-8' },
    );
    return JSON.parse(output) as { text: string; pageCount: number };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
