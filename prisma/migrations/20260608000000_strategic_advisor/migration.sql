-- AGENTIK-STRATEGIC-ADVISOR-01 — Phase 27: Prisma Migration
-- Strategic Advisor persistence models

-- StrategicAdviceRecord
CREATE TABLE "StrategicAdviceRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "summary"         TEXT NOT NULL,
    "domain"          TEXT NOT NULL,
    "priority"        TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "traceable"       BOOLEAN NOT NULL DEFAULT true,
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "generatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicAdviceRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicAdviceRecord_orgSlug_idx" ON "StrategicAdviceRecord"("orgSlug");
CREATE INDEX "StrategicAdviceRecord_orgSlug_generatedAt_idx" ON "StrategicAdviceRecord"("orgSlug", "generatedAt");
CREATE INDEX "StrategicAdviceRecord_orgSlug_domain_idx" ON "StrategicAdviceRecord"("orgSlug", "domain");

-- StrategicConcernRecord
CREATE TABLE "StrategicConcernRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "domain"          TEXT NOT NULL,
    "severity"        TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isEmergent"      BOOLEAN NOT NULL DEFAULT false,
    "isLatent"        BOOLEAN NOT NULL DEFAULT false,
    "rationale"       TEXT NOT NULL,
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "detectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicConcernRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicConcernRecord_orgSlug_idx" ON "StrategicConcernRecord"("orgSlug");
CREATE INDEX "StrategicConcernRecord_orgSlug_detectedAt_idx" ON "StrategicConcernRecord"("orgSlug", "detectedAt");
CREATE INDEX "StrategicConcernRecord_orgSlug_severity_idx" ON "StrategicConcernRecord"("orgSlug", "severity");

-- StrategicOpportunityRecord
CREATE TABLE "StrategicOpportunityRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "domain"          TEXT NOT NULL,
    "magnitude"       TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "captureScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeHorizon"     TEXT NOT NULL,
    "isIgnored"       BOOLEAN NOT NULL DEFAULT false,
    "rationale"       TEXT NOT NULL,
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicOpportunityRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicOpportunityRecord_orgSlug_idx" ON "StrategicOpportunityRecord"("orgSlug");
CREATE INDEX "StrategicOpportunityRecord_orgSlug_createdAt_idx" ON "StrategicOpportunityRecord"("orgSlug", "createdAt");
CREATE INDEX "StrategicOpportunityRecord_orgSlug_domain_idx" ON "StrategicOpportunityRecord"("orgSlug", "domain");

-- StrategicQuestionRecord
CREATE TABLE "StrategicQuestionRecord" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "question"    TEXT NOT NULL,
    "rationale"   TEXT NOT NULL,
    "domain"      TEXT NOT NULL,
    "priority"    TEXT NOT NULL,
    "confidence"  TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicQuestionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicQuestionRecord_orgSlug_idx" ON "StrategicQuestionRecord"("orgSlug");
CREATE INDEX "StrategicQuestionRecord_orgSlug_createdAt_idx" ON "StrategicQuestionRecord"("orgSlug", "createdAt");
CREATE INDEX "StrategicQuestionRecord_orgSlug_domain_idx" ON "StrategicQuestionRecord"("orgSlug", "domain");

-- StrategicRecommendationRecord
CREATE TABLE "StrategicRecommendationRecord" (
    "id"              TEXT NOT NULL,
    "orgSlug"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "rationale"       TEXT NOT NULL,
    "domain"          TEXT NOT NULL,
    "priority"        TEXT NOT NULL,
    "confidence"      TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedImpact"  TEXT NOT NULL,
    "associatedRisks" JSONB NOT NULL DEFAULT '[]',
    "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
    "playbookIds"     JSONB NOT NULL DEFAULT '[]',
    "metadata"        JSONB NOT NULL DEFAULT '{}',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicRecommendationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicRecommendationRecord_orgSlug_idx" ON "StrategicRecommendationRecord"("orgSlug");
CREATE INDEX "StrategicRecommendationRecord_orgSlug_createdAt_idx" ON "StrategicRecommendationRecord"("orgSlug", "createdAt");
CREATE INDEX "StrategicRecommendationRecord_orgSlug_priority_idx" ON "StrategicRecommendationRecord"("orgSlug", "priority");

-- StrategicAdvisorBriefingRecord
CREATE TABLE "StrategicAdvisorBriefingRecord" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "summary"      TEXT NOT NULL,
    "headline"     TEXT NOT NULL,
    "advisorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"   TEXT NOT NULL,
    "metadata"     JSONB NOT NULL DEFAULT '{}',
    "generatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicAdvisorBriefingRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicAdvisorBriefingRecord_orgSlug_idx" ON "StrategicAdvisorBriefingRecord"("orgSlug");
CREATE INDEX "StrategicAdvisorBriefingRecord_orgSlug_type_idx" ON "StrategicAdvisorBriefingRecord"("orgSlug", "type");
CREATE INDEX "StrategicAdvisorBriefingRecord_orgSlug_generatedAt_idx" ON "StrategicAdvisorBriefingRecord"("orgSlug", "generatedAt");

-- StrategicAdvisorDigestRecord
CREATE TABLE "StrategicAdvisorDigestRecord" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "period"       TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "headline"     TEXT NOT NULL,
    "advisorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"   TEXT NOT NULL,
    "metadata"     JSONB NOT NULL DEFAULT '{}',
    "generatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategicAdvisorDigestRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrategicAdvisorDigestRecord_orgSlug_idx" ON "StrategicAdvisorDigestRecord"("orgSlug");
CREATE INDEX "StrategicAdvisorDigestRecord_orgSlug_period_idx" ON "StrategicAdvisorDigestRecord"("orgSlug", "period");
CREATE INDEX "StrategicAdvisorDigestRecord_orgSlug_generatedAt_idx" ON "StrategicAdvisorDigestRecord"("orgSlug", "generatedAt");
