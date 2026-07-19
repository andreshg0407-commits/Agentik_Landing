-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260406000000_identity_status_enum
--
-- PURPOSE: Backfill migration — adds IdentityStatus enum and identity
--          enhancement columns to CustomerProfile.
--
-- WHY THIS EXISTS:
--   These were deployed via `prisma db push` without a migration file.
--   Required before any migration that references IdentityStatus or the
--   identity columns on CustomerProfile.
--
-- IDEMPOTENCY:
--   Enum creation uses DO $$ BEGIN ... EXCEPTION WHEN duplicate_object guard.
--   Column additions use IF NOT EXISTS.
--
-- MUST RUN AFTER:
--   20260331224808_customer360_pipeline_intelligence (creates CustomerProfile)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "IdentityStatus" AS ENUM (
    'VERIFIED',
    'NEEDS_REVIEW',
    'CONSUMIDOR_FINAL',
    'DUPLICATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'NEEDS_REVIEW';

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "sagTerceroId" INTEGER;

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "nitNormalized" TEXT;

CREATE INDEX IF NOT EXISTS "CustomerProfile_organizationId_sagTerceroId_idx"
  ON "CustomerProfile"("organizationId", "sagTerceroId");

CREATE INDEX IF NOT EXISTS "CustomerProfile_organizationId_nitNormalized_idx"
  ON "CustomerProfile"("organizationId", "nitNormalized");
