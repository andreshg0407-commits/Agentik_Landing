-- AGENTIK-STRATEGIC-SIMULATIONS-01
-- Migration: Strategic Simulation Models
-- Created: 2026-06-09

-- StrategicSimulationRecord
CREATE TABLE "StrategicSimulationRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "category"        TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "summary"         TEXT NOT NULL,
  "confidence"      TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'COMPLETED',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "simulatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrategicSimulationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicSimulationRecord_orgSlug_idx" ON "StrategicSimulationRecord"("orgSlug");
CREATE INDEX "StrategicSimulationRecord_orgSlug_category_idx" ON "StrategicSimulationRecord"("orgSlug", "category");
CREATE INDEX "StrategicSimulationRecord_orgSlug_domain_idx" ON "StrategicSimulationRecord"("orgSlug", "domain");
CREATE INDEX "StrategicSimulationRecord_orgSlug_simulatedAt_idx" ON "StrategicSimulationRecord"("orgSlug", "simulatedAt");

-- SimulationScenarioRecord
CREATE TABLE "SimulationScenarioRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "simulationId"    TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "variant"         TEXT NOT NULL,
  "category"        TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "confidence"      TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "overallRisk"     TEXT NOT NULL,
  "overallImpact"   TEXT NOT NULL,
  "scenarioData"    JSONB NOT NULL DEFAULT '{}',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "simulatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulationScenarioRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SimulationScenarioRecord_orgSlug_idx" ON "SimulationScenarioRecord"("orgSlug");
CREATE INDEX "SimulationScenarioRecord_orgSlug_simulationId_idx" ON "SimulationScenarioRecord"("orgSlug", "simulationId");
CREATE INDEX "SimulationScenarioRecord_orgSlug_variant_idx" ON "SimulationScenarioRecord"("orgSlug", "variant");
CREATE INDEX "SimulationScenarioRecord_orgSlug_simulatedAt_idx" ON "SimulationScenarioRecord"("orgSlug", "simulatedAt");

-- SimulationComparisonRecord
CREATE TABLE "SimulationComparisonRecord" (
  "id"               TEXT NOT NULL,
  "orgSlug"          TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "scenarioIds"      JSONB NOT NULL DEFAULT '[]',
  "winnerScenarioId" TEXT,
  "winnerRationale"  TEXT NOT NULL,
  "confidence"       TEXT NOT NULL,
  "tradeoffs"        JSONB NOT NULL DEFAULT '[]',
  "metadata"         JSONB NOT NULL DEFAULT '{}',
  "comparedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulationComparisonRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SimulationComparisonRecord_orgSlug_idx" ON "SimulationComparisonRecord"("orgSlug");
CREATE INDEX "SimulationComparisonRecord_orgSlug_comparedAt_idx" ON "SimulationComparisonRecord"("orgSlug", "comparedAt");

-- SimulationRecommendationRecord
CREATE TABLE "SimulationRecommendationRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "scenarioId"      TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "rationale"       TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "priority"        TEXT NOT NULL,
  "confidence"      TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "suggestedOnly"   BOOLEAN NOT NULL DEFAULT true,
  "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulationRecommendationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SimulationRecommendationRecord_orgSlug_idx" ON "SimulationRecommendationRecord"("orgSlug");
CREATE INDEX "SimulationRecommendationRecord_orgSlug_scenarioId_idx" ON "SimulationRecommendationRecord"("orgSlug", "scenarioId");
CREATE INDEX "SimulationRecommendationRecord_orgSlug_priority_idx" ON "SimulationRecommendationRecord"("orgSlug", "priority");

-- SimulationAuditRecord
CREATE TABLE "SimulationAuditRecord" (
  "id"         TEXT NOT NULL,
  "orgSlug"    TEXT NOT NULL,
  "runId"      TEXT NOT NULL,
  "eventType"  TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "SimulationAuditRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SimulationAuditRecord_orgSlug_idx" ON "SimulationAuditRecord"("orgSlug");
CREATE INDEX "SimulationAuditRecord_orgSlug_runId_idx" ON "SimulationAuditRecord"("orgSlug", "runId");
CREATE INDEX "SimulationAuditRecord_orgSlug_occurredAt_idx" ON "SimulationAuditRecord"("orgSlug", "occurredAt");
