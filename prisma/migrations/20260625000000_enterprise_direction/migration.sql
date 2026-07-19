-- AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 36: Migration
-- Enterprise Direction: 6 models

CREATE TABLE "EnterpriseDirectionRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "overallScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "northStarScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alignmentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"     TEXT NOT NULL DEFAULT 'LOW',
    "limitations"    JSONB NOT NULL DEFAULT '[]',
    "errors"         JSONB NOT NULL DEFAULT '[]',
    "payload"        TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseDirectionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NorthStarRecord" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "statement"   TEXT NOT NULL,
    "horizon"     TEXT NOT NULL,
    "domain"      TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "confidence"  TEXT NOT NULL DEFAULT 'LOW',
    "score"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NorthStarRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectionObjectiveRecord" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "domain"      TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "horizon"     TEXT NOT NULL,
    "priority"    TEXT NOT NULL DEFAULT 'MEDIUM',
    "score"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "northStarId" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectionObjectiveRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectionDeviationRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "domain"         TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "severity"       TEXT NOT NULL DEFAULT 'LOW',
    "deviationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSystemic"     BOOLEAN NOT NULL DEFAULT false,
    "evidenceIds"    JSONB NOT NULL DEFAULT '[]',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectionDeviationRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectionConflictRecord" (
    "id"            TEXT NOT NULL,
    "orgSlug"       TEXT NOT NULL,
    "sessionId"     TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "domain"        TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "severity"      TEXT NOT NULL DEFAULT 'LOW',
    "conflictScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBlocking"    BOOLEAN NOT NULL DEFAULT false,
    "affectedIds"   JSONB NOT NULL DEFAULT '[]',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectionConflictRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectionReportRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "overallScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alignmentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "objectiveCount" INTEGER NOT NULL DEFAULT 0,
    "priorityCount"  INTEGER NOT NULL DEFAULT 0,
    "deviationCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount"  INTEGER NOT NULL DEFAULT 0,
    "confidence"     TEXT NOT NULL DEFAULT 'LOW',
    "limitations"    JSONB NOT NULL DEFAULT '[]',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectionReportRecord_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "EnterpriseDirectionRecord_orgSlug_idx" ON "EnterpriseDirectionRecord"("orgSlug");
CREATE INDEX "EnterpriseDirectionRecord_orgSlug_status_idx" ON "EnterpriseDirectionRecord"("orgSlug", "status");
CREATE INDEX "EnterpriseDirectionRecord_orgSlug_sessionId_idx" ON "EnterpriseDirectionRecord"("orgSlug", "sessionId");

CREATE INDEX "NorthStarRecord_orgSlug_idx" ON "NorthStarRecord"("orgSlug");
CREATE INDEX "NorthStarRecord_orgSlug_sessionId_idx" ON "NorthStarRecord"("orgSlug", "sessionId");

CREATE INDEX "DirectionObjectiveRecord_orgSlug_idx" ON "DirectionObjectiveRecord"("orgSlug");
CREATE INDEX "DirectionObjectiveRecord_orgSlug_sessionId_idx" ON "DirectionObjectiveRecord"("orgSlug", "sessionId");
CREATE INDEX "DirectionObjectiveRecord_orgSlug_priority_idx" ON "DirectionObjectiveRecord"("orgSlug", "priority");

CREATE INDEX "DirectionDeviationRecord_orgSlug_idx" ON "DirectionDeviationRecord"("orgSlug");
CREATE INDEX "DirectionDeviationRecord_orgSlug_sessionId_idx" ON "DirectionDeviationRecord"("orgSlug", "sessionId");
CREATE INDEX "DirectionDeviationRecord_orgSlug_severity_idx" ON "DirectionDeviationRecord"("orgSlug", "severity");

CREATE INDEX "DirectionConflictRecord_orgSlug_idx" ON "DirectionConflictRecord"("orgSlug");
CREATE INDEX "DirectionConflictRecord_orgSlug_sessionId_idx" ON "DirectionConflictRecord"("orgSlug", "sessionId");
CREATE INDEX "DirectionConflictRecord_orgSlug_isBlocking_idx" ON "DirectionConflictRecord"("orgSlug", "isBlocking");

CREATE INDEX "DirectionReportRecord_orgSlug_idx" ON "DirectionReportRecord"("orgSlug");
CREATE INDEX "DirectionReportRecord_orgSlug_sessionId_idx" ON "DirectionReportRecord"("orgSlug", "sessionId");
