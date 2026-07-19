/**
 * lib/reconciliation/adapters/orders-vs-sales-canonical.ts
 *
 * AGENTIK-RECON-ENGINE-01 — Task 11
 * Pedidos vs Ventas — Progressive Migration to Universal Engine
 *
 * This file wraps the existing orders-vs-sales adapter to route through
 * the new universal matching engine while preserving backward compatibility.
 *
 * Migration strategy:
 *   1. orders-vs-sales.ts is UNCHANGED — it still powers the current UI flow
 *   2. This file normalizes its ReconSide[] output → CanonicalReconRecord[]
 *   3. The universal engine runs on those canonical records
 *   4. The engine result is converted back to the existing ReconResult shape
 *      for full backward compatibility
 *
 * When this migration is complete:
 *   - run-service.ts will call runOrdersVsSalesViaEngine() instead of runOrdersVsSalesRecon()
 *   - The old engine.ts reconcile() function will be retired
 *   - This adapter will be the reference implementation for SAG order/sales normalization
 *
 * CRITICAL RULES:
 *   - Does NOT modify orders-vs-sales.ts
 *   - Does NOT touch SAG write layer
 *   - Does NOT change cartera, DIAN, or CollectionAllocation
 *   - Returns the same ReconResult shape the UI expects
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import {
  fetchReconSide,
  runOrdersVsSalesRecon,
} from "./orders-vs-sales";
import { runUniversalRecon }        from "../engine/recon-engine";
import type { CanonicalReconRecord } from "../canonical-record";
import type { ReconSide, ReconResult } from "../types";
import type { ReconciliationEngineResult } from "../engine/engine-types";

// ── Normalization: ReconSide → CanonicalReconRecord ────────────────────────────

/**
 * Convert an aggregated ReconSide record (SAG orders/sales format) to CanonicalReconRecord.
 *
 * The key (`sellerSlug|productLine|channel`) becomes the documentNumber.
 * This ensures exact matching in the universal engine mirrors the existing key-based engine.
 *
 * @param side       The aggregated ReconSide row
 * @param sourceId   "sag_orders" | "sag_sales"
 * @param period     YYYYMM period string (used to derive date)
 * @param indexInSide Zero-based position in the side array (for stable ID generation)
 */
export function normalizeReconSideToCanonical(
  side:        ReconSide,
  sourceId:    "sag_orders" | "sag_sales",
  period:      string,
  indexInSide: number,
): CanonicalReconRecord {
  const sellerSlug  = (side.meta as Record<string, string> | undefined)?.sellerName ?? side.key.split("|")[0] ?? "";
  const productLine = (side.meta as Record<string, string> | undefined)?.productLine ?? side.key.split("|")[1] ?? "";
  const channel     = (side.meta as Record<string, string> | undefined)?.channel     ?? side.key.split("|")[2] ?? "";

  // Derive a business date from the period (YYYYMM → first day of month)
  const year  = period.slice(0, 4);
  const month = period.slice(4, 6);
  const date  = `${year}-${month}-01`;

  return {
    // Stable ID: source + index (not a DB ID — engine never persists records)
    id:             `${sourceId}:${indexInSide}:${side.key}`,
    sourceId,
    externalId:     side.key,
    documentType:   "AGGREGATE_COMMERCIAL",
    // documentNumber = the composite key — ensures 1-to-1 matching with existing engine
    documentNumber: side.key,
    thirdPartyId:   side.key.split("|")[0] ?? null,   // sellerSlug as thirdPartyId
    thirdPartyName: sellerSlug || null,
    amount:         side.amount,
    currency:       "COP",
    date,
    dueDate:        null,
    reference:      side.label,
    accountCode:    null,
    status:         "aggregated",
    rawRef:         `SagAggregate:${sourceId}:${side.key}`,
    metadata: {
      rows:        side.rows,
      productLine,
      channel,
      period,
      originalKey: side.key,
    },
  };
}

/**
 * Normalize a full side of ReconSide[] to CanonicalReconRecord[].
 */
function normalizeReconSideArray(
  sides:    ReconSide[],
  sourceId: "sag_orders" | "sag_sales",
  period:   string,
): CanonicalReconRecord[] {
  return sides.map((s, i) => normalizeReconSideToCanonical(s, sourceId, period, i));
}

// ── Adapter: runOrdersVsSalesViaEngine ────────────────────────────────────────

/**
 * Run Pedidos vs Ventas reconciliation through the universal engine.
 *
 * Drop-in replacement for runOrdersVsSalesRecon() — same signature, same return type.
 * Uses the universal matching engine internally.
 *
 * @param organizationId  Tenant isolation — required
 * @param period          YYYYMM period
 * @param sourceAKey      Import source key for side A (e.g. "sag_pya", "csv", "all")
 * @param sourceBKey      Import source key for side B
 */
export async function runOrdersVsSalesViaEngine(
  organizationId: string,
  period:         string,
  sourceAKey:     string,
  sourceBKey:     string,
): Promise<ReconResult> {
  // Fetch both sides using the existing (unchanged) adapter
  const [rawSideA, rawSideB] = await Promise.all([
    fetchReconSide(organizationId, period, sourceAKey),
    fetchReconSide(organizationId, period, sourceBKey),
  ]);

  // Normalize to CanonicalReconRecord
  const recordsA = normalizeReconSideArray(rawSideA, "sag_orders", period);
  const recordsB = normalizeReconSideArray(rawSideB, "sag_sales",  period);

  // Run through universal engine
  const engineResult = runUniversalRecon({
    organizationId,
    sourceAType:  "sag_orders",
    sourceBType:  "sag_sales",
    sourceALabel: sourceAKey === "all" ? "Todas las fuentes (A)" : sourceAKey,
    sourceBLabel: sourceBKey === "all" ? "Todas las fuentes (B)" : sourceBKey,
    recordsA,
    recordsB,
    options: {
      amountTolerance:     0.001,
      minFuzzyScore:       60,
      dateFuzzyDays:       31,   // orders vs sales: same period ±31 days is acceptable
      maxFuzzyComparisons: 50_000,
      detectDuplicates:    true,
    },
  });

  // Convert engine result back to ReconResult (backward compatible)
  return engineResultToReconResult(engineResult, sourceAKey, sourceBKey, period);
}

// ── Result conversion ─────────────────────────────────────────────────────────

/**
 * Convert a ReconciliationEngineResult to the legacy ReconResult shape.
 *
 * This ensures the UI and run-service remain unchanged during the migration period.
 * Once the UI is updated to consume ReconciliationEngineResult directly,
 * this conversion layer can be removed.
 */
function engineResultToReconResult(
  result:     ReconciliationEngineResult,
  sourceAKey: string,
  sourceBKey: string,
  period:     string,
): ReconResult {
  const records = [
    // Matched pairs → MATCH or MISMATCH_AMOUNT
    ...result.matches.map(m => ({
      key:          m.recordA.documentNumber ?? m.recordA.externalId,
      label:        (m.recordA.metadata as Record<string, unknown>)?.originalKey
                      ? String((m.recordA.metadata as Record<string, unknown>).originalKey)
                      : m.recordA.reference ?? m.recordA.externalId,
      status:       (m.explanation.decision === "exact_match" ? "MATCH" : "MISMATCH_AMOUNT") as import("../types").ReconStatus,
      amountA:      m.recordA.amount,
      amountB:      m.recordB.amount,
      delta:        m.amountDelta,
      deltaPercent: m.amountDeltaPct,
      rowsA:        Number((m.recordA.metadata as Record<string, unknown>)?.rows ?? 0),
      rowsB:        Number((m.recordB.metadata as Record<string, unknown>)?.rows ?? 0),
      metaA:        m.recordA.metadata as Record<string, unknown>,
      metaB:        m.recordB.metadata as Record<string, unknown>,
    })),

    // Probable matches → POSSIBLE_DUPLICATE (closest legacy status)
    ...result.exceptions
      .filter(e => e.type === "probable_match")
      .map(e => ({
        key:          e.recordA?.documentNumber ?? e.recordA?.externalId ?? e.recordB?.documentNumber ?? "",
        label:        e.explanation,
        status:       "POSSIBLE_DUPLICATE" as import("../types").ReconStatus,
        amountA:      e.amountA ?? null,
        amountB:      e.amountB ?? null,
        delta:        e.amountDelta ?? null,
        deltaPercent: null,
        rowsA:        0,
        rowsB:        0,
      })),

    // Only in A
    ...result.exceptions
      .filter(e => e.type === "only_in_a" && e.recordA)
      .map(e => ({
        key:          e.recordA!.documentNumber ?? e.recordA!.externalId,
        label:        e.recordA!.reference ?? e.recordA!.externalId,
        status:       "ONLY_IN_A" as import("../types").ReconStatus,
        amountA:      e.recordA!.amount,
        amountB:      null,
        delta:        null,
        deltaPercent: null,
        rowsA:        Number((e.recordA!.metadata as Record<string, unknown>)?.rows ?? 0),
        rowsB:        0,
        metaA:        e.recordA!.metadata as Record<string, unknown>,
      })),

    // Only in B
    ...result.exceptions
      .filter(e => e.type === "only_in_b" && e.recordB)
      .map(e => ({
        key:          e.recordB!.documentNumber ?? e.recordB!.externalId,
        label:        e.recordB!.reference ?? e.recordB!.externalId,
        status:       "ONLY_IN_B" as import("../types").ReconStatus,
        amountA:      null,
        amountB:      e.recordB!.amount,
        delta:        null,
        deltaPercent: null,
        rowsA:        0,
        rowsB:        Number((e.recordB!.metadata as Record<string, unknown>)?.rows ?? 0),
        metaB:        e.recordB!.metadata as Record<string, unknown>,
      })),
  ];

  return {
    reconType:    "orders_vs_sales",
    scope:        `period:${period}`,
    sourceALabel: sourceAKey === "all" ? "Todas las fuentes (A)" : sourceAKey,
    sourceBLabel: sourceBKey === "all" ? "Todas las fuentes (B)" : sourceBKey,
    summary: {
      total:              result.summary.total,
      matched:            result.summary.matched,
      mismatchAmount:     result.summary.mismatchAmount,
      onlyInA:            result.summary.onlyInA,
      onlyInB:            result.summary.onlyInB,
      possibleDuplicates: result.summary.possibleDuplicates,
      totalAmountA:       result.summary.totalAmountA,
      totalAmountB:       result.summary.totalAmountB,
      deltaTotal:         result.summary.deltaTotal,
      matchRate:          result.summary.matchRate,
    },
    records,
    runAt: result.runAt,
  };
}
