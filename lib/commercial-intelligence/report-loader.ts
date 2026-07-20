/**
 * report-loader.ts
 *
 * CASTILLITOS-REPORTS-DATA-INTEGRATION-01
 * Server-side data loader for Commercial Intelligence.
 *
 * Reads from CommercialCoverageSnapshot (Prisma) and maps to
 * SagAvailabilityRecord[] for the availability engine.
 *
 * Mapping:
 *   CommercialCoverageSnapshot.line "LT" → SubLinea "LATIN KIDS"
 *   CommercialCoverageSnapshot.line "CS" → SubLinea "CASTILLITOS"
 *   SubGrupo → inferred from description via inferProductType()
 *
 * server-only — uses Prisma directly.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { inferProductType } from "@/lib/comercial/maletas/sag-inventory-adapter";
import { loadLatestCCSBatch } from "./ccs-reader";
import type { SagAvailabilityRecord } from "./availability-types";
import type { SellerMaletaRecord } from "./maleta-replacement-engine";

// ── Line → SubLinea mapping (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 7)

import { LINE_TO_SUBLINEA } from "@/lib/comercial/line-map";

function mapLineToSubLinea(line: string): string {
  return LINE_TO_SUBLINEA[line] ?? line;
}

// ── Load availability records from latest snapshot ───────────────────────────

/**
 * Loads the latest CommercialCoverageSnapshot batch and maps to
 * SagAvailabilityRecord[] for buildAvailabilityReport().
 */
export async function loadAvailabilityRecords(
  organizationId: string,
): Promise<{ records: SagAvailabilityRecord[]; snapshotAt: string | null }> {
  const batch = await loadLatestCCSBatch(organizationId);

  if (batch.rows.length === 0) {
    return { records: [], snapshotAt: batch.snapshotAt };
  }

  // COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01:
  // Defensive guard — exclude productLine="5" refs that may exist in
  // historical snapshots. These belong to the accessory pipeline (PIL 26/27).
  // Uses refCode cross-reference against ProductEntity.
  const accessorySkus = new Set<string>();
  try {
    const accProducts = await (prisma as any).productEntity.findMany({
      where: { organizationId, productLine: "5" },
      select: { sku: true },
    });
    for (const p of accProducts) {
      if (p.sku) accessorySkus.add(p.sku);
    }
  } catch {
    // Graceful — if ProductEntity is unavailable, no exclusion
  }

  const rows = accessorySkus.size > 0
    ? batch.rows.filter(r => !accessorySkus.has(r.refCode))
    : batch.rows;

  const records: SagAvailabilityRecord[] = rows.map(row => {
    const pendingOrders = row.pendingOrdersQty ?? 0;
    // warehouseQty = disponible + pendingOrders (reconstruct from stored data)
    const inventarioBodega = row.disponible + pendingOrders;

    // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 4:
    // Track whether subGrupo comes from real SAG data or text inference.
    const subGrupoInferred = !row.subgrupoSag;

    return {
      reference: row.refCode,
      description: row.description,
      subLinea: mapLineToSubLinea(row.line),
      subGrupo: row.subgrupoSag ?? inferProductType(row.description),
      subGrupoInferred,
      bodega: "01+04+14+15",  // SAG-DATAFLOW-FIX-01: expanded commercial bodegas
      inventarioBodega,
      pedidosPendientes: pendingOrders,
    };
  });

  return {
    records,
    snapshotAt: batch.snapshotAt,
  };
}

// ── Load seller maleta records (placeholder — no per-bodega data yet) ────────

/**
 * Loads seller maleta inventory for replacement analysis.
 *
 * V1: Returns empty array — CommercialCoverageSnapshot does not store
 * per-bodega (35-39) data. The maleta replacement engine will still run
 * and evaluate threshold rules; it just won't identify affected sellers.
 *
 * V2: Will query seller bodegas (35-39) from SAG directly.
 */
export async function loadSellerMaletaRecords(
  _organizationId: string,
): Promise<SellerMaletaRecord[]> {
  // V1: No per-seller-bodega data in CommercialCoverageSnapshot
  return [];
}
