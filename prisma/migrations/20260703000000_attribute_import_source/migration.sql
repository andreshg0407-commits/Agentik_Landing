-- AGENTIK-ATTRIBUTE-IMPORT-SOURCE-01
-- Add source tracking to attribute models.
-- Enables SAG / ERP import with full provenance (source, externalRef).
--
-- source:      "manual" | "sag" | "shopify" | "erp_generic" | "pending_review"
-- externalRef: raw external field/value identifier (e.g. "color", "AZUL")

-- ProductAttributeDefinition
ALTER TABLE "ProductAttributeDefinition"
  ADD COLUMN IF NOT EXISTS "source"      TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

-- ProductAttributeDefinitionOption
ALTER TABLE "ProductAttributeDefinitionOption"
  ADD COLUMN IF NOT EXISTS "source"      TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

-- ProductAttribute
ALTER TABLE "ProductAttribute"
  ADD COLUMN IF NOT EXISTS "source"      TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

-- Indexes for import queries (filter by source, join on externalRef)
CREATE INDEX IF NOT EXISTS "ProductAttributeDefinition_org_source_idx"
  ON "ProductAttributeDefinition" ("organizationId", "source");

CREATE INDEX IF NOT EXISTS "ProductAttribute_org_source_idx"
  ON "ProductAttribute" ("organizationId", "source");
