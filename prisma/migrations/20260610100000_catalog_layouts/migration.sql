-- MARKETING-STUDIO-CATALOG-LAYOUTS-01
-- Adds layout, groupByCategory, categorySort, categoryOrder to CatalogDefinition.
-- These fields support category-grouped visual layouts for the catalog engine.

ALTER TABLE "CatalogDefinition"
    ADD COLUMN "layout"          TEXT    NOT NULL DEFAULT 'GRID_STANDARD',
    ADD COLUMN "groupByCategory" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "categorySort"    TEXT    NOT NULL DEFAULT 'alphabetical',
    ADD COLUMN "categoryOrder"   JSONB;
