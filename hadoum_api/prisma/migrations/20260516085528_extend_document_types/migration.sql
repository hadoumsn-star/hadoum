-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'ACTE_DECES';
ALTER TYPE "DocumentType" ADD VALUE 'PIECE_ID_TUTEUR';
ALTER TYPE "DocumentType" ADD VALUE 'ACCORD_AEMO';
ALTER TYPE "DocumentType" ADD VALUE 'CARNET_SANTE';
ALTER TYPE "DocumentType" ADD VALUE 'CERTIFICAT_PEC';
ALTER TYPE "DocumentType" ADD VALUE 'AUTORISATION_GOUVERNEMENTALE';
