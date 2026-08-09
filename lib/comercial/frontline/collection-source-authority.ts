/**
 * lib/comercial/frontline/collection-source-authority.ts
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01
 *
 * Collection source authority contract.
 *
 * Establishes which SAG collection sources may be treated as canonical
 * AR (accounts receivable) authority for computing:
 *   - net receivable balances (originalAmount - appliedPayments)
 *   - overdue amounts
 *   - DPD (days past due)
 *   - credit decisions
 *   - financial statements
 *
 * CANONICAL_COLLECTION_SOURCE = dbo.vw_agentik_recaudos
 * LEGACY_COLLECTION_SOURCE    = v_pagosnew
 *
 * v_pagosnew MUST NOT be used as:
 *   - primary source
 *   - fallback
 *   - complement
 *   - union
 *   - gap filler
 *
 * CollectionRecord rows sourced from SAG_V_PAGOSNEW are operational
 * telemetry only — they may be used for:
 *   - shadow reconciliation (simulation, never authoritative)
 *   - cobros dashboards (with "unverified" badge)
 *   - data quality audits
 *   - customer identity linking (sagTerceroId bridge)
 *
 * This file is pure types + deterministic functions. No DB. No SAG. No side effects.
 */

// ── Collection amount source enum (mirrors Prisma CollectionAmountSource) ────

export type CollectionAmountSource =
  | "SAG_V_PAGOSNEW"
  | "SAG_V_MOVPAGOS"
  | "SAG_V_DOCPAGOS"
  | "SAG_VW_AGENTIK_RECAUDOS"
  | "MANUAL";

// ── Source authority classification ─────────────────────────────────────────

export type CollectionSourceAuthority =
  | "CANONICAL"
  | "LEGACY"
  | "PENDING_VALIDATION"
  | "MANUAL";

/**
 * Source authority registry.
 *
 * Only CANONICAL sources may produce authoritative AR data.
 * LEGACY sources exist for operational telemetry — never for AR truth.
 */
const SOURCE_AUTHORITY: Record<CollectionAmountSource, CollectionSourceAuthority> = {
  SAG_VW_AGENTIK_RECAUDOS: "CANONICAL",
  SAG_V_PAGOSNEW:          "LEGACY",
  SAG_V_MOVPAGOS:          "PENDING_VALIDATION",
  SAG_V_DOCPAGOS:          "PENDING_VALIDATION",
  MANUAL:                  "MANUAL",
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the authority classification for a collection amount source.
 */
export function resolveCollectionSourceAuthority(
  source: CollectionAmountSource | string,
): CollectionSourceAuthority {
  return SOURCE_AUTHORITY[source as CollectionAmountSource] ?? "PENDING_VALIDATION";
}

/**
 * Returns true only when the source is canonical — i.e., its data
 * may be used to compute authoritative AR balances.
 */
export function isCanonicalCollectionSource(
  source: CollectionAmountSource | string,
): boolean {
  return resolveCollectionSourceAuthority(source) === "CANONICAL";
}

/**
 * Returns true when the source is legacy — its data MUST NOT be used
 * for AR truth under any circumstance (primary, fallback, complement,
 * union, or gap filler).
 */
export function isLegacyCollectionSource(
  source: CollectionAmountSource | string,
): boolean {
  return resolveCollectionSourceAuthority(source) === "LEGACY";
}

// ── Constants ───────────────────────────────────────────────────────────────

/** The one and only canonical collection source for AR truth. */
export const CANONICAL_COLLECTION_SOURCE: CollectionAmountSource = "SAG_VW_AGENTIK_RECAUDOS";

/** The legacy source that MUST NOT be treated as AR authority. */
export const LEGACY_COLLECTION_SOURCE: CollectionAmountSource = "SAG_V_PAGOSNEW";

/**
 * Label for collection data sourced from v_pagosnew.
 * Use this in UI instead of presenting legacy data as authoritative.
 */
export const LEGACY_COLLECTION_LABEL = "Recaudos sin verificar (fuente legacy)";

/**
 * Label for collection data sourced from vw_agentik_recaudos.
 */
export const CANONICAL_COLLECTION_LABEL = "Recaudos verificados";

// ── Guard functions for consumers ───────────────────────────────────────────

/**
 * Guard: assert that a CollectionRecord's amountSource is canonical
 * before using it for AR truth calculations.
 *
 * Returns a discriminated result so callers handle both cases explicitly.
 */
export function assertCanonicalSource(
  amountSource: string,
): { canonical: true } | { canonical: false; reason: string } {
  if (isCanonicalCollectionSource(amountSource)) {
    return { canonical: true };
  }

  const authority = resolveCollectionSourceAuthority(amountSource);
  if (authority === "LEGACY") {
    return {
      canonical: false,
      reason: `Source "${amountSource}" is LEGACY. v_pagosnew MUST NOT be used as AR authority (primary, fallback, complement, union, or gap filler).`,
    };
  }

  return {
    canonical: false,
    reason: `Source "${amountSource}" has authority "${authority}" — not yet validated for AR truth.`,
  };
}
