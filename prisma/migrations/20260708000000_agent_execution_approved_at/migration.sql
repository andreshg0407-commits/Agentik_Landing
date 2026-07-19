-- AGENTIK-APPROVAL-WORKFLOW-01 — AgentExecution: approvedAt
-- Adds the approvedAt timestamp to AgentExecution to record when
-- an execution was formally approved by a human operator.
-- Set atomically alongside approvedBy and status = 'approved'.

ALTER TABLE "AgentExecution"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AgentExecution_tenantId_approvedAt_idx"
  ON "AgentExecution"("tenantId", "approvedAt");
