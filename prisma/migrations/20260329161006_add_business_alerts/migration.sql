-- CreateTable
CREATE TABLE "BusinessAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,

    CONSTRAINT "BusinessAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessAlert_organizationId_status_severity_idx" ON "BusinessAlert"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "BusinessAlert_organizationId_module_period_idx" ON "BusinessAlert"("organizationId", "module", "period");

-- CreateIndex
CREATE INDEX "BusinessAlert_organizationId_period_idx" ON "BusinessAlert"("organizationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAlert_organizationId_type_entityKey_period_key" ON "BusinessAlert"("organizationId", "type", "entityKey", "period");

-- AddForeignKey
ALTER TABLE "BusinessAlert" ADD CONSTRAINT "BusinessAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
