-- CreateEnum
CREATE TYPE "DonorType" AS ENUM ('PARRAIN', 'DONATEUR_PONCTUEL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('BROUILLON', 'ACTIVE', 'TERMINEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "DonorCommunicationType" AS ENUM ('REPORT_SENT', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'ACKNOWLEDGEMENT');

-- CreateEnum
CREATE TYPE "DonorCommunicationDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "DonorReportPeriodType" AS ENUM ('MENSUEL', 'TRIMESTRIEL');

-- CreateEnum
CREATE TYPE "DonorReportStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT');

-- AlterEnum
ALTER TYPE "AuditModule" ADD VALUE 'DONORS';

-- CreateTable
CREATE TABLE "DonorProfile" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "DonorType" NOT NULL,
    "engagementStartDate" TIMESTAMP(3),
    "monthlyContributionXof" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAmountXof" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'BROUILLON',
    "utilizationReport" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDocument" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "donorProfileId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amountXof" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "transactionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonorCommunication" (
    "id" TEXT NOT NULL,
    "donorProfileId" TEXT NOT NULL,
    "type" "DonorCommunicationType" NOT NULL,
    "direction" "DonorCommunicationDirection",
    "date" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "documentKey" TEXT,
    "documentMime" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonorCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonorReport" (
    "id" TEXT NOT NULL,
    "donorProfileId" TEXT NOT NULL,
    "periodType" "DonorReportPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "DonorReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "fileKey" TEXT,
    "fileMime" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonorReportPhoto" (
    "id" TEXT NOT NULL,
    "donorReportId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonorReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DonorProfile_contactId_key" ON "DonorProfile"("contactId");

-- CreateIndex
CREATE INDEX "DonorProfile_type_idx" ON "DonorProfile"("type");

-- CreateIndex
CREATE INDEX "DonorProfile_active_idx" ON "DonorProfile"("active");

-- CreateIndex
CREATE INDEX "FundraisingCampaign_status_idx" ON "FundraisingCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_transactionId_key" ON "Donation"("transactionId");

-- CreateIndex
CREATE INDEX "Donation_donorProfileId_idx" ON "Donation"("donorProfileId");

-- CreateIndex
CREATE INDEX "Donation_campaignId_idx" ON "Donation"("campaignId");

-- CreateIndex
CREATE INDEX "DonorCommunication_donorProfileId_idx" ON "DonorCommunication"("donorProfileId");

-- CreateIndex
CREATE INDEX "DonorCommunication_type_idx" ON "DonorCommunication"("type");

-- CreateIndex
CREATE INDEX "DonorReport_donorProfileId_idx" ON "DonorReport"("donorProfileId");

-- CreateIndex
CREATE INDEX "DonorReport_status_idx" ON "DonorReport"("status");

-- CreateIndex
CREATE INDEX "DonorReport_periodStart_periodEnd_idx" ON "DonorReport"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "DonorProfile" ADD CONSTRAINT "DonorProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorProfile" ADD CONSTRAINT "DonorProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingCampaign" ADD CONSTRAINT "FundraisingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorProfileId_fkey" FOREIGN KEY ("donorProfileId") REFERENCES "DonorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraisingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorCommunication" ADD CONSTRAINT "DonorCommunication_donorProfileId_fkey" FOREIGN KEY ("donorProfileId") REFERENCES "DonorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorCommunication" ADD CONSTRAINT "DonorCommunication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorReport" ADD CONSTRAINT "DonorReport_donorProfileId_fkey" FOREIGN KEY ("donorProfileId") REFERENCES "DonorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorReport" ADD CONSTRAINT "DonorReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorReportPhoto" ADD CONSTRAINT "DonorReportPhoto_donorReportId_fkey" FOREIGN KEY ("donorReportId") REFERENCES "DonorReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
