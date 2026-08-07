-- Module 4 schema consolidation
--
-- This migration formally captures schema changes that were already applied
-- to the development database via `prisma db push` (and, in two cases,
-- `prisma db push --accept-data-loss`) while Module 4 (Locaux et espaces,
-- Tickets de maintenance, Contrats fournisseurs, Démarches administratives,
-- Stocks et inventaire, Registre d'entrées/sorties) was built.
--
-- It was generated with:
--   npx prisma migrate diff --from-migrations prisma/migrations \
--     --to-config-datasource --script
-- i.e. "from the last formally migrated schema (20260603300000_add_candidate_
-- integration_date) to the live development database", then reviewed
-- statement-by-statement before being committed here. No statement in this
-- file was applied blindly.
--
-- Safety review performed before commit (see docs/database-migrations.md
-- for the full audit trail):
--   - No DROP TABLE, no DROP COLUMN, no SET NOT NULL anywhere in this file.
--   - The only two statements touching pre-existing, populated tables
--     (Document.type, Candidate.scheduledIntegrationDate) are annotated
--     below and were verified against live data before being included.
--   - The five new UNIQUE indexes were checked against live data for
--     duplicate values; zero duplicates were found for all five.
--   - All new foreign keys reference brand-new Module 4 tables or add
--     nullable, SET NULL-on-delete relations to pre-existing tables — no
--     existing row can violate any of them.
--
-- CreateEnum
CREATE TYPE "public"."AssetCondition" AS ENUM ('NEUF', 'BON', 'MOYEN', 'MAUVAIS', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "public"."AssetStatus" AS ENUM ('DISPONIBLE', 'AFFECTE', 'EN_MAINTENANCE', 'PERDU', 'VOLE', 'CASSE', 'REFORME', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."AssetValidationAction" AS ENUM ('ASSET_TRANSFER', 'ASSET_DISPOSAL', 'ASSET_ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."BillingFrequency" AS ENUM ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE', 'PONCTUELLE');

-- CreateEnum
CREATE TYPE "public"."ContractCategory" AS ENUM ('BOULANGERIE', 'GAZ', 'EAU', 'ELECTRICITE', 'WOYOFAL', 'ENTRETIEN', 'NETTOYAGE', 'SECURITE', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."ContractStatus" AS ENUM ('BROUILLON', 'ACTIF', 'EXPIRE_BIENTOT', 'EXPIRE', 'RESILIE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."ContractValidationAction" AS ENUM ('CREATION', 'RENEWAL', 'TERMINATION');

-- CreateEnum
CREATE TYPE "public"."EntryStatus" AS ENUM ('PREVUE', 'PRESENT', 'SORTI', 'ANNULEE', 'REFUSEE', 'EN_ATTENTE_VALIDATION', 'ARCHIVEE');

-- CreateEnum
CREATE TYPE "public"."EntryType" AS ENUM ('ENTREE', 'SORTIE', 'VISITE_PREVUE', 'VISITE_IMPREVUE', 'SORTIE_TEMPORAIRE', 'SORTIE_EXCEPTIONNELLE', 'RETOUR', 'PRESTATION', 'LIVRAISON', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."EntryValidationAction" AS ENUM ('EXCEPTIONAL_EXIT', 'ACCESS_OVERRIDE', 'AFTER_HOURS_ACCESS', 'MANUAL_CHECKOUT_OVERRIDE', 'RECORD_ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."GoodsMovementStatus" AS ENUM ('ENREGISTRE', 'SORTI', 'RETOURNE', 'EN_ATTENTE_VALIDATION', 'ANNULE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."GoodsMovementType" AS ENUM ('ENTREE_MARCHANDISE', 'SORTIE_MARCHANDISE', 'LIVRAISON', 'RETOUR_FOURNISSEUR', 'PRET_EQUIPEMENT', 'RETOUR_EQUIPEMENT', 'TRANSFERT', 'SORTIE_TEMPORAIRE', 'DON_RECU', 'DON_DISTRIBUE', 'REFORME', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."GoodsValidationAction" AS ENUM ('HIGH_VALUE_ASSET_EXIT', 'TEMPORARY_ASSET_EXIT', 'CONTROLLED_GOODS_EXIT', 'RECORD_ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."IncidentStatus" AS ENUM ('EN_COURS', 'PLANIFIE', 'EN_RETARD', 'RESOLU');

-- CreateEnum
CREATE TYPE "public"."IncidentType" AS ENUM ('MEDICAL', 'COMPORTEMENT', 'SCOLAIRE', 'LOGISTIQUE', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('VALIDATION_SUBMITTED', 'VALIDATION_APPROVED', 'VALIDATION_REJECTED', 'VALIDATION_CHANGES_REQUESTED', 'CONTRACT_EXPIRING_SOON', 'CONTRACT_EXPIRED', 'PROCEDURE_EXPIRING_SOON', 'PROCEDURE_EXPIRED', 'PROCEDURE_RENEWAL_DUE', 'PROCEDURE_RESPONSE_OVERDUE', 'STOCK_LOW', 'STOCK_OUT', 'STOCK_EXPIRING_SOON', 'STOCK_EXPIRED', 'ASSET_INVENTORY_DUE', 'ASSET_WARRANTY_EXPIRING_SOON', 'VISITOR_OVERDUE_DEPARTURE', 'VISITOR_LONG_PRESENCE', 'EXPECTED_VISITOR_NO_SHOW', 'GOODS_RETURN_OVERDUE', 'REGISTER_INCIDENT_UNRESOLVED');

-- CreateEnum
CREATE TYPE "public"."ProcedureDocumentType" AS ENUM ('FORMULAIRE', 'COURRIER', 'RECEPISSE', 'AGREMENT', 'AUTORISATION', 'ATTESTATION', 'ASSURANCE', 'CERTIFICAT', 'PIECE_JURIDIQUE', 'REPONSE_ADMINISTRATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."ProcedurePriority" AS ENUM ('BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "public"."ProcedureStatus" AS ENUM ('A_PREPARER', 'EN_COURS', 'SOUMIS', 'EN_ATTENTE_REPONSE', 'APPROUVE', 'REFUSE', 'EXPIRE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."ProcedureType" AS ENUM ('AGREMENT', 'DECLARATION', 'AUTORISATION', 'ASSURANCE', 'CERTIFICAT', 'DOCUMENT_JURIDIQUE', 'RENOUVELLEMENT', 'CONVENTION', 'ATTESTATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."ProcedureValidationAction" AS ENUM ('SUBMISSION', 'FINALIZATION', 'RENEWAL', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."RegisterDocumentType" AS ENUM ('AUTORISATION_ACCES', 'PIECE_IDENTITE', 'BON_LIVRAISON', 'BON_SORTIE', 'PRET_EQUIPEMENT', 'RETOUR_EQUIPEMENT', 'RAPPORT_INCIDENT', 'DOCUMENT_VEHICULE', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."RenewalType" AS ENUM ('AUTOMATIQUE', 'MANUEL', 'NON_RENOUVELABLE');

-- CreateEnum
CREATE TYPE "public"."SpaceCondition" AS ENUM ('BON', 'MOYEN', 'MAUVAIS', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "public"."SpaceType" AS ENUM ('SALLE_CLASSE', 'DORTOIR', 'CUISINE', 'SANITAIRE', 'BUREAU', 'INFIRMERIE', 'STOCKAGE', 'ESPACE_EXTERIEUR', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."StockCategory" AS ENUM ('ALIMENTAIRE', 'HYGIENE', 'ENTRETIEN', 'MEDICAL', 'BUREAU', 'EQUIPEMENT', 'AUTRE', 'FOURNITURES_SCOLAIRES', 'VETEMENTS', 'LITERIE', 'MOBILIER', 'INFORMATIQUE', 'OUTILLAGE', 'DON');

-- CreateEnum
CREATE TYPE "public"."StockDocumentType" AS ENUM ('FACTURE', 'BON_LIVRAISON', 'BON_SORTIE', 'DON', 'INVENTAIRE', 'TRANSFERT', 'REFORME', 'PERTE', 'VOL', 'GARANTIE', 'PHOTO', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."StockMovementType" AS ENUM ('ENTREE', 'SORTIE', 'AJUSTEMENT_POSITIF', 'AJUSTEMENT_NEGATIF', 'TRANSFERT', 'PERTE', 'CASSE', 'PEREMPTION', 'DON_RECU', 'DON_DISTRIBUE', 'RETOUR', 'INVENTAIRE_CORRECTION');

-- CreateEnum
CREATE TYPE "public"."StockUnit" AS ENUM ('UNITE', 'CARTON', 'PAQUET', 'KILOGRAMME', 'GRAMME', 'LITRE', 'MILLILITRE', 'BOITE', 'SAC', 'BOUTEILLE', 'ROULEAU', 'LOT', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."StockValidationAction" AS ENUM ('LARGE_STOCK_EXIT', 'NEGATIVE_ADJUSTMENT', 'STOCK_LOSS', 'INVENTORY_CORRECTION', 'STOCK_ITEM_ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('OUVERT', 'ASSIGNE', 'EN_COURS', 'EN_ATTENTE', 'RESOLU', 'FERME', 'ANNULE');

-- CreateEnum
CREATE TYPE "public"."TicketUrgency" AS ENUM ('FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "public"."TransactionCategory" AS ENUM ('ALIMENTATION', 'SALAIRES', 'ENTRETIEN', 'SANTE', 'PEDAGOGIE', 'EQUIPEMENT', 'DON', 'VIREMENT', 'APPORT', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."TransactionStatus" AS ENUM ('VALIDE', 'EN_ATTENTE');

-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('DEPENSE', 'RECETTE');

-- CreateEnum
CREATE TYPE "public"."ValidationResourceType" AS ENUM ('MAINTENANCE_TICKET', 'SUPPLIER_CONTRACT', 'ADMINISTRATIVE_PROCEDURE', 'STOCK_ITEM', 'INVENTORY_ASSET', 'ENTRY_LOG', 'GOODS_MOVEMENT_LOG');

-- CreateEnum
CREATE TYPE "public"."ValidationStatus" AS ENUM ('DRAFT', 'PENDING_VALIDATION', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "public"."VisitorCategory" AS ENUM ('PARENT_TUTEUR', 'FOURNISSEUR', 'PRESTATAIRE', 'MAINTENANCE', 'LIVRAISON', 'PARTENAIRE', 'BENEVOLE', 'ADMINISTRATION', 'PERSONNEL', 'VISITEUR', 'AUTRE');

-- AlterEnum
-- The value set of DocumentType has not actually changed since the last
-- migration (20260516085528_extend_document_types) — this recreate-and-swap
-- only realigns Prisma's migration-history bookkeeping with the value set
-- already live on this database. Verified before commit: the 15 target
-- values are a superset of every distinct value present in `Document.type`
-- (12 distinct values in use across 55 rows, all present in the new enum).
-- No data loss.
BEGIN;
CREATE TYPE "public"."DocumentType_new" AS ENUM ('ACTE_NAISSANCE', 'ACTE_DECES', 'PIECE_ID_TUTEUR', 'ACCORD_AEMO', 'CARNET_SANTE', 'CERTIFICAT_PEC', 'AUTORISATION_GOUVERNEMENTALE', 'PHOTO', 'ORDONNANCE', 'BULLETIN_SCOLAIRE', 'LEGAL_DOCUMENT', 'EVALUATION_PSYCHOMOTRICE', 'BILAN_PSYCHOLOGIQUE', 'BILAN_SANTE', 'AUTRE');
ALTER TABLE "public"."Document" ALTER COLUMN "type" TYPE "public"."DocumentType_new" USING ("type"::text::"public"."DocumentType_new");
ALTER TYPE "public"."DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "public"."DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "public"."DocumentType_old";
COMMIT;

-- AlterTable
-- Candidate.scheduledIntegrationDate is already TIMESTAMP(3) on the live
-- database; this statement only reconciles migration history with that
-- reality (a pre-Module-4 change applied via db push). No-op on live data.
ALTER TABLE "public"."Candidate" ALTER COLUMN "scheduledIntegrationDate" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
-- Two new nullable columns on FormerStaffMember (pre-Module-4 drift,
-- applied via db push alongside Module 4 work). Nullable additive change,
-- no backfill required.
ALTER TABLE "public"."FormerStaffMember" ADD COLUMN     "scheduledReintegrationDate" TIMESTAMP(3),
ADD COLUMN     "scheduledRole" TEXT;

-- CreateTable
CREATE TABLE "public"."AdministrativeProcedure" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "description" TEXT,
    "referenceNumber" TEXT,
    "submissionDate" TIMESTAMP(3),
    "expectedResponseDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "status" "public"."ProcedureStatus" NOT NULL DEFAULT 'A_PREPARER',
    "assignedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "pendingValidationAction" "public"."ProcedureValidationAction",
    "priority" "public"."ProcedurePriority" NOT NULL DEFAULT 'NORMALE',
    "validationStatus" "public"."ValidationStatus",
    "procedureType" "public"."ProcedureType" NOT NULL,

    CONSTRAINT "AdministrativeProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetLine" (
    "id" TEXT NOT NULL,
    "category" "public"."TransactionCategory" NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "budgetXof" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EntryLog" (
    "id" TEXT NOT NULL,
    "entryType" "public"."EntryType" NOT NULL,
    "visitorCategory" "public"."VisitorCategory" NOT NULL,
    "fullName" TEXT NOT NULL,
    "organization" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "identityDocumentType" TEXT,
    "identityDocumentNumber" TEXT,
    "purpose" TEXT,
    "personVisited" TEXT,
    "personVisitedUserId" TEXT,
    "spaceId" TEXT,
    "arrivalDateTime" TIMESTAMP(3),
    "expectedDepartureDateTime" TIMESTAMP(3),
    "actualDepartureDateTime" TIMESTAMP(3),
    "status" "public"."EntryStatus" NOT NULL DEFAULT 'PREVUE',
    "accessBadgeNumber" TEXT,
    "vehicleRegistration" TEXT,
    "accompanyingPersonsCount" INTEGER NOT NULL DEFAULT 0,
    "authorizedBy" TEXT,
    "authorizedByUserId" TEXT,
    "recordedById" TEXT,
    "notes" TEXT,
    "incidentReported" BOOLEAN NOT NULL DEFAULT false,
    "incidentId" TEXT,
    "incidentDescription" TEXT,
    "validationStatus" "public"."ValidationStatus",
    "pendingValidationAction" "public"."EntryValidationAction",
    "pendingValidationPayload" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EntryLogDocument" (
    "id" TEXT NOT NULL,
    "entryLogId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "documentType" "public"."RegisterDocumentType",
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryLogDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoodsMovementDocument" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "documentType" "public"."RegisterDocumentType",
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsMovementDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoodsMovementLog" (
    "id" TEXT NOT NULL,
    "movementType" "public"."GoodsMovementType" NOT NULL,
    "description" TEXT NOT NULL,
    "itemReference" TEXT,
    "stockItemId" TEXT,
    "inventoryAssetId" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" "public"."StockUnit",
    "source" TEXT,
    "destination" TEXT,
    "personInCharge" TEXT,
    "vehicleRegistration" TEXT,
    "deliveryNoteNumber" TEXT,
    "authorizationReference" TEXT,
    "reason" TEXT,
    "movementDateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "status" "public"."GoodsMovementStatus" NOT NULL DEFAULT 'ENREGISTRE',
    "recordedById" TEXT,
    "authorizedByUserId" TEXT,
    "validationStatus" "public"."ValidationStatus",
    "pendingValidationAction" "public"."GoodsValidationAction",
    "pendingValidationPayload" JSONB,
    "incidentReported" BOOLEAN NOT NULL DEFAULT false,
    "incidentId" TEXT,
    "incidentDescription" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsMovementLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "public"."IncidentType" NOT NULL,
    "description" TEXT,
    "signaledBy" TEXT NOT NULL,
    "status" "public"."IncidentStatus" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attachmentKey" TEXT,
    "attachmentMime" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IncidentNote" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetCode" TEXT,
    "serialNumber" TEXT,
    "category" "public"."StockCategory" NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionCost" INTEGER,
    "fundingSource" TEXT,
    "donorName" TEXT,
    "warrantyEndDate" TIMESTAMP(3),
    "condition" "public"."AssetCondition" NOT NULL DEFAULT 'BON',
    "status" "public"."AssetStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "spaceId" TEXT,
    "assignedTo" TEXT,
    "assignedToUserId" TEXT,
    "lastInventoryDate" TIMESTAMP(3),
    "nextInventoryDate" TIMESTAMP(3),
    "notes" TEXT,
    "validationStatus" "public"."ValidationStatus",
    "pendingValidationAction" "public"."AssetValidationAction",
    "pendingValidationPayload" JSONB,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryAssetDocument" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "documentType" "public"."StockDocumentType",
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAssetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "problemType" TEXT,
    "spaceId" TEXT NOT NULL,
    "urgency" "public"."TicketUrgency" NOT NULL,
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'OUVERT',
    "reportedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedBy" TEXT NOT NULL,
    "assignedTo" TEXT,
    "plannedDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "estimatedCost" INTEGER,
    "actualCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validationStatus" "public"."ValidationStatus",

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "resourceType" "public"."ValidationResourceType",
    "resourceId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcedureDocument" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentType" "public"."ProcedureDocumentType",
    "uploadedById" TEXT,

    CONSTRAINT "ProcedureDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."SpaceType" NOT NULL,
    "description" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "zone" TEXT,
    "condition" "public"."SpaceCondition" NOT NULL DEFAULT 'BON',
    "capacity" INTEGER,
    "equipment" TEXT[],
    "observations" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpaceDocument" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "public"."StockCategory" NOT NULL,
    "currentQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageLocation" TEXT,
    "batchNumber" TEXT,
    "expirationDate" TIMESTAMP(3),
    "supplierName" TEXT,
    "unitCost" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "barcode" TEXT,
    "createdById" TEXT,
    "description" TEXT,
    "isPerishable" BOOLEAN NOT NULL DEFAULT false,
    "maximumQuantity" DOUBLE PRECISION,
    "minimumQuantity" DOUBLE PRECISION,
    "pendingValidationAction" "public"."StockValidationAction",
    "pendingValidationPayload" JSONB,
    "reference" TEXT,
    "reorderQuantity" DOUBLE PRECISION,
    "spaceId" TEXT,
    "supplierContractId" TEXT,
    "validationStatus" "public"."ValidationStatus",
    "unit" "public"."StockUnit" NOT NULL DEFAULT 'UNITE',

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockItemDocument" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "label" TEXT,
    "documentType" "public"."StockDocumentType",
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockItemDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockMovement" (
    "id" TEXT NOT NULL,
    "type" "public"."StockMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "destination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "batchNumber" TEXT,
    "expirationDate" TIMESTAMP(3),
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "quantityAfter" DOUBLE PRECISION NOT NULL,
    "quantityBefore" DOUBLE PRECISION NOT NULL,
    "referenceDocument" TEXT,
    "source" TEXT,
    "stockItemId" TEXT NOT NULL,
    "totalValue" INTEGER,
    "unitCost" INTEGER,
    "validationStatus" "public"."ValidationStatus",

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierContract" (
    "id" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "category" "public"."ContractCategory" NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "renewalType" "public"."RenewalType",
    "amount" INTEGER,
    "billingFrequency" "public"."BillingFrequency",
    "status" "public"."ContractStatus" NOT NULL DEFAULT 'ACTIF',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "contactPerson" TEXT,
    "contractNumber" TEXT,
    "email" TEXT,
    "noticePeriod" INTEGER,
    "pendingValidationAction" "public"."ContractValidationAction",
    "phone" TEXT,
    "validationStatus" "public"."ValidationStatus",

    CONSTRAINT "SupplierContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "category" "public"."TransactionCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "public"."TransactionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "justifKey" TEXT,
    "justifMime" TEXT,
    "donorName" TEXT,
    "isAnonymousDonor" BOOLEAN,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ValidationRequest" (
    "id" TEXT NOT NULL,
    "resourceType" "public"."ValidationResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "public"."ValidationStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "previousStatus" "public"."ValidationStatus",
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_category_month_year_key" ON "public"."BudgetLine"("category" ASC, "month" ASC, "year" ASC);

-- CreateIndex
CREATE INDEX "EntryLog_spaceId_idx" ON "public"."EntryLog"("spaceId" ASC);

-- CreateIndex
CREATE INDEX "EntryLog_status_idx" ON "public"."EntryLog"("status" ASC);

-- CreateIndex
CREATE INDEX "GoodsMovementLog_inventoryAssetId_idx" ON "public"."GoodsMovementLog"("inventoryAssetId" ASC);

-- CreateIndex
CREATE INDEX "GoodsMovementLog_status_idx" ON "public"."GoodsMovementLog"("status" ASC);

-- CreateIndex
CREATE INDEX "GoodsMovementLog_stockItemId_idx" ON "public"."GoodsMovementLog"("stockItemId" ASC);

-- CreateIndex
-- Verified before commit: zero duplicate assetCode values in InventoryAsset.
CREATE UNIQUE INDEX "InventoryAsset_assetCode_key" ON "public"."InventoryAsset"("assetCode" ASC);

-- CreateIndex
-- Verified before commit: zero duplicate serialNumber values in InventoryAsset.
CREATE UNIQUE INDEX "InventoryAsset_serialNumber_key" ON "public"."InventoryAsset"("serialNumber" ASC);

-- CreateIndex
CREATE INDEX "Notification_recipientId_isRead_idx" ON "public"."Notification"("recipientId" ASC, "isRead" ASC);

-- CreateIndex
-- Verified before commit: zero duplicate barcode values in StockItem.
CREATE UNIQUE INDEX "StockItem_barcode_key" ON "public"."StockItem"("barcode" ASC);

-- CreateIndex
-- Verified before commit: zero duplicate reference values in StockItem.
CREATE UNIQUE INDEX "StockItem_reference_key" ON "public"."StockItem"("reference" ASC);

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_idx" ON "public"."StockMovement"("stockItemId" ASC);

-- CreateIndex
CREATE INDEX "ValidationRequest_resourceType_resourceId_idx" ON "public"."ValidationRequest"("resourceType" ASC, "resourceId" ASC);

-- CreateIndex
CREATE INDEX "ValidationRequest_status_idx" ON "public"."ValidationRequest"("status" ASC);

-- AddForeignKey
ALTER TABLE "public"."AdministrativeProcedure" ADD CONSTRAINT "AdministrativeProcedure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."SupplierContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLog" ADD CONSTRAINT "EntryLog_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLog" ADD CONSTRAINT "EntryLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLog" ADD CONSTRAINT "EntryLog_personVisitedUserId_fkey" FOREIGN KEY ("personVisitedUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLog" ADD CONSTRAINT "EntryLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLog" ADD CONSTRAINT "EntryLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLogDocument" ADD CONSTRAINT "EntryLogDocument_entryLogId_fkey" FOREIGN KEY ("entryLogId") REFERENCES "public"."EntryLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EntryLogDocument" ADD CONSTRAINT "EntryLogDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementDocument" ADD CONSTRAINT "GoodsMovementDocument_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "public"."GoodsMovementLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementDocument" ADD CONSTRAINT "GoodsMovementDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementLog" ADD CONSTRAINT "GoodsMovementLog_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementLog" ADD CONSTRAINT "GoodsMovementLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementLog" ADD CONSTRAINT "GoodsMovementLog_inventoryAssetId_fkey" FOREIGN KEY ("inventoryAssetId") REFERENCES "public"."InventoryAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementLog" ADD CONSTRAINT "GoodsMovementLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoodsMovementLog" ADD CONSTRAINT "GoodsMovementLog_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "public"."StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncidentNote" ADD CONSTRAINT "IncidentNote_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAsset" ADD CONSTRAINT "InventoryAsset_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAsset" ADD CONSTRAINT "InventoryAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAsset" ADD CONSTRAINT "InventoryAsset_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAssetDocument" ADD CONSTRAINT "InventoryAssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."InventoryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAssetDocument" ADD CONSTRAINT "InventoryAssetDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- NOTE: this recreates the FK exactly as it is live today (ON DELETE
-- CASCADE). The follow-up migration 20260730140100_module4_indexes_and_
-- constraints changes this to ON DELETE RESTRICT to stop a future Space
-- deletion from silently destroying MaintenanceTicket history. Space
-- deletion is not currently exposed by the API, so this is not an active
-- risk on the current dataset, but the corrected behaviour is applied
-- immediately after this migration so no window exists in a freshly
-- migrated database either.
ALTER TABLE "public"."MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcedureDocument" ADD CONSTRAINT "ProcedureDocument_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "public"."AdministrativeProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcedureDocument" ADD CONSTRAINT "ProcedureDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceDocument" ADD CONSTRAINT "SpaceDocument_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockItem" ADD CONSTRAINT "StockItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockItem" ADD CONSTRAINT "StockItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockItem" ADD CONSTRAINT "StockItem_supplierContractId_fkey" FOREIGN KEY ("supplierContractId") REFERENCES "public"."SupplierContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockItemDocument" ADD CONSTRAINT "StockItemDocument_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "public"."StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockItemDocument" ADD CONSTRAINT "StockItemDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Historical stock movement records are children of their StockItem
-- (mirrors the *Document tables' pattern); StockItem has no delete
-- endpoint in the API (items are archived, never deleted), so this is
-- not an active risk on the current dataset.
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "public"."StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationRequest" ADD CONSTRAINT "ValidationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationRequest" ADD CONSTRAINT "ValidationRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
