// One-time development cleanup script — Finance + Administration & Locaux
// demo/test data.
//
// SAFETY
// - Refuses to run when NODE_ENV or APP_ENV is 'production'.
// - Refuses to run unless DATABASE_URL points at a recognized local host
//   (localhost/127.0.0.1/::1) and neither the host nor the database name
//   look production-related.
// - Dry-run by default: prints the database identity and full before/after
//   counts but deletes nothing. Pass --confirm to actually delete.
// - Wrapped in a single Prisma transaction — either everything below
//   commits, or nothing does.
//
// SCOPE (see project cleanup request for the full rationale)
// - Finance: all Transaction rows (DEPENSE + RECETTE), their
//   EXPENSE_TRANSACTION ValidationRequest rows, and their FINANCE/Transaction
//   AuditLog rows. BudgetLine rows (and FINANCE/BudgetLine audit logs) are
//   never touched.
// - Administration & Locaux: MaintenanceTicket, SupplierContract,
//   AdministrativeProcedure, Space, StockItem (+StockMovement), Incident,
//   InventoryAsset, EntryLog, GoodsMovementLog, their ValidationRequest rows,
//   and their AuditLog rows (module MAINTENANCE / SUPPLIER_CONTRACTS /
//   ADMINISTRATIVE_PROCEDURES / STOCK / INCIDENTS).
// - Never touched: User, Contact, ContactCategory, BudgetLine, and every
//   other module (Children, Staff, Activities, FundRequests, ...).
//
// USAGE
//   npm run cleanup:demo-data                # dry run — report only
//   npm run cleanup:demo-data -- --confirm    # actually delete
//
// Not wired into app startup, migrations, or seeding — run manually only.

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  ValidationResourceType,
  AuditModule,
} from '@prisma/client';
import { Pool } from 'pg';

const CONFIRM = process.argv.includes('--confirm');

const ADMIN_VALIDATION_RESOURCE_TYPES: ValidationResourceType[] = [
  'MAINTENANCE_TICKET',
  'SUPPLIER_CONTRACT',
  'ADMINISTRATIVE_PROCEDURE',
  'STOCK_ITEM',
  'INVENTORY_ASSET',
  'ENTRY_LOG',
  'GOODS_MOVEMENT_LOG',
];

const ADMIN_AUDIT_MODULES: AuditModule[] = [
  'MAINTENANCE',
  'SUPPLIER_CONTRACTS',
  'ADMINISTRATIVE_PROCEDURES',
  'STOCK',
  'INCIDENTS',
];

// ─── Safety guards ──────────────────────────────────────────────────────────

function assertSafeEnvironment(databaseUrl: string | undefined) {
  const nodeEnv = process.env.NODE_ENV;
  const appEnv = process.env.APP_ENV;
  if (nodeEnv === 'production' || appEnv === 'production') {
    throw new Error(
      `Refusing to run: NODE_ENV='${nodeEnv}' / APP_ENV='${appEnv}' looks like production.`,
    );
  }
  if (!databaseUrl) {
    throw new Error('Refusing to run: DATABASE_URL is not set.');
  }

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
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowedHosts.has(host)) {
    throw new Error(
      `Refusing to run: DATABASE_URL host '${host}' is not a recognized local host (allowed: localhost, 127.0.0.1, ::1).`,
    );
  }
  if (/prod/i.test(host) || /prod/i.test(dbName)) {
    throw new Error(
      `Refusing to run: host ('${host}') or database name ('${dbName}') looks production-related.`,
    );
  }

  return { host, dbName };
}

// ─── Reporting ──────────────────────────────────────────────────────────────

interface Counts {
  // Finance
  transactionsByType: Record<string, number>;
  transactionsByStatus: Record<string, number>;
  transactionsByWorkflowStatus: Record<string, number>;
  expenseValidationRequests: number;
  financeAuditLogs: number;
  // Administration & Locaux
  maintenanceTickets: number;
  supplierContracts: number;
  administrativeProcedures: number;
  spaces: number;
  stockItems: number;
  stockMovements: number;
  inventoryAssets: number;
  entryLogs: number;
  goodsMovementLogs: number;
  incidents: number;
  adminValidationRequests: number;
  adminAuditLogs: number;
  // Preserved, for the report only
  budgetLines: number;
  contacts: number;
  users: number;
}

async function collectCounts(prisma: PrismaClient): Promise<Counts> {
  const [
    byType,
    byStatus,
    byWorkflowStatus,
    expenseValidationRequests,
    financeAuditLogs,
    maintenanceTickets,
    supplierContracts,
    administrativeProcedures,
    spaces,
    stockItems,
    stockMovements,
    inventoryAssets,
    entryLogs,
    goodsMovementLogs,
    incidents,
    adminValidationRequests,
    adminAuditLogs,
    budgetLines,
    contacts,
    users,
  ] = await Promise.all([
    prisma.transaction.groupBy({ by: ['type'], _count: true }),
    prisma.transaction.groupBy({ by: ['status'], _count: true }),
    prisma.transaction.groupBy({ by: ['expenseWorkflowStatus'], _count: true }),
    prisma.validationRequest.count({
      where: { resourceType: 'EXPENSE_TRANSACTION' },
    }),
    prisma.auditLog.count({
      where: { module: 'FINANCE', entity: 'Transaction' },
    }),
    prisma.maintenanceTicket.count(),
    prisma.supplierContract.count(),
    prisma.administrativeProcedure.count(),
    prisma.space.count(),
    prisma.stockItem.count(),
    prisma.stockMovement.count(),
    prisma.inventoryAsset.count(),
    prisma.entryLog.count(),
    prisma.goodsMovementLog.count(),
    prisma.incident.count(),
    prisma.validationRequest.count({
      where: { resourceType: { in: ADMIN_VALIDATION_RESOURCE_TYPES } },
    }),
    prisma.auditLog.count({ where: { module: { in: ADMIN_AUDIT_MODULES } } }),
    prisma.budgetLine.count(),
    prisma.contact.count(),
    prisma.user.count(),
  ]);

  const toRecord = <T extends { _count: number }>(
    rows: T[],
    getKey: (row: T) => string | null,
  ) => Object.fromEntries(rows.map((r) => [getKey(r) ?? 'NULL', r._count]));

  return {
    transactionsByType: toRecord(byType, (r) => r.type),
    transactionsByStatus: toRecord(byStatus, (r) => r.status),
    transactionsByWorkflowStatus: toRecord(
      byWorkflowStatus,
      (r) => r.expenseWorkflowStatus,
    ),
    expenseValidationRequests,
    financeAuditLogs,
    maintenanceTickets,
    supplierContracts,
    administrativeProcedures,
    spaces,
    stockItems,
    stockMovements,
    inventoryAssets,
    entryLogs,
    goodsMovementLogs,
    incidents,
    adminValidationRequests,
    adminAuditLogs,
    budgetLines,
    contacts,
    users,
  };
}

async function collectS3Keys(prisma: PrismaClient): Promise<string[]> {
  const [
    transactions,
    tickets,
    contracts,
    procedures,
    spaces,
    stockItemDocs,
    assetDocs,
    entryLogDocs,
    goodsMovementDocs,
    incidents,
  ] = await Promise.all([
    prisma.transaction.findMany({
      select: {
        justifKey: true,
        purchaseOrderKey: true,
        invoiceKey: true,
        deliveryNoteKey: true,
      },
    }),
    prisma.ticketAttachment.findMany({ select: { fileKey: true } }),
    prisma.contractDocument.findMany({ select: { fileKey: true } }),
    prisma.procedureDocument.findMany({ select: { fileKey: true } }),
    prisma.spaceDocument.findMany({ select: { fileKey: true } }),
    prisma.stockItemDocument.findMany({ select: { fileKey: true } }),
    prisma.inventoryAssetDocument.findMany({ select: { fileKey: true } }),
    prisma.entryLogDocument.findMany({ select: { fileKey: true } }),
    prisma.goodsMovementDocument.findMany({ select: { fileKey: true } }),
    prisma.incident.findMany({ select: { attachmentKey: true } }),
  ]);

  const keys: (string | null)[] = [
    ...transactions.flatMap((t) => [
      t.justifKey,
      t.purchaseOrderKey,
      t.invoiceKey,
      t.deliveryNoteKey,
    ]),
    ...tickets.map((d) => d.fileKey),
    ...contracts.map((d) => d.fileKey),
    ...procedures.map((d) => d.fileKey),
    ...spaces.map((d) => d.fileKey),
    ...stockItemDocs.map((d) => d.fileKey),
    ...assetDocs.map((d) => d.fileKey),
    ...entryLogDocs.map((d) => d.fileKey),
    ...goodsMovementDocs.map((d) => d.fileKey),
    ...incidents.map((i) => i.attachmentKey),
  ];

  return keys.filter((k): k is string => !!k);
}

function printCounts(title: string, counts: Counts) {
  console.log(`\n── ${title} ──`);
  console.log('Finance:');
  console.log(
    `  Transactions by type:            ${JSON.stringify(counts.transactionsByType)}`,
  );
  console.log(
    `  Transactions by status:          ${JSON.stringify(counts.transactionsByStatus)}`,
  );
  console.log(
    `  Transactions by workflow status: ${JSON.stringify(counts.transactionsByWorkflowStatus)}`,
  );
  console.log(
    `  EXPENSE_TRANSACTION validation requests: ${counts.expenseValidationRequests}`,
  );
  console.log(`  FINANCE/Transaction audit logs:  ${counts.financeAuditLogs}`);
  console.log('Administration & Locaux:');
  console.log(`  MaintenanceTicket:     ${counts.maintenanceTickets}`);
  console.log(`  SupplierContract:      ${counts.supplierContracts}`);
  console.log(`  AdministrativeProcedure: ${counts.administrativeProcedures}`);
  console.log(`  Space:                 ${counts.spaces}`);
  console.log(`  StockItem:             ${counts.stockItems}`);
  console.log(`  StockMovement:         ${counts.stockMovements}`);
  console.log(`  InventoryAsset:        ${counts.inventoryAssets}`);
  console.log(`  EntryLog:              ${counts.entryLogs}`);
  console.log(`  GoodsMovementLog:      ${counts.goodsMovementLogs}`);
  console.log(`  Incident:              ${counts.incidents}`);
  console.log(
    `  Admin ValidationRequest rows: ${counts.adminValidationRequests}`,
  );
  console.log(`  Admin AuditLog rows:          ${counts.adminAuditLogs}`);
  console.log('Preserved (reported, never deleted):');
  console.log(
    `  BudgetLine: ${counts.budgetLines}  |  Contact: ${counts.contacts}  |  User: ${counts.users}`,
  );
}

// ─── Deletion ───────────────────────────────────────────────────────────────
// FK-safe order: children/referencers before the rows they reference.
// See the script header for the full dependency rationale.

async function deleteEverything(prisma: PrismaClient) {
  return prisma.$transaction(async (tx) => {
    // Finance
    await tx.validationRequest.deleteMany({
      where: { resourceType: 'EXPENSE_TRANSACTION' },
    });
    await tx.auditLog.deleteMany({
      where: { module: 'FINANCE', entity: 'Transaction' },
    });
    await tx.transaction.deleteMany({});

    // Administration & Locaux
    await tx.validationRequest.deleteMany({
      where: { resourceType: { in: ADMIN_VALIDATION_RESOURCE_TYPES } },
    });
    await tx.auditLog.deleteMany({
      where: { module: { in: ADMIN_AUDIT_MODULES } },
    });

    // GoodsMovementLog / EntryLog reference StockItem, InventoryAsset,
    // Incident, Space (all optional) — deleted first so nothing downstream
    // has to rely on a default ON DELETE action.
    await tx.goodsMovementLog.deleteMany({}); // cascades GoodsMovementDocument
    await tx.entryLog.deleteMany({}); // cascades EntryLogDocument
    await tx.incident.deleteMany({}); // cascades notes/status-history/child+staff links

    // MaintenanceTicket has a Restrict FK to Space — must go before Space.
    await tx.maintenanceTicket.deleteMany({}); // cascades TicketAttachment

    // StockItem references Space + SupplierContract — before both.
    await tx.stockItem.deleteMany({}); // cascades StockMovement, StockItemDocument
    await tx.inventoryAsset.deleteMany({}); // cascades InventoryAssetDocument; references Space

    await tx.supplierContract.deleteMany({}); // cascades ContractDocument
    await tx.administrativeProcedure.deleteMany({}); // cascades ProcedureDocument

    // Last: nothing left references Space.
    await tx.space.deleteMany({}); // cascades SpaceDocument
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { host, dbName } = assertSafeEnvironment(process.env.DATABASE_URL);

  console.log('═══════════════════════════════════════════════════════════');
  console.log(
    ' Hadoum dev cleanup — Finance + Administration & Locaux demo data',
  );
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Database host: ${host}`);
  console.log(`Database name: ${dbName}`);
  console.log(
    `Mode: ${CONFIRM ? 'DELETE (--confirm passed)' : 'DRY RUN (pass --confirm to delete)'}`,
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const before = await collectCounts(prisma);
    printCounts('BEFORE', before);

    const s3Keys = await collectS3Keys(prisma);
    console.log(
      `\nReferenced S3 object keys (${s3Keys.length}) — NOT deleted from S3 by this script:`,
    );
    for (const key of s3Keys) console.log(`  - ${key}`);

    if (!CONFIRM) {
      console.log(
        '\nDry run complete. No data was deleted. Re-run with --confirm to delete.',
      );
      return;
    }

    console.log('\nDeleting…');
    await deleteEverything(prisma);
    console.log('Delete transaction committed.');

    const after = await collectCounts(prisma);
    printCounts('AFTER', after);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    '\nCleanup aborted:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
