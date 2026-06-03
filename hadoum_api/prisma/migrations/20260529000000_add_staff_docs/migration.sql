CREATE TABLE "StaffDoc" (
  "id"        TEXT         NOT NULL,
  "staffId"   TEXT         NOT NULL,
  "key"       TEXT         NOT NULL,
  "label"     TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffDoc_pkey" PRIMARY KEY ("id")
);
