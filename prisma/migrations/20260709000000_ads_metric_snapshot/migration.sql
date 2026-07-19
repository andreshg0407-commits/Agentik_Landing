-- MARKETING-ANALYTICS-HISTORY-01: AdsMetricSnapshot
-- Historical metric snapshots for paid ads per tenant, platform, and execution.
-- Upsert key: tenantId + executionId + range + date.
-- No secrets stored — normalized metrics only.

CREATE TABLE "AdsMetricSnapshot" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "executionId"         TEXT NOT NULL,
    "provider"            TEXT NOT NULL,
    "platform"            TEXT NOT NULL,
    "externalCampaignId"  TEXT,
    "externalAdsetId"     TEXT,
    "externalAdId"        TEXT,
    "range"               TEXT NOT NULL,
    "date"                TEXT NOT NULL,
    "currency"            TEXT NOT NULL DEFAULT 'USD',
    "spend"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions"         INTEGER NOT NULL DEFAULT 0,
    "reach"               INTEGER NOT NULL DEFAULT 0,
    "clicks"              INTEGER NOT NULL DEFAULT 0,
    "ctr"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversions"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "results"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerResult"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "externalStatus"      TEXT NOT NULL DEFAULT 'unknown',
    "providerStatus"      TEXT,
    "metadataJson"        JSONB,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- Upsert uniqueness
CREATE UNIQUE INDEX "AdsMetricSnapshot_tenantId_executionId_range_date_key"
    ON "AdsMetricSnapshot"("tenantId", "executionId", "range", "date");

-- Query indexes
CREATE INDEX "AdsMetricSnapshot_tenantId_date_idx"
    ON "AdsMetricSnapshot"("tenantId", "date");

CREATE INDEX "AdsMetricSnapshot_tenantId_executionId_date_idx"
    ON "AdsMetricSnapshot"("tenantId", "executionId", "date");

CREATE INDEX "AdsMetricSnapshot_tenantId_provider_date_idx"
    ON "AdsMetricSnapshot"("tenantId", "provider", "date");

CREATE INDEX "AdsMetricSnapshot_tenantId_externalCampaignId_date_idx"
    ON "AdsMetricSnapshot"("tenantId", "externalCampaignId", "date");

CREATE INDEX "AdsMetricSnapshot_tenantId_createdAt_idx"
    ON "AdsMetricSnapshot"("tenantId", "createdAt" DESC);
