-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('N1', 'N2', 'N3');

-- AlterEnum
ALTER TYPE "IncidentStatus" ADD VALUE 'EN_ATTENTE';

-- AlterEnum
ALTER TYPE "IncidentType" ADD VALUE 'SECURITE';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "priority" "IncidentPriority" NOT NULL DEFAULT 'N3';

-- CreateTable
CREATE TABLE "IncidentStatusHistory" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "previousStatus" "IncidentStatus" NOT NULL,
    "newStatus" "IncidentStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentChild" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentStaff" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentStatusHistory_incidentId_idx" ON "IncidentStatusHistory"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentChild_childId_idx" ON "IncidentChild"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentChild_incidentId_childId_key" ON "IncidentChild"("incidentId", "childId");

-- CreateIndex
CREATE INDEX "IncidentStaff_staffId_idx" ON "IncidentStaff"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentStaff_incidentId_staffId_key" ON "IncidentStaff"("incidentId", "staffId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_priority_idx" ON "Incident"("priority");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentStatusHistory" ADD CONSTRAINT "IncidentStatusHistory_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentStatusHistory" ADD CONSTRAINT "IncidentStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentChild" ADD CONSTRAINT "IncidentChild_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentChild" ADD CONSTRAINT "IncidentChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentStaff" ADD CONSTRAINT "IncidentStaff_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentStaff" ADD CONSTRAINT "IncidentStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
