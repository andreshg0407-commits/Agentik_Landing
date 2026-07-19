-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260428000000_product_intelligence_layer
--
-- PURPOSE: Backfill migration — creates the full Product Intelligence Layer
--          (MS-05 through MS-12).
--
-- WHY THIS EXISTS:
--   All product models were deployed via `prisma db push` without migrations.
--
-- IDEMPOTENCY:
--   All CREATE TABLE use IF NOT EXISTS guards.
--   FKs use NOT VALID to skip constraint validation against existing data.
--
-- MUST RUN AFTER:
--   20260302035350_core_agentik_v1 (creates Organization)
--   20260415000000_marketing_studio (creates GeneratedAsset referenced by ProductAssetLink)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ProductEntity ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductEntity" (
    "id"                       TEXT         NOT NULL,
    "organizationId"           TEXT         NOT NULL,
    "version"                  INTEGER      NOT NULL DEFAULT 1,
    "name"                     TEXT         NOT NULL,
    "sku"                      TEXT,
    "category"                 TEXT,
    "description"              TEXT,
    "price"                    DOUBLE PRECISION,
    "currency"                 TEXT         NOT NULL DEFAULT 'COP',
    "status"                   TEXT         NOT NULL DEFAULT 'pending',
    "commercialStatus"         TEXT         NOT NULL DEFAULT 'active',
    "usagePermission"          TEXT         NOT NULL DEFAULT 'commercial',
    "crmName"                  TEXT,
    "productLine"              TEXT,
    "segment"                  TEXT,
    "salesArgument"            TEXT,
    "availability"             TEXT,
    "notes"                    TEXT,
    "readinessLevel"           TEXT         NOT NULL DEFAULT 'not_ready',
    "readinessScore"           INTEGER      NOT NULL DEFAULT 0,
    "readyDestinations"        JSONB,
    "partialDestinations"      JSONB,
    "blockedDestinations"      JSONB,
    "lastReadinessComputedAt"  TIMESTAMP(3),
    "approvedAt"               TIMESTAMP(3),
    "approvedBy"               TEXT,
    "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEntity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_status_idx"
    ON "ProductEntity"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_sku_idx"
    ON "ProductEntity"("organizationId", "sku");

CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_category_idx"
    ON "ProductEntity"("organizationId", "category");

CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_readinessLevel_idx"
    ON "ProductEntity"("organizationId", "readinessLevel");

CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_createdAt_idx"
    ON "ProductEntity"("organizationId", "createdAt");

ALTER TABLE "ProductEntity"
    ADD CONSTRAINT "ProductEntity_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductVariant ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id"             TEXT         NOT NULL,
    "productId"      TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "sku"            TEXT,
    "name"           TEXT         NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'active',
    "attributes"     JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx"
    ON "ProductVariant"("productId");

CREATE INDEX IF NOT EXISTS "ProductVariant_organizationId_productId_idx"
    ON "ProductVariant"("organizationId", "productId");

ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductAttribute ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductAttribute" (
    "id"             TEXT         NOT NULL,
    "productId"      TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "key"            TEXT         NOT NULL,
    "label"          TEXT         NOT NULL,
    "valueText"      TEXT,
    "valueNumber"    DOUBLE PRECISION,
    "valueBoolean"   BOOLEAN,
    "valueJson"      JSONB,
    "type"           TEXT         NOT NULL DEFAULT 'text',
    "destination"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductAttribute_productId_key_key"
    ON "ProductAttribute"("productId", "key");

CREATE INDEX IF NOT EXISTS "ProductAttribute_productId_idx"
    ON "ProductAttribute"("productId");

CREATE INDEX IF NOT EXISTS "ProductAttribute_organizationId_key_idx"
    ON "ProductAttribute"("organizationId", "key");

ALTER TABLE "ProductAttribute"
    ADD CONSTRAINT "ProductAttribute_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductAssetLink ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductAssetLink" (
    "id"                  TEXT         NOT NULL,
    "productId"           TEXT         NOT NULL,
    "organizationId"      TEXT         NOT NULL,
    "assetId"             TEXT         NOT NULL,
    "role"                TEXT         NOT NULL DEFAULT 'gallery',
    "sourceType"          TEXT,
    "sourceGenerationId"  TEXT,
    "sourceProvider"      TEXT,
    "generatedBy"         TEXT,
    "generationIntent"    TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAssetLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductAssetLink_productId_assetId_key"
    ON "ProductAssetLink"("productId", "assetId");

CREATE INDEX IF NOT EXISTS "ProductAssetLink_productId_idx"
    ON "ProductAssetLink"("productId");

CREATE INDEX IF NOT EXISTS "ProductAssetLink_organizationId_assetId_idx"
    ON "ProductAssetLink"("organizationId", "assetId");

ALTER TABLE "ProductAssetLink"
    ADD CONSTRAINT "ProductAssetLink_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductSyncState ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductSyncState" (
    "id"             TEXT         NOT NULL,
    "productId"      TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "channel"        TEXT         NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "lastSyncAt"     TIMESTAMP(3),
    "errorMessage"   TEXT,
    "externalId"     TEXT,
    "version"        INTEGER      NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSyncState_productId_channel_key"
    ON "ProductSyncState"("productId", "channel");

CREATE INDEX IF NOT EXISTS "ProductSyncState_productId_idx"
    ON "ProductSyncState"("productId");

CREATE INDEX IF NOT EXISTS "ProductSyncState_organizationId_channel_status_idx"
    ON "ProductSyncState"("organizationId", "channel", "status");

ALTER TABLE "ProductSyncState"
    ADD CONSTRAINT "ProductSyncState_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductPublicationState ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductPublicationState" (
    "id"                       TEXT         NOT NULL,
    "productId"                TEXT         NOT NULL,
    "organizationId"           TEXT         NOT NULL,
    "channel"                  TEXT         NOT NULL,
    "publicationStatus"        TEXT         NOT NULL DEFAULT 'unpublished',
    "publishedAt"              TIMESTAMP(3),
    "lastPublicationAttemptAt" TIMESTAMP(3),
    "externalPublicationId"    TEXT,
    "publicationUrl"           TEXT,
    "errorMessage"             TEXT,
    "version"                  INTEGER      NOT NULL DEFAULT 1,
    "shopifyHandle"            TEXT,
    "externalVariantIds"       JSONB,
    "lastSyncAt"               TIMESTAMP(3),
    "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPublicationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductPublicationState_productId_channel_key"
    ON "ProductPublicationState"("productId", "channel");

CREATE INDEX IF NOT EXISTS "ProductPublicationState_productId_idx"
    ON "ProductPublicationState"("productId");

CREATE INDEX IF NOT EXISTS "ProductPublicationState_organizationId_channel_publicationStatus_idx"
    ON "ProductPublicationState"("organizationId", "channel", "publicationStatus");

ALTER TABLE "ProductPublicationState"
    ADD CONSTRAINT "ProductPublicationState_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── CommercePublicationEvent ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CommercePublicationEvent" (
    "id"                 TEXT         NOT NULL,
    "organizationId"     TEXT         NOT NULL,
    "productId"          TEXT         NOT NULL,
    "channel"            TEXT         NOT NULL,
    "publicationStateId" TEXT         NOT NULL,
    "eventType"          TEXT         NOT NULL,
    "resultState"        TEXT         NOT NULL,
    "jobId"              TEXT,
    "message"            TEXT,
    "payload"            JSONB,
    "occurredAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercePublicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommercePublicationEvent_organizationId_productId_channel_idx"
    ON "CommercePublicationEvent"("organizationId", "productId", "channel");

CREATE INDEX IF NOT EXISTS "CommercePublicationEvent_publicationStateId_idx"
    ON "CommercePublicationEvent"("publicationStateId");

CREATE INDEX IF NOT EXISTS "CommercePublicationEvent_organizationId_eventType_occurredAt_idx"
    ON "CommercePublicationEvent"("organizationId", "eventType", "occurredAt");

ALTER TABLE "CommercePublicationEvent"
    ADD CONSTRAINT "CommercePublicationEvent_publicationStateId_fkey"
    FOREIGN KEY ("publicationStateId")
    REFERENCES "ProductPublicationState"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── PropagationJob ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PropagationJob" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "productId"      TEXT         NOT NULL,
    "eventType"      TEXT         NOT NULL,
    "channel"        TEXT         NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pending',
    "priority"       INTEGER      NOT NULL DEFAULT 5,
    "payload"        JSONB,
    "scheduledAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "retryCount"     INTEGER      NOT NULL DEFAULT 0,
    "lastError"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropagationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PropagationJob_organizationId_status_scheduledAt_idx"
    ON "PropagationJob"("organizationId", "status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "PropagationJob_productId_idx"
    ON "PropagationJob"("productId");

CREATE INDEX IF NOT EXISTS "PropagationJob_organizationId_channel_status_idx"
    ON "PropagationJob"("organizationId", "channel", "status");

ALTER TABLE "PropagationJob"
    ADD CONSTRAINT "PropagationJob_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;

-- ── ProductActivity ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProductActivity" (
    "id"             TEXT         NOT NULL,
    "productId"      TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "eventType"      TEXT         NOT NULL,
    "payload"        JSONB,
    "actorId"        TEXT,
    "actorLabel"     TEXT,
    "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductActivity_productId_occurredAt_idx"
    ON "ProductActivity"("productId", "occurredAt");

CREATE INDEX IF NOT EXISTS "ProductActivity_organizationId_eventType_idx"
    ON "ProductActivity"("organizationId", "eventType");

ALTER TABLE "ProductActivity"
    ADD CONSTRAINT "ProductActivity_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "ProductEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    NOT VALID;
