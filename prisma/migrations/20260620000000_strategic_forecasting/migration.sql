-- AGENTIK-STRATEGIC-FORECASTING-01 — Migration: Strategic Forecasting Models

CREATE TABLE "StrategicForecastRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "horizon"         TEXT NOT NULL,
  "domain"          TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
  "forecastScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidenceLevel" TEXT NOT NULL DEFAULT 'INSUFFICIENT',
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reportJson"      JSONB NOT NULL DEFAULT '{}',
  "limitations"     JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicForecastRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastScenarioRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "sessionId"       TEXT NOT NULL,
  "forecastId"      TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "probability"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outcome"         TEXT NOT NULL DEFAULT 'UNCERTAIN',
  "horizon"         TEXT NOT NULL,
  "domain"          TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "limitations"     JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastScenarioRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastSignalRecord" (
  "id"          TEXT NOT NULL,
  "orgSlug"     TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "forecastId"  TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "intensity"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "horizon"     TEXT NOT NULL,
  "domain"      TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
  "isWeak"      BOOLEAN NOT NULL DEFAULT false,
  "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastSignalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastTrajectoryRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "sessionId"       TEXT NOT NULL,
  "forecastId"      TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "direction"       TEXT NOT NULL,
  "startingScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "projectedScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "horizon"         TEXT NOT NULL,
  "domain"          TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastTrajectoryRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastReportRecord" (
  "id"               TEXT NOT NULL,
  "orgSlug"          TEXT NOT NULL,
  "sessionId"        TEXT NOT NULL,
  "forecastId"       TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "forecastScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidenceScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "scenarioCount"    INTEGER NOT NULL DEFAULT 0,
  "riskCount"        INTEGER NOT NULL DEFAULT 0,
  "opportunityCount" INTEGER NOT NULL DEFAULT 0,
  "limitations"      JSONB NOT NULL DEFAULT '[]',
  "metadata"         JSONB NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastReportRecord_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "StrategicForecastRecord_orgSlug_idx" ON "StrategicForecastRecord"("orgSlug");
CREATE INDEX "StrategicForecastRecord_orgSlug_status_idx" ON "StrategicForecastRecord"("orgSlug", "status");
CREATE INDEX "StrategicForecastRecord_orgSlug_horizon_idx" ON "StrategicForecastRecord"("orgSlug", "horizon");
CREATE INDEX "ForecastScenarioRecord_orgSlug_idx" ON "ForecastScenarioRecord"("orgSlug");
CREATE INDEX "ForecastScenarioRecord_orgSlug_forecastId_idx" ON "ForecastScenarioRecord"("orgSlug", "forecastId");
CREATE INDEX "ForecastScenarioRecord_orgSlug_type_idx" ON "ForecastScenarioRecord"("orgSlug", "type");
CREATE INDEX "ForecastSignalRecord_orgSlug_idx" ON "ForecastSignalRecord"("orgSlug");
CREATE INDEX "ForecastSignalRecord_orgSlug_forecastId_idx" ON "ForecastSignalRecord"("orgSlug", "forecastId");
CREATE INDEX "ForecastSignalRecord_orgSlug_type_idx" ON "ForecastSignalRecord"("orgSlug", "type");
CREATE INDEX "ForecastTrajectoryRecord_orgSlug_idx" ON "ForecastTrajectoryRecord"("orgSlug");
CREATE INDEX "ForecastTrajectoryRecord_orgSlug_forecastId_idx" ON "ForecastTrajectoryRecord"("orgSlug", "forecastId");
CREATE INDEX "ForecastReportRecord_orgSlug_idx" ON "ForecastReportRecord"("orgSlug");
CREATE INDEX "ForecastReportRecord_orgSlug_forecastId_idx" ON "ForecastReportRecord"("orgSlug", "forecastId");
