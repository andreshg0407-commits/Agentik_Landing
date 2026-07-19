-- MARKETING-ADS-ACCOUNTS-01 — TenantAdsConfig
-- Ads platform account selection preferences per tenant.
-- Stores ONLY external resource IDs — NO secrets, NO tokens.
-- Secrets live exclusively in the VaultSecret table.

CREATE TABLE IF NOT EXISTS "TenantAdsConfig" (
    "id"                          TEXT NOT NULL,
    "organizationId"              TEXT NOT NULL,
    "platform"                    TEXT NOT NULL,
    "selectedAdAccountId"         TEXT,
    "selectedAdAccountName"       TEXT,
    "selectedBusinessId"          TEXT,
    "selectedBusinessName"        TEXT,
    "selectedPageId"              TEXT,
    "selectedPageName"            TEXT,
    "selectedInstagramAccountId"  TEXT,
    "selectedInstagramAccountName" TEXT,
    "selectedAdvertiserId"        TEXT,
    "selectedAdvertiserName"      TEXT,
    "lastDiscoveredAt"            TIMESTAMP(3),
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAdsConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantAdsConfig_organizationId_platform_key"
    ON "TenantAdsConfig"("organizationId", "platform");

CREATE INDEX IF NOT EXISTS "TenantAdsConfig_organizationId_idx"
    ON "TenantAdsConfig"("organizationId");
