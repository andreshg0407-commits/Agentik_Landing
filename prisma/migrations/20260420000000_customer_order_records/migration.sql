-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260420000000_customer_order_records
--
-- PURPOSE: Backfill migration — creates CustomerOrderRecord table for
--          SAG PD (Pedidos Cliente) pipeline.
--
-- WHY THIS EXISTS:
--   CustomerOrderRecord was deployed via `prisma db push` without a migration.
--
-- IDEMPOTENCY:
--   CREATE TYPE and CREATE TABLE use IF NOT EXISTS / duplicate_object guards.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CustomerOrderStatus" AS ENUM (
    'PENDIENTE',
    'CONFIRMADO',
    'DESPACHADO',
    'FACTURADO',
    'CANCELADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerOrderRecord" (
    "id"             TEXT                  NOT NULL,
    "organizationId" TEXT                  NOT NULL,
    "erpMovId"       INTEGER               NOT NULL,
    "orderNumber"    TEXT                  NOT NULL,
    "customerNit"    TEXT,
    "customerName"   TEXT                  NOT NULL,
    "orderDate"      TIMESTAMP(3)          NOT NULL,
    "amount"         DECIMAL(18,2)         NOT NULL,
    "currency"       TEXT                  NOT NULL DEFAULT 'COP',
    "status"         "CustomerOrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "sourceCode"     TEXT                  NOT NULL DEFAULT 'PD',
    "rawJson"        JSONB                 NOT NULL,
    "syncedAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOrderRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderRecord_organizationId_erpMovId_key"
    ON "CustomerOrderRecord"("organizationId", "erpMovId");

CREATE INDEX IF NOT EXISTS "CustomerOrderRecord_organizationId_orderDate_idx"
    ON "CustomerOrderRecord"("organizationId", "orderDate");

ALTER TABLE "CustomerOrderRecord"
    ADD CONSTRAINT "CustomerOrderRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;
