-- PRODUCTION-EVENT-MODEL-01
-- Universal production event model (ERP-agnostic).

-- CreateTable
CREATE TABLE "ProductionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentNumber" TEXT NOT NULL,
    "sourceRawCode" TEXT NOT NULL DEFAULT '',
    "sourceRawName" TEXT NOT NULL DEFAULT '',
    "productionOrderRef" TEXT,
    "referenceCode" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "line" TEXT,
    "subGroup" TEXT,
    "locationFrom" TEXT,
    "locationTo" TEXT,
    "stageFrom" TEXT,
    "stageTo" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" TEXT NOT NULL DEFAULT 'provisional',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEventLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productionEventId" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "description" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'unidades',
    "sourceLineId" TEXT,
    "variantId" TEXT,
    "productId" TEXT,
    "lineMetadata" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionEventLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (ProductionEvent)
CREATE UNIQUE INDEX "ProductionEvent_organizationId_sourceSystem_sourceDocumentTyp_key" ON "ProductionEvent"("organizationId", "sourceSystem", "sourceDocumentType", "sourceDocumentId");
CREATE INDEX "ProductionEvent_organizationId_eventType_idx" ON "ProductionEvent"("organizationId", "eventType");
CREATE INDEX "ProductionEvent_organizationId_sourceSystem_idx" ON "ProductionEvent"("organizationId", "sourceSystem");
CREATE INDEX "ProductionEvent_organizationId_referenceCode_idx" ON "ProductionEvent"("organizationId", "referenceCode");
CREATE INDEX "ProductionEvent_organizationId_eventDate_idx" ON "ProductionEvent"("organizationId", "eventDate");
CREATE INDEX "ProductionEvent_organizationId_productionOrderRef_idx" ON "ProductionEvent"("organizationId", "productionOrderRef");
CREATE INDEX "ProductionEvent_organizationId_status_idx" ON "ProductionEvent"("organizationId", "status");

-- CreateIndex (ProductionEventLine)
CREATE UNIQUE INDEX "ProductionEventLine_productionEventId_sourceLineId_key" ON "ProductionEventLine"("productionEventId", "sourceLineId");
CREATE INDEX "ProductionEventLine_organizationId_referenceCode_idx" ON "ProductionEventLine"("organizationId", "referenceCode");
CREATE INDEX "ProductionEventLine_organizationId_referenceCode_size_color_idx" ON "ProductionEventLine"("organizationId", "referenceCode", "size", "color");
CREATE INDEX "ProductionEventLine_productionEventId_idx" ON "ProductionEventLine"("productionEventId");

-- AddForeignKey
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEventLine" ADD CONSTRAINT "ProductionEventLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEventLine" ADD CONSTRAINT "ProductionEventLine_productionEventId_fkey" FOREIGN KEY ("productionEventId") REFERENCES "ProductionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
