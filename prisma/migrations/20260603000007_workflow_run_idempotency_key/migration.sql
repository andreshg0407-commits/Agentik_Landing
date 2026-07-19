-- AGENTIK-WORKFLOW-HARDENING-01
-- Add idempotencyKey to WorkflowRun for concurrency-safe deduplication.
-- Uses a partial unique index (WHERE NOT NULL) so multiple NULLs are allowed
-- while enforcing uniqueness among non-null keys.

ALTER TABLE "WorkflowRun"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Partial unique index: only enforces uniqueness when value is present.
-- Concurrent inserts with the same key will get a unique constraint violation
-- (Prisma P2002), which the repository handles by re-reading and returning
-- the existing record.
CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowRun_idempotencyKey_key"
  ON "WorkflowRun"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
