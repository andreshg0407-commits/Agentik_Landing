-- MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01
-- Maleta replenishment plans, items, and traceability events.

-- Plan
CREATE TABLE "MaletaReplenishmentPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "warehouseCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "documentNumber" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "summaryAddedRefs" INTEGER NOT NULL DEFAULT 0,
    "summaryRemovedRefs" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaletaReplenishmentPlan_pkey" PRIMARY KEY ("id")
);

-- Item
CREATE TABLE "MaletaReplenishmentItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subgroupSag" TEXT NOT NULL,
    "removedReference" TEXT,
    "removedDescription" TEXT,
    "addedReference" TEXT NOT NULL,
    "addedDescription" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaletaReplenishmentItem_pkey" PRIMARY KEY ("id")
);

-- Event
CREATE TABLE "MaletaReplenishmentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaletaReplenishmentEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes: Plan
CREATE INDEX "MaletaReplenishmentPlan_organizationId_vendorId_idx" ON "MaletaReplenishmentPlan"("organizationId", "vendorId");
CREATE INDEX "MaletaReplenishmentPlan_organizationId_status_idx" ON "MaletaReplenishmentPlan"("organizationId", "status");
CREATE INDEX "MaletaReplenishmentPlan_organizationId_documentNumber_idx" ON "MaletaReplenishmentPlan"("organizationId", "documentNumber");
CREATE INDEX "MaletaReplenishmentPlan_organizationId_createdAt_idx" ON "MaletaReplenishmentPlan"("organizationId", "createdAt");
CREATE INDEX "MaletaReplenishmentPlan_vendorId_idx" ON "MaletaReplenishmentPlan"("vendorId");

-- Indexes: Item
CREATE INDEX "MaletaReplenishmentItem_planId_idx" ON "MaletaReplenishmentItem"("planId");
CREATE INDEX "MaletaReplenishmentItem_organizationId_subgroupSag_idx" ON "MaletaReplenishmentItem"("organizationId", "subgroupSag");
CREATE INDEX "MaletaReplenishmentItem_organizationId_addedReference_idx" ON "MaletaReplenishmentItem"("organizationId", "addedReference");
CREATE INDEX "MaletaReplenishmentItem_organizationId_removedReference_idx" ON "MaletaReplenishmentItem"("organizationId", "removedReference");

-- Indexes: Event
CREATE INDEX "MaletaReplenishmentEvent_planId_idx" ON "MaletaReplenishmentEvent"("planId");
CREATE INDEX "MaletaReplenishmentEvent_organizationId_createdAt_idx" ON "MaletaReplenishmentEvent"("organizationId", "createdAt");

-- Foreign keys: Plan
ALTER TABLE "MaletaReplenishmentPlan" ADD CONSTRAINT "MaletaReplenishmentPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: Item
ALTER TABLE "MaletaReplenishmentItem" ADD CONSTRAINT "MaletaReplenishmentItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaletaReplenishmentItem" ADD CONSTRAINT "MaletaReplenishmentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaletaReplenishmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: Event
ALTER TABLE "MaletaReplenishmentEvent" ADD CONSTRAINT "MaletaReplenishmentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaletaReplenishmentEvent" ADD CONSTRAINT "MaletaReplenishmentEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaletaReplenishmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
