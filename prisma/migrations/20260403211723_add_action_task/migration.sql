-- CreateEnum
CREATE TYPE "ActionTaskStatus" AS ENUM ('PENDING', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ActionTaskType" AS ENUM ('CREAR_TAREA_COMERCIAL', 'ASIGNAR_SEGUIMIENTO_VENDEDOR', 'MARCAR_CLIENTE_RECUPERACION', 'GENERAR_INFORME', 'PROGRAMAR_INFORME', 'ABRIR_ALERTA_OPERATIVA', 'CREAR_ACCION_COBRANZA', 'ESCALAR_A_GERENCIA');

-- CreateEnum
CREATE TYPE "ActionTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SagDocumentFamily" AS ENUM ('OFFICIAL_INVOICE', 'DISPATCH_REMISION', 'CREDIT_NOTE', 'DEBIT_NOTE', 'OTHER');

-- AlterTable
ALTER TABLE "SaleRecord" ADD COLUMN     "originDocumentRef" TEXT,
ADD COLUMN     "sagDocumentFamily" "SagDocumentFamily" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "ActionTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionType" "ActionTaskType" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "sourceModule" TEXT,
    "status" "ActionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "ActionTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedTo" TEXT,
    "createdBy" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTask_organizationId_status_idx" ON "ActionTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ActionTask_organizationId_actionType_idx" ON "ActionTask"("organizationId", "actionType");

-- CreateIndex
CREATE INDEX "ActionTask_organizationId_priority_status_idx" ON "ActionTask"("organizationId", "priority", "status");

-- CreateIndex
CREATE INDEX "ActionTask_organizationId_createdAt_idx" ON "ActionTask"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_sagDocumentFamily_saleDate_idx" ON "SaleRecord"("organizationId", "sagDocumentFamily", "saleDate");

-- AddForeignKey
ALTER TABLE "ActionTask" ADD CONSTRAINT "ActionTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
