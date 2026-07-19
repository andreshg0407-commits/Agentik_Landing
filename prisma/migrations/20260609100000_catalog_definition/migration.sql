-- MARKETING-STUDIO-CATALOG-BUILDER-01
-- Adds CatalogDefinition: persisted catalog definition engine.
-- A catalog stores ONLY the definition (filters, sort, groupBy, commercial mode).
-- Products are resolved dynamically at query time — never stored on the catalog.

CREATE TABLE "CatalogDefinition" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "status"         TEXT NOT NULL DEFAULT 'draft',
    "filters"        JSONB,
    "sortField"      TEXT NOT NULL DEFAULT 'sortOrder',
    "sortDirection"  TEXT NOT NULL DEFAULT 'asc',
    "groupBy"        TEXT,
    "pricingMode"    TEXT NOT NULL DEFAULT 'with_prices',
    "ctaMode"        TEXT NOT NULL DEFAULT 'none',
    "whatsAppPhone"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdBy"      TEXT,

    CONSTRAINT "CatalogDefinition_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "CatalogDefinition_organizationId_status_idx"
    ON "CatalogDefinition"("organizationId", "status");

CREATE INDEX "CatalogDefinition_organizationId_createdAt_idx"
    ON "CatalogDefinition"("organizationId", "createdAt");

-- Foreign key
ALTER TABLE "CatalogDefinition"
    ADD CONSTRAINT "CatalogDefinition_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
