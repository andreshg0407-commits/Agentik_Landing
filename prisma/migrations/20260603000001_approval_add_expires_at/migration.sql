-- AlterTable: Add expiresAt to Approval model
ALTER TABLE "Approval" ADD COLUMN "expiresAt" TIMESTAMP(3);
