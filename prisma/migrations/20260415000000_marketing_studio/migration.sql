-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260415000000_marketing_studio
--
-- PURPOSE: Backfill migration — creates Marketing Studio tables.
--
-- WHY THIS EXISTS:
--   StudioSession and GeneratedAsset were deployed via `prisma db push`
--   without migration files.
--
-- IDEMPOTENCY:
--   All CREATE TYPE and CREATE TABLE use IF NOT EXISTS / duplicate_object guards.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "StudioSessionDbStatus" AS ENUM (
    'IDLE',
    'IN_PROGRESS',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'PUBLISHING',
    'PUBLISHED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssetGenerationStatus" AS ENUM (
    'PENDING',
    'QUEUED',
    'GENERATING',
    'READY',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssetPublishStatus" AS ENUM (
    'NONE',
    'QUEUED',
    'PUBLISHING',
    'PUBLISHED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── StudioSession ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StudioSession" (
    "id"                    TEXT                    NOT NULL,
    "organizationId"        TEXT                    NOT NULL,
    "tenantId"              TEXT                    NOT NULL,
    "step"                  TEXT                    NOT NULL,
    "status"                "StudioSessionDbStatus" NOT NULL DEFAULT 'IDLE',
    "objective"             TEXT,
    "productSku"            TEXT,
    "productImageUrl"       TEXT,
    "inputsJson"            JSONB,
    "reviewItemsJson"       JSONB,
    "publishResultJson"     JSONB,
    "executionJobId"        TEXT,
    "executionPayloadJson"  JSONB,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioSession_organizationId_status_idx"
    ON "StudioSession"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "StudioSession_organizationId_tenantId_createdAt_idx"
    ON "StudioSession"("organizationId", "tenantId", "createdAt" DESC);

ALTER TABLE "StudioSession"
    ADD CONSTRAINT "StudioSession_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── GeneratedAsset ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GeneratedAsset" (
    "id"               TEXT                     NOT NULL,
    "sessionId"        TEXT                     NOT NULL,
    "assetType"        TEXT                     NOT NULL,
    "generationStatus" "AssetGenerationStatus"  NOT NULL DEFAULT 'PENDING',
    "publishStatus"    "AssetPublishStatus"     NOT NULL DEFAULT 'NONE',
    "assetUrl"         TEXT,
    "content"          TEXT,
    "reviewStatus"     TEXT                     NOT NULL DEFAULT 'pending',
    "externalRef"      TEXT,
    "generationJobId"  TEXT,
    "providerMeta"     JSONB,
    "createdAt"        TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)             NOT NULL,

    CONSTRAINT "GeneratedAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GeneratedAsset_sessionId_idx"
    ON "GeneratedAsset"("sessionId");

CREATE INDEX IF NOT EXISTS "GeneratedAsset_sessionId_generationStatus_idx"
    ON "GeneratedAsset"("sessionId", "generationStatus");

ALTER TABLE "GeneratedAsset"
    ADD CONSTRAINT "GeneratedAsset_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "StudioSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;
