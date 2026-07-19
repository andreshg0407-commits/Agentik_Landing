-- CreateTable
CREATE TABLE "SagWriteOperation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "writeType" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceRef" TEXT,
    "inputJson" JSONB NOT NULL,
    "generatedXml" TEXT NOT NULL,
    "submittedXml" TEXT,
    "sagResponseRaw" TEXT,
    "sagResponseOk" BOOLEAN,
    "initiatedBy" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SagWriteOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SagWriteOperation_organizationId_status_idx" ON "SagWriteOperation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SagWriteOperation_organizationId_initiatedAt_idx" ON "SagWriteOperation"("organizationId", "initiatedAt");

-- CreateIndex
CREATE INDEX "SagWriteOperation_organizationId_writeType_idx" ON "SagWriteOperation"("organizationId", "writeType");

-- AddForeignKey
ALTER TABLE "SagWriteOperation" ADD CONSTRAINT "SagWriteOperation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
