-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'PYA';

-- CreateTable
CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "category" TEXT,
    "price" DECIMAL(18,4),
    "currency" TEXT DEFAULT 'USD',
    "status" TEXT,
    "imageUrl" TEXT,
    "payloadJson" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT,
    "totalAmount" DECIMAL(18,4),
    "currency" TEXT DEFAULT 'USD',
    "customerId" TEXT,
    "customerName" TEXT,
    "orderedAt" TIMESTAMP(3),
    "payloadJson" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSnapshot_organizationId_sourceSystem_idx" ON "ProductSnapshot"("organizationId", "sourceSystem");

-- CreateIndex
CREATE INDEX "ProductSnapshot_workspaceId_idx" ON "ProductSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "ProductSnapshot_status_idx" ON "ProductSnapshot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSnapshot_organizationId_sourceSystem_sourceId_key" ON "ProductSnapshot"("organizationId", "sourceSystem", "sourceId");

-- CreateIndex
CREATE INDEX "OrderSnapshot_organizationId_sourceSystem_idx" ON "OrderSnapshot"("organizationId", "sourceSystem");

-- CreateIndex
CREATE INDEX "OrderSnapshot_workspaceId_idx" ON "OrderSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "OrderSnapshot_orderedAt_idx" ON "OrderSnapshot"("orderedAt");

-- CreateIndex
CREATE INDEX "OrderSnapshot_status_idx" ON "OrderSnapshot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSnapshot_organizationId_sourceSystem_sourceId_key" ON "OrderSnapshot"("organizationId", "sourceSystem", "sourceId");

-- AddForeignKey
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSnapshot" ADD CONSTRAINT "OrderSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSnapshot" ADD CONSTRAINT "OrderSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
