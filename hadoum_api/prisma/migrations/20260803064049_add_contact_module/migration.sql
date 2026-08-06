-- CreateTable
CREATE TABLE "ContactCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "organization" TEXT,
    "functionTitle" TEXT,
    "categoryId" TEXT NOT NULL,
    "phone" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "photoKey" TEXT,
    "photoMime" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactCategory_key_key" ON "ContactCategory"("key");

-- CreateIndex
CREATE INDEX "Contact_fullName_idx" ON "Contact"("fullName");

-- CreateIndex
CREATE INDEX "Contact_organization_idx" ON "Contact"("organization");

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_categoryId_idx" ON "Contact"("categoryId");

-- CreateIndex
CREATE INDEX "Contact_active_idx" ON "Contact"("active");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContactCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
