-- Migration: add_task_model
-- Sprint: AGENTIK-TASK-PERSISTENCE-01
-- Creates the Task table with all domain fields and indexes.

CREATE TABLE "Task" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "draftId"         TEXT,
    "title"           TEXT NOT NULL,
    "description"     TEXT,
    "priority"        TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'open',
    "source"          TEXT NOT NULL,
    "category"        TEXT NOT NULL DEFAULT 'general',
    "visibility"      TEXT NOT NULL DEFAULT 'organization',
    "ownerType"       TEXT NOT NULL,
    "ownerId"         TEXT NOT NULL,
    "ownerLabel"      TEXT NOT NULL,
    "assignedType"    TEXT,
    "assignedId"      TEXT,
    "assignedLabel"   TEXT,
    "module"          TEXT,
    "entityType"      TEXT,
    "entityId"        TEXT,
    "dueAt"           TIMESTAMP(3),
    "metadataJson"    JSONB,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "completedAt"     TIMESTAMP(3),
    "cancelledAt"     TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- Foreign key to Organization
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Task_organizationId_idx"          ON "Task"("organizationId");
CREATE INDEX "Task_status_idx"                  ON "Task"("status");
CREATE INDEX "Task_priority_idx"                ON "Task"("priority");
CREATE INDEX "Task_source_idx"                  ON "Task"("source");
CREATE INDEX "Task_category_idx"               ON "Task"("category");
CREATE INDEX "Task_createdAt_idx"               ON "Task"("createdAt");
CREATE INDEX "Task_ownerId_idx"                 ON "Task"("ownerId");
CREATE INDEX "Task_assignedId_idx"              ON "Task"("assignedId");
CREATE INDEX "Task_module_idx"                  ON "Task"("module");
CREATE INDEX "Task_entityId_idx"                ON "Task"("entityId");
CREATE INDEX "Task_organizationId_status_idx"   ON "Task"("organizationId", "status");
CREATE INDEX "Task_organizationId_priority_idx" ON "Task"("organizationId", "priority");
CREATE INDEX "Task_organizationId_createdAt_idx" ON "Task"("organizationId", "createdAt");
