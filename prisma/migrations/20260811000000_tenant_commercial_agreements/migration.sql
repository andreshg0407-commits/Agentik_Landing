-- CreateTable: TenantCommercialAgreement
CREATE TABLE "TenantCommercialAgreement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agreementType" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCommercialAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TenantCommercialAgreementModule
CREATE TABLE "TenantCommercialAgreementModule" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,

    CONSTRAINT "TenantCommercialAgreementModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TenantCommercialAgreementUsageLimit
CREATE TABLE "TenantCommercialAgreementUsageLimit" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "includedQuantity" INTEGER NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'SOFT_CAP',
    "overagePriceCents" INTEGER,
    "overageCurrency" TEXT,

    CONSTRAINT "TenantCommercialAgreementUsageLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantCommercialAgreement_organizationId_status_idx" ON "TenantCommercialAgreement"("organizationId", "status");
CREATE INDEX "TenantCommercialAgreement_organizationId_effectiveFrom_idx" ON "TenantCommercialAgreement"("organizationId", "effectiveFrom");

CREATE UNIQUE INDEX "TenantCommercialAgreementModule_agreementId_moduleKey_key" ON "TenantCommercialAgreementModule"("agreementId", "moduleKey");
CREATE INDEX "TenantCommercialAgreementModule_agreementId_idx" ON "TenantCommercialAgreementModule"("agreementId");

CREATE UNIQUE INDEX "TenantCommercialAgreementUsageLimit_agreementId_metricKey_key" ON "TenantCommercialAgreementUsageLimit"("agreementId", "metricKey");
CREATE INDEX "TenantCommercialAgreementUsageLimit_agreementId_idx" ON "TenantCommercialAgreementUsageLimit"("agreementId");

-- AddForeignKey
ALTER TABLE "TenantCommercialAgreement" ADD CONSTRAINT "TenantCommercialAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantCommercialAgreementModule" ADD CONSTRAINT "TenantCommercialAgreementModule_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "TenantCommercialAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantCommercialAgreementUsageLimit" ADD CONSTRAINT "TenantCommercialAgreementUsageLimit_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "TenantCommercialAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
