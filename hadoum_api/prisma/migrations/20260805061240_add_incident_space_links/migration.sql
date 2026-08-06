-- CreateTable
CREATE TABLE "IncidentSpace" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentSpace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentSpace_spaceId_idx" ON "IncidentSpace"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentSpace_incidentId_spaceId_key" ON "IncidentSpace"("incidentId", "spaceId");

-- AddForeignKey
ALTER TABLE "IncidentSpace" ADD CONSTRAINT "IncidentSpace_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentSpace" ADD CONSTRAINT "IncidentSpace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
