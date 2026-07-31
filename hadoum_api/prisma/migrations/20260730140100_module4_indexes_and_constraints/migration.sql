-- Module 4 indexes and constraint correction
--
-- Two categories of change, both new relative to what was ever live via
-- db push (verified via `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script`, run against the database
-- exactly as left by the previous migration):
--
-- 1. MaintenanceTicket.spaceId's delete behaviour is corrected from
--    CASCADE to RESTRICT. Every other FK from a Module 4 resource to
--    Space (InventoryAsset, StockItem, EntryLog) uses SET NULL, preserving
--    the resource if its Space is ever deleted. MaintenanceTicket was the
--    only outlier, and CASCADE there would silently destroy maintenance
--    history if a Space were deleted. RESTRICT was chosen over SET NULL
--    because MaintenanceTicket.spaceId is NOT NULL (a ticket always
--    belongs to a space); making it nullable would be a larger, business-
--    logic-affecting change out of scope for this consolidation sprint.
--    RESTRICT simply blocks deleting a Space that still has tickets,
--    which is strictly safer than silent cascading deletion.
--
-- 2. Ten new non-unique indexes, each backed by a real, currently-executed
--    query pattern found by reading the corresponding service files
--    (see docs/database-migrations.md for the full justification per
--    index) — not a blanket application of the schema's own field list.

-- DropForeignKey
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT "MaintenanceTicket_spaceId_fkey";

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- maintenance-tickets.service.ts findAll(): filtered by spaceId (FK, not
-- auto-indexed by Postgres).
CREATE INDEX "MaintenanceTicket_spaceId_idx" ON "MaintenanceTicket"("spaceId");

-- CreateIndex
-- maintenance-tickets.service.ts findAll(): filtered by status.
CREATE INDEX "MaintenanceTicket_status_idx" ON "MaintenanceTicket"("status");

-- CreateIndex
-- supplier-contracts.service.ts findAll(): filtered by status (operational
-- active/expiring dashboard counters).
CREATE INDEX "SupplierContract_status_idx" ON "SupplierContract"("status");

-- CreateIndex
-- administrative-procedures.service.ts findAll(): filtered by status.
CREATE INDEX "AdministrativeProcedure_status_idx" ON "AdministrativeProcedure"("status");

-- CreateIndex
-- stock-items.service.ts findAll(): isActive is applied on every call
-- (defaults to true), the most selective/common filter on this table.
CREATE INDEX "StockItem_isActive_idx" ON "StockItem"("isActive");

-- CreateIndex
-- inventory-assets.service.ts findAll(): filtered by spaceId (FK).
CREATE INDEX "InventoryAsset_spaceId_idx" ON "InventoryAsset"("spaceId");

-- CreateIndex
-- inventory-assets.service.ts findAll(): filtered by status (also used
-- twice per call for the archived/non-archived toggle).
CREATE INDEX "InventoryAsset_status_idx" ON "InventoryAsset"("status");

-- CreateIndex
-- notifications.service.ts findForUser(): filtered by recipientId, sorted
-- by createdAt desc — not covered by the existing (recipientId, isRead)
-- composite index.
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
-- Every Module 4 service's notify*Once() dedup guard runs a findFirst on
-- this exact (resourceType, resourceId, type) triple before creating a
-- notification, on nearly every mutation across seven resources.
CREATE INDEX "Notification_resourceType_resourceId_type_idx" ON "Notification"("resourceType", "resourceId", "type");

-- CreateIndex
-- validations.service.ts findPendingFor()/findPending()/findHistory():
-- submittedAt is used for ordering on every pending-validation list,
-- alongside a status filter.
CREATE INDEX "ValidationRequest_status_submittedAt_idx" ON "ValidationRequest"("status", "submittedAt");
