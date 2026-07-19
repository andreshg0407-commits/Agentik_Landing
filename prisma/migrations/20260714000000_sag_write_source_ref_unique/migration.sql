-- ORDER-SAG-LIFECYCLE-01: Enforce sourceRef uniqueness per organization.
-- Prevents duplicate SAG write operations for the same order.
-- Partial index: only applies when sourceRef IS NOT NULL (other write types don't use it).

CREATE UNIQUE INDEX "SagWriteOperation_orgId_sourceRef_key"
  ON "SagWriteOperation" ("organizationId", "sourceRef")
  WHERE "sourceRef" IS NOT NULL;
