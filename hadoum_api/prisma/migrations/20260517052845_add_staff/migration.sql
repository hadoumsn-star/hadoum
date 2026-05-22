-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('PRESENT', 'ABSENT', 'CONGE');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NOUVEAU', 'PRESELECTIONNE', 'ENTRETIEN_FAIT');

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "classes" TEXT[],
    "status" "StaffStatus" NOT NULL DEFAULT 'PRESENT',
    "phone" TEXT,
    "email" TEXT,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "targetRole" TEXT,
    "phone" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NOUVEAU',
    "cvKey" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormerStaffMember" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL,
    "exitReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormerStaffMember_pkey" PRIMARY KEY ("id")
);
