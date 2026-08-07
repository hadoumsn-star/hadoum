import { SetMetadata } from '@nestjs/common';
import { AuditModule } from '@prisma/client';

export const AUDITED_KEY = 'audited';

export interface AuditedMetadata {
  module: AuditModule;
  // Display name of the entity this route mutates — also used (lower-camel-
  // cased) as the PrismaService property to snapshot before/after state,
  // e.g. 'Transaction' -> prisma.transaction, 'BudgetLine' -> prisma.budgetLine.
  entity: string;
  // Free-form action label (CREATE/UPDATE/DELETE or a module-specific
  // transition like APPROVE/ASSIGN/ARCHIVE). Not derived from the HTTP verb
  // alone so the audit trail reads like the actual business action taken.
  action: string;
  // Route param holding this entity's own id, when it isn't `:id` (e.g. a
  // nested sub-resource route like ':id/documents/:documentId').
  idParam?: string;
}

/**
 * Marks a controller route handler as audited. Purely declarative metadata —
 * the actual snapshotting/writing happens in AuditLogInterceptor, registered
 * once globally (see app.module.ts). Adding this decorator never changes a
 * route's behavior, request validation, or response shape.
 */
export const Audited = (metadata: AuditedMetadata) =>
  SetMetadata(AUDITED_KEY, metadata);
