-- AlterTable
ALTER TABLE "SourceMatchRecord" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sellerSlug" DROP DEFAULT,
ALTER COLUMN "storeSlug" DROP DEFAULT,
ALTER COLUMN "f2Amount" DROP DEFAULT,
ALTER COLUMN "f2Date" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "SaleRecord_orgId_inferredFrom_idx" RENAME TO "SaleRecord_organizationId_sourceInferredFrom_idx";

-- RenameIndex
ALTER INDEX "SaleRecord_orgId_sourceType_date_idx" RENAME TO "SaleRecord_organizationId_sagSourceType_saleDate_idx";

-- RenameIndex
ALTER INDEX "SaleRecord_orgId_sourceType_seller_idx" RENAME TO "SaleRecord_organizationId_sagSourceType_sellerSlug_saleDate_idx";

-- RenameIndex
ALTER INDEX "SaleRecord_orgId_sourceType_stage_date_idx" RENAME TO "SaleRecord_organizationId_sagSourceType_sourceDocumentStage_idx";

-- RenameIndex
ALTER INDEX "SaleRecord_orgId_sourceType_store_idx" RENAME TO "SaleRecord_organizationId_sagSourceType_storeSlug_saleDate_idx";

-- RenameIndex
ALTER INDEX "SourceMatchRecord_org_nit_period_idx" RENAME TO "SourceMatchRecord_organizationId_customerNit_periodoAoMes_idx";

-- RenameIndex
ALTER INDEX "SourceMatchRecord_org_orphan_period_idx" RENAME TO "SourceMatchRecord_organizationId_isOrphan_periodoAoMes_idx";

-- RenameIndex
ALTER INDEX "SourceMatchRecord_org_orphan_risk_idx" RENAME TO "SourceMatchRecord_organizationId_isOrphan_orphanRisk_idx";

-- RenameIndex
ALTER INDEX "SourceMatchRecord_org_period_idx" RENAME TO "SourceMatchRecord_organizationId_periodoAoMes_idx";

-- RenameIndex
ALTER INDEX "SourceMatchRecord_org_seller_period_idx" RENAME TO "SourceMatchRecord_organizationId_sellerSlug_periodoAoMes_idx";
