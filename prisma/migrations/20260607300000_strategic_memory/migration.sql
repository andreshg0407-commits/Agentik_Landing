-- AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
-- Strategic Memory Layer: StrategicMemoryRecord, StrategicRelationRecord, StrategicSnapshotRecord

-- StrategicMemoryRecord
CREATE TABLE IF NOT EXISTS "StrategicMemoryRecord" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "orgSlug"        TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "priority"       TEXT NOT NULL DEFAULT 'MEDIUM',
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
  "confidence"     TEXT NOT NULL DEFAULT 'MEDIUM',
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "domain"         TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
  "title"          TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "rationale"      TEXT NOT NULL,
  "evidenceIds"    TEXT[] NOT NULL DEFAULT '{}',
  "relatedIds"     TEXT[] NOT NULL DEFAULT '{}',
  "source"         TEXT NOT NULL DEFAULT 'USER_INPUT',
  "agentId"        TEXT,
  "userId"         TEXT,
  "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "strategicScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "validUntil"     TIMESTAMP(3),
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_idx" ON "StrategicMemoryRecord"("orgSlug");
CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_type_idx" ON "StrategicMemoryRecord"("orgSlug","type");
CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_status_idx" ON "StrategicMemoryRecord"("orgSlug","status");
CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_priority_idx" ON "StrategicMemoryRecord"("orgSlug","priority");
CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_domain_idx" ON "StrategicMemoryRecord"("orgSlug","domain");
CREATE INDEX IF NOT EXISTS "StrategicMemoryRecord_orgSlug_status_priority_idx" ON "StrategicMemoryRecord"("orgSlug","status","priority");

-- StrategicRelationRecord
CREATE TABLE IF NOT EXISTS "StrategicRelationRecord" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "orgSlug"   TEXT NOT NULL,
  "sourceId"  TEXT NOT NULL,
  "targetId"  TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "rationale" TEXT,
  "strength"  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "metadata"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "StrategicRelationRecord_orgSlug_sourceId_targetId_type_key"
  ON "StrategicRelationRecord"("orgSlug","sourceId","targetId","type");
CREATE INDEX IF NOT EXISTS "StrategicRelationRecord_orgSlug_idx" ON "StrategicRelationRecord"("orgSlug");
CREATE INDEX IF NOT EXISTS "StrategicRelationRecord_orgSlug_sourceId_idx" ON "StrategicRelationRecord"("orgSlug","sourceId");
CREATE INDEX IF NOT EXISTS "StrategicRelationRecord_orgSlug_targetId_idx" ON "StrategicRelationRecord"("orgSlug","targetId");

-- StrategicSnapshotRecord
CREATE TABLE IF NOT EXISTS "StrategicSnapshotRecord" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "orgSlug"        TEXT NOT NULL,
  "period"         TEXT NOT NULL DEFAULT 'ADHOC',
  "strategicScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "activeItems"    INTEGER NOT NULL DEFAULT 0,
  "criticalItems"  INTEGER NOT NULL DEFAULT 0,
  "totalItems"     INTEGER NOT NULL DEFAULT 0,
  "narrative"      TEXT NOT NULL,
  "insights"       TEXT[] NOT NULL DEFAULT '{}',
  "topItems"       JSONB NOT NULL DEFAULT '[]',
  "goalIds"        TEXT[] NOT NULL DEFAULT '{}',
  "riskIds"        TEXT[] NOT NULL DEFAULT '{}',
  "decisionIds"    TEXT[] NOT NULL DEFAULT '{}',
  "commitmentIds"  TEXT[] NOT NULL DEFAULT '{}',
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StrategicSnapshotRecord_orgSlug_idx" ON "StrategicSnapshotRecord"("orgSlug");
CREATE INDEX IF NOT EXISTS "StrategicSnapshotRecord_orgSlug_period_idx" ON "StrategicSnapshotRecord"("orgSlug","period");
CREATE INDEX IF NOT EXISTS "StrategicSnapshotRecord_orgSlug_createdAt_idx" ON "StrategicSnapshotRecord"("orgSlug","createdAt");
