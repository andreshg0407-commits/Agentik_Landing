-- AGENTIK-BOARD-INTELLIGENCE-01
-- Migration: Board Intelligence models

CREATE TABLE "BoardSessionRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "topic"           TEXT NOT NULL,
    "outcome"         TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "boardScore"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "governanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "strategicScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"      TEXT NOT NULL DEFAULT 'LOW',
    "riskCount"       INTEGER NOT NULL DEFAULT 0,
    "findingCount"    INTEGER NOT NULL DEFAULT 0,
    "archived"        BOOLEAN NOT NULL DEFAULT false,
    "payload"         JSONB NOT NULL DEFAULT '{}',
    "conductedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardSessionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardSessionRecord_orgSlug_idx" ON "BoardSessionRecord"("orgSlug");
CREATE INDEX "BoardSessionRecord_orgSlug_outcome_idx" ON "BoardSessionRecord"("orgSlug", "outcome");
CREATE INDEX "BoardSessionRecord_orgSlug_conductedAt_idx" ON "BoardSessionRecord"("orgSlug", "conductedAt");

CREATE TABLE "BoardRiskRecord" (
    "id"            TEXT NOT NULL,
    "orgSlug"       TEXT NOT NULL,
    "sessionId"     TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "domain"        TEXT NOT NULL,
    "severity"      TEXT NOT NULL,
    "compositeRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likelihood"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impact"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSystemic"    BOOLEAN NOT NULL DEFAULT false,
    "confidence"    TEXT NOT NULL DEFAULT 'LOW',
    "evidenceIds"   JSONB NOT NULL DEFAULT '[]',
    "metadata"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardRiskRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardRiskRecord_orgSlug_idx" ON "BoardRiskRecord"("orgSlug");
CREATE INDEX "BoardRiskRecord_orgSlug_sessionId_idx" ON "BoardRiskRecord"("orgSlug", "sessionId");
CREATE INDEX "BoardRiskRecord_orgSlug_severity_idx" ON "BoardRiskRecord"("orgSlug", "severity");

CREATE TABLE "BoardFindingRecord" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "domain"      TEXT NOT NULL,
    "priority"    TEXT NOT NULL,
    "isBlocker"   BOOLEAN NOT NULL DEFAULT false,
    "confidence"  TEXT NOT NULL DEFAULT 'LOW',
    "sourceModule" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardFindingRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardFindingRecord_orgSlug_idx" ON "BoardFindingRecord"("orgSlug");
CREATE INDEX "BoardFindingRecord_orgSlug_sessionId_idx" ON "BoardFindingRecord"("orgSlug", "sessionId");
CREATE INDEX "BoardFindingRecord_orgSlug_priority_idx" ON "BoardFindingRecord"("orgSlug", "priority");

CREATE TABLE "BoardRecommendationRecord" (
    "id"            TEXT NOT NULL,
    "orgSlug"       TEXT NOT NULL,
    "sessionId"     TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "domain"        TEXT NOT NULL,
    "priority"      TEXT NOT NULL,
    "confidence"    TEXT NOT NULL DEFAULT 'LOW',
    "impactScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedOnly" BOOLEAN NOT NULL DEFAULT true,
    "evidenceIds"   JSONB NOT NULL DEFAULT '[]',
    "metadata"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardRecommendationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardRecommendationRecord_orgSlug_idx" ON "BoardRecommendationRecord"("orgSlug");
CREATE INDEX "BoardRecommendationRecord_orgSlug_sessionId_idx" ON "BoardRecommendationRecord"("orgSlug", "sessionId");
CREATE INDEX "BoardRecommendationRecord_orgSlug_priority_idx" ON "BoardRecommendationRecord"("orgSlug", "priority");

CREATE TABLE "BoardResolutionRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "sessionId"       TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "outcome"         TEXT NOT NULL,
    "confidence"      TEXT NOT NULL DEFAULT 'LOW',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedOnly"   BOOLEAN NOT NULL DEFAULT true,
    "conditions"      JSONB NOT NULL DEFAULT '[]',
    "limitations"     JSONB NOT NULL DEFAULT '[]',
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "resolvedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardResolutionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardResolutionRecord_orgSlug_idx" ON "BoardResolutionRecord"("orgSlug");
CREATE INDEX "BoardResolutionRecord_orgSlug_sessionId_idx" ON "BoardResolutionRecord"("orgSlug", "sessionId");
CREATE INDEX "BoardResolutionRecord_orgSlug_outcome_idx" ON "BoardResolutionRecord"("orgSlug", "outcome");
