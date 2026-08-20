-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_ENDING_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_END_DATE_PASSED';
ALTER TYPE "NotificationType" ADD VALUE 'DONOR_REPORT_MISSING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ValidationResourceType" ADD VALUE 'CAMPAIGN';
ALTER TYPE "ValidationResourceType" ADD VALUE 'DONOR_PROFILE';
