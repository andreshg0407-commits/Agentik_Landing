-- AGENTIK-AGENT-RUNTIME-DURABILITY-01
-- Persistent execution lifecycle for the agent runtime.
-- Enables session/attempt/lease recovery after process restart.

CREATE TABLE IF NOT EXISTS "RuntimeExecutionSession" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "actionId"       TEXT        NOT NULL,
  "toolId"         TEXT        NOT NULL,
  "agentId"        TEXT        NOT NULL,
  "moduleKey"      TEXT,
  "status"         TEXT        NOT NULL,
  "attempt"        INTEGER     NOT NULL DEFAULT 0,
  "maxAttempts"    INTEGER     NOT NULL DEFAULT 3,
  "leaseOwner"     TEXT,
  "leaseExpiresAt" TIMESTAMPTZ,
  "startedAt"      TIMESTAMPTZ,
  "completedAt"    TIMESTAMPTZ,
  "failedAt"       TIMESTAMPTZ,
  "canceledAt"     TIMESTAMPTZ,
  "timedOutAt"     TIMESTAMPTZ,
  "durationMs"     INTEGER,
  "idempotencyKey" TEXT,
  "correlationId"  TEXT,
  "causationId"    TEXT,
  "payload"        JSONB,
  "result"         JSONB,
  "error"          JSONB,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RuntimeExecutionSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RES_org_status_idx"   ON "RuntimeExecutionSession"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "RES_actionId_idx"     ON "RuntimeExecutionSession"("actionId");
CREATE INDEX IF NOT EXISTS "RES_toolId_idx"       ON "RuntimeExecutionSession"("toolId");
CREATE INDEX IF NOT EXISTS "RES_agentId_idx"      ON "RuntimeExecutionSession"("agentId");
CREATE INDEX IF NOT EXISTS "RES_idempKey_idx"     ON "RuntimeExecutionSession"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RES_correlId_idx"     ON "RuntimeExecutionSession"("correlationId");
CREATE INDEX IF NOT EXISTS "RES_leaseExp_idx"     ON "RuntimeExecutionSession"("leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "RES_org_createdAt_idx" ON "RuntimeExecutionSession"("organizationId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RuntimeExecutionAttempt" (
  "id"              TEXT        NOT NULL,
  "sessionId"       TEXT        NOT NULL,
  "attemptNumber"   INTEGER     NOT NULL,
  "status"          TEXT        NOT NULL,
  "parentAttemptId" TEXT,
  "retryReason"     TEXT,
  "startedAt"       TIMESTAMPTZ,
  "completedAt"     TIMESTAMPTZ,
  "durationMs"      INTEGER,
  "error"           JSONB,
  "retryable"       BOOLEAN     NOT NULL DEFAULT false,
  "nextRetryAt"     TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RuntimeExecutionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuntimeExecutionAttempt_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "RuntimeExecutionSession"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "REA_sessionId_idx"  ON "RuntimeExecutionAttempt"("sessionId");
CREATE INDEX IF NOT EXISTS "REA_status_idx"     ON "RuntimeExecutionAttempt"("status");
CREATE INDEX IF NOT EXISTS "REA_nextRetry_idx"  ON "RuntimeExecutionAttempt"("nextRetryAt");

CREATE TABLE IF NOT EXISTS "RuntimeExecutionLease" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionId"   TEXT        NOT NULL,
  "ownerId"     TEXT        NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'active',
  "acquiredAt"  TIMESTAMPTZ NOT NULL,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "releasedAt"  TIMESTAMPTZ,
  "heartbeatAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RuntimeExecutionLease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuntimeExecutionLease_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "RuntimeExecutionSession"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "REL_sessionId_idx" ON "RuntimeExecutionLease"("sessionId");
CREATE INDEX IF NOT EXISTS "REL_ownerId_idx"   ON "RuntimeExecutionLease"("ownerId");
CREATE INDEX IF NOT EXISTS "REL_expiresAt_idx" ON "RuntimeExecutionLease"("expiresAt");
CREATE INDEX IF NOT EXISTS "REL_status_idx"    ON "RuntimeExecutionLease"("status");

-- Back-reference is implicit via FK. No extra migration needed for Organization relation
-- since Organization.id is already the PK referenced by organizationId.
