-- DropForeignKey
ALTER TABLE "CommerceJob" DROP CONSTRAINT "CommerceJob_connectionId_fkey";

-- AlterTable
ALTER TABLE "CommerceJob" ADD COLUMN     "catalogId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ALTER COLUMN "connectionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DistributionPipeline" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DistributionSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DistributionVariant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "DestinationHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "healthLevel" TEXT NOT NULL DEFAULT 'unknown',
    "failedJobCount" INTEGER NOT NULL DEFAULT 0,
    "pendingJobCount" INTEGER NOT NULL DEFAULT 0,
    "staleCount" INTEGER NOT NULL DEFAULT 0,
    "webhookBacklog" INTEGER NOT NULL DEFAULT 0,
    "isAuthValid" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRetryAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionRetryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "productId" TEXT,
    "catalogId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "destinationSummary" JSONB NOT NULL DEFAULT '{}',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingPlanStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "executionJobId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingPlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT,
    "stepId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishingHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DestinationHealthSnapshot_organizationId_destination_snapsh_idx" ON "DestinationHealthSnapshot"("organizationId", "destination", "snapshotAt" DESC);

-- CreateIndex
CREATE INDEX "DestinationHealthSnapshot_organizationId_snapshotAt_idx" ON "DestinationHealthSnapshot"("organizationId", "snapshotAt" DESC);

-- CreateIndex
CREATE INDEX "ExecutionRetryAttempt_jobId_idx" ON "ExecutionRetryAttempt"("jobId");

-- CreateIndex
CREATE INDEX "ExecutionRetryAttempt_organizationId_createdAt_idx" ON "ExecutionRetryAttempt"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PublishingPlan_organizationId_status_idx" ON "PublishingPlan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PublishingPlan_organizationId_scheduledAt_idx" ON "PublishingPlan"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PublishingPlan_organizationId_priority_idx" ON "PublishingPlan"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "PublishingPlanStep_organizationId_planId_idx" ON "PublishingPlanStep"("organizationId", "planId");

-- CreateIndex
CREATE INDEX "PublishingPlanStep_organizationId_destination_status_idx" ON "PublishingPlanStep"("organizationId", "destination", "status");

-- CreateIndex
CREATE INDEX "PublishingPlanStep_organizationId_scheduledAt_idx" ON "PublishingPlanStep"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PublishingEvent_organizationId_eventType_idx" ON "PublishingEvent"("organizationId", "eventType");

-- CreateIndex
CREATE INDEX "PublishingEvent_organizationId_planId_idx" ON "PublishingEvent"("organizationId", "planId");

-- CreateIndex
CREATE INDEX "PublishingEvent_organizationId_occurredAt_idx" ON "PublishingEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "PublishingHealthSnapshot_organizationId_createdAt_idx" ON "PublishingHealthSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceJob_idempotencyKey_key" ON "CommerceJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommerceJob_organizationId_jobType_status_idx" ON "CommerceJob"("organizationId", "jobType", "status");

-- CreateIndex
CREATE INDEX "CommerceJob_idempotencyKey_idx" ON "CommerceJob"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "CommerceJob" ADD CONSTRAINT "CommerceJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationHealthSnapshot" ADD CONSTRAINT "DestinationHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRetryAttempt" ADD CONSTRAINT "ExecutionRetryAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CommerceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRetryAttempt" ADD CONSTRAINT "ExecutionRetryAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingPlan" ADD CONSTRAINT "PublishingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingPlanStep" ADD CONSTRAINT "PublishingPlanStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingPlanStep" ADD CONSTRAINT "PublishingPlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PublishingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingEvent" ADD CONSTRAINT "PublishingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingEvent" ADD CONSTRAINT "PublishingEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PublishingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingHealthSnapshot" ADD CONSTRAINT "PublishingHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DistributionPipeline_orgId_sched_idx" RENAME TO "DistributionPipeline_organizationId_scheduledAt_idx";

-- RenameIndex
ALTER INDEX "DistributionPipeline_orgId_status_idx" RENAME TO "DistributionPipeline_organizationId_status_idx";

-- RenameIndex
ALTER INDEX "DistributionPipeline_orgId_type_idx" RENAME TO "DistributionPipeline_organizationId_pipelineType_idx";

-- RenameIndex
ALTER INDEX "DistributionSchedule_orgId_channel_status_idx" RENAME TO "DistributionSchedule_organizationId_channel_status_idx";

-- RenameIndex
ALTER INDEX "DistributionSchedule_orgId_scheduledAt_idx" RENAME TO "DistributionSchedule_organizationId_scheduledAt_idx";

-- RenameIndex
ALTER INDEX "DistributionVariant_orgId_channel_purpose_idx" RENAME TO "DistributionVariant_organizationId_channel_purpose_idx";

-- RenameIndex
ALTER INDEX "DistributionVariant_orgId_isReady_idx" RENAME TO "DistributionVariant_organizationId_isReady_idx";

-- RenameIndex
ALTER INDEX "DistributionVariant_orgId_productId_idx" RENAME TO "DistributionVariant_organizationId_productId_idx";

