-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('IMAGE_UPLOAD', 'ECOMMERCE_LISTING');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "source" "ScanSource" NOT NULL DEFAULT 'IMAGE_UPLOAD',
ADD COLUMN     "sourceText" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'PHOTO',
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_scanId_idx" ON "attachments"("scanId");

-- CreateIndex
CREATE INDEX "scans_source_idx" ON "scans"("source");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
