-- PRODUCTION-EVENT-MODEL-REVIEW-01
-- Adjust ProductionEvent header for multi-line documents.
-- referenceCode and description become nullable (multi-line documents
-- like CN/ET/T2/Y1 span many references — no single header reference).
-- Add lineCount for quick consumer hints.

-- AlterTable: make referenceCode nullable
ALTER TABLE "ProductionEvent" ALTER COLUMN "referenceCode" DROP NOT NULL;

-- AlterTable: make description nullable, remove default
ALTER TABLE "ProductionEvent" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "ProductionEvent" ALTER COLUMN "description" DROP DEFAULT;

-- AlterTable: add lineCount
ALTER TABLE "ProductionEvent" ADD COLUMN "lineCount" INTEGER NOT NULL DEFAULT 0;
