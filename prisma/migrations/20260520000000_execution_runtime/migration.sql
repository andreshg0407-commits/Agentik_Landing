-- MS-13 Execution Runtime
-- Extends CommerceJob for internal (non-Shopify) jobs and idempotency.
-- Adds DestinationHealthSnapshot and ExecutionRetryAttempt tables.

-- Make connectionId nullable (internal jobs have no integration connection)
ALTER TABLE "CommerceJob" ALTER COLUMN "connectionId" DROP NOT NULL;

-- Execution runtime fields
ALTER TABLE "CommerceJob" ADD COLUMN IF NOT EXISTS "catalogId"      TEXT;
ALTER TABLE "CommerceJob" ADD COLUMN IF NOT EXISTS "maxRetries"     INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CommerceJob" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "CommerceJob_idempotencyKey_key"
  ON "CommerceJob"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- Additional query index for jobType + status
CREATE INDEX IF NOT EXISTS "CommerceJob_orgId_jobType_status_idx"
  ON "CommerceJob"("organizationId", "jobType", "status");

CREATE INDEX IF NOT EXISTS "CommerceJob_idempotencyKey_idx"
  ON "CommerceJob"("idempotencyKey");

-- Destination health snapshots
CREATE TABLE IF NOT EXISTS "DestinationHealthSnapshot" (
  "id"              TEXT        NOT NULL,
  "organizationId"  TEXT        NOT NULL,
  "destination"     TEXT        NOT NULL,
  "healthLevel"     TEXT        NOT NULL DEFAULT 'unknown',
  "failedJobCount"  INTEGER     NOT NULL DEFAULT 0,
  "pendingJobCount" INTEGER     NOT NULL DEFAULT 0,
  "staleCount"      INTEGER     NOT NULL DEFAULT 0,
  "webhookBacklog"  INTEGER     NOT NULL DEFAULT 0,
  "isAuthValid"     BOOLEAN     NOT NULL DEFAULT true,
  "detail"          TEXT,
  "snapshotAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DestinationHealthSnapshot_orgId_dest_idx"
  ON "DestinationHealthSnapshot"("organizationId", "destination", "snapshotAt" DESC);

CREATE INDEX IF NOT EXISTS "DestinationHealthSnapshot_orgId_at_idx"
  ON "DestinationHealthSnapshot"("organizationId", "snapshotAt" DESC);

ALTER TABLE "DestinationHealthSnapshot"
  ADD CONSTRAINT "DestinationHealthSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- Execution retry audit trail
CREATE TABLE IF NOT EXISTS "ExecutionRetryAttempt" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "jobId"          TEXT        NOT NULL,
  "attemptNumber"  INTEGER     NOT NULL,
  "scheduledAt"    TIMESTAMP(3) NOT NULL,
  "executedAt"     TIMESTAMP(3),
  "outcome"        TEXT,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutionRetryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExecutionRetryAttempt_jobId_idx"
  ON "ExecutionRetryAttempt"("jobId");

CREATE INDEX IF NOT EXISTS "ExecutionRetryAttempt_orgId_createdAt_idx"
  ON "ExecutionRetryAttempt"("organizationId", "createdAt" DESC);

ALTER TABLE "ExecutionRetryAttempt"
  ADD CONSTRAINT "ExecutionRetryAttempt_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "CommerceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "ExecutionRetryAttempt"
  ADD CONSTRAINT "ExecutionRetryAttempt_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
