-- CreateEnum
CREATE TYPE "CollectionAppliedStatus" AS ENUM ('AVAILABLE', 'PARTIALLY_APPLIED', 'APPLIED', 'MANUAL_OVERRIDE');

-- AlterTable
ALTER TABLE "CollectionRecord"
  ADD COLUMN "appliedStatus"   "CollectionAppliedStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "paymentRecordId" TEXT,
  ADD COLUMN "appliedAt"       TIMESTAMP(3),
  ADD COLUMN "appliedBy"       TEXT;

-- Index for querying unApplied records quickly
CREATE INDEX "CollectionRecord_organizationId_appliedStatus_idx"
  ON "CollectionRecord"("organizationId", "appliedStatus");
