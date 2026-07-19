/*
  Warnings:

  - You are about to alter the column `costUsd` on the `AgentLog` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,6)`.
  - You are about to alter the column `priceUsd` on the `Plan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `unitCostUsd` on the `UsageEvent` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,6)`.
  - You are about to alter the column `totalCostUsd` on the `UsageEvent` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,6)`.
  - A unique constraint covering the columns `[organizationId,key]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - Made the column `key` on table `Project` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- DropIndex
DROP INDEX "Agent_activeVersionId_key";

-- DropIndex
DROP INDEX "Project_organizationId_name_key";

-- AlterTable
ALTER TABLE "AgentLog" ALTER COLUMN "costUsd" SET DATA TYPE DECIMAL(14,6);

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "integrationId" TEXT;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "metaJson" JSONB,
ADD COLUMN     "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "permissionsJson" JSONB,
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED';

-- AlterTable
ALTER TABLE "Plan" ALTER COLUMN "priceUsd" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "key" SET NOT NULL;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "traceId" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'generic';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerCustomerId" TEXT,
ADD COLUMN     "providerSubscriptionId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UsageEvent" ALTER COLUMN "unitCostUsd" SET DATA TYPE DECIMAL(12,6),
ALTER COLUMN "totalCostUsd" SET DATA TYPE DECIMAL(14,6);

-- CreateIndex
CREATE INDEX "AuditLog_traceId_idx" ON "AuditLog"("traceId");

-- CreateIndex
CREATE INDEX "Channel_integrationId_idx" ON "Channel"("integrationId");

-- CreateIndex
CREATE INDEX "Integration_organizationId_status_idx" ON "Integration"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_key_key" ON "Project"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Run_organizationId_type_idx" ON "Run"("organizationId", "type");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
