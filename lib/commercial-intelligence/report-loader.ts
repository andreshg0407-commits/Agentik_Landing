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
  // Find latest snapshot timestamp
  const latest = await prisma.commercialCoverageSnapshot.findFirst({
    where: { organizationId },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });

  if (!latest) {
    return { records: [], snapshotAt: null };
  }

  // Load all rows from the latest batch
  const rows = await prisma.commercialCoverageSnapshot.findMany({
    where: {
      organizationId,
      snapshotAt: latest.snapshotAt,
    },
    select: {
      refCode: true,
      description: true,
      line: true,
      disponible: true,
      pendingOrdersQty: true,
      subgrupoSag: true,
    },
  });

  const records: SagAvailabilityRecord[] = rows.map(row => {
    const pendingOrders = row.pendingOrdersQty ?? 0;
    // warehouseQty = disponible + pendingOrders (reconstruct from stored data)
    const inventarioBodega = row.disponible + pendingOrders;

    return {
      reference: row.refCode,
      description: row.description,
      subLinea: mapLineToSubLinea(row.line),
      subGrupo: (row as any).subgrupoSag ?? inferProductType(row.description),
      bodega: "01+04",  // MULTI-BODEGA: textile commercial availability
      inventarioBodega,
      pedidosPendientes: pendingOrders,
    };
  });

  return {
    records,
    snapshotAt: latest.snapshotAt.toISOString(),
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
