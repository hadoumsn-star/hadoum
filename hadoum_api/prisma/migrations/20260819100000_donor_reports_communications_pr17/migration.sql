-- AlterTable
ALTER TABLE "DonorCommunication" ADD COLUMN     "donorReportId" TEXT;

-- AlterTable
ALTER TABLE "DonorReport" ADD COLUMN     "activitiesNarrative" TEXT,
ADD COLUMN     "financialSummarySnapshot" JSONB,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DonorReportPhoto" ADD COLUMN     "approvedForDonorReport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "DonorReport_donorProfileId_periodType_periodStart_periodEnd_key" ON "DonorReport"("donorProfileId", "periodType", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "DonorCommunication" ADD CONSTRAINT "DonorCommunication_donorReportId_fkey" FOREIGN KEY ("donorReportId") REFERENCES "DonorReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
