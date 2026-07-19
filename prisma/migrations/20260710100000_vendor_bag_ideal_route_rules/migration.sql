-- CreateTable
CREATE TABLE "VendorBagIdealRouteRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "subgrupoSag" TEXT NOT NULL,
    "minimumRefs" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBagIdealRouteRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorBagIdealRouteRule_organizationId_vendorId_line_subgrupoSag_key" ON "VendorBagIdealRouteRule"("organizationId", "vendorId", "line", "subgrupoSag");

-- CreateIndex
CREATE INDEX "VendorBagIdealRouteRule_organizationId_vendorId_idx" ON "VendorBagIdealRouteRule"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorBagIdealRouteRule_organizationId_vendorId_line_idx" ON "VendorBagIdealRouteRule"("organizationId", "vendorId", "line");

-- AddForeignKey
ALTER TABLE "VendorBagIdealRouteRule" ADD CONSTRAINT "VendorBagIdealRouteRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
