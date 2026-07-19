-- AGENTIK-AI-BILLING-FOUNDATION-01
-- AiUsage and AiCreditLedger tables

CREATE TABLE "AiUsage" (
  "id"                    TEXT NOT NULL,
  "organizationId"        TEXT NOT NULL,
  "orgSlug"               TEXT NOT NULL,
  "moduleSlug"            TEXT,
  "agentId"               TEXT,
  "agentDisplayName"      TEXT,
  "featureKey"            TEXT NOT NULL,
  "workflowRunId"         TEXT,
  "workExecutionId"       TEXT,
  "autonomousOperationId" TEXT,
  "copilotSessionId"      TEXT,
  "provider"              TEXT,
  "model"                 TEXT,
  "usageKind"             TEXT NOT NULL,
  "inputTokens"           INTEGER NOT NULL DEFAULT 0,
  "outputTokens"          INTEGER NOT NULL DEFAULT 0,
  "totalTokens"           INTEGER NOT NULL DEFAULT 0,
  "imageUnits"            INTEGER,
  "videoSeconds"          INTEGER,
  "audioSeconds"          INTEGER,
  "requestCount"          INTEGER NOT NULL DEFAULT 1,
  "costUsd"               DECIMAL(12, 6),
  "costMode"              TEXT NOT NULL,
  "creditsUsed"           INTEGER NOT NULL DEFAULT 0,
  "status"                TEXT NOT NULL,
  "metadataJson"          JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_organizationId_idx" ON "AiUsage"("organizationId");
CREATE INDEX "AiUsage_orgSlug_idx"        ON "AiUsage"("orgSlug");
CREATE INDEX "AiUsage_moduleSlug_idx"     ON "AiUsage"("moduleSlug");
CREATE INDEX "AiUsage_agentId_idx"        ON "AiUsage"("agentId");
CREATE INDEX "AiUsage_featureKey_idx"     ON "AiUsage"("featureKey");
CREATE INDEX "AiUsage_usageKind_idx"      ON "AiUsage"("usageKind");
CREATE INDEX "AiUsage_createdAt_idx"      ON "AiUsage"("createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiCreditLedger" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "orgSlug"          TEXT NOT NULL,
  "type"             TEXT NOT NULL,
  "credits"          INTEGER NOT NULL,
  "balanceAfter"     INTEGER,
  "relatedUsageId"   TEXT,
  "relatedInvoiceId" TEXT,
  "reason"           TEXT,
  "createdBy"        TEXT,
  "metadataJson"     JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCreditLedger_organizationId_idx" ON "AiCreditLedger"("organizationId");
CREATE INDEX "AiCreditLedger_orgSlug_idx"         ON "AiCreditLedger"("orgSlug");
CREATE INDEX "AiCreditLedger_type_idx"            ON "AiCreditLedger"("type");
CREATE INDEX "AiCreditLedger_createdAt_idx"       ON "AiCreditLedger"("createdAt");

ALTER TABLE "AiCreditLedger" ADD CONSTRAINT "AiCreditLedger_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
