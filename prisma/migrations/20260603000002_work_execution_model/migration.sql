-- CreateTable: WorkExecution
-- Sprint: AGENTIK-WORK-EXECUTION-LIVE-01

CREATE TABLE "WorkExecution" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approvalId"     TEXT NOT NULL,
    "executorType"   TEXT NOT NULL,
    "trigger"        TEXT NOT NULL,
    "status"         TEXT NOT NULL,
    "success"        BOOLEAN,
    "message"        TEXT,
    "durationMs"     INTEGER,
    "payloadJson"    JSONB,
    "resultJson"     JSONB,
    "auditTrailJson" JSONB,
    "errorsJson"     JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "failedAt"       TIMESTAMP(3),

    CONSTRAINT "WorkExecution_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkExecution" ADD CONSTRAINT "WorkExecution_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkExecution" ADD CONSTRAINT "WorkExecution_approvalId_fkey"
    FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WorkExecution_organizationId_idx" ON "WorkExecution"("organizationId");
CREATE INDEX "WorkExecution_approvalId_idx"     ON "WorkExecution"("approvalId");
CREATE INDEX "WorkExecution_status_idx"         ON "WorkExecution"("status");
CREATE INDEX "WorkExecution_executorType_idx"   ON "WorkExecution"("executorType");
CREATE INDEX "WorkExecution_createdAt_idx"      ON "WorkExecution"("createdAt");
