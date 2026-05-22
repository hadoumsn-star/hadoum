-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "exitReason" TEXT,
ADD COLUMN     "exitResponsable" TEXT,
ADD COLUMN     "exitType" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
