/**
 * lib/integrations/sag/sag-inventory-storage.ts
 *
 * SAG Inventory Snapshot Storage Layer.
 *
 * Persists normalized SAG inventory rows to CommercialCoverageSnapshot.
 * Each sync call creates a new snapshot batch (all rows share the same snapshotAt).
 *
 * ─── BATCH STRATEGY ───────────────────────────────────────────────────────────
 * A full sync replaces the inventory state. New rows are inserted with a fresh
 * snapshotAt timestamp. The API endpoint always reads the LATEST batch.
 * Old batches are not deleted — they provide historical audit trail.
 *
 * ─── STATUS ASSIGNMENT (V1) ───────────────────────────────────────────────────
 * Since V1 has no velocity data, status is assigned by simple stock rules:
 *   disponible === 0                    → "sin_stock"
 *   disponible > 0, pendingOrdersQty > disponible → "ruptura_inminente"
 *   disponible > 0                     → "sin_datos_velocidad"
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

import { prisma }                            from "@/lib/prisma";
import type { SagInventoryNormalizedRow }    from "./sag-inventory-contract";

// ─── Status derivation ────────────────────────────────────────────────────────

function deriveCoverageStatus(
  disponible:       number,
  pendingOrdersQty: number,
): string {
  if (disponible === 0)                           return "sin_stock";
  if (pendingOrdersQty > disponible)              return "ruptura_inminente";
  if (pendingOrdersQty > disponible * 0.8)        return "cobertura_baja";
  return "sin_datos_velocidad";
}

// ─── Demand pressure score (0–100) ───────────────────────────────────────────

function computeDemandPressureScore(
  disponible:       number,
  pendingOrdersQty: number,
): number {
  if (disponible <= 0) return 100;
  const ratio = pendingOrdersQty / disponible;
  return Math.min(100, Math.round(ratio * 100));
}

// ─── Operational score (0–100) ───────────────────────────────────────────────
// Simple coverage quality score for V1 (no velocity).
// Inversely proportional to demand pressure.

function computeOperationalScore(
  disponible:       number,
  pendingOrdersQty: number,
): number {
  return Math.max(0, 100 - computeDemandPressureScore(disponible, pendingOrdersQty));
}

// ─── Storage function ─────────────────────────────────────────────────────────

export interface PersistInventorySnapshotResult {
  snapshotAt: string;
  refsWritten: number;
}

/**
 * Persists a normalized inventory snapshot to CommercialCoverageSnapshot.
 *
 * All rows share the same snapshotAt timestamp (the sync batch timestamp).
 * Returns the snapshotAt and the number of rows written.
 *
 * @param organizationId  Org to write snapshot for
 * @param rows            Normalized rows from sag-inventory-normalizer
 * @param snapshotAt      ISO timestamp for the batch (defaults to now)
 */
export async function persistSagInventorySnapshot(
  organizationId: string,
  rows:           SagInventoryNormalizedRow[],
  snapshotAt?:    Date,
): Promise<PersistInventorySnapshotResult> {
  const batchAt = snapshotAt ?? new Date();

  const data = rows.map(row => ({
    organizationId,
    refCode:             row.refCode,
    description:         row.description,
    line:                row.line,
    disponible:          row.disponible,
    pendingOrdersQty:    row.pendingOrdersQty,
    demandPressureScore: computeDemandPressureScore(row.disponible, row.pendingOrdersQty),
    operationalScore:    computeOperationalScore(row.disponible, row.pendingOrdersQty),
    affectedRepCount:    0,
    status:              deriveCoverageStatus(row.disponible, row.pendingOrdersQty),
    // INVENTORY-CRM-RESERVATION-LAYER-01
    physicalQty:         row.physicalQty ?? null,
    crmReservedQty:      row.crmReservedQty ?? null,
    // CATALOG-SAG-SUBGROUP-ENRICHMENT-01
    subgrupoId:          row.subgrupoId ?? null,
    subgrupoSag:         row.subgrupoSag ?? null,
    snapshotAt:          batchAt,
  }));

  await prisma.commercialCoverageSnapshot.createMany({ data });

  return {
    snapshotAt:  batchAt.toISOString(),
    refsWritten: data.length,
  };
}

// ─── Snapshot metadata query ──────────────────────────────────────────────────

/**
 * Returns metadata about the current inventory snapshot for an org.
 * Used by the diagnostics panel.
 */
export async function getSagInventorySnapshotMeta(
  organizationId: string,
): Promise<{
  hasSnapshot:  boolean;
  snapshotAt:   string | null;
  refCount:     number;
  ageHours:     number | null;
  isStale:      boolean;
}> {
  const latest = await prisma.commercialCoverageSnapshot.findFirst({
    where:   { organizationId },
    orderBy: { snapshotAt: "desc" },
    select:  { snapshotAt: true },
  });

  if (!latest) {
    return { hasSnapshot: false, snapshotAt: null, refCount: 0, ageHours: null, isStale: true };
  }

  const count = await prisma.commercialCoverageSnapshot.count({
    where: { organizationId, snapshotAt: latest.snapshotAt },
  });

  const ageMs    = Date.now() - latest.snapshotAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  return {
    hasSnapshot: true,
    snapshotAt:  latest.snapshotAt.toISOString(),
    refCount:    count,
    ageHours:    Math.round(ageHours * 10) / 10,
    isStale:     ageHours > 24,
  };
}
