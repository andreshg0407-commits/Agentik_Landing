-- AGENTIK-RECON-SESSIONS-01: Reconciliation Sessions Foundation
-- Additive-only migration. No existing tables or columns are modified.
-- Three new models: ReconciliationSession, ReconciliationRun, ReconciliationEvent.
-- One new enum: ReconSessionStatus.

-- ── Enum ──────────────────────────────────────────────────────────────────────

CREATE TYPE "ReconSessionStatus" AS ENUM (
    'DRAFT',
    'READY',
    'RUNNING',
    'NEEDS_REVIEW',
    'PARTIALLY_RECONCILED',
    'RECONCILED',
    'CLOSED',
    'FAILED',
    'CANCELLED'
);

-- ── ReconciliationSession ─────────────────────────────────────────────────────

CREATE TABLE "ReconciliationSession" (
    "id"             TEXT                  NOT NULL,
    "organizationId" TEXT                  NOT NULL,
    "sessionCode"    TEXT                  NOT NULL,
    "title"          TEXT                  NOT NULL,
    "sourceAType"    TEXT                  NOT NULL,
    "sourceALabel"   TEXT                  NOT NULL,
    "sourceBType"    TEXT                  NOT NULL,
    "sourceBLabel"   TEXT                  NOT NULL,
    "period"         TEXT,
    "status"         "ReconSessionStatus"  NOT NULL DEFAULT 'DRAFT',
    "createdBy"      TEXT,
    "assignedTo"     TEXT,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "closedAt"       TIMESTAMP(3),
    "summaryJson"    JSONB,
    "metadataJson"   JSONB,
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "ReconciliationSession_pkey" PRIMARY KEY ("id")
);

-- Unique: one session code per org
CREATE UNIQUE INDEX "ReconciliationSession_organizationId_sessionCode_key"
    ON "ReconciliationSession"("organizationId", "sessionCode");

-- Query indices
CREATE INDEX "ReconciliationSession_organizationId_status_idx"
    ON "ReconciliationSession"("organizationId", "status");

CREATE INDEX "ReconciliationSession_organizationId_period_idx"
    ON "ReconciliationSession"("organizationId", "period");

CREATE INDEX "ReconciliationSession_organizationId_createdAt_idx"
    ON "ReconciliationSession"("organizationId", "createdAt");

-- FK to Organization
ALTER TABLE "ReconciliationSession"
    ADD CONSTRAINT "ReconciliationSession_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ReconciliationRun ─────────────────────────────────────────────────────────

CREATE TABLE "ReconciliationRun" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "sessionId"      TEXT         NOT NULL,
    "runNumber"      INTEGER      NOT NULL DEFAULT 1,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "sourceAKey"     TEXT,
    "sourceBKey"     TEXT,
    "period"         TEXT,
    "summaryJson"    JSONB,
    "errorJson"      JSONB,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationRun_sessionId_idx"
    ON "ReconciliationRun"("sessionId");

CREATE INDEX "ReconciliationRun_organizationId_status_idx"
    ON "ReconciliationRun"("organizationId", "status");

CREATE INDEX "ReconciliationRun_organizationId_createdAt_idx"
    ON "ReconciliationRun"("organizationId", "createdAt");

-- FK to Organization
ALTER TABLE "ReconciliationRun"
    ADD CONSTRAINT "ReconciliationRun_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to ReconciliationSession
ALTER TABLE "ReconciliationRun"
    ADD CONSTRAINT "ReconciliationRun_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "ReconciliationSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ReconciliationEvent ───────────────────────────────────────────────────────

CREATE TABLE "ReconciliationEvent" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "sessionId"      TEXT         NOT NULL,
    "actorType"      TEXT         NOT NULL DEFAULT 'system',
    "actorId"        TEXT,
    "eventType"      TEXT         NOT NULL,
    "message"        TEXT         NOT NULL,
    "metadataJson"   JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationEvent_sessionId_idx"
    ON "ReconciliationEvent"("sessionId");

CREATE INDEX "ReconciliationEvent_organizationId_eventType_idx"
    ON "ReconciliationEvent"("organizationId", "eventType");

CREATE INDEX "ReconciliationEvent_organizationId_createdAt_idx"
    ON "ReconciliationEvent"("organizationId", "createdAt");

-- FK to Organization
ALTER TABLE "ReconciliationEvent"
    ADD CONSTRAINT "ReconciliationEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to ReconciliationSession
ALTER TABLE "ReconciliationEvent"
    ADD CONSTRAINT "ReconciliationEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "ReconciliationSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
