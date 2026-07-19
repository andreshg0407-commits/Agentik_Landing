-- CreateTable
CREATE TABLE "OperatorReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalRef" TEXT,
    "executionJobId" TEXT,
    "planId" TEXT,
    "stageId" TEXT,
    "resultPayload" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "receiptId" TEXT,
    "planId" TEXT,
    "stageId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDurationMs" INTEGER NOT NULL DEFAULT 0,
    "totalDispatched" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorReceipt_organizationId_channel_status_idx" ON "OperatorReceipt"("organizationId", "channel", "status");

-- CreateIndex
CREATE INDEX "OperatorReceipt_organizationId_planId_idx" ON "OperatorReceipt"("organizationId", "planId");

-- CreateIndex
CREATE INDEX "OperatorReceipt_organizationId_dispatchedAt_idx" ON "OperatorReceipt"("organizationId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_organizationId_channel_idx" ON "OperatorAuditEvent"("organizationId", "channel");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_organizationId_occurredAt_idx" ON "OperatorAuditEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "OperatorHealthSnapshot_organizationId_channel_createdAt_idx" ON "OperatorHealthSnapshot"("organizationId", "channel", "createdAt");

-- AddForeignKey
ALTER TABLE "OperatorReceipt" ADD CONSTRAINT "OperatorReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAuditEvent" ADD CONSTRAINT "OperatorAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorHealthSnapshot" ADD CONSTRAINT "OperatorHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
