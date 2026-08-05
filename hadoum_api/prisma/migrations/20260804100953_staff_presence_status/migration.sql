-- CreateEnum
CREATE TYPE "StaffPresenceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- AlterTable
ALTER TABLE "StaffPresenceConfirmation" ADD COLUMN     "status" "StaffPresenceStatus";
