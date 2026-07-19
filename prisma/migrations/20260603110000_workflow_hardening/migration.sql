-- AGENTIK-WORKFLOW-HARDENING-01
-- Phase 2: Add triggerExecutionId index for fast anti-duplicate lookups.
-- The partial unique index on idempotencyKey was applied in migration
-- 20260603000007_workflow_run_idempotency_key.

-- Fast lookup by trigger execution (deduplication guard on chain start).
CREATE INDEX IF NOT EXISTS "WorkflowRun_triggerExecutionId_idx"
  ON "WorkflowRun"("triggerExecutionId");
