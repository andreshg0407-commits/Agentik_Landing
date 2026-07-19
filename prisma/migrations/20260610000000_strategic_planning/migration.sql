-- AGENTIK-STRATEGIC-PLANNING-01 — Phase 27: Strategic Planning Schema Migration

CREATE TABLE "StrategicPlanRecord" (
  "id"            TEXT NOT NULL,
  "orgSlug"       TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "status"        TEXT NOT NULL,
  "priority"      TEXT NOT NULL,
  "planScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "suggestedOnly" BOOLEAN NOT NULL DEFAULT true,
  "objectiveIds"  JSONB NOT NULL DEFAULT '[]',
  "initiativeIds" JSONB NOT NULL DEFAULT '[]',
  "milestoneIds"  JSONB NOT NULL DEFAULT '[]',
  "roadmapId"     TEXT,
  "evidenceIds"   JSONB NOT NULL DEFAULT '[]',
  "limitations"   JSONB NOT NULL DEFAULT '[]',
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicPlanRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategicPlanRecord_orgSlug_idx"          ON "StrategicPlanRecord"("orgSlug");
CREATE INDEX "StrategicPlanRecord_orgSlug_status_idx"   ON "StrategicPlanRecord"("orgSlug", "status");
CREATE INDEX "StrategicPlanRecord_orgSlug_priority_idx" ON "StrategicPlanRecord"("orgSlug", "priority");
CREATE INDEX "StrategicPlanRecord_orgSlug_createdAt_idx" ON "StrategicPlanRecord"("orgSlug", "createdAt");

CREATE TABLE "StrategicObjectiveRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "priority"        TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impactScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "alignmentScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicObjectiveRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategicObjectiveRecord_orgSlug_idx"          ON "StrategicObjectiveRecord"("orgSlug");
CREATE INDEX "StrategicObjectiveRecord_orgSlug_domain_idx"   ON "StrategicObjectiveRecord"("orgSlug", "domain");
CREATE INDEX "StrategicObjectiveRecord_orgSlug_priority_idx" ON "StrategicObjectiveRecord"("orgSlug", "priority");
CREATE INDEX "StrategicObjectiveRecord_orgSlug_status_idx"   ON "StrategicObjectiveRecord"("orgSlug", "status");

CREATE TABLE "StrategicInitiativeRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "objectiveId"     TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "priority"        TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impactScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "effortScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "suggestedOnly"   BOOLEAN NOT NULL DEFAULT true,
  "evidenceIds"     JSONB NOT NULL DEFAULT '[]',
  "playbookIds"     JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicInitiativeRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategicInitiativeRecord_orgSlug_idx"             ON "StrategicInitiativeRecord"("orgSlug");
CREATE INDEX "StrategicInitiativeRecord_orgSlug_objectiveId_idx" ON "StrategicInitiativeRecord"("orgSlug", "objectiveId");
CREATE INDEX "StrategicInitiativeRecord_orgSlug_priority_idx"    ON "StrategicInitiativeRecord"("orgSlug", "priority");
CREATE INDEX "StrategicInitiativeRecord_orgSlug_status_idx"      ON "StrategicInitiativeRecord"("orgSlug", "status");

CREATE TABLE "StrategicMilestoneRecord" (
  "id"              TEXT NOT NULL,
  "orgSlug"         TEXT NOT NULL,
  "initiativeId"    TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "priority"        TEXT NOT NULL,
  "estimatedDate"   TEXT NOT NULL,
  "successCriteria" JSONB NOT NULL DEFAULT '[]',
  "dependencyIds"   JSONB NOT NULL DEFAULT '[]',
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicMilestoneRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategicMilestoneRecord_orgSlug_idx"             ON "StrategicMilestoneRecord"("orgSlug");
CREATE INDEX "StrategicMilestoneRecord_orgSlug_initiativeId_idx" ON "StrategicMilestoneRecord"("orgSlug", "initiativeId");
CREATE INDEX "StrategicMilestoneRecord_orgSlug_status_idx"      ON "StrategicMilestoneRecord"("orgSlug", "status");

CREATE TABLE "StrategicRoadmapRecord" (
  "id"            TEXT NOT NULL,
  "orgSlug"       TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "priority"      TEXT NOT NULL,
  "status"        TEXT NOT NULL,
  "roadmapScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "objectiveIds"  JSONB NOT NULL DEFAULT '[]',
  "initiativeIds" JSONB NOT NULL DEFAULT '[]',
  "milestoneIds"  JSONB NOT NULL DEFAULT '[]',
  "horizon"       TEXT NOT NULL,
  "evidenceIds"   JSONB NOT NULL DEFAULT '[]',
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicRoadmapRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategicRoadmapRecord_orgSlug_idx"          ON "StrategicRoadmapRecord"("orgSlug");
CREATE INDEX "StrategicRoadmapRecord_orgSlug_priority_idx" ON "StrategicRoadmapRecord"("orgSlug", "priority");
CREATE INDEX "StrategicRoadmapRecord_orgSlug_status_idx"   ON "StrategicRoadmapRecord"("orgSlug", "status");
CREATE INDEX "StrategicRoadmapRecord_orgSlug_createdAt_idx" ON "StrategicRoadmapRecord"("orgSlug", "createdAt");
