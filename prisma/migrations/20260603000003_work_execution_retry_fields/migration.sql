-- AddColumns: WorkExecution retry fields
-- Sprint: AGENTIK-WORK-EXECUTION-RETRY-01

ALTER TABLE "WorkExecution" ADD COLUMN "retryOfExecutionId" TEXT;
ALTER TABLE "WorkExecution" ADD COLUMN "retryAttempt"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkExecution" ADD COLUMN "maxRetryAttempts"   INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WorkExecution" ADD COLUMN "retryReason"        TEXT;
ALTER TABLE "WorkExecution" ADD COLUMN "retriedByJson"      JSONB;
ALTER TABLE "WorkExecution" ADD COLUMN "retriedAt"          TIMESTAMP(3);

CREATE INDEX "WorkExecution_retryOfExecutionId_idx" ON "WorkExecution"("retryOfExecutionId");
