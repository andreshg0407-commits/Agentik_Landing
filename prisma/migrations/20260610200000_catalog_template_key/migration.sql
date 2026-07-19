-- Migration: 20260610200000_catalog_template_key
-- Adds templateKey to CatalogDefinition for commercial template support.
-- Default "retail" preserves existing catalog behavior.

ALTER TABLE "CatalogDefinition" ADD COLUMN "templateKey" TEXT NOT NULL DEFAULT 'retail';
