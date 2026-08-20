// Standalone helper, run as a plain `node` child process (see
// test/utils/pdf-text.ts) — never imported by Jest/ts-jest directly.
// pdf-parse@2's pdfjs-dist backend needs real dynamic `import()` for its
// worker setup, which Jest's CJS/vm module loader can't provide without
// `--experimental-vm-modules` (a flag that would have to apply to the
// *entire* Jest process if set the usual way). Running this one file as
// its own plain Node process sidesteps that entirely — no Jest config or
// package.json script needs to change for the rest of the test suite.
import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'node:fs';

const [, , filePath] = process.argv;
const data = readFileSync(filePath);
const parser = new PDFParse({ data });
const result = await parser.getText();
await parser.destroy();
process.stdout.write(JSON.stringify({ text: result.text, pageCount: result.total }));
