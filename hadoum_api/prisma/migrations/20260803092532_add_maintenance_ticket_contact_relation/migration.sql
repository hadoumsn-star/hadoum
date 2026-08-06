-- AlterTable
ALTER TABLE "MaintenanceTicket" ADD COLUMN     "assignedContactId" TEXT;

-- CreateIndex
CREATE INDEX "MaintenanceTicket_assignedContactId_idx" ON "MaintenanceTicket"("assignedContactId");

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assignedContactId_fkey" FOREIGN KEY ("assignedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
