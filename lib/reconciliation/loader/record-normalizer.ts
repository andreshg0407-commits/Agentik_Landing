/**
 * lib/reconciliation/loader/record-normalizer.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 5
 * Universal Normalization Pipeline
 *
 * Pure normalization functions: raw source records → CanonicalReconRecord[].
 *
 * Rules:
 *   - Pure functions. No Prisma. No side effects.
 *   - Delegates to engine/normalization.ts for text/number/date helpers — no duplication.
 *   - Delegates to orders-vs-sales-canonical.ts for SAG aggregate normalization — no duplication.
 *   - Returns empty array or null for malformed input — never throws.
 *
 * Adding a new source:
 *   1. Add a `normalizeXxx()` function here.
 *   2. Call it from the corresponding loader in sag-record-loader.ts (or new loader file).
 *   3. Bump NORMALIZATION_VERSION if the canonical mapping changes.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord }       from "../canonical-record";
import type { ReconSide }                  from "../types";
import { normalizeReconSideToCanonical }   from "../adapters/orders-vs-sales-canonical";

// ── Version ────────────────────────────────────────────────────────────────────

/**
 * Increment this when the canonical field mapping changes in a breaking way.
 * Governance snapshots store this value so historical evaluations remain auditable.
 */
export const NORMALIZATION_VERSION = "record-loader-01";

// ── SAG Aggregate (ReconSide) → CanonicalReconRecord[] ────────────────────────

/**
 * Normalize a ReconSide[] (SAG orders/sales aggregates) to CanonicalReconRecord[].
 *
 * Delegates entirely to normalizeReconSideToCanonical() from the existing adapter.
 * No duplication of normalization logic.
 */
export function normalizeSagSides(
  sides:    ReconSide[],
  sourceId: "sag_orders" | "sag_sales",
  period:   string,
): CanonicalReconRecord[] {
  return sides.map((s, i) => normalizeReconSideToCanonical(s, sourceId, period, i));
}
