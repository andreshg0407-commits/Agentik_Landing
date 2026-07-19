-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestorType" TEXT NOT NULL,
    "requestorId" TEXT,
    "requestorLabel" TEXT,
    "approverType" TEXT NOT NULL,
    "approverId" TEXT,
    "approverLabel" TEXT,
    "module" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "navigationTarget" TEXT,
    "impactSummary" TEXT,
    "recommendation" TEXT,
    "businessContextJson" JSONB,
    "relationshipsJson" JSONB,
    "auditTrailJson" JSONB,
    "decisionJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Approval_organizationId_idx" ON "Approval"("organizationId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "Approval_priority_idx" ON "Approval"("priority");

-- CreateIndex
CREATE INDEX "Approval_category_idx" ON "Approval"("category");

-- CreateIndex
CREATE INDEX "Approval_source_idx" ON "Approval"("source");

-- CreateIndex
CREATE INDEX "Approval_createdAt_idx" ON "Approval"("createdAt");

-- CreateIndex
CREATE INDEX "Approval_requestorId_idx" ON "Approval"("requestorId");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Approval_module_idx" ON "Approval"("module");

-- CreateIndex
CREATE INDEX "Approval_entityType_entityId_idx" ON "Approval"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
