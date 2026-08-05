-- AlterTable
ALTER TABLE "AdministrativeProcedure" ADD COLUMN     "assignedContactId" TEXT;

-- CreateIndex
CREATE INDEX "AdministrativeProcedure_assignedContactId_idx" ON "AdministrativeProcedure"("assignedContactId");

-- AddForeignKey
ALTER TABLE "AdministrativeProcedure" ADD CONSTRAINT "AdministrativeProcedure_assignedContactId_fkey" FOREIGN KEY ("assignedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
