-- MARKETING-STUDIO-PRODUCT-CONTENT-01
-- Commercial master content layer for product references.
-- 1:1 with ProductEntity — one content record per product, created lazily.
-- All fields are optional so the record can be created empty and filled progressively.

CREATE TABLE "ProductContent" (
  "id"                   TEXT NOT NULL,
  "productId"            TEXT NOT NULL,
  "organizationId"       TEXT NOT NULL,

  -- ── Commercial titles ──
  "commercialTitle"      TEXT,
  "subtitle"             TEXT,
  "shortDescription"     TEXT,
  "longDescription"      TEXT,

  -- ── Commercial value layer ──
  "keyBenefits"          TEXT,  -- JSON: string[]
  "keyFeatures"          TEXT,  -- JSON: string[]

  -- ── Physical / technical specs ──
  "materials"            TEXT,
  "dimensions"           TEXT,
  "weight"               TEXT,

  -- ── Usage / care ──
  "careInstructions"     TEXT,
  "usageInstructions"    TEXT,
  "recommendedAge"       TEXT,

  -- ── FAQ ──
  "faq"                  TEXT,  -- JSON: { q: string; a: string }[]

  -- ── SEO layer ──
  "seoTitle"             TEXT,
  "seoDescription"       TEXT,
  "searchKeywords"       TEXT,  -- JSON: string[]

  -- ── Lifecycle ──
  -- Values governed at domain layer: draft | complete | approved
  "status"               TEXT NOT NULL DEFAULT 'draft',

  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductContent_pkey" PRIMARY KEY ("id")
);

-- Unique constraint enforces 1:1 with ProductEntity
CREATE UNIQUE INDEX "ProductContent_productId_key" ON "ProductContent"("productId");

-- FK to ProductEntity
ALTER TABLE "ProductContent"
  ADD CONSTRAINT "ProductContent_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "ProductEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Performance indexes
CREATE INDEX "ProductContent_organizationId_idx" ON "ProductContent"("organizationId");
CREATE INDEX "ProductContent_organizationId_status_idx" ON "ProductContent"("organizationId", "status");
