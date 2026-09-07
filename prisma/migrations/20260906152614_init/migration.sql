-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('critical', 'moderate', 'minor');

-- CreateEnum
CREATE TYPE "DeclarationType" AS ENUM ('MANUFACTURER_NAME_ADDRESS', 'NET_QUANTITY', 'MRP', 'MFG_DATE', 'CONSUMER_CARE', 'COUNTRY_OF_ORIGIN', 'UNIT_SALE_PRICE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OFFICER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "designation" TEXT,
    "jurisdiction" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "productName" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "complianceScore" INTEGER,
    "reportUrl" TEXT,
    "reportKey" TEXT,
    "officerNote" TEXT,
    "rawExtraction" JSONB,
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declarations" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "type" "DeclarationType" NOT NULL,
    "valueFound" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boundingBox" JSONB,
    "fontSizeEst" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "suggestedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "scans_userId_idx" ON "scans"("userId");

-- CreateIndex
CREATE INDEX "scans_status_idx" ON "scans"("status");

-- CreateIndex
CREATE INDEX "scans_createdAt_idx" ON "scans"("createdAt");

-- CreateIndex
CREATE INDEX "scans_complianceScore_idx" ON "scans"("complianceScore");

-- CreateIndex
CREATE INDEX "declarations_scanId_idx" ON "declarations"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_scanId_type_key" ON "declarations"("scanId", "type");

-- CreateIndex
CREATE INDEX "violations_scanId_idx" ON "violations"("scanId");

-- CreateIndex
CREATE INDEX "violations_ruleCode_idx" ON "violations"("ruleCode");

-- CreateIndex
CREATE INDEX "violations_severity_idx" ON "violations"("severity");

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
