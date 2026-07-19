-- CATALOG-SAG-SUBGROUP-ENRICHMENT-01
-- Add SAG subgroup fields to ProductEntity and CommercialCoverageSnapshot

-- ProductEntity: master subgroup from SAG SUBGRUPOS table
ALTER TABLE "ProductEntity" ADD COLUMN "subgrupoId" INTEGER;
ALTER TABLE "ProductEntity" ADD COLUMN "subgrupoSag" TEXT;

-- CommercialCoverageSnapshot: denormalized subgroup for operational queries
ALTER TABLE "CommercialCoverageSnapshot" ADD COLUMN "subgrupoId" INTEGER;
ALTER TABLE "CommercialCoverageSnapshot" ADD COLUMN "subgrupoSag" TEXT;
