/**
 * lib/integrations/sag/sag-inventory-sync.ts
 *
 * SAG Inventory Sync Engine.
 *
 * Orchestrates the full sync pipeline:
 *   SagInventoryInputRow[] → normalize → (optional: dryRun) → persist → result
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 *   const result = await runSagInventorySync({ organizationId, rows, dryRun });
 *
 * ─── DRY RUN ──────────────────────────────────────────────────────────────────
 * When dryRun: true, runs full validation + normalization but skips persistence.
 * Returns the same result shape with status: "dry_run".
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

import type {
  SagInventoryInputRow,
  SagInventorySyncResult,
} from "./sag-inventory-contract";
import { normalizeSagInventoryRows } from "./sag-inventory-normalizer";
import { persistSagInventorySnapshot } from "./sag-inventory-storage";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SagInventorySyncOptions {
  organizationId: string;
  rows:           SagInventoryInputRow[];
  /** When true, validates but does not persist. Default: false */
  dryRun?:        boolean;
  /** Override batch timestamp (testing / backfill) */
  snapshotAt?:    Date;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Runs the full SAG inventory sync pipeline for an org.
 * Returns a structured result with diagnostics.
 */
export async function runSagInventorySync(
  opts: SagInventorySyncOptions,
): Promise<SagInventorySyncResult> {
  const { organizationId, rows, dryRun = false, snapshotAt } = opts;
  const startMs = Date.now();

  // ── 1. Validate input ──────────────────────────────────────────────────────
  if (!rows || rows.length === 0) {
    return {
      status:           "empty",
      snapshotAt:       null,
      refsWritten:      0,
      invalidRows:      0,
      duplicateRows:    0,
      warehouses:       [],
      durationMs:       Date.now() - startMs,
      validationErrors: [],
      dryRun,
    };
  }

  // ── 2. Normalize ───────────────────────────────────────────────────────────
  const normalized = normalizeSagInventoryRows(rows);

  if (normalized.rows.length === 0) {
    return {
      status:           "empty",
      snapshotAt:       null,
      refsWritten:      0,
      invalidRows:      normalized.invalidRows,
      duplicateRows:    normalized.duplicateRows,
      warehouses:       normalized.warehouses,
      durationMs:       Date.now() - startMs,
      validationErrors: normalized.validationErrors,
      dryRun,
    };
  }

  // ── 3. Dry run path ────────────────────────────────────────────────────────
  if (dryRun) {
    return {
      status:           "dry_run",
      snapshotAt:       null,
      refsWritten:      normalized.rows.length,
      invalidRows:      normalized.invalidRows,
      duplicateRows:    normalized.duplicateRows,
      warehouses:       normalized.warehouses,
      durationMs:       Date.now() - startMs,
      validationErrors: normalized.validationErrors,
      dryRun:           true,
    };
  }

  // ── 4. Persist ─────────────────────────────────────────────────────────────
  try {
    const persisted = await persistSagInventorySnapshot(
      organizationId,
      normalized.rows,
      snapshotAt,
    );

    const status = normalized.invalidRows > 0 ? "partial" : "success";

    return {
      status,
      snapshotAt:       persisted.snapshotAt,
      refsWritten:      persisted.refsWritten,
      invalidRows:      normalized.invalidRows,
      duplicateRows:    normalized.duplicateRows,
      warehouses:       normalized.warehouses,
      durationMs:       Date.now() - startMs,
      validationErrors: normalized.validationErrors,
      dryRun:           false,
    };
  } catch (err) {
    return {
      status:           "error",
      snapshotAt:       null,
      refsWritten:      0,
      invalidRows:      normalized.invalidRows,
      duplicateRows:    normalized.duplicateRows,
      warehouses:       normalized.warehouses,
      durationMs:       Date.now() - startMs,
      validationErrors: normalized.validationErrors,
      dryRun:           false,
      error:            err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
