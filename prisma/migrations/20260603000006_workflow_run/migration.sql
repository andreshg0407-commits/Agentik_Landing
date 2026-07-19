-- AGENTIK-WORKFLOW-CHAINING-01
-- WorkflowRun model: live instances of executing workflow chains

CREATE TABLE IF NOT EXISTS "WorkflowRun" (
  "id"                 TEXT      NOT NULL PRIMARY KEY,
  "organizationId"     TEXT      NOT NULL,
  "chainId"            TEXT      NOT NULL,
  "chainName"          TEXT      NOT NULL,
  "status"             TEXT      NOT NULL,
  "triggerExecutionId" TEXT      NOT NULL,
  "triggerApprovalId"  TEXT,
  "currentStepId"      TEXT,
  "stepsJson"          JSONB,
  "auditTrailJson"     JSONB,
  "metadataJson"       JSONB,
  "createdAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt"        TIMESTAMP,
  "failedAt"           TIMESTAMP,
  CONSTRAINT "WorkflowRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkflowRun_organizationId_idx"     ON "WorkflowRun"("organizationId");
CREATE INDEX IF NOT EXISTS "WorkflowRun_chainId_idx"            ON "WorkflowRun"("chainId");
CREATE INDEX IF NOT EXISTS "WorkflowRun_status_idx"             ON "WorkflowRun"("status");
CREATE INDEX IF NOT EXISTS "WorkflowRun_triggerExecutionId_idx" ON "WorkflowRun"("triggerExecutionId");
CREATE INDEX IF NOT EXISTS "WorkflowRun_createdAt_idx"          ON "WorkflowRun"("createdAt");
