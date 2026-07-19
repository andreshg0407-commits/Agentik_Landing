-- CreateTable
CREATE TABLE "AssortmentIdealOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "subgroupCode" TEXT NOT NULL,
    "idealUnits" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssortmentIdealOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssortmentIdealOverride_organizationId_catalogId_idx" ON "AssortmentIdealOverride"("organizationId", "catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "AssortmentIdealOverride_organizationId_catalogId_groupCode_su_key" ON "AssortmentIdealOverride"("organizationId", "catalogId", "groupCode", "subgroupCode");

-- AddForeignKey
ALTER TABLE "AssortmentIdealOverride" ADD CONSTRAINT "AssortmentIdealOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
