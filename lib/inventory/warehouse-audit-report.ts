/**
 * lib/inventory/warehouse-audit-report.ts
 *
 * COMERCIAL-INVENTORY-LIFECYCLE-AND-WAREHOUSE-INTELLIGENCE-02 — FASE 7
 *
 * Warehouse audit report service with inconsistency detection.
 * Compares warehouse-master canonical data against actual PIL data.
 *
 * server-only — uses Prisma.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getAllWarehouses,
  resolveWarehouseByPk,
  type WarehouseEntry,
  type WarehouseBusinessType,
} from "./warehouse-master";

const db = prisma as any;

export interface WarehouseAuditEntry {
  warehouseId: string;
  ssCodigo: string | null;
  ssNombre: string | null;
  businessType: WarehouseBusinessType | "UNMAPPED";
  productCount: number;
  totalPositiveStock: number;
  totalNegativeStock: number;
  inconsistencies: string[];
}

export interface WarehouseAuditReport {
  totalWarehouses: number;
  mappedWarehouses: number;
  unmappedWarehouses: number;
  entries: WarehouseAuditEntry[];
  inconsistencies: string[];
}

/**
 * Build warehouse audit report by comparing master vs actual PIL data.
 */
export async function getWarehouseAuditReport(
  organizationId: string,
): Promise<WarehouseAuditReport> {
  // 1. Get all distinct warehouseIds from PIL
  const rawLevels = await db.productInventoryLevel.findMany({
    where: { organizationId },
    select: { warehouseId: true, externalRef: true, quantity: true },
  });

  // Aggregate by warehouseId
  const whStats = new Map<string, {
    externalRefs: Set<string>;
    productCount: number;
    totalPositive: number;
    totalNegative: number;
  }>();

  for (const lvl of rawLevels) {
    if (!whStats.has(lvl.warehouseId)) {
      whStats.set(lvl.warehouseId, { externalRefs: new Set(), productCount: 0, totalPositive: 0, totalNegative: 0 });
    }
    const s = whStats.get(lvl.warehouseId)!;
    s.productCount++;
    const qty = Number(lvl.quantity ?? 0);
    if (qty > 0) s.totalPositive += qty;
    if (qty < 0) s.totalNegative += qty;
    if (lvl.externalRef) s.externalRefs.add(lvl.externalRef);
  }

  const masterWarehouses = getAllWarehouses();
  const masterPks = new Set(masterWarehouses.map(w => w.kaNlBodega));
  const globalInconsistencies: string[] = [];

  const entries: WarehouseAuditEntry[] = [];

  // Check PIL warehouses against master
  for (const [whId, stats] of whStats) {
    const master = resolveWarehouseByPk(whId);
    const inconsistencies: string[] = [];

    if (!master) {
      inconsistencies.push(`Warehouse ${whId} exists in PIL but NOT in warehouse-master`);
      globalInconsistencies.push(`UNMAPPED: ka_nl_bodega=${whId} has ${stats.productCount} products, ${stats.totalPositive} positive stock`);
    } else {
      // Check externalRef consistency
      for (const ref of stats.externalRefs) {
        if (ref !== master.ssCodigo) {
          inconsistencies.push(`PIL externalRef="${ref}" does not match master ssCodigo="${master.ssCodigo}"`);
        }
      }

      // Check negative stock in commercial warehouses
      if (stats.totalNegative < 0 && (master.includeInCommercialInventory || master.includeInImportInventory)) {
        inconsistencies.push(`Negative stock (${stats.totalNegative}) in commercial warehouse`);
      }
    }

    entries.push({
      warehouseId: whId,
      ssCodigo: master?.ssCodigo ?? (stats.externalRefs.size > 0 ? [...stats.externalRefs][0] : null),
      ssNombre: master?.ssNombre ?? null,
      businessType: master?.businessType ?? "UNMAPPED",
      productCount: stats.productCount,
      totalPositiveStock: stats.totalPositive,
      totalNegativeStock: stats.totalNegative,
      inconsistencies,
    });
  }

  // Check master warehouses with no PIL data
  for (const mw of masterWarehouses) {
    if (!whStats.has(mw.kaNlBodega)) {
      if (mw.businessType !== "EXCLUDED") {
        globalInconsistencies.push(`MISSING: ${mw.ssNombre} (ka_nl_bodega=${mw.kaNlBodega}) in master but no PIL data`);
      }
    }
  }

  // Sort by product count descending
  entries.sort((a, b) => b.productCount - a.productCount);

  return {
    totalWarehouses: entries.length,
    mappedWarehouses: entries.filter(e => e.businessType !== "UNMAPPED").length,
    unmappedWarehouses: entries.filter(e => e.businessType === "UNMAPPED").length,
    entries,
    inconsistencies: globalInconsistencies,
  };
}
