-- AGENTIK-MULTI-MODULE-EXECUTORS-QA-01
-- Add indexes for module and actionType columns

CREATE INDEX IF NOT EXISTS "WorkExecution_module_idx" ON "WorkExecution"("module");
CREATE INDEX IF NOT EXISTS "WorkExecution_actionType_idx" ON "WorkExecution"("actionType");
