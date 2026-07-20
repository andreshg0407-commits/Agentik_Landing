/**
 * ccs-reader.ts
 *
 * Canonical reader for CommercialCoverageSnapshot (CCS) — the aggregate
 * textile inventory pipeline. All consumers that need the "latest batch
 * of CCS rows" MUST go through this function instead of duplicating
 * the findFirst(snapshotAt desc) + findMany(snapshotAt = latest) pattern.
 *
 * Sprint: COMERCIAL-INVENTORY-CCS-DEDUP-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export interface CCSBatchResult {
  /** Raw CCS rows from the latest snapshot batch */
  rows: CCSRow[];
  /** ISO timestamp of the snapshot batch, or null if no data */
  snapshotAt: string | null;
}

export interface CCSRow {
  refCode: string;
  description: string;
  line: string;
  disponible: number;
  pendingOrdersQty: number | null;
  subgrupoSag: string | null;
}

/**
 * Loads the latest CommercialCoverageSnapshot batch for an organization.
 *
 * This is the single source of truth for the CCS "latest batch" query.
 * Returns raw rows — callers apply their own domain-specific mapping.
 */
export async function loadLatestCCSBatch(
  organizationId: string,
): Promise<CCSBatchResult> {
  const latest = await prisma.commercialCoverageSnapshot.findFirst({
    where: { organizationId },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });

  if (!latest) {
    return { rows: [], snapshotAt: null };
  }

  const dbRows = await prisma.commercialCoverageSnapshot.findMany({
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

  const rows: CCSRow[] = dbRows.map(r => ({
    refCode: r.refCode,
    description: r.description,
    line: r.line,
    disponible: r.disponible,
    pendingOrdersQty: r.pendingOrdersQty,
    subgrupoSag: (r as any).subgrupoSag ?? null,
  }));

  return {
    rows,
    snapshotAt: latest.snapshotAt.toISOString(),
  };
}
