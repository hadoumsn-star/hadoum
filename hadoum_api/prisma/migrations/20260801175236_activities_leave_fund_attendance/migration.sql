-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ValidationResourceType" ADD VALUE 'ACTIVITY';
ALTER TYPE "ValidationResourceType" ADD VALUE 'LEAVE_REQUEST';
ALTER TYPE "ValidationResourceType" ADD VALUE 'FUND_REQUEST';

-- AlterTable
ALTER TABLE "StaffAttendance" ADD COLUMN     "validationStatus" "ValidationStatus";

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "validationStatus" "ValidationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundRequest" (
    "id" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validationStatus" "ValidationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildAttendance" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "present" BOOLEAN NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPresenceConfirmation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPresenceConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_validationStatus_idx" ON "Activity"("validationStatus");

-- CreateIndex
CREATE INDEX "Activity_educatorId_idx" ON "Activity"("educatorId");

-- CreateIndex
CREATE INDEX "FundRequest_validationStatus_idx" ON "FundRequest"("validationStatus");

-- CreateIndex
CREATE INDEX "ChildAttendance_date_idx" ON "ChildAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ChildAttendance_childId_date_key" ON "ChildAttendance"("childId", "date");

-- CreateIndex
CREATE INDEX "StaffPresenceConfirmation_date_idx" ON "StaffPresenceConfirmation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPresenceConfirmation_staffId_date_key" ON "StaffPresenceConfirmation"("staffId", "date");

-- CreateIndex
CREATE INDEX "StaffAttendance_validationStatus_idx" ON "StaffAttendance"("validationStatus");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildAttendance" ADD CONSTRAINT "ChildAttendance_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildAttendance" ADD CONSTRAINT "ChildAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPresenceConfirmation" ADD CONSTRAINT "StaffPresenceConfirmation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPresenceConfirmation" ADD CONSTRAINT "StaffPresenceConfirmation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
