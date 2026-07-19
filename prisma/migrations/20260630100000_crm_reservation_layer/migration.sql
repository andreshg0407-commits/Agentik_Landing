-- INVENTORY-CRM-RESERVATION-LAYER-01
-- Add physicalQty and crmReservedQty to CommercialCoverageSnapshot

ALTER TABLE "CommercialCoverageSnapshot" ADD COLUMN "physicalQty" INTEGER;
ALTER TABLE "CommercialCoverageSnapshot" ADD COLUMN "crmReservedQty" INTEGER;
