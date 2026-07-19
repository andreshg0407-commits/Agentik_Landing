-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260425000000_copilot_signals
--
-- PURPOSE: Backfill migration — creates Agentik Financial Copilot tables.
--
-- WHY THIS EXISTS:
--   CopilotSignalRecord and CopilotActionLog were deployed via `prisma db push`
--   without migration files.
--
-- IDEMPOTENCY:
--   CREATE TABLE uses IF NOT EXISTS guards.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CopilotSignalRecord ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CopilotSignalRecord" (
    "id"              TEXT         NOT NULL,
    "organizationId"  TEXT         NOT NULL,
    "ruleId"          TEXT         NOT NULL,
    "severity"        TEXT         NOT NULL,
    "lifecycle"       TEXT         NOT NULL DEFAULT 'detected',
    "targetModule"    TEXT         NOT NULL,
    "titulo"          TEXT         NOT NULL,
    "confidenceScore" INTEGER      NOT NULL,
    "confidenceLevel" TEXT         NOT NULL,
    "evidenceJson"    JSONB,
    "explicacion"     TEXT,
    "detectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3),

    CONSTRAINT "CopilotSignalRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CopilotSignalRecord_organizationId_ruleId_idx"
    ON "CopilotSignalRecord"("organizationId", "ruleId");

CREATE INDEX IF NOT EXISTS "CopilotSignalRecord_organizationId_lifecycle_idx"
    ON "CopilotSignalRecord"("organizationId", "lifecycle");

CREATE INDEX IF NOT EXISTS "CopilotSignalRecord_organizationId_targetModule_idx"
    ON "CopilotSignalRecord"("organizationId", "targetModule");

CREATE INDEX IF NOT EXISTS "CopilotSignalRecord_organizationId_detectedAt_idx"
    ON "CopilotSignalRecord"("organizationId", "detectedAt");

ALTER TABLE "CopilotSignalRecord"
    ADD CONSTRAINT "CopilotSignalRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── CopilotActionLog ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CopilotActionLog" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "signalId"       TEXT,
    "ruleId"         TEXT         NOT NULL,
    "module"         TEXT         NOT NULL,
    "action"         TEXT         NOT NULL,
    "actorId"        TEXT         NOT NULL,
    "outcome"        TEXT,
    "entitySnapshot" JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CopilotActionLog_organizationId_ruleId_idx"
    ON "CopilotActionLog"("organizationId", "ruleId");

CREATE INDEX IF NOT EXISTS "CopilotActionLog_organizationId_actorId_idx"
    ON "CopilotActionLog"("organizationId", "actorId");

CREATE INDEX IF NOT EXISTS "CopilotActionLog_signalId_idx"
    ON "CopilotActionLog"("signalId");

ALTER TABLE "CopilotActionLog"
    ADD CONSTRAINT "CopilotActionLog_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "CopilotActionLog"
    ADD CONSTRAINT "CopilotActionLog_signalId_fkey"
    FOREIGN KEY ("signalId")
    REFERENCES "CopilotSignalRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
