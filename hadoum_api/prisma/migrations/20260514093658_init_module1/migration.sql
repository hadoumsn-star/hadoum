-- CreateEnum
CREATE TYPE "ChildStatus" AS ENUM ('ORPHELIN_COMPLET', 'DEMI_ORPHELIN', 'ENFANT_EN_DIFFICULTE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MASCULIN', 'FEMININ');

-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('DAARA', 'ECOLE_PUBLIQUE', 'ECOLE_PRIVEE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ACTE_NAISSANCE', 'PHOTO', 'ORDONNANCE', 'BULLETIN_SCOLAIRE', 'AUTRE');

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "fileNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "placeOfBirth" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "status" "ChildStatus" NOT NULL,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianRelation" TEXT,
    "emergencyContacts" JSONB,
    "familyComposition" TEXT,
    "placementHistory" TEXT,
    "familyContacts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "bloodType" TEXT,
    "allergies" TEXT,
    "currentTreatments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" TEXT NOT NULL,
    "medicalRecordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "medicalRecordId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "doctor" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "prescription" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsychRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "initialAssessment" TEXT,
    "pppObjectives" TEXT,
    "behavioralEvolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsychRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsychSession" (
    "id" TEXT NOT NULL,
    "psychRecordId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "observations" TEXT NOT NULL,
    "progress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsychSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "schoolType" "SchoolType" NOT NULL,
    "schoolName" TEXT NOT NULL,
    "currentLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResult" (
    "id" TEXT NOT NULL,
    "schoolRecordId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" DOUBLE PRECISION,
    "attendance" TEXT,
    "teacherNotes" TEXT,
    "bulletinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyObservation" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "author" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "groupIntegration" TEXT,
    "incidents" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "label" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Child_fileNumber_key" ON "Child"("fileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_childId_key" ON "MedicalRecord"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "PsychRecord_childId_key" ON "PsychRecord"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolRecord_childId_key" ON "SchoolRecord"("childId");

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PsychRecord" ADD CONSTRAINT "PsychRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PsychSession" ADD CONSTRAINT "PsychSession_psychRecordId_fkey" FOREIGN KEY ("psychRecordId") REFERENCES "PsychRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolRecord" ADD CONSTRAINT "SchoolRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_schoolRecordId_fkey" FOREIGN KEY ("schoolRecordId") REFERENCES "SchoolRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyObservation" ADD CONSTRAINT "DailyObservation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
