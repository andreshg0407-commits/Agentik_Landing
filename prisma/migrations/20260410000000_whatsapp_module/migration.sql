-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260410000000_whatsapp_module
--
-- PURPOSE: Backfill migration — creates WhatsApp Business module tables.
--
-- WHY THIS EXISTS:
--   WhatsApp models were deployed via `prisma db push` without migration files.
--
-- IDEMPOTENCY:
--   All CREATE TYPE and CREATE TABLE use IF NOT EXISTS / duplicate_object guards.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "WaConversationStatus" AS ENUM (
    'ACTIVE',
    'RESOLVED',
    'HANDED_OFF',
    'TIMED_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaMessageRole" AS ENUM (
    'USER',
    'ASSISTANT',
    'SYSTEM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaIntent" AS ENUM (
    'FAQ',
    'APPOINTMENT',
    'SALES',
    'SUPPORT',
    'HANDOFF',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── WhatsAppConfig ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppConfig" (
    "id"             TEXT    NOT NULL,
    "organizationId" TEXT    NOT NULL,
    "phoneNumberId"  TEXT    NOT NULL,
    "wabaId"         TEXT    NOT NULL,
    "webhookSecret"  TEXT    NOT NULL,
    "displayName"    TEXT    NOT NULL,
    "welcomeMessage" TEXT,
    "intentConfig"   JSONB,
    "brandConfig"    JSONB,
    "active"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConfig_organizationId_key"
    ON "WhatsAppConfig"("organizationId");

ALTER TABLE "WhatsAppConfig"
    ADD CONSTRAINT "WhatsAppConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── WhatsAppConversation ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppConversation" (
    "id"             TEXT                    NOT NULL,
    "organizationId" TEXT                    NOT NULL,
    "configId"       TEXT                    NOT NULL,
    "contactPhone"   TEXT                    NOT NULL,
    "contactName"    TEXT,
    "status"         "WaConversationStatus"  NOT NULL DEFAULT 'ACTIVE',
    "lastIntent"     "WaIntent",
    "handedOff"      BOOLEAN                 NOT NULL DEFAULT false,
    "handoffTo"      TEXT,
    "createdAt"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)            NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_organizationId_contactPhone_key"
    ON "WhatsAppConversation"("organizationId", "contactPhone");

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_organizationId_status_idx"
    ON "WhatsAppConversation"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_organizationId_updatedAt_idx"
    ON "WhatsAppConversation"("organizationId", "updatedAt");

CREATE INDEX IF NOT EXISTS "WhatsAppConversation_configId_idx"
    ON "WhatsAppConversation"("configId");

ALTER TABLE "WhatsAppConversation"
    ADD CONSTRAINT "WhatsAppConversation_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "WhatsAppConversation"
    ADD CONSTRAINT "WhatsAppConversation_configId_fkey"
    FOREIGN KEY ("configId")
    REFERENCES "WhatsAppConfig"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── WhatsAppMessage ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id"             TEXT            NOT NULL,
    "conversationId" TEXT            NOT NULL,
    "organizationId" TEXT            NOT NULL,
    "role"           "WaMessageRole" NOT NULL,
    "content"        TEXT            NOT NULL,
    "intent"         "WaIntent",
    "rawPayload"     JSONB,
    "waMessageId"    TEXT,
    "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_waMessageId_key"
    ON "WhatsAppMessage"("waMessageId");

CREATE INDEX IF NOT EXISTS "WhatsAppMessage_conversationId_idx"
    ON "WhatsAppMessage"("conversationId");

CREATE INDEX IF NOT EXISTS "WhatsAppMessage_organizationId_intent_idx"
    ON "WhatsAppMessage"("organizationId", "intent");

CREATE INDEX IF NOT EXISTS "WhatsAppMessage_organizationId_createdAt_idx"
    ON "WhatsAppMessage"("organizationId", "createdAt");

ALTER TABLE "WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId")
    REFERENCES "WhatsAppConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── WhatsAppContactMemory ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppContactMemory" (
    "id"                      TEXT         NOT NULL,
    "organizationId"          TEXT         NOT NULL,
    "contactPhone"            TEXT         NOT NULL,
    "contactName"             TEXT,
    "lastSuccessfulOutcome"   TEXT,
    "lastSuccessfulOutcomeAt" TIMESTAMP(3),
    "lastProductMention"      TEXT,
    "lastAppointmentRequest"  TEXT,
    "lastHandoffAt"           TIMESTAMP(3),
    "totalConversations"      INTEGER      NOT NULL DEFAULT 1,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppContactMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppContactMemory_organizationId_contactPhone_key"
    ON "WhatsAppContactMemory"("organizationId", "contactPhone");

CREATE INDEX IF NOT EXISTS "WhatsAppContactMemory_organizationId_idx"
    ON "WhatsAppContactMemory"("organizationId");

ALTER TABLE "WhatsAppContactMemory"
    ADD CONSTRAINT "WhatsAppContactMemory_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;
