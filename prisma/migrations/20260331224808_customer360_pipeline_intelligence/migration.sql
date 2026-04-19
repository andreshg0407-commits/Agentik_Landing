-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'CHURNED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'VISIT', 'NOTE', 'MEETING', 'QUOTE_SENT', 'DEMO', 'PROPOSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "erpId" TEXT,
    "crmId" TEXT,
    "nit" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "segment" TEXT,
    "customerType" TEXT NOT NULL DEFAULT 'B2B',
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "department" TEXT,
    "address" TEXT,
    "sellerSlug" TEXT,
    "sellerName" TEXT,
    "ltv" DECIMAL(18,2),
    "lastPurchaseAt" TIMESTAMP(3),
    "purchasePeriods" INTEGER NOT NULL DEFAULT 0,
    "avgMonthlyRevenue" DECIMAL(18,2),
    "avgTicket" DECIMAL(18,2),
    "totalSalesL12" DECIMAL(18,2),
    "totalReceivable" DECIMAL(18,2),
    "overdueReceivable" DECIMAL(18,2),
    "maxDpd" INTEGER,
    "healthScore" INTEGER,
    "riskScore" INTEGER,
    "churnRisk" TEXT,
    "nextBestAction" TEXT,
    "aiSummary" TEXT,
    "scoredAt" TIMESTAMP(3),
    "erpSyncedAt" TIMESTAMP(3),
    "crmSyncedAt" TIMESTAMP(3),
    "rawErpJson" JSONB,
    "rawCrmJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReceivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "erpId" TEXT,
    "invoiceNumber" TEXT,
    "customerNit" TEXT,
    "customerName" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "agingBucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "rawErpJson" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "crmId" TEXT,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "probability" INTEGER NOT NULL DEFAULT 50,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "expectedCloseAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "lossReason" TEXT,
    "lossNote" TEXT,
    "sellerSlug" TEXT,
    "sellerName" TEXT,
    "aiCloseProbability" DOUBLE PRECISION,
    "riskFlags" TEXT[],
    "rawCrmJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "crmId" TEXT,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "outcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sellerSlug" TEXT,
    "sellerName" TEXT,
    "rawCrmJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMQuote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "crmId" TEXT,
    "quoteNumber" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "sellerSlug" TEXT,
    "sellerName" TEXT,
    "rawCrmJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "probability" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_status_idx" ON "CustomerProfile"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_sellerSlug_idx" ON "CustomerProfile"("organizationId", "sellerSlug");

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_lastPurchaseAt_idx" ON "CustomerProfile"("organizationId", "lastPurchaseAt");

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_nit_idx" ON "CustomerProfile"("organizationId", "nit");

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_churnRisk_idx" ON "CustomerProfile"("organizationId", "churnRisk");

-- CreateIndex
CREATE INDEX "CustomerProfile_organizationId_customerType_idx" ON "CustomerProfile"("organizationId", "customerType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_organizationId_slug_key" ON "CustomerProfile"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "CustomerReceivable_organizationId_status_idx" ON "CustomerReceivable"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CustomerReceivable_organizationId_customerNit_idx" ON "CustomerReceivable"("organizationId", "customerNit");

-- CreateIndex
CREATE INDEX "CustomerReceivable_organizationId_customerId_idx" ON "CustomerReceivable"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerReceivable_organizationId_dueDate_idx" ON "CustomerReceivable"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "CustomerReceivable_organizationId_agingBucket_idx" ON "CustomerReceivable"("organizationId", "agingBucket");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReceivable_organizationId_erpId_key" ON "CustomerReceivable"("organizationId", "erpId");

-- CreateIndex
CREATE INDEX "CRMOpportunity_organizationId_stage_status_idx" ON "CRMOpportunity"("organizationId", "stage", "status");

-- CreateIndex
CREATE INDEX "CRMOpportunity_organizationId_sellerSlug_status_idx" ON "CRMOpportunity"("organizationId", "sellerSlug", "status");

-- CreateIndex
CREATE INDEX "CRMOpportunity_organizationId_expectedCloseAt_idx" ON "CRMOpportunity"("organizationId", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "CRMOpportunity_organizationId_status_idx" ON "CRMOpportunity"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CRMOpportunity_organizationId_customerId_idx" ON "CRMOpportunity"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CRMOpportunity_organizationId_crmId_key" ON "CRMOpportunity"("organizationId", "crmId");

-- CreateIndex
CREATE INDEX "CRMActivity_organizationId_customerId_occurredAt_idx" ON "CRMActivity"("organizationId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "CRMActivity_organizationId_opportunityId_idx" ON "CRMActivity"("organizationId", "opportunityId");

-- CreateIndex
CREATE INDEX "CRMActivity_organizationId_occurredAt_idx" ON "CRMActivity"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "CRMActivity_organizationId_sellerSlug_idx" ON "CRMActivity"("organizationId", "sellerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "CRMActivity_organizationId_crmId_key" ON "CRMActivity"("organizationId", "crmId");

-- CreateIndex
CREATE INDEX "CRMQuote_organizationId_customerId_idx" ON "CRMQuote"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "CRMQuote_organizationId_status_idx" ON "CRMQuote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CRMQuote_organizationId_sellerSlug_idx" ON "CRMQuote"("organizationId", "sellerSlug");

-- CreateIndex
CREATE INDEX "CRMQuote_organizationId_issuedAt_idx" ON "CRMQuote"("organizationId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CRMQuote_organizationId_crmId_key" ON "CRMQuote"("organizationId", "crmId");

-- CreateIndex
CREATE INDEX "PipelineStage_organizationId_order_idx" ON "PipelineStage"("organizationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_organizationId_key_key" ON "PipelineStage"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReceivable" ADD CONSTRAINT "CustomerReceivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReceivable" ADD CONSTRAINT "CustomerReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMOpportunity" ADD CONSTRAINT "CRMOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMOpportunity" ADD CONSTRAINT "CRMOpportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CRMOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMQuote" ADD CONSTRAINT "CRMQuote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMQuote" ADD CONSTRAINT "CRMQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMQuote" ADD CONSTRAINT "CRMQuote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CRMOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
