-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ESPECES', 'VIREMENT', 'CHEQUE', 'MOBILE_MONEY', 'CARTE', 'AUTRE');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "deliveryNoteKey" TEXT,
ADD COLUMN     "deliveryNoteMime" TEXT,
ADD COLUMN     "invoiceKey" TEXT,
ADD COLUMN     "invoiceMime" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "purchaseOrderKey" TEXT,
ADD COLUMN     "purchaseOrderMime" TEXT,
ADD COLUMN     "supplierContactId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_supplierContactId_idx" ON "Transaction"("supplierContactId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
