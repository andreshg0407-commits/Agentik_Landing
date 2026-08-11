-- Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
-- Creates typed commercial term and entitlement period tables
-- for tenant module billing authority.
--
-- MIGRATION_STATUS = CREATED_NOT_APPLIED
-- DO NOT APPLY without commercial authority approval.
--
-- FK POLICY: RESTRICT (not CASCADE).
-- Billing history MUST NOT be casually destroyable.
-- Deleting a TenantModule row with existing commercial terms or
-- entitlement periods will fail — this is intentional.
-- Deactivation closes periods; it never deletes history.

-- TenantModuleCommercialTerm — append-only price history
CREATE TABLE "TenantModuleCommercialTerm" (
    "id" TEXT NOT NULL,
    "tenantModuleId" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModuleCommercialTerm_pkey" PRIMARY KEY ("id")
);

-- TenantModuleEntitlementPeriod — activation/deactivation history
CREATE TABLE "TenantModuleEntitlementPeriod" (
    "id" TEXT NOT NULL,
    "tenantModuleId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantModuleEntitlementPeriod_pkey" PRIMARY KEY ("id")
);

-- Indexes for efficient temporal queries
CREATE INDEX "TenantModuleCommercialTerm_tenantModuleId_effectiveFrom_idx" ON "TenantModuleCommercialTerm"("tenantModuleId", "effectiveFrom");
CREATE INDEX "TenantModuleCommercialTerm_tenantModuleId_effectiveTo_idx" ON "TenantModuleCommercialTerm"("tenantModuleId", "effectiveTo");
CREATE INDEX "TenantModuleEntitlementPeriod_tenantModuleId_effectiveFrom_idx" ON "TenantModuleEntitlementPeriod"("tenantModuleId", "effectiveFrom");
CREATE INDEX "TenantModuleEntitlementPeriod_tenantModuleId_effectiveTo_idx" ON "TenantModuleEntitlementPeriod"("tenantModuleId", "effectiveTo");

-- Foreign keys with RESTRICT — billing history must not be casually destroyable.
-- To remove a TenantModule, first close/archive all commercial terms and entitlement periods.
ALTER TABLE "TenantModuleCommercialTerm" ADD CONSTRAINT "TenantModuleCommercialTerm_tenantModuleId_fkey" FOREIGN KEY ("tenantModuleId") REFERENCES "TenantModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantModuleEntitlementPeriod" ADD CONSTRAINT "TenantModuleEntitlementPeriod_tenantModuleId_fkey" FOREIGN KEY ("tenantModuleId") REFERENCES "TenantModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
