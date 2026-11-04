-- CreateEnum
CREATE TYPE "SatsangStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'ALLOCATED', 'PUBLISHED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Choice" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE', 'BACKUP');

-- CreateEnum
CREATE TYPE "RowKind" AS ENUM ('BLOCK', 'NAMED_PART', 'SINGLE_PRAYER', 'PREFILLED');

-- CreateEnum
CREATE TYPE "RowStatus" AS ENUM ('ASSIGNED', 'DROPPED', 'COVERED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('ADMIN', 'SCHEDULER');

-- CreateTable
CREATE TABLE "AdminAccount" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fixedNames" TEXT[] DEFAULT ARRAY['VISVAS']::TEXT[],

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bhakta" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "listOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bhakta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "satsangDay" INTEGER NOT NULL DEFAULT 6,
    "satsangTime" TEXT NOT NULL DEFAULT '19:00',
    "openDay" INTEGER NOT NULL DEFAULT 1,
    "openTime" TEXT NOT NULL DEFAULT '06:00',
    "closeDay" INTEGER NOT NULL DEFAULT 2,
    "closeTime" TEXT NOT NULL DEFAULT '23:59',
    "publishDay" INTEGER NOT NULL DEFAULT 3,
    "publishTime" TEXT NOT NULL DEFAULT '06:00',
    "defaultTemplateId" INTEGER,
    "autoMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlokamTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slokamsPerBhakta" INTEGER NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlokamTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRow" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "sheetOrder" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "fromText" TEXT,
    "toText" TEXT,
    "rowKind" "RowKind" NOT NULL,
    "unitNo" INTEGER NOT NULL,
    "rowSpan" INTEGER NOT NULL DEFAULT 1,
    "prefilledName" TEXT,

    CONSTRAINT "TemplateRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Satsang" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Satsang',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "templateId" INTEGER,
    "stateOverride" TEXT,
    "status" "SatsangStatus" NOT NULL DEFAULT 'SCHEDULED',
    "publishPaused" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Satsang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" SERIAL NOT NULL,
    "satsangId" INTEGER NOT NULL,
    "bhaktaId" INTEGER NOT NULL,
    "choice" "Choice" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectedAttempt" (
    "id" SERIAL NOT NULL,
    "satsangId" INTEGER NOT NULL,
    "enteredName" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRow" (
    "id" SERIAL NOT NULL,
    "satsangId" INTEGER NOT NULL,
    "sheetOrder" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "fromText" TEXT,
    "toText" TEXT,
    "rowKind" "RowKind" NOT NULL,
    "unitNo" INTEGER NOT NULL,
    "rowSpan" INTEGER NOT NULL DEFAULT 1,
    "prefilledName" TEXT,
    "backupGroup" INTEGER,
    "primaryBhaktaId" INTEGER,
    "backupBhaktaId" INTEGER,
    "coveredById" INTEGER,
    "status" "RowStatus" NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "AllocationRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "satsangId" INTEGER,
    "actor" "Actor" NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "key" TEXT NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key","windowEnd")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccount_username_key" ON "AdminAccount"("username");

-- CreateIndex
CREATE INDEX "Bhakta_batchId_listOrder_idx" ON "Bhakta"("batchId", "listOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Bhakta_batchId_nameKey_key" ON "Bhakta"("batchId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySchedule_batchId_key" ON "WeeklySchedule"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRow_templateId_sheetOrder_key" ON "TemplateRow"("templateId", "sheetOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Satsang_batchId_seq_key" ON "Satsang"("batchId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Satsang_batchId_startsAt_key" ON "Satsang"("batchId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Response_satsangId_bhaktaId_key" ON "Response"("satsangId", "bhaktaId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationRow_satsangId_sheetOrder_key" ON "AllocationRow"("satsangId", "sheetOrder");

-- CreateIndex
CREATE INDEX "AuditLog_satsangId_at_idx" ON "AuditLog"("satsangId", "at");

-- AddForeignKey
ALTER TABLE "Bhakta" ADD CONSTRAINT "Bhakta_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_defaultTemplateId_fkey" FOREIGN KEY ("defaultTemplateId") REFERENCES "SlokamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRow" ADD CONSTRAINT "TemplateRow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlokamTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Satsang" ADD CONSTRAINT "Satsang_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Satsang" ADD CONSTRAINT "Satsang_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlokamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_satsangId_fkey" FOREIGN KEY ("satsangId") REFERENCES "Satsang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_bhaktaId_fkey" FOREIGN KEY ("bhaktaId") REFERENCES "Bhakta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectedAttempt" ADD CONSTRAINT "RejectedAttempt_satsangId_fkey" FOREIGN KEY ("satsangId") REFERENCES "Satsang"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRow" ADD CONSTRAINT "AllocationRow_satsangId_fkey" FOREIGN KEY ("satsangId") REFERENCES "Satsang"("id") ON DELETE CASCADE ON UPDATE CASCADE;
