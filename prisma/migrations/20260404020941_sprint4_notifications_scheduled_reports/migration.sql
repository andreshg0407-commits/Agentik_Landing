-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACTION_ASSIGNED', 'ACTION_REASSIGNED', 'ACTION_DUE_TODAY', 'ACTION_OVERDUE', 'ACTION_COMPLETED', 'SCHEDULED_REPORT_READY', 'SCHEDULED_REPORT_FAILED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actionTaskId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionTaskId" TEXT,
    "createdBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'ONCE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "lastError" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientEmail_isRead_idx" ON "Notification"("organizationId", "recipientEmail", "isRead");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReport_actionTaskId_key" ON "ScheduledReport"("actionTaskId");

-- CreateIndex
CREATE INDEX "ScheduledReport_organizationId_isActive_nextRunAt_idx" ON "ScheduledReport"("organizationId", "isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledReport_organizationId_createdAt_idx" ON "ScheduledReport"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actionTaskId_fkey" FOREIGN KEY ("actionTaskId") REFERENCES "ActionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_actionTaskId_fkey" FOREIGN KEY ("actionTaskId") REFERENCES "ActionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
