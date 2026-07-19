-- AGENTIK-PRODUCT-IMPORT-01
-- Prepare the product data model for idempotent import from SAG / ERP / Shopify.
--
-- Changes:
--   1. ProductEntity    → externalSource + externalId (import identity)
--   2. ProductVariant   → externalSource + externalId (variant import identity)
--   3. ProductVariantAttribute (new) — typed attribute-variant junction
--   4. ProductInventoryLevel   (new) — stock per product / variant / warehouse
--   5. ProductSnapshot  → linkedProductId (snapshot→product traceability)
--
-- All changes are additive. No existing columns removed.
-- ProductVariant.attributes Json? is preserved as display cache.

-- ── 1. ProductEntity — external import identity ───────────────────────────────

ALTER TABLE "ProductEntity"
  ADD COLUMN IF NOT EXISTS "externalSource" TEXT,
  ADD COLUMN IF NOT EXISTS "externalId"     TEXT;

-- Partial unique index: only enforced when both fields are non-null.
-- Manually created products (null/null) are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductEntity_org_external_source_id_key"
  ON "ProductEntity" ("organizationId", "externalSource", "externalId")
  WHERE "externalSource" IS NOT NULL AND "externalId" IS NOT NULL;

-- Fast lookup by external system when syncing
CREATE INDEX IF NOT EXISTS "ProductEntity_organizationId_externalSource_externalId_idx"
  ON "ProductEntity" ("organizationId", "externalSource", "externalId");

-- ── 2. ProductVariant — external import identity ──────────────────────────────

ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "externalSource" TEXT,
  ADD COLUMN IF NOT EXISTS "externalId"     TEXT;

-- Partial unique index: same pattern as ProductEntity
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_org_external_source_id_key"
  ON "ProductVariant" ("organizationId", "externalSource", "externalId")
  WHERE "externalSource" IS NOT NULL AND "externalId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ProductVariant_organizationId_externalSource_externalId_idx"
  ON "ProductVariant" ("organizationId", "externalSource", "externalId");

-- ── 3. ProductVariantAttribute (new table) ────────────────────────────────────
-- Typed attribute assignments for variants.
-- Replaces the opaque ProductVariant.attributes Json? for operational queries.

CREATE TABLE IF NOT EXISTS "ProductVariantAttribute" (
  "id"             TEXT        NOT NULL,
  "variantId"      TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "key"            TEXT        NOT NULL,
  "label"          TEXT        NOT NULL,
  "value"          TEXT        NOT NULL,
  "source"         TEXT        NOT NULL DEFAULT 'manual',
  "externalRef"    TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "ProductVariantAttribute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariantAttribute_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE,
  CONSTRAINT "ProductVariantAttribute_variantId_key_key"
    UNIQUE ("variantId", "key")
);

CREATE INDEX IF NOT EXISTS "ProductVariantAttribute_organizationId_key_value_idx"
  ON "ProductVariantAttribute" ("organizationId", "key", "value");

CREATE INDEX IF NOT EXISTS "ProductVariantAttribute_variantId_idx"
  ON "ProductVariantAttribute" ("variantId");

-- ── 4. ProductInventoryLevel (new table) ──────────────────────────────────────
-- Stock per product / variant / warehouse.
-- warehouseId "_default" = single-warehouse sentinel.
-- variantId null = product-level aggregate (no variant breakdown).

CREATE TABLE IF NOT EXISTS "ProductInventoryLevel" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "productId"      TEXT        NOT NULL,
  "variantId"      TEXT,
  "warehouseId"    TEXT        NOT NULL DEFAULT '_default',
  "quantity"       INTEGER     NOT NULL DEFAULT 0,
  "reservedQty"    INTEGER     NOT NULL DEFAULT 0,
  "source"         TEXT        NOT NULL DEFAULT 'manual',
  "externalRef"    TEXT,
  "syncedAt"       TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "ProductInventoryLevel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductInventoryLevel_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "ProductEntity" ("id") ON DELETE CASCADE,
  CONSTRAINT "ProductInventoryLevel_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL
);

-- Operational query indexes
CREATE INDEX IF NOT EXISTS "ProductInventoryLevel_productId_variantId_warehouseId_idx"
  ON "ProductInventoryLevel" ("productId", "variantId", "warehouseId");

CREATE INDEX IF NOT EXISTS "ProductInventoryLevel_organizationId_source_idx"
  ON "ProductInventoryLevel" ("organizationId", "source");

CREATE INDEX IF NOT EXISTS "ProductInventoryLevel_productId_idx"
  ON "ProductInventoryLevel" ("productId");

CREATE INDEX IF NOT EXISTS "ProductInventoryLevel_variantId_idx"
  ON "ProductInventoryLevel" ("variantId");

-- ── 5. ProductSnapshot — snapshot → product traceability ─────────────────────
-- No FK constraint: connector layer must not depend on product layer.
-- Null = snapshot not yet promoted to an Agentik ProductEntity.

ALTER TABLE "ProductSnapshot"
  ADD COLUMN IF NOT EXISTS "linkedProductId" TEXT;

CREATE INDEX IF NOT EXISTS "ProductSnapshot_organizationId_linkedProductId_idx"
  ON "ProductSnapshot" ("organizationId", "linkedProductId");
