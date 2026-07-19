-- AGENTIK-IDEMPOTENCY-01
-- Add idempotencyKey to Task and Approval models.
-- Uses partial unique indexes (WHERE IS NOT NULL) so multiple NULL rows are allowed.

-- Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_idempotencyKey_key"
  ON "Task"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- Approval
ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Approval_idempotencyKey_key"
  ON "Approval"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
