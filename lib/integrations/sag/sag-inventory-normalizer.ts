/**
 * lib/integrations/sag/sag-inventory-normalizer.ts
 *
 * SAG Inventory Snapshot Normalizer.
 *
 * Pure function — no Prisma, no React, no side effects.
 * Transforms SagInventoryInputRow[] into SagInventoryNormalizedRow[].
 *
 * Operations:
 *   1. Validate required fields (refCode, description, disponible)
 *   2. Trim and uppercase refCode
 *   3. Infer line, category, productType from description
 *   4. Compute warehouseQty from disponible + pendingOrdersQty
 *   5. Deduplicate by refCode (aggregate quantities, keep first description)
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

import type {
  SagInventoryInputRow,
  SagInventoryNormalizedRow,
  SagInventoryValidationError,
} from "./sag-inventory-contract";
import {
  inferCategory,
  inferProductType,
} from "@/lib/comercial/maletas/sag-inventory-adapter";

// ─── Line inference (consolidated in line-map.ts — Phase 7) ──────────────────

import { resolveLineCode } from "@/lib/comercial/line-map";

// ─── Normalizer result ────────────────────────────────────────────────────────

export interface NormalizerOutput {
  rows:             SagInventoryNormalizedRow[];
  validationErrors: SagInventoryValidationError[];
  duplicateRows:    number;
  invalidRows:      number;
  warehouses:       string[];
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalizes raw SAG inventory input rows.
 *
 * Deduplication: when the same refCode appears multiple times (e.g. multiple
 * bodegas), quantities are summed and the first description is kept.
 */
export function normalizeSagInventoryRows(
  input: SagInventoryInputRow[],
): NormalizerOutput {
  const validationErrors: SagInventoryValidationError[] = [];
  const warehouseSet = new Set<string>();
  let invalidRows   = 0;

  // ── Phase 1: validate and build candidate rows ────────────────────────────
  const candidates: (SagInventoryNormalizedRow & { rowIndex: number })[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = input[i];

    // Required: refCode
    const rawRef = typeof row.refCode === "string" ? row.refCode.trim() : "";
    if (!rawRef) {
      validationErrors.push({ rowIndex: i, refCode: row.refCode, reason: "refCode vacío o ausente" });
      invalidRows++;
      continue;
    }

    // Required: description
    const desc = typeof row.description === "string" ? row.description.trim() : "";
    if (!desc) {
      validationErrors.push({ rowIndex: i, refCode: rawRef, reason: "description vacía o ausente" });
      invalidRows++;
      continue;
    }

    // Required: disponible (must be a number)
    const rawDisp = row.disponible;
    if (rawDisp === undefined || rawDisp === null || isNaN(Number(rawDisp))) {
      validationErrors.push({ rowIndex: i, refCode: rawRef, reason: "disponible ausente o no numérico" });
      invalidRows++;
      continue;
    }

    const disponible       = Math.max(0, Number(rawDisp));
    const pendingOrdersQty = Math.max(0, Number(row.pendingOrdersQty ?? 0));
    const warehouseQty     = row.warehouseQty !== undefined
      ? Math.max(0, Number(row.warehouseQty))
      : disponible + pendingOrdersQty;

    const bodega = typeof row.bodega === "string" && row.bodega.trim()
      ? row.bodega.trim().toUpperCase()
      : "PRINCIPAL";

    warehouseSet.add(bodega);

    candidates.push({
      rowIndex:         i,
      refCode:          rawRef.toUpperCase(),
      description:      desc,
      line:             resolveLineCode(row.line, desc),
      disponible,
      warehouseQty,
      pendingOrdersQty,
      category:         inferCategory(desc),
      productType:      inferProductType(desc),
      bodega,
    });
  }

  // ── Phase 2: deduplicate by refCode (sum quantities, keep first desc) ─────
  const seen    = new Map<string, SagInventoryNormalizedRow>();
  let duplicateRows = 0;

  for (const candidate of candidates) {
    const { rowIndex: _idx, ...row } = candidate;
    const existing = seen.get(row.refCode);

    if (existing) {
      // Aggregate quantities
      existing.disponible       += row.disponible;
      existing.warehouseQty     += row.warehouseQty;
      existing.pendingOrdersQty += row.pendingOrdersQty;
      duplicateRows++;
    } else {
      seen.set(row.refCode, { ...row });
    }
  }

  return {
    rows:             Array.from(seen.values()),
    validationErrors: validationErrors.slice(0, 20), // cap at 20 for API response
    duplicateRows,
    invalidRows,
    warehouses:       Array.from(warehouseSet),
  };
}
