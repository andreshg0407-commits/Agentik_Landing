-- SAG-HISTORICAL-READ-COMPLETENESS-01
-- Add seller persistence and line aggregates to CustomerOrderRecord

ALTER TABLE "CustomerOrderRecord" ADD COLUMN "sellerTerceroId" INTEGER;
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "sellerName" TEXT;
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "sellerSource" TEXT;
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "sellerConfidence" TEXT;
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "totalUnits" DECIMAL(18,2);
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "totalLineValue" DECIMAL(18,2);
ALTER TABLE "CustomerOrderRecord" ADD COLUMN "lineCount" INTEGER;
