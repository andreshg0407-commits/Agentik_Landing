-- AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 33: Prisma Migration
-- CreateTable ExecutiveCouncilSessionRecord

CREATE TABLE "ExecutiveCouncilSessionRecord" (
    "id"               TEXT NOT NULL,
    "orgSlug"          TEXT NOT NULL,
    "title"            TEXT NOT NULL,
    "topic"            TEXT NOT NULL,
    "perspectives"     TEXT[],
    "opinionIds"       JSONB NOT NULL DEFAULT '[]',
    "recommendationIds" JSONB NOT NULL DEFAULT '[]',
    "disagreementIds"  JSONB NOT NULL DEFAULT '[]',
    "consensusId"      TEXT,
    "resolutionId"     TEXT,
    "sessionScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outcome"          TEXT NOT NULL,
    "limitations"      JSONB NOT NULL DEFAULT '[]',
    "metadata"         JSONB NOT NULL DEFAULT '{}',
    "conductedAt"      TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveCouncilSessionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveCouncilSessionRecord_orgSlug_idx" ON "ExecutiveCouncilSessionRecord"("orgSlug");
CREATE INDEX "ExecutiveCouncilSessionRecord_orgSlug_outcome_idx" ON "ExecutiveCouncilSessionRecord"("orgSlug", "outcome");
CREATE INDEX "ExecutiveCouncilSessionRecord_orgSlug_sessionScore_idx" ON "ExecutiveCouncilSessionRecord"("orgSlug", "sessionScore");
CREATE INDEX "ExecutiveCouncilSessionRecord_orgSlug_conductedAt_idx" ON "ExecutiveCouncilSessionRecord"("orgSlug", "conductedAt");

-- CreateTable ExecutiveCouncilOpinionRecord

CREATE TABLE "ExecutiveCouncilOpinionRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "sessionId"       TEXT NOT NULL,
    "perspective"     TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "stance"          TEXT NOT NULL,
    "rationale"       TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority"        TEXT NOT NULL,
    "arguments"       JSONB NOT NULL DEFAULT '[]',
    "findings"        JSONB NOT NULL DEFAULT '[]',
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "generatedAt"     TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveCouncilOpinionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveCouncilOpinionRecord_orgSlug_idx" ON "ExecutiveCouncilOpinionRecord"("orgSlug");
CREATE INDEX "ExecutiveCouncilOpinionRecord_orgSlug_sessionId_idx" ON "ExecutiveCouncilOpinionRecord"("orgSlug", "sessionId");
CREATE INDEX "ExecutiveCouncilOpinionRecord_orgSlug_perspective_idx" ON "ExecutiveCouncilOpinionRecord"("orgSlug", "perspective");

-- CreateTable ExecutiveCouncilConsensusRecord

CREATE TABLE "ExecutiveCouncilConsensusRecord" (
    "id"                     TEXT NOT NULL,
    "orgSlug"                TEXT NOT NULL,
    "sessionId"              TEXT NOT NULL,
    "outcome"                TEXT NOT NULL,
    "title"                  TEXT NOT NULL,
    "summary"                TEXT NOT NULL,
    "votes"                  JSONB NOT NULL DEFAULT '[]',
    "agreementScore"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"             TEXT NOT NULL,
    "dominantPerspective"    TEXT NOT NULL,
    "supportingPerspectives" JSONB NOT NULL DEFAULT '[]',
    "opposingPerspectives"   JSONB NOT NULL DEFAULT '[]',
    "limitations"            JSONB NOT NULL DEFAULT '[]',
    "metadata"               JSONB NOT NULL DEFAULT '{}',
    "reachedAt"              TEXT NOT NULL,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveCouncilConsensusRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveCouncilConsensusRecord_orgSlug_idx" ON "ExecutiveCouncilConsensusRecord"("orgSlug");
CREATE INDEX "ExecutiveCouncilConsensusRecord_orgSlug_sessionId_idx" ON "ExecutiveCouncilConsensusRecord"("orgSlug", "sessionId");
CREATE INDEX "ExecutiveCouncilConsensusRecord_orgSlug_outcome_idx" ON "ExecutiveCouncilConsensusRecord"("orgSlug", "outcome");

-- CreateTable ExecutiveCouncilResolutionRecord

CREATE TABLE "ExecutiveCouncilResolutionRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "sessionId"       TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "outcome"         TEXT NOT NULL,
    "recommendationIds" JSONB NOT NULL DEFAULT '[]',
    "consensusId"     TEXT,
    "disagreementIds" JSONB NOT NULL DEFAULT '[]',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"      TEXT NOT NULL,
    "limitations"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "resolvedAt"      TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveCouncilResolutionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveCouncilResolutionRecord_orgSlug_idx" ON "ExecutiveCouncilResolutionRecord"("orgSlug");
CREATE INDEX "ExecutiveCouncilResolutionRecord_orgSlug_sessionId_idx" ON "ExecutiveCouncilResolutionRecord"("orgSlug", "sessionId");
CREATE INDEX "ExecutiveCouncilResolutionRecord_orgSlug_outcome_idx" ON "ExecutiveCouncilResolutionRecord"("orgSlug", "outcome");

-- CreateTable ExecutiveCouncilRecommendationRecord

CREATE TABLE "ExecutiveCouncilRecommendationRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "sessionId"       TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "rationale"       TEXT NOT NULL,
    "perspective"     TEXT NOT NULL,
    "priority"        TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impactScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedOnly"   BOOLEAN NOT NULL DEFAULT true,
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveCouncilRecommendationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveCouncilRecommendationRecord_orgSlug_idx" ON "ExecutiveCouncilRecommendationRecord"("orgSlug");
CREATE INDEX "ExecutiveCouncilRecommendationRecord_orgSlug_sessionId_idx" ON "ExecutiveCouncilRecommendationRecord"("orgSlug", "sessionId");
CREATE INDEX "ExecutiveCouncilRecommendationRecord_orgSlug_priority_idx" ON "ExecutiveCouncilRecommendationRecord"("orgSlug", "priority");
CREATE INDEX "ExecutiveCouncilRecommendationRecord_orgSlug_perspective_idx" ON "ExecutiveCouncilRecommendationRecord"("orgSlug", "perspective");
