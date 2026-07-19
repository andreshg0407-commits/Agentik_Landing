-- AGENTIK-MULTI-MODULE-EXECUTORS-01
-- Add module and actionType columns to WorkExecution for specialized executor routing

ALTER TABLE "WorkExecution" ADD COLUMN IF NOT EXISTS "module" TEXT;
ALTER TABLE "WorkExecution" ADD COLUMN IF NOT EXISTS "actionType" TEXT;
