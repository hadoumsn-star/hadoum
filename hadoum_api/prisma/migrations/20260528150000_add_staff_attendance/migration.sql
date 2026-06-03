CREATE TABLE "StaffAttendance" (
  "id"        TEXT NOT NULL,
  "staffId"   TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "motif"     TEXT,
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin"   TIMESTAMP(3),
  "justifKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);
