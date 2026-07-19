-- Migration: 20260610300000_catalog_public_link
-- Adds CatalogPublicLink for shareable public catalog URLs.
-- Products are never stored here — resolved at view time from CatalogDefinition.

CREATE TABLE "CatalogPublicLink" (
  "id"             TEXT NOT NULL,
  "catalogId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"      TEXT,
  "expiresAt"      TIMESTAMP(3),
  "accessCount"    INTEGER NOT NULL DEFAULT 0,
  "lastAccessAt"   TIMESTAMP(3),

  CONSTRAINT "CatalogPublicLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogPublicLink_slug_key" ON "CatalogPublicLink"("slug");
CREATE INDEX "CatalogPublicLink_slug_idx" ON "CatalogPublicLink"("slug");
CREATE INDEX "CatalogPublicLink_orgCatalog_idx" ON "CatalogPublicLink"("organizationId", "catalogId");

ALTER TABLE "CatalogPublicLink"
  ADD CONSTRAINT "CatalogPublicLink_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "CatalogDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogPublicLink"
  ADD CONSTRAINT "CatalogPublicLink_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
