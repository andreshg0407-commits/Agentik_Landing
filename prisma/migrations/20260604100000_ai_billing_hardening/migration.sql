-- AGENTIK-AI-BILLING-HARDENING-01
-- Add correlationId to AiCreditLedger (idempotency key)
-- Add AiCreditBalance table (stored balance for atomic ops)

-- Step 1: Add correlationId to AiCreditLedger
-- NULL = no idempotency key (allowed for legacy entries)
-- Unique index allows multiple NULLs (standard PostgreSQL behavior)
ALTER TABLE "AiCreditLedger" ADD COLUMN "correlationId" TEXT;
CREATE UNIQUE INDEX "AiCreditLedger_correlationId_key" ON "AiCreditLedger"("correlationId")
  WHERE "correlationId" IS NOT NULL;

-- Step 2: Create AiCreditBalance table
-- One row per org — the canonical stored balance.
-- Maintained atomically inside Prisma $transaction.
CREATE TABLE "AiCreditBalance" (
  "id"             TEXT NOT NULL,
  "orgSlug"        TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "balance"        INTEGER NOT NULL DEFAULT 0,
  "totalGranted"   INTEGER NOT NULL DEFAULT 0,
  "totalDebited"   INTEGER NOT NULL DEFAULT 0,
  "totalRefunded"  INTEGER NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCreditBalance_orgSlug_key"        ON "AiCreditBalance"("orgSlug");
CREATE UNIQUE INDEX "AiCreditBalance_organizationId_key" ON "AiCreditBalance"("organizationId");
CREATE INDEX        "AiCreditBalance_updatedAt_idx"      ON "AiCreditBalance"("updatedAt");

ALTER TABLE "AiCreditBalance" ADD CONSTRAINT "AiCreditBalance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Backfill AiCreditBalance from existing ledger entries
-- Computes balance per org from existing ledger rows.
INSERT INTO "AiCreditBalance" ("id", "orgSlug", "organizationId", "balance", "totalGranted", "totalDebited", "totalRefunded", "updatedAt")
SELECT
  gen_random_uuid()::text AS id,
  l."orgSlug",
  l."organizationId",
  SUM(l."credits")                                                                  AS balance,
  COALESCE(SUM(CASE WHEN l."credits" > 0 AND l."type" NOT IN ('REFUND') THEN l."credits" ELSE 0 END), 0) AS "totalGranted",
  COALESCE(SUM(CASE WHEN l."credits" < 0 THEN ABS(l."credits") ELSE 0 END), 0)     AS "totalDebited",
  COALESCE(SUM(CASE WHEN l."type" = 'REFUND' THEN l."credits" ELSE 0 END), 0)      AS "totalRefunded",
  NOW()                                                                              AS "updatedAt"
FROM "AiCreditLedger" l
GROUP BY l."orgSlug", l."organizationId"
ON CONFLICT ("orgSlug") DO UPDATE
  SET balance       = EXCLUDED.balance,
      "totalGranted"  = EXCLUDED."totalGranted",
      "totalDebited"  = EXCLUDED."totalDebited",
      "totalRefunded" = EXCLUDED."totalRefunded",
      "updatedAt"     = NOW();
