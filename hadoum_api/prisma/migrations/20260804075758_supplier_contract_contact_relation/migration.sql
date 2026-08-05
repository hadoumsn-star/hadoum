-- AlterTable
ALTER TABLE "SupplierContract" ADD COLUMN     "supplierContactId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierContract_supplierContactId_idx" ON "SupplierContract"("supplierContactId");

-- AddForeignKey
ALTER TABLE "SupplierContract" ADD CONSTRAINT "SupplierContract_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
