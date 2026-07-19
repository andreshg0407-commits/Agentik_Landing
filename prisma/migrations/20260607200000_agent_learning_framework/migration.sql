-- AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
-- Agent Learning Framework persistence layer

-- ── LearningEventRecord ───────────────────────────────────────────────────────

CREATE TABLE "LearningEventRecord" (
  "id"              TEXT          NOT NULL,
  "orgSlug"         TEXT          NOT NULL,
  "type"            TEXT          NOT NULL,
  "source"          TEXT          NOT NULL,
  "domain"          TEXT          NOT NULL,
  "referenceId"     TEXT          NOT NULL,
  "referenceType"   TEXT          NOT NULL,
  "confidence"      TEXT          NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "agentId"         TEXT,
  "userId"          TEXT,
  "metadata"        JSONB         NOT NULL DEFAULT '{}',
  "occurredAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningEventRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearningEventRecord_orgSlug_idx"           ON "LearningEventRecord"("orgSlug");
CREATE INDEX "LearningEventRecord_orgSlug_type_idx"      ON "LearningEventRecord"("orgSlug", "type");
CREATE INDEX "LearningEventRecord_orgSlug_domain_idx"    ON "LearningEventRecord"("orgSlug", "domain");
CREATE INDEX "LearningEventRecord_orgSlug_occurred_idx"  ON "LearningEventRecord"("orgSlug", "occurredAt");

-- ── LearningPatternRecord ─────────────────────────────────────────────────────

CREATE TABLE "LearningPatternRecord" (
  "id"                 TEXT          NOT NULL,
  "orgSlug"            TEXT          NOT NULL,
  "domain"             TEXT          NOT NULL,
  "name"               TEXT          NOT NULL,
  "description"        TEXT          NOT NULL,
  "status"             TEXT          NOT NULL,
  "reinforcementCount" INTEGER       NOT NULL DEFAULT 0,
  "weakeningCount"     INTEGER       NOT NULL DEFAULT 0,
  "netScore"           INTEGER       NOT NULL DEFAULT 0,
  "confidenceScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceEventIds"   TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "agentId"            TEXT,
  "metadata"           JSONB         NOT NULL DEFAULT '{}',
  "firstSeenAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningPatternRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearningPatternRecord_orgSlug_idx"        ON "LearningPatternRecord"("orgSlug");
CREATE INDEX "LearningPatternRecord_orgSlug_domain_idx" ON "LearningPatternRecord"("orgSlug", "domain");
CREATE INDEX "LearningPatternRecord_orgSlug_status_idx" ON "LearningPatternRecord"("orgSlug", "status");

-- ── LearningOutcomeRecord ─────────────────────────────────────────────────────

CREATE TABLE "LearningOutcomeRecord" (
  "id"          TEXT          NOT NULL,
  "orgSlug"     TEXT          NOT NULL,
  "eventId"     TEXT          NOT NULL,
  "patternId"   TEXT,
  "result"      TEXT          NOT NULL,
  "domain"      TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata"    JSONB         NOT NULL DEFAULT '{}',
  "evaluatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningOutcomeRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearningOutcomeRecord_orgSlug_idx"        ON "LearningOutcomeRecord"("orgSlug");
CREATE INDEX "LearningOutcomeRecord_orgSlug_event_idx"  ON "LearningOutcomeRecord"("orgSlug", "eventId");
CREATE INDEX "LearningOutcomeRecord_orgSlug_result_idx" ON "LearningOutcomeRecord"("orgSlug", "result");

-- ── LearningAdjustmentRecord ──────────────────────────────────────────────────

CREATE TABLE "LearningAdjustmentRecord" (
  "id"          TEXT          NOT NULL,
  "orgSlug"     TEXT          NOT NULL,
  "patternId"   TEXT          NOT NULL,
  "domain"      TEXT          NOT NULL,
  "direction"   TEXT          NOT NULL,
  "magnitude"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rationale"   TEXT          NOT NULL,
  "applied"     BOOLEAN       NOT NULL DEFAULT false,
  "appliedAt"   TIMESTAMP(3),
  "metadata"    JSONB         NOT NULL DEFAULT '{}',
  "suggestedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningAdjustmentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearningAdjustmentRecord_orgSlug_idx"         ON "LearningAdjustmentRecord"("orgSlug");
CREATE INDEX "LearningAdjustmentRecord_orgSlug_pattern_idx" ON "LearningAdjustmentRecord"("orgSlug", "patternId");
CREATE INDEX "LearningAdjustmentRecord_orgSlug_applied_idx" ON "LearningAdjustmentRecord"("orgSlug", "applied");

-- ── AgentLearningProfileRecord ────────────────────────────────────────────────

CREATE TABLE "AgentLearningProfileRecord" (
  "id"               TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "agentId"          TEXT          NOT NULL,
  "orgSlug"          TEXT          NOT NULL,
  "displayName"      TEXT          NOT NULL,
  "domains"          TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "totalEvents"      INTEGER       NOT NULL DEFAULT 0,
  "positiveOutcomes" INTEGER       NOT NULL DEFAULT 0,
  "negativeOutcomes" INTEGER       NOT NULL DEFAULT 0,
  "activePatterns"   INTEGER       NOT NULL DEFAULT 0,
  "confidenceScore"  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastLearningAt"   TIMESTAMP(3),
  "metadata"         JSONB         NOT NULL DEFAULT '{}',
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentLearningProfileRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentLearningProfileRecord_agentId_orgSlug_key" ON "AgentLearningProfileRecord"("agentId", "orgSlug");
CREATE INDEX "AgentLearningProfileRecord_orgSlug_idx"       ON "AgentLearningProfileRecord"("orgSlug");
CREATE INDEX "AgentLearningProfileRecord_orgSlug_agent_idx" ON "AgentLearningProfileRecord"("orgSlug", "agentId");

-- ── TenantLearningProfileRecord ───────────────────────────────────────────────

CREATE TABLE "TenantLearningProfileRecord" (
  "id"              TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "orgSlug"         TEXT          NOT NULL,
  "riskTolerance"   TEXT          NOT NULL DEFAULT 'MEDIUM',
  "decisionStyle"   TEXT          NOT NULL DEFAULT 'BALANCED',
  "learningMaturity" TEXT         NOT NULL DEFAULT 'EARLY',
  "totalEvents"     INTEGER       NOT NULL DEFAULT 0,
  "totalPatterns"   INTEGER       NOT NULL DEFAULT 0,
  "activeDomains"   TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastLearningAt"  TIMESTAMP(3),
  "metadata"        JSONB         NOT NULL DEFAULT '{}',
  "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantLearningProfileRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantLearningProfileRecord_orgSlug_key" ON "TenantLearningProfileRecord"("orgSlug");
CREATE INDEX "TenantLearningProfileRecord_orgSlug_idx" ON "TenantLearningProfileRecord"("orgSlug");
