-- AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
-- CopilotMemory: durable per-tenant strategic memory for the Copilot Intelligence layer.
-- Implements soft delete via deletedAt (NULL = active).
-- tags stored as JSONB for flexible array operations.

-- CreateTable
CREATE TABLE "CopilotMemory" (
    "id"         TEXT          NOT NULL,
    "orgSlug"    TEXT          NOT NULL,
    "type"       TEXT          NOT NULL,
    "scope"      TEXT          NOT NULL,
    "importance" TEXT          NOT NULL,
    "title"      VARCHAR(80)   NOT NULL,
    "content"    TEXT          NOT NULL,
    "tagsJson"   JSONB         NOT NULL DEFAULT '[]',
    "source"     TEXT          NOT NULL,
    "moduleId"   TEXT,
    "agentId"    TEXT,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)  NOT NULL,
    "deletedAt"  TIMESTAMP(3),

    CONSTRAINT "CopilotMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: single-column
CREATE INDEX "CopilotMemory_orgSlug_idx"    ON "CopilotMemory"("orgSlug");
CREATE INDEX "CopilotMemory_deletedAt_idx"  ON "CopilotMemory"("deletedAt");

-- CreateIndex: composite (tenant-scoped lookups)
CREATE INDEX "CopilotMemory_orgSlug_type_idx"       ON "CopilotMemory"("orgSlug", "type");
CREATE INDEX "CopilotMemory_orgSlug_scope_idx"      ON "CopilotMemory"("orgSlug", "scope");
CREATE INDEX "CopilotMemory_orgSlug_importance_idx" ON "CopilotMemory"("orgSlug", "importance");
CREATE INDEX "CopilotMemory_orgSlug_moduleId_idx"   ON "CopilotMemory"("orgSlug", "moduleId");
CREATE INDEX "CopilotMemory_orgSlug_agentId_idx"    ON "CopilotMemory"("orgSlug", "agentId");
