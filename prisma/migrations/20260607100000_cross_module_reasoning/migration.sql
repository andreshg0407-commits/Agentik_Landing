-- AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
-- Cross-Module Reasoning persistence layer

-- ── ReasoningExecution ────────────────────────────────────────────────────────

CREATE TABLE "ReasoningExecution" (
  "id"                  TEXT          NOT NULL,
  "orgSlug"             TEXT          NOT NULL,
  "status"              TEXT          NOT NULL,
  "confidenceLevel"     TEXT          NOT NULL,
  "confidenceScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "signalCount"         INTEGER       NOT NULL DEFAULT 0,
  "evidenceCount"       INTEGER       NOT NULL DEFAULT 0,
  "hypothesisCount"     INTEGER       NOT NULL DEFAULT 0,
  "riskCount"           INTEGER       NOT NULL DEFAULT 0,
  "opportunityCount"    INTEGER       NOT NULL DEFAULT 0,
  "recommendationCount" INTEGER       NOT NULL DEFAULT 0,
  "narrative"           TEXT          NOT NULL DEFAULT '',
  "durationMs"          INTEGER       NOT NULL DEFAULT 0,
  "chainJson"           JSONB         NOT NULL DEFAULT '{}',
  "metadata"            JSONB         NOT NULL DEFAULT '{}',
  "completedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningExecution_orgSlug_idx"             ON "ReasoningExecution"("orgSlug");
CREATE INDEX "ReasoningExecution_orgSlug_status_idx"      ON "ReasoningExecution"("orgSlug", "status");
CREATE INDEX "ReasoningExecution_orgSlug_completedAt_idx" ON "ReasoningExecution"("orgSlug", "completedAt");

-- ── ReasoningHypothesisRecord ─────────────────────────────────────────────────

CREATE TABLE "ReasoningHypothesisRecord" (
  "id"           TEXT          NOT NULL,
  "orgSlug"      TEXT          NOT NULL,
  "executionId"  TEXT          NOT NULL,
  "category"     TEXT          NOT NULL,
  "title"        TEXT          NOT NULL,
  "explanation"  TEXT          NOT NULL,
  "supported"    BOOLEAN       NOT NULL DEFAULT false,
  "contradicted" BOOLEAN       NOT NULL DEFAULT false,
  "confidence"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceIds"  TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata"     JSONB         NOT NULL DEFAULT '{}',
  "generatedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningHypothesisRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningHypothesisRecord_orgSlug_idx"           ON "ReasoningHypothesisRecord"("orgSlug");
CREATE INDEX "ReasoningHypothesisRecord_orgSlug_execution_idx" ON "ReasoningHypothesisRecord"("orgSlug", "executionId");
CREATE INDEX "ReasoningHypothesisRecord_orgSlug_category_idx"  ON "ReasoningHypothesisRecord"("orgSlug", "category");

-- ── ReasoningEvidenceRecord ───────────────────────────────────────────────────

CREATE TABLE "ReasoningEvidenceRecord" (
  "id"          TEXT          NOT NULL,
  "orgSlug"     TEXT          NOT NULL,
  "executionId" TEXT          NOT NULL,
  "type"        TEXT          NOT NULL,
  "domain"      TEXT          NOT NULL,
  "label"       TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "strength"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceRef"   TEXT          NOT NULL,
  "sourceType"  TEXT          NOT NULL,
  "metadata"    JSONB         NOT NULL DEFAULT '{}',
  "collectedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningEvidenceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningEvidenceRecord_orgSlug_idx"          ON "ReasoningEvidenceRecord"("orgSlug");
CREATE INDEX "ReasoningEvidenceRecord_orgSlug_exec_idx"     ON "ReasoningEvidenceRecord"("orgSlug", "executionId");
CREATE INDEX "ReasoningEvidenceRecord_orgSlug_domain_idx"   ON "ReasoningEvidenceRecord"("orgSlug", "domain");

-- ── ReasoningRiskRecord ───────────────────────────────────────────────────────

CREATE TABLE "ReasoningRiskRecord" (
  "id"          TEXT          NOT NULL,
  "orgSlug"     TEXT          NOT NULL,
  "executionId" TEXT          NOT NULL,
  "domain"      TEXT          NOT NULL,
  "title"       TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "severity"    TEXT          NOT NULL,
  "likelihood"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impact"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceIds" TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata"    JSONB         NOT NULL DEFAULT '{}',
  "detectedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningRiskRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningRiskRecord_orgSlug_idx"          ON "ReasoningRiskRecord"("orgSlug");
CREATE INDEX "ReasoningRiskRecord_orgSlug_exec_idx"     ON "ReasoningRiskRecord"("orgSlug", "executionId");
CREATE INDEX "ReasoningRiskRecord_orgSlug_severity_idx" ON "ReasoningRiskRecord"("orgSlug", "severity");

-- ── ReasoningOpportunityRecord ────────────────────────────────────────────────

CREATE TABLE "ReasoningOpportunityRecord" (
  "id"          TEXT          NOT NULL,
  "orgSlug"     TEXT          NOT NULL,
  "executionId" TEXT          NOT NULL,
  "type"        TEXT          NOT NULL,
  "title"       TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "urgency"     TEXT          NOT NULL,
  "potential"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceIds" TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata"    JSONB         NOT NULL DEFAULT '{}',
  "detectedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningOpportunityRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningOpportunityRecord_orgSlug_idx"       ON "ReasoningOpportunityRecord"("orgSlug");
CREATE INDEX "ReasoningOpportunityRecord_orgSlug_exec_idx"  ON "ReasoningOpportunityRecord"("orgSlug", "executionId");
CREATE INDEX "ReasoningOpportunityRecord_orgSlug_type_idx"  ON "ReasoningOpportunityRecord"("orgSlug", "type");

-- ── ReasoningRecommendationRecord ─────────────────────────────────────────────

CREATE TABLE "ReasoningRecommendationRecord" (
  "id"             TEXT          NOT NULL,
  "orgSlug"        TEXT          NOT NULL,
  "executionId"    TEXT          NOT NULL,
  "type"           TEXT          NOT NULL,
  "priority"       TEXT          NOT NULL,
  "title"          TEXT          NOT NULL,
  "description"    TEXT          NOT NULL,
  "rationale"      TEXT          NOT NULL,
  "hypothesisId"   TEXT,
  "evidenceIds"    TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata"       JSONB         NOT NULL DEFAULT '{}',
  "generatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReasoningRecommendationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasoningRecommendationRecord_orgSlug_idx"          ON "ReasoningRecommendationRecord"("orgSlug");
CREATE INDEX "ReasoningRecommendationRecord_orgSlug_exec_idx"     ON "ReasoningRecommendationRecord"("orgSlug", "executionId");
CREATE INDEX "ReasoningRecommendationRecord_orgSlug_priority_idx" ON "ReasoningRecommendationRecord"("orgSlug", "priority");
