-- AGENTIK-AI-PRICING-ENGINE-01
-- Creates AiProvider and AiModelRate tables for configurable AI pricing.
-- providerId = "global" and modelId = "default" are reserved for fallback rates.

-- ── AiProvider ────────────────────────────────────────────────────────────────
CREATE TABLE "AiProvider" (
  "id"                   TEXT          NOT NULL,
  "name"                 TEXT          NOT NULL,
  "kind"                 TEXT          NOT NULL,
  "status"               TEXT          NOT NULL,
  "defaultCurrency"      TEXT          NOT NULL DEFAULT 'USD',
  "supportsTokenBilling" BOOLEAN       NOT NULL DEFAULT true,
  "supportsUnitBilling"  BOOLEAN       NOT NULL DEFAULT false,
  "supportsStreaming"    BOOLEAN       NOT NULL DEFAULT false,
  "metadataJson"         JSONB,
  "createdAt"            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMPTZ   NOT NULL,

  CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProvider_kind_idx"   ON "AiProvider" ("kind");
CREATE INDEX "AiProvider_status_idx" ON "AiProvider" ("status");

-- Insert reserved "global" provider for usageKind-level fallback rates
INSERT INTO "AiProvider" ("id", "name", "kind", "status", "updatedAt")
VALUES ('global', 'Global Fallback', 'INTERNAL', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ── AiModelRate ───────────────────────────────────────────────────────────────
CREATE TABLE "AiModelRate" (
  "id"                     TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "providerId"             TEXT          NOT NULL,
  "modelId"                TEXT          NOT NULL,
  "displayName"            TEXT          NOT NULL,
  "usageKind"              TEXT          NOT NULL,
  "currency"               TEXT          NOT NULL DEFAULT 'USD',
  "inputTokenCostPer1M"    DECIMAL(12,6),
  "outputTokenCostPer1M"   DECIMAL(12,6),
  "imageUnitCost"          DECIMAL(12,6),
  "videoSecondCost"        DECIMAL(12,6),
  "audioSecondCost"        DECIMAL(12,6),
  "requestCost"            DECIMAL(12,6),
  "minimumProviderCostUsd" DECIMAL(12,6),
  "minimumCredits"         INTEGER       NOT NULL DEFAULT 1,
  "creditMarkupMultiplier" DECIMAL(8,4)  NOT NULL DEFAULT 1.0,
  "effectiveFrom"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo"            TIMESTAMPTZ,
  "status"                 TEXT          NOT NULL,
  "metadataJson"           JSONB,
  "createdAt"              TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMPTZ   NOT NULL,

  CONSTRAINT "AiModelRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiModelRate_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "AiProvider" ("id") ON DELETE CASCADE
);

CREATE INDEX "AiModelRate_providerId_idx"    ON "AiModelRate" ("providerId");
CREATE INDEX "AiModelRate_modelId_idx"       ON "AiModelRate" ("modelId");
CREATE INDEX "AiModelRate_usageKind_idx"     ON "AiModelRate" ("usageKind");
CREATE INDEX "AiModelRate_status_idx"        ON "AiModelRate" ("status");
CREATE INDEX "AiModelRate_effectiveFrom_idx" ON "AiModelRate" ("effectiveFrom");
CREATE INDEX "AiModelRate_effectiveTo_idx"   ON "AiModelRate" ("effectiveTo");
