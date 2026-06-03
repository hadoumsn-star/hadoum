CREATE TABLE "CandidateDoc" (
  "id"          TEXT         NOT NULL,
  "candidateId" TEXT         NOT NULL,
  "key"         TEXT         NOT NULL,
  "label"       TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateDoc_pkey" PRIMARY KEY ("id")
);
