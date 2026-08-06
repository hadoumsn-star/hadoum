// One-time script: remove test/demo Contact records, then import the real
// BESOIN contacts from "Fiche de contact BESOIN.xlsx" (sheets "CONTACTS
// UTILES" and "PARENTS DORPHELINS").
//
// SAFETY
// - Dry-run by default: prints the full plan (deletions + import) but
//   mutates nothing. Pass --confirm to actually execute.
// - Refuses to run against what looks like production unless
//   --allow-production is explicitly passed (then still gated by --confirm
//   for any actual mutation).
// - --replace-test-contacts must be passed for either mode — this script
//   always does both steps (test-contact cleanup + import) together; it is
//   not a "just import" tool.
// - Contact deletion + import both run inside a single transaction when
//   --confirm is passed: either everything below commits, or nothing does.
// - Never touches User, Staff, Child, or ContactCategory rows, except to
//   create the "PARENT_TUTEUR" category if it doesn't already exist (a pure
//   addition — see ensurePartentTuteurCategory below).
//
// USAGE
//   npm run import:besoin-contacts -- --file="Fiche de contact BESOIN.xlsx" --dry-run --replace-test-contacts
//   npm run import:besoin-contacts -- --file="Fiche de contact BESOIN.xlsx" --confirm --replace-test-contacts
//
// Not wired into app startup, migrations, or seeding — run manually only.

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import {
  classifyContact,
  matchContact,
  parseContactsUtilesRows,
  parseParentsOrphelinsRows,
  PARENT_TUTEUR_CATEGORY_KEY,
  TEST_TIMESTAMP_SUFFIX,
  type ImportRow,
  type DedupCandidate,
} from '../src/contacts/besoin-import.util';

// ─── CLI args ───────────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).replace(/^"|"$/g, '') : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

// Synthetic candidate id for a row planned as 'create' but not yet inserted
// — see buildPlan()'s candidate pool and execute()'s pending-id resolution.
const pendingKey = (row: ImportRow) =>
  `pending:${row.sourceSheet}:${row.rowIndex}`;

const CONFIRM = hasFlag('confirm');
const REPLACE_TEST_CONTACTS = hasFlag('replace-test-contacts');
const ALLOW_PRODUCTION = hasFlag('allow-production');
const FILE_ARG = getArg('file');

// ─── Safety guards ──────────────────────────────────────────────────────────

export function assertSafeEnvironment(
  databaseUrl: string | undefined,
  allowProduction: boolean = ALLOW_PRODUCTION,
): {
  host: string;
  dbName: string;
  env: string;
} {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const appEnv = process.env.APP_ENV ?? nodeEnv;
  const looksProd = nodeEnv === 'production' || appEnv === 'production';

  if (!databaseUrl)
    throw new Error('Refusing to run: DATABASE_URL is not set.');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Refusing to run: DATABASE_URL is not a valid connection string.',
    );
  }
  const host = url.hostname;
  const dbName = url.pathname.replace(/^\//, '');
  const hostLooksProd = !['localhost', '127.0.0.1', '::1'].includes(host);
  const nameLooksProd = /prod/i.test(host) || /prod/i.test(dbName);

  if ((looksProd || hostLooksProd || nameLooksProd) && !allowProduction) {
    throw new Error(
      `Refusing to run against what looks like production (env='${appEnv}', host='${host}', db='${dbName}') without --allow-production.`,
    );
  }
  return { host, dbName, env: appEnv };
}

// Excel parsing wrappers — the row-mapping/classification logic itself lives
// in src/contacts/besoin-import.util.ts (imported above) so it can be unit
// tested with plain Jest; these two just adapt an XLSX.WorkSheet to that
// module's dependency-free `SheetRow[]` input.

function parseContactsUtiles(ws: XLSX.WorkSheet): ImportRow[] {
  return parseContactsUtilesRows(
    XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
  );
}

function parseParentsOrphelins(ws: XLSX.WorkSheet): ImportRow[] {
  return parseParentsOrphelinsRows(
    XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
  );
}

// ─── Reporting types ────────────────────────────────────────────────────────

export interface TestContactPlanItem {
  id: string;
  fullName: string;
  organization: string | null;
  phone: string | null;
  categoryKey: string;
  reason: string;
  referenceCount: number;
  referenceBreakdown: Record<string, number>;
  blocked: boolean;
  blockReason: string | null;
}

export interface ImportPlanItem {
  row: ImportRow;
  action: 'create' | 'reuse' | 'ambiguous' | 'skip';
  matchedContactId: string | null; // real DB id, or a 'pending:<n>' placeholder — see execute()
  matchedOn: 'phone+name' | 'phone' | 'name' | null;
  enrichedFields: string[];
  note: string | null;
}

// ─── Main planning (read-only — safe to run without --confirm) ────────────

export async function buildPlan(prisma: PrismaClient, rows: ImportRow[]) {
  const allContacts = await prisma.contact.findMany({
    include: { category: { select: { key: true } } },
  });

  const testItems: TestContactPlanItem[] = [];
  for (const c of allContacts) {
    const { isTest, reason } = classifyContact({
      fullName: c.fullName,
      organization: c.organization,
      notes: c.notes,
      email: c.email,
    });
    if (!isTest) continue;

    const [txCount, scCount, apCount, mtCount] = await Promise.all([
      prisma.transaction.count({ where: { supplierContactId: c.id } }),
      prisma.supplierContract.count({ where: { supplierContactId: c.id } }),
      prisma.administrativeProcedure.count({
        where: { assignedContactId: c.id },
      }),
      prisma.maintenanceTicket.count({ where: { assignedContactId: c.id } }),
    ]);
    const referenceBreakdown = {
      transactions: txCount,
      supplierContracts: scCount,
      administrativeProcedures: apCount,
      maintenanceTickets: mtCount,
    };
    const referenceCount = txCount + scCount + apCount + mtCount;

    // A referenced test contact is only safe to auto-delete if every single
    // referencing record also looks like test data — otherwise it's
    // reported for manual review and left untouched, per spec.
    let blocked = false;
    let blockReason: string | null = null;
    if (referenceCount > 0) {
      const [nonTestTx, nonTestSc, nonTestAp, nonTestMt] = await Promise.all([
        prisma.transaction.findMany({
          where: { supplierContactId: c.id },
          select: { label: true },
        }),
        prisma.supplierContract.findMany({
          where: { supplierContactId: c.id },
          select: { contractName: true },
        }),
        prisma.administrativeProcedure.findMany({
          where: { assignedContactId: c.id },
          select: { title: true },
        }),
        prisma.maintenanceTicket.findMany({
          where: { assignedContactId: c.id },
          select: { title: true },
        }),
      ]);
      const nonTestLabels = [
        ...nonTestTx
          .filter((t) => !TEST_TIMESTAMP_SUFFIX.test(t.label))
          .map((t) => `Transaction "${t.label}"`),
        ...nonTestSc
          .filter((t) => !TEST_TIMESTAMP_SUFFIX.test(t.contractName))
          .map((t) => `SupplierContract "${t.contractName}"`),
        ...nonTestAp
          .filter((t) => !TEST_TIMESTAMP_SUFFIX.test(t.title))
          .map((t) => `AdministrativeProcedure "${t.title}"`),
        ...nonTestMt
          .filter((t) => !TEST_TIMESTAMP_SUFFIX.test(t.title))
          .map((t) => `MaintenanceTicket "${t.title}"`),
      ];
      if (nonTestLabels.length > 0) {
        blocked = true;
        blockReason = `referenced by non-test record(s): ${nonTestLabels.join(', ')}`;
      }
    }

    testItems.push({
      id: c.id,
      fullName: c.fullName,
      organization: c.organization,
      phone: c.phone,
      categoryKey: c.category.key,
      reason: reason!,
      referenceCount,
      referenceBreakdown,
      blocked,
      blockReason,
    });
  }

  const deletableIds = new Set(
    testItems.filter((t) => !t.blocked).map((t) => t.id),
  );
  const remainingContacts = allContacts.filter((c) => !deletableIds.has(c.id));

  // Candidate pool for matchContact(): starts as the real, pre-existing
  // (post-deletion) contacts, and grows with a synthetic `pending:<row>`
  // entry every time a row is planned as 'create' — so a later row in this
  // same sheet sharing a phone/name is matched against it exactly the same
  // way it would be matched against a real database row. execute() resolves
  // `pending:` ids to the real inserted id once that earlier row is actually
  // created (see there).
  const candidates: DedupCandidate[] = remainingContacts.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    phone: c.phone,
    functionTitle: c.functionTitle,
    notes: c.notes,
  }));

  const importPlan: ImportPlanItem[] = [];
  for (const row of rows) {
    if (row.excluded) {
      importPlan.push({
        row,
        action: 'skip',
        matchedContactId: null,
        matchedOn: null,
        enrichedFields: [],
        note: row.excludeReason,
      });
      continue;
    }

    const result = matchContact(row, candidates);
    importPlan.push({
      row,
      action: result.action,
      matchedContactId: result.matchedContactId,
      matchedOn: result.matchedOn,
      enrichedFields: result.enrichedFields,
      note:
        result.note ??
        (result.action === 'ambiguous'
          ? `${result.candidateIds.length} existing contacts match on ${result.matchedOn}`
          : null),
    });
    if (result.action === 'create') {
      candidates.push({
        id: pendingKey(row),
        fullName: row.fullName,
        phone: row.phone,
        functionTitle: row.functionTitle,
        notes: row.notes,
      });
    }
  }

  return { allContactsTotal: allContacts.length, testItems, importPlan };
}

// ─── Report printing ────────────────────────────────────────────────────────

function printDeletionReport(testItems: TestContactPlanItem[]) {
  const deletable = testItems.filter((t) => !t.blocked);
  const blocked = testItems.filter((t) => t.blocked);

  console.log(`\nProposed test-contact deletions: ${deletable.length}`);
  for (const t of deletable) {
    console.log(
      `  - [${t.id}] ${t.fullName} | org=${t.organization ?? '—'} | phone=${t.phone ?? '—'} | category=${t.categoryKey} | reason: ${t.reason} | refs=${t.referenceCount}`,
    );
  }
  console.log(`\nBlocked deletions requiring manual review: ${blocked.length}`);
  for (const t of blocked) {
    console.log(`  - [${t.id}] ${t.fullName} | ${t.blockReason}`);
  }
}

function printImportReport(importPlan: ImportPlanItem[]) {
  const byAction = {
    create: importPlan.filter((p) => p.action === 'create'),
    reuse: importPlan.filter((p) => p.action === 'reuse'),
    ambiguous: importPlan.filter((p) => p.action === 'ambiguous'),
    skip: importPlan.filter((p) => p.action === 'skip'),
  };
  console.log(`\nExcel rows prepared: ${importPlan.length}`);
  console.log(`  Expected new contacts:    ${byAction.create.length}`);
  console.log(`  Expected reused contacts: ${byAction.reuse.length}`);
  console.log(`  Ambiguous (manual review):${byAction.ambiguous.length}`);
  console.log(`  Skipped:                  ${byAction.skip.length}`);
  if (byAction.ambiguous.length > 0) {
    console.log('\nAmbiguous rows:');
    for (const p of byAction.ambiguous) {
      console.log(
        `  - [${p.row.sourceSheet} row ${p.row.rowIndex}] ${p.row.fullName}: ${p.note}`,
      );
    }
  }
  const flaggedCreates = byAction.create.filter((p) => p.note);
  if (flaggedCreates.length > 0) {
    console.log(
      '\nCreated separately but flagged for manual review (shared phone, different name — not auto-merged):',
    );
    for (const p of flaggedCreates) {
      console.log(
        `  - [${p.row.sourceSheet} row ${p.row.rowIndex}] ${p.row.fullName}: ${p.note}`,
      );
    }
  }
  if (byAction.skip.length > 0) {
    console.log('\nSkipped rows:');
    for (const p of byAction.skip) {
      console.log(
        `  - [${p.row.sourceSheet} row ${p.row.rowIndex}] ${p.row.fullName || '(no name)'}: ${p.note}`,
      );
    }
  }
  const byCategory = new Map<string, number>();
  for (const p of importPlan) {
    if (p.action !== 'create' && p.action !== 'reuse') continue;
    byCategory.set(
      p.row.categoryKey,
      (byCategory.get(p.row.categoryKey) ?? 0) + 1,
    );
  }
  console.log('\nExpected contacts by category (create + reuse):');
  for (const [key, count] of byCategory) console.log(`  ${key}: ${count}`);
}

// ─── Execution (mutating — only when --confirm) ────────────────────────────

async function ensureParentTuteurCategory(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const existing = await tx.contactCategory.findUnique({
    where: { key: PARENT_TUTEUR_CATEGORY_KEY },
  });
  if (existing) return existing.id;
  const created = await tx.contactCategory.create({
    data: {
      key: PARENT_TUTEUR_CATEGORY_KEY,
      label: 'Parent / Tuteur',
      sortOrder: 100,
    },
  });
  console.log(
    `Created missing ContactCategory "${PARENT_TUTEUR_CATEGORY_KEY}".`,
  );
  return created.id;
}

export async function execute(
  prisma: PrismaClient,
  testItems: TestContactPlanItem[],
  importPlan: ImportPlanItem[],
) {
  const deletable = testItems.filter((t) => !t.blocked);

  return prisma.$transaction(
    async (tx) => {
      // 1) Delete test contacts. onDelete: SetNull on Transaction/
      // SupplierContract/AdministrativeProcedure/MaintenanceTicket means
      // any (test-only, per the plan above) referencing rows have their
      // contact reference cleared automatically — they are never deleted
      // themselves, since deleting business records is out of this
      // script's scope.
      let deletedCount = 0;
      for (const t of deletable) {
        await tx.contact.delete({ where: { id: t.id } });
        deletedCount++;
      }

      // 2) Resolve category ids (creating PARENT_TUTEUR if missing).
      const categoryKeys = Array.from(
        new Set(
          importPlan
            .filter((p) => p.action === 'create' || p.action === 'reuse')
            .map((p) => p.row.categoryKey),
        ),
      );
      const categoryIdByKey = new Map<string, string>();
      for (const key of categoryKeys) {
        if (key === PARENT_TUTEUR_CATEGORY_KEY) {
          categoryIdByKey.set(key, await ensureParentTuteurCategory(tx));
        } else {
          const cat = await tx.contactCategory.findUnique({ where: { key } });
          if (!cat)
            throw new Error(
              `ContactCategory "${key}" not found — refusing to import against it.`,
            );
          categoryIdByKey.set(key, cat.id);
        }
      }

      // 3) Import: create / reuse+enrich. `p.matchedContactId` is a real,
      // pre-existing Contact id for rows matched against the database
      // (resolved directly by matchContact() in buildPlan). For rows matched
      // against an *earlier row in this same sheet*, matchContact() instead
      // returns the `pending:<sheet>:<rowIndex>` placeholder id (see
      // buildPlan's candidate pool) since that contact doesn't exist yet at
      // plan time; those are resolved here via the id actually created
      // moments earlier in this same transaction.
      const createdIdByPendingKey = new Map<string, string>();
      let created = 0;
      let reused = 0;
      let enriched = 0;

      for (const p of importPlan) {
        if (p.action === 'skip' || p.action === 'ambiguous') continue;

        if (p.action === 'create') {
          const contact = await tx.contact.create({
            data: {
              fullName: p.row.fullName,
              functionTitle: p.row.functionTitle,
              phone: p.row.phone,
              notes: p.row.notes,
              categoryId: categoryIdByKey.get(p.row.categoryKey)!,
              active: true,
            },
          });
          created++;
          createdIdByPendingKey.set(pendingKey(p.row), contact.id);
          continue;
        }

        // action === 'reuse'
        const targetId = p.matchedContactId?.startsWith('pending:')
          ? createdIdByPendingKey.get(p.matchedContactId)
          : p.matchedContactId;
        if (!targetId) {
          throw new Error(
            `Could not resolve the contact to reuse for row "${p.row.fullName}" (${p.row.sourceSheet}) — aborting.`,
          );
        }
        const existing = await tx.contact.findUniqueOrThrow({
          where: { id: targetId },
        });
        const data: Prisma.ContactUpdateInput = {};
        if (!existing.functionTitle && p.row.functionTitle)
          data.functionTitle = p.row.functionTitle;
        if (!existing.phone && p.row.phone) data.phone = p.row.phone;
        if (!existing.notes && p.row.notes) data.notes = p.row.notes;
        if (Object.keys(data).length > 0) {
          await tx.contact.update({ where: { id: targetId }, data });
          enriched++;
        }
        reused++;
      }

      return { deletedCount, created, reused, enriched };
    },
    { timeout: 120_000 },
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!REPLACE_TEST_CONTACTS) {
    throw new Error(
      'Refusing to run: pass --replace-test-contacts (this script always cleans up test contacts and imports together).',
    );
  }
  if (!FILE_ARG) {
    throw new Error(
      'Refusing to run: pass --file="Fiche de contact BESOIN.xlsx".',
    );
  }
  const filePath = resolve(FILE_ARG);
  if (!existsSync(filePath)) {
    throw new Error(`Refusing to run: file not found at ${filePath}.`);
  }

  const { host, dbName, env } = assertSafeEnvironment(process.env.DATABASE_URL);

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' BESOIN contacts import — test-contact cleanup + real import');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Database host: ${host}`);
  console.log(`Database name: ${dbName}`);
  console.log(`Environment:   ${env}`);
  console.log(`Source file:   ${filePath}`);
  console.log(
    `Mode: ${CONFIRM ? 'EXECUTE (--confirm passed)' : 'DRY RUN (pass --confirm to execute)'}`,
  );

  const workbook = XLSX.read(readFileSync(filePath));
  const utilesSheet = workbook.Sheets['CONTACTS UTILES'];
  const parentsSheet = workbook.Sheets['PARENTS DORPHELINS'];
  if (!utilesSheet || !parentsSheet) {
    throw new Error(
      'Refusing to run: expected sheets "CONTACTS UTILES" and "PARENTS DORPHELINS" not both found.',
    );
  }

  const utilesRows = parseContactsUtiles(utilesSheet);
  const parentsRows = parseParentsOrphelins(parentsSheet);
  const etatExcluded = utilesRows.filter(
    (r) => r.excludeReason === 'Service = ETAT',
  ).length;
  const allRows = [...utilesRows, ...parentsRows];

  console.log(
    `\nCONTACTS UTILES: ${utilesRows.length} rows (${etatExcluded} excluded as Service = ETAT)`,
  );
  console.log(`PARENTS DORPHELINS: ${parentsRows.length} rows`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const beforeCount = await prisma.contact.count();
    console.log(`\nExisting contacts total: ${beforeCount}`);

    const { testItems, importPlan } = await buildPlan(prisma, allRows);
    printDeletionReport(testItems);
    printImportReport(importPlan);

    if (!CONFIRM) {
      console.log(
        '\nDry run complete. No data was changed. Re-run with --confirm to execute.',
      );
      return;
    }

    console.log('\nExecuting…');
    const result = await execute(prisma, testItems, importPlan);
    console.log('Transaction committed.');
    console.log(`\nTest contacts deleted: ${result.deletedCount}`);
    console.log(`Contacts created:      ${result.created}`);
    console.log(`Contacts reused:       ${result.reused}`);
    console.log(`Contacts enriched:     ${result.enriched}`);

    const afterCount = await prisma.contact.count();
    console.log(`\nContacts total after:  ${afterCount}`);
    const afterByCategory = await prisma.contact.groupBy({
      by: ['categoryId'],
      _count: true,
    });
    const categories = await prisma.contactCategory.findMany({
      select: { id: true, key: true },
    });
    const keyById = new Map(categories.map((c) => [c.id, c.key]));
    console.log('Contacts by category (after):');
    for (const row of afterByCategory) {
      console.log(
        `  ${keyById.get(row.categoryId) ?? row.categoryId}: ${row._count}`,
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Guarded so this file can be `import`-ed (e.g. by its own Jest spec, to
// unit-test buildPlan()/execute()/assertSafeEnvironment() against a mocked
// Prisma client) without firing off the real CLI flow as a side effect.
if (require.main === module) {
  main().catch((error) => {
    console.error(
      '\nImport aborted:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
