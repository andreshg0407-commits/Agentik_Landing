-- Migration: AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
-- Adds MemoryGraphNode and MemoryGraphEdge tables

CREATE TABLE "MemoryGraphNode" (
    "id"        TEXT NOT NULL,
    "orgSlug"   TEXT NOT NULL,
    "nodeType"  TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "metadata"  JSONB NOT NULL DEFAULT '{}',
    "source"    TEXT NOT NULL,
    "tags"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "weight"    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryGraphNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryGraphEdge" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "edgeType"     TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "weight"       DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "label"        TEXT,
    "metadata"     JSONB NOT NULL DEFAULT '{}',
    "source"       TEXT NOT NULL,
    "reasoning"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryGraphEdge_pkey" PRIMARY KEY ("id")
);

-- Indexes for MemoryGraphNode
CREATE INDEX "MemoryGraphNode_orgSlug_idx" ON "MemoryGraphNode"("orgSlug");
CREATE INDEX "MemoryGraphNode_orgSlug_nodeType_idx" ON "MemoryGraphNode"("orgSlug", "nodeType");
CREATE INDEX "MemoryGraphNode_orgSlug_createdAt_idx" ON "MemoryGraphNode"("orgSlug", "createdAt");
CREATE INDEX "MemoryGraphNode_weight_idx" ON "MemoryGraphNode"("weight");

-- Indexes for MemoryGraphEdge
CREATE INDEX "MemoryGraphEdge_orgSlug_idx" ON "MemoryGraphEdge"("orgSlug");
CREATE INDEX "MemoryGraphEdge_orgSlug_edgeType_idx" ON "MemoryGraphEdge"("orgSlug", "edgeType");
CREATE INDEX "MemoryGraphEdge_orgSlug_sourceNodeId_idx" ON "MemoryGraphEdge"("orgSlug", "sourceNodeId");
CREATE INDEX "MemoryGraphEdge_orgSlug_targetNodeId_idx" ON "MemoryGraphEdge"("orgSlug", "targetNodeId");
CREATE INDEX "MemoryGraphEdge_sourceNodeId_targetNodeId_idx" ON "MemoryGraphEdge"("sourceNodeId", "targetNodeId");
CREATE INDEX "MemoryGraphEdge_orgSlug_createdAt_idx" ON "MemoryGraphEdge"("orgSlug", "createdAt");
