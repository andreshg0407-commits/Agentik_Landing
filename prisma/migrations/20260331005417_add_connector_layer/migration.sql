-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SYNCING', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectorRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "modules" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorRun" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ConnectorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsErrored" INTEGER NOT NULL DEFAULT 0,
    "cursorBefore" TEXT,
    "cursorAfter" TEXT,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "ConnectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCursor" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorMapping" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transform" TEXT,
    "defaultValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connector_organizationId_source_idx" ON "Connector"("organizationId", "source");

-- CreateIndex
CREATE INDEX "Connector_organizationId_status_idx" ON "Connector"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_organizationId_source_name_key" ON "Connector"("organizationId", "source", "name");

-- CreateIndex
CREATE INDEX "ConnectorRun_connectorId_module_idx" ON "ConnectorRun"("connectorId", "module");

-- CreateIndex
CREATE INDEX "ConnectorRun_organizationId_source_module_idx" ON "ConnectorRun"("organizationId", "source", "module");

-- CreateIndex
CREATE INDEX "ConnectorRun_organizationId_status_idx" ON "ConnectorRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ConnectorRun_startedAt_idx" ON "ConnectorRun"("startedAt");

-- CreateIndex
CREATE INDEX "ConnectorCursor_organizationId_module_idx" ON "ConnectorCursor"("organizationId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCursor_connectorId_module_key" ON "ConnectorCursor"("connectorId", "module");

-- CreateIndex
CREATE INDEX "ConnectorMapping_connectorId_module_idx" ON "ConnectorMapping"("connectorId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorMapping_connectorId_module_sourceField_key" ON "ConnectorMapping"("connectorId", "module", "sourceField");

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCursor" ADD CONSTRAINT "ConnectorCursor_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorMapping" ADD CONSTRAINT "ConnectorMapping_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
