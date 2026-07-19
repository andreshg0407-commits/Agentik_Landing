-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260429000000_integration_runtime
--
-- PURPOSE: Backfill migration — creates MS-10 Integration Runtime tables.
--
-- WHY THIS EXISTS:
--   IntegrationConnection, IntegrationSecret, IntegrationEvent,
--   IntegrationWebhookEvent, and CommerceJob were deployed via `prisma db push`
--   without migration files.
--
-- IDEMPOTENCY:
--   All CREATE TABLE use IF NOT EXISTS guards.
--   FKs use NOT VALID to skip validation against existing data.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── IntegrationConnection ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
    "id"                  TEXT         NOT NULL,
    "organizationId"      TEXT         NOT NULL,
    "provider"            TEXT         NOT NULL,
    "status"              TEXT         NOT NULL DEFAULT 'not_connected',
    "health"              TEXT         NOT NULL DEFAULT 'disconnected',
    "shopDomain"          TEXT,
    "externalAccountId"   TEXT,
    "externalAccountName" TEXT,
    "scopes"              JSONB        NOT NULL DEFAULT '[]',
    "connectedAt"         TIMESTAMP(3),
    "disconnectedAt"      TIMESTAMP(3),
    "lastHealthCheckAt"   TIMESTAMP(3),
    "errorMessage"        TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationConnection_organizationId_provider_idx"
    ON "IntegrationConnection"("organizationId", "provider");

CREATE INDEX IF NOT EXISTS "IntegrationConnection_organizationId_status_idx"
    ON "IntegrationConnection"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "IntegrationConnection_provider_status_idx"
    ON "IntegrationConnection"("provider", "status");

ALTER TABLE "IntegrationConnection"
    ADD CONSTRAINT "IntegrationConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── IntegrationSecret ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationSecret" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "connectionId"   TEXT         NOT NULL,
    "secretType"     TEXT         NOT NULL,
    "encryptedValue" TEXT         NOT NULL,
    "keyVersion"     TEXT         NOT NULL DEFAULT 'v1',
    "expiresAt"      TIMESTAMP(3),
    "revokedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSecret_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationSecret_organizationId_connectionId_secretType_idx"
    ON "IntegrationSecret"("organizationId", "connectionId", "secretType");

CREATE INDEX IF NOT EXISTS "IntegrationSecret_connectionId_secretType_idx"
    ON "IntegrationSecret"("connectionId", "secretType");

CREATE INDEX IF NOT EXISTS "IntegrationSecret_expiresAt_idx"
    ON "IntegrationSecret"("expiresAt");

ALTER TABLE "IntegrationSecret"
    ADD CONSTRAINT "IntegrationSecret_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "IntegrationSecret"
    ADD CONSTRAINT "IntegrationSecret_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "IntegrationConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── IntegrationEvent ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "connectionId"   TEXT,
    "provider"       TEXT         NOT NULL,
    "eventType"      TEXT         NOT NULL,
    "payload"        JSONB        NOT NULL DEFAULT '{}',
    "actorId"        TEXT,
    "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationEvent_organizationId_provider_occurredAt_idx"
    ON "IntegrationEvent"("organizationId", "provider", "occurredAt");

CREATE INDEX IF NOT EXISTS "IntegrationEvent_connectionId_occurredAt_idx"
    ON "IntegrationEvent"("connectionId", "occurredAt");

CREATE INDEX IF NOT EXISTS "IntegrationEvent_organizationId_eventType_idx"
    ON "IntegrationEvent"("organizationId", "eventType");

ALTER TABLE "IntegrationEvent"
    ADD CONSTRAINT "IntegrationEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "IntegrationEvent"
    ADD CONSTRAINT "IntegrationEvent_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "IntegrationConnection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

-- ── IntegrationWebhookEvent ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationWebhookEvent" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "provider"       TEXT         NOT NULL,
    "eventId"        TEXT         NOT NULL,
    "topic"          TEXT         NOT NULL,
    "payload"        JSONB        NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "errorMessage"   TEXT,
    "processedAt"    TIMESTAMP(3),
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationWebhookEvent_organizationId_provider_eventId_key"
    ON "IntegrationWebhookEvent"("organizationId", "provider", "eventId");

CREATE INDEX IF NOT EXISTS "IntegrationWebhookEvent_organizationId_provider_status_idx"
    ON "IntegrationWebhookEvent"("organizationId", "provider", "status");

CREATE INDEX IF NOT EXISTS "IntegrationWebhookEvent_organizationId_receivedAt_idx"
    ON "IntegrationWebhookEvent"("organizationId", "receivedAt");

ALTER TABLE "IntegrationWebhookEvent"
    ADD CONSTRAINT "IntegrationWebhookEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── CommerceJob ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CommerceJob" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "connectionId"   TEXT         NOT NULL,
    "provider"       TEXT         NOT NULL,
    "jobType"        TEXT         NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "priority"       INTEGER      NOT NULL DEFAULT 5,
    "productId"      TEXT,
    "payload"        JSONB        NOT NULL DEFAULT '{}',
    "result"         JSONB,
    "retryCount"     INTEGER      NOT NULL DEFAULT 0,
    "scheduledAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "lastError"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommerceJob_organizationId_provider_status_idx"
    ON "CommerceJob"("organizationId", "provider", "status");

CREATE INDEX IF NOT EXISTS "CommerceJob_organizationId_status_scheduledAt_idx"
    ON "CommerceJob"("organizationId", "status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "CommerceJob_connectionId_status_idx"
    ON "CommerceJob"("connectionId", "status");

CREATE INDEX IF NOT EXISTS "CommerceJob_productId_idx"
    ON "CommerceJob"("productId");

ALTER TABLE "CommerceJob"
    ADD CONSTRAINT "CommerceJob_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "CommerceJob"
    ADD CONSTRAINT "CommerceJob_connectionId_fkey"
    FOREIGN KEY ("connectionId")
    REFERENCES "IntegrationConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;
