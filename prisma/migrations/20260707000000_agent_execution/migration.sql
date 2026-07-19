-- AGENTIK-EXECUTION-REGISTRY-01 — AgentExecution
-- Cross-module execution registry for all Agentik-initiated actions on
-- external systems. Stores audit references and status only — no secrets.

CREATE TABLE IF NOT EXISTS "AgentExecution" (
    "id"                    TEXT NOT NULL,
    "tenantId"              TEXT NOT NULL,
    "module"                TEXT NOT NULL,
    "provider"              TEXT,
    "intent"                TEXT,
    "operation"             TEXT NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "createdBy"             TEXT NOT NULL,
    "approvedBy"            TEXT,
    "externalReferenceIds"  JSONB,
    "summary"               TEXT,
    "metadataJson"          JSONB,
    "errorCode"             TEXT,
    "errorMessage"          TEXT,
    "startedAt"             TIMESTAMP(3),
    "completedAt"           TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_idx"
    ON "AgentExecution"("tenantId");

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_status_idx"
    ON "AgentExecution"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_module_idx"
    ON "AgentExecution"("tenantId", "module");

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_provider_idx"
    ON "AgentExecution"("tenantId", "provider");

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_createdAt_idx"
    ON "AgentExecution"("tenantId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AgentExecution_status_idx"
    ON "AgentExecution"("status");

CREATE INDEX IF NOT EXISTS "AgentExecution_module_provider_idx"
    ON "AgentExecution"("module", "provider");

CREATE INDEX IF NOT EXISTS "AgentExecution_createdAt_idx"
    ON "AgentExecution"("createdAt");
