/**
 * live-vendor-loader.ts
 *
 * LIVEVENDOR-FOUNDATION-01 — Phase 11: Server-side data loader.
 * Queries Prisma for InventoryTransfer, ProductInventoryLevel, and
 * CommercialCoverageSnapshot, then assembles LiveVendorProfiles.
 *
 * No SAG direct access. Consumes only normalized Prisma data.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { CASTILLITOS_LOCATIONS } from "@/lib/logistics/catalogs/castillitos-locations";
import { buildLocationResolver } from "@/lib/logistics/location-resolver";
import { loadAvailabilityRecords } from "@/lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "@/lib/commercial-intelligence/availability-engine";

import {
  bindVendorToLocation,
  buildPortfolioSnapshot,
  buildTransferHistory,
  assembleLiveVendorProfile,
  analyzeVendorReplacements,
  type PortfolioInventoryRecord,
  type RawTransferRecord,
} from "./live-vendor-engine";

import type {
  LiveVendorProfile,
  VendorReplacementAnalysis,
} from "./live-vendor-types";

import { resolveInventoryThresholds } from "@/lib/tenant-rules/tenant-rule-resolver";

// ── Castillitos vendor registry ─────────────────────────────────────────────

/** Vendor → location code mapping. Source: CASTILLITOS_LOCATIONS catalog. */
const VENDOR_LOCATION_MAP: Array<{ vendorId: string; vendorName: string; locationCode: string }> = [
  { vendorId: "ORLANDO", vendorName: "Orlando", locationCode: "35" },
  { vendorId: "CARLOS_LEON", vendorName: "Carlos Leon", locationCode: "36" },
  { vendorId: "LUIS", vendorName: "Luis", locationCode: "37" },
  { vendorId: "NESTOR", vendorName: "Nestor", locationCode: "38" },
  { vendorId: "CARLOS_VILLA", vendorName: "Carlos Villa", locationCode: "39" },
  { vendorId: "FREDY", vendorName: "Fredy", locationCode: "40" },
];

const resolver = buildLocationResolver(CASTILLITOS_LOCATIONS);

// ── Loaders ─────────────────────────────────────────────────────────────────

/** Load all live vendor profiles for an organization. */
export async function loadLiveVendors(organizationId: string): Promise<LiveVendorProfile[]> {
  const db = prisma as any;

  // 1. Load availability data
  const { records: sagRecords } = await loadAvailabilityRecords(organizationId);
  const availabilityReport = buildAvailabilityReport({
    orgSlug: "castillitos",
    records: sagRecords,
    sourceBodega: "01",
  });
  const availabilityRows = availabilityReport.rows;

  // Resolve tenant business rules
  const tenantRules = resolveInventoryThresholds("castillitos");

  // 2. Load all vendor profiles in parallel
  const profiles = await Promise.all(
    VENDOR_LOCATION_MAP.map(async (vendor) => {
      const locationBinding = bindVendorToLocation(vendor.vendorId, vendor.locationCode, resolver);

      // 3. Load portfolio inventory from ProductInventoryLevel
      const inventoryRecords = await loadPortfolioInventory(organizationId, vendor.locationCode);

      // 4. Load TM transfer history
      const transferRecords = await loadVendorTransfers(organizationId, vendor.locationCode);

      // 5. Find last TM inbound transfer
      const lastInbound = transferRecords
        .filter((t) => t.destinationWarehouseCode === vendor.locationCode)
        .sort((a, b) => b.documentDate.getTime() - a.documentDate.getTime())[0];

      // 6. Build portfolio snapshot
      const portfolio = buildPortfolioSnapshot({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        locationCode: vendor.locationCode,
        locationName: locationBinding.locationName,
        inventoryRecords,
        availabilityRows,
        lastTransferAt: lastInbound?.documentDate.toISOString() ?? null,
        lastTransferDocument: lastInbound?.documentNumber ?? null,
        rules: tenantRules.length > 0 ? tenantRules : undefined,
      });

      // 7. Build transfer history
      const transferHistory = buildTransferHistory(
        vendor.vendorId,
        vendor.locationCode,
        transferRecords,
      );

      // 8. Assemble profile
      return assembleLiveVendorProfile({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        locationBinding,
        portfolio,
        transferHistory,
      });
    }),
  );

  return profiles;
}

/** Load a single live vendor profile by ID. */
export async function loadLiveVendorById(
  organizationId: string,
  vendorId: string,
): Promise<LiveVendorProfile | null> {
  const vendor = VENDOR_LOCATION_MAP.find((v) => v.vendorId === vendorId);
  if (!vendor) return null;

  const profiles = await loadLiveVendors(organizationId);
  return profiles.find((p) => p.vendorId === vendorId) ?? null;
}

/** Load portfolio snapshots for all vendors (lightweight). */
export async function loadVendorPortfolioSnapshots(
  organizationId: string,
): Promise<LiveVendorProfile[]> {
  return loadLiveVendors(organizationId);
}

/** Load replacement analysis for a specific vendor. */
export async function loadVendorReplacementAnalysis(
  organizationId: string,
  vendorId: string,
): Promise<VendorReplacementAnalysis | null> {
  const profile = await loadLiveVendorById(organizationId, vendorId);
  if (!profile) return null;

  const { records: sagRecords } = await loadAvailabilityRecords(organizationId);
  const availabilityReport = buildAvailabilityReport({
    orgSlug: "castillitos",
    records: sagRecords,
    sourceBodega: "01",
  });

  const tenantRules = resolveInventoryThresholds("castillitos");

  return analyzeVendorReplacements({
    vendorId: profile.vendorId,
    vendorName: profile.vendorName,
    locationCode: profile.location.locationCode,
    portfolioItems: profile.portfolio.items,
    availabilityRows: availabilityReport.rows,
    rules: tenantRules.length > 0 ? tenantRules : undefined,
  });
}

// ── Internal data queries ───────────────────────────────────────────────────

async function loadPortfolioInventory(
  organizationId: string,
  locationCode: string,
): Promise<PortfolioInventoryRecord[]> {
  const db = prisma as any;

  try {
    const rows = await db.productInventoryLevel.findMany({
      where: {
        organizationId,
        externalRef: locationCode,
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // Resolve product details
    const productIds = rows.map((r: any) => r.productId);
    if (productIds.length === 0) return [];

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        referenceCode: true,
        name: true,
      },
    });

    const productMap = new Map<string, { referenceCode: string; name: string | null }>();
    for (const p of products) {
      productMap.set(p.id, { referenceCode: p.referenceCode ?? p.id, name: p.name });
    }

    return rows.map((r: any) => {
      const product = productMap.get(r.productId);
      return {
        referenceCode: product?.referenceCode ?? r.productId,
        productName: product?.name ?? null,
        size: null, // V2: size/color from variant
        color: null,
        quantity: r.quantity,
      };
    });
  } catch {
    // ProductInventoryLevel or Product table may not exist yet
    return [];
  }
}

async function loadVendorTransfers(
  organizationId: string,
  locationCode: string,
): Promise<RawTransferRecord[]> {
  const db = prisma as any;

  try {
    const transfers = await db.inventoryTransfer.findMany({
      where: {
        organizationId,
        OR: [
          { originWarehouseCode: locationCode },
          { destinationWarehouseCode: locationCode },
        ],
      },
      select: {
        id: true,
        documentNumber: true,
        transferType: true,
        originWarehouseCode: true,
        destinationWarehouseCode: true,
        documentDate: true,
        isClosed: true,
      },
      orderBy: { documentDate: "desc" },
      take: 100,
    });

    // Count lines per transfer
    const transferIds = transfers.map((t: any) => t.id);
    let lineCounts = new Map<string, { count: number; totalQty: number }>();

    if (transferIds.length > 0) {
      const lineAggs: Array<{
        inventoryTransferId: string;
        line_count: number;
        total_qty: number;
      }> = await db.$queryRawUnsafe(
        `SELECT "inventoryTransferId",
                COUNT(*)::int as line_count,
                COALESCE(SUM("quantity"), 0)::float as total_qty
         FROM "InventoryTransferLine"
         WHERE "inventoryTransferId" = ANY($1::text[])
         GROUP BY "inventoryTransferId"`,
        transferIds,
      );
      for (const agg of lineAggs) {
        lineCounts.set(agg.inventoryTransferId, { count: agg.line_count, totalQty: agg.total_qty });
      }
    }

    return transfers.map((t: any) => {
      const lc = lineCounts.get(t.id);
      return {
        id: t.id,
        documentNumber: t.documentNumber,
        transferType: t.transferType,
        originWarehouseCode: t.originWarehouseCode,
        destinationWarehouseCode: t.destinationWarehouseCode,
        documentDate: t.documentDate,
        isClosed: t.isClosed,
        lineCount: lc?.count ?? 0,
        totalQuantity: lc?.totalQty ?? 0,
      };
    });
  } catch {
    // InventoryTransfer table may not exist yet
    return [];
  }
}
