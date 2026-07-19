-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('ANNUAL', 'QUARTERLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BudgetDimension" AS ENUM ('TOTAL', 'BRANCH', 'CHANNEL', 'SELLER', 'LINE', 'PAYROLL');

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "periodType" "BudgetPeriod" NOT NULL,
    "dimension" "BudgetDimension" NOT NULL,
    "dimensionKey" TEXT NOT NULL DEFAULT 'total',
    "dimensionLabel" TEXT NOT NULL DEFAULT 'Total',
    "category" TEXT NOT NULL DEFAULT 'revenue',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_organizationId_year_periodType_idx" ON "Budget"("organizationId", "year", "periodType");

-- CreateIndex
CREATE INDEX "Budget_organizationId_dimension_dimensionKey_idx" ON "Budget"("organizationId", "dimension", "dimensionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_organizationId_year_month_quarter_periodType_dimensi_key" ON "Budget"("organizationId", "year", "month", "quarter", "periodType", "dimension", "dimensionKey", "category");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
