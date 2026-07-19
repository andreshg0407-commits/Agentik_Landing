-- MS-14 Distribution Runtime
-- Adds DistributionVariant, DistributionPipeline, DistributionSchedule tables.

CREATE TABLE IF NOT EXISTS "DistributionVariant" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "productId"      TEXT,
  "assetId"        TEXT,
  "purpose"        TEXT        NOT NULL,
  "channel"        TEXT        NOT NULL,
  "ratio"          TEXT,
  "width"          INTEGER,
  "height"         INTEGER,
  "isReady"        BOOLEAN     NOT NULL DEFAULT false,
  "sourceAssetUrl" TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionVariant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DistributionVariant_orgId_productId_idx" ON "DistributionVariant"("organizationId", "productId");
CREATE INDEX IF NOT EXISTS "DistributionVariant_orgId_channel_purpose_idx" ON "DistributionVariant"("organizationId", "channel", "purpose");
CREATE INDEX IF NOT EXISTS "DistributionVariant_orgId_isReady_idx" ON "DistributionVariant"("organizationId", "isReady");
ALTER TABLE "DistributionVariant"
  ADD CONSTRAINT "DistributionVariant_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

CREATE TABLE IF NOT EXISTS "DistributionPipeline" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "pipelineType"   TEXT        NOT NULL,
  "status"         TEXT        NOT NULL DEFAULT 'draft',
  "channels"       JSONB       NOT NULL DEFAULT '[]',
  "stages"         JSONB       NOT NULL DEFAULT '[]',
  "productIds"     JSONB       NOT NULL DEFAULT '[]',
  "catalogId"      TEXT,
  "scheduledAt"    TIMESTAMP(3),
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "lastError"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionPipeline_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DistributionPipeline_orgId_status_idx" ON "DistributionPipeline"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "DistributionPipeline_orgId_type_idx"   ON "DistributionPipeline"("organizationId", "pipelineType");
CREATE INDEX IF NOT EXISTS "DistributionPipeline_orgId_sched_idx"  ON "DistributionPipeline"("organizationId", "scheduledAt");
ALTER TABLE "DistributionPipeline"
  ADD CONSTRAINT "DistributionPipeline_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

CREATE TABLE IF NOT EXISTS "DistributionSchedule" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "label"          TEXT         NOT NULL,
  "slotType"       TEXT         NOT NULL,
  "channel"        TEXT         NOT NULL,
  "timezone"       TEXT         NOT NULL DEFAULT 'America/Bogota',
  "scheduledAt"    TIMESTAMP(3),
  "recurrenceCron" TEXT,
  "productIds"     JSONB        NOT NULL DEFAULT '[]',
  "pipelineId"     TEXT,
  "status"         TEXT         NOT NULL DEFAULT 'pending',
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DistributionSchedule_orgId_channel_status_idx" ON "DistributionSchedule"("organizationId", "channel", "status");
CREATE INDEX IF NOT EXISTS "DistributionSchedule_orgId_scheduledAt_idx"    ON "DistributionSchedule"("organizationId", "scheduledAt");
ALTER TABLE "DistributionSchedule"
  ADD CONSTRAINT "DistributionSchedule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
