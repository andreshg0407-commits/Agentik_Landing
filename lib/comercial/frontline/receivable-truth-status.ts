/**
 * lib/comercial/frontline/receivable-truth-status.ts
 *
 * AGENTIK-RECEIVABLES-SAFETY-LOCK-P0
 *
 * Receivable truth status — presentation eligibility gate.
 *
 * Financial certification (AGENTIK-VW-AGENTIK-PAGOS-APPLICATION-CERT-01)
 * proved that current Castillitos CustomerReceivable pipeline does not
 * include payment application data from vw_agentik_recaudos. Overdue
 * amounts are over-reported (e.g. AMV LLANO: $542M shown vs $35.6M real).
 *
 * Until a certified reconciliation pipeline exists (AGENTIK-RECEIVABLES-AR-TRUTH-01),
 * all overdue warnings, attention items, and definitive financial statements
 * derived from CustomerReceivable are SUPPRESSED.
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01 establishes:
 *   CANONICAL_COLLECTION_SOURCE = dbo.vw_agentik_recaudos
 *   LEGACY_COLLECTION_SOURCE    = v_pagosnew (SAG_V_PAGOSNEW)
 *
 * CollectionRecord sourced from SAG_V_PAGOSNEW MUST NOT be used as
 * canonical AR authority. See collection-source-authority.ts.
 *
 * This file is pure types + deterministic resolver. No DB. No SAG. No side effects.
 */

// ── Truth status enum ─────────────────────────────────────────────────────────

/**
 * Receivable truth status determines whether overdue data may be presented
 * as certified financial fact.
 *
 * CERTIFIED           — Pipeline includes payment application reconciliation.
 *                       Overdue amounts are trustworthy.
 * UNVERIFIED          — Pipeline does NOT include payment applications.
 *                       Overdue amounts may be severely over-reported.
 * STALE               — Pipeline was certified but data is older than threshold.
 * SOURCE_CONFLICT     — Multiple sources disagree on balance.
 * MISSING_APPLICATION — Payment application data source is absent.
 */
export type ReceivableTruthStatus =
  | "CERTIFIED"
  | "UNVERIFIED"
  | "STALE"
  | "SOURCE_CONFLICT"
  | "MISSING_APPLICATION_DETAIL";

// ── Per-tenant truth status registry ──────────────────────────────────────────

/**
 * Tenant-level receivable truth status.
 *
 * This is intentionally a static registry — not a DB query.
 * A tenant graduates to CERTIFIED only when its reconciliation pipeline
 * is audited and proven correct.
 *
 * Current state (2026-08-09):
 *   castillitos: UNVERIFIED — CustomerReceivable does not include
 *                vw_agentik_recaudos payment applications.
 */
const TENANT_TRUTH_STATUS: Record<string, ReceivableTruthStatus> = {
  // No tenants are certified yet.
  // When AGENTIK-RECEIVABLES-AR-TRUTH-01 completes for a tenant,
  // add: "tenant-slug": "CERTIFIED"
};

const DEFAULT_TRUTH_STATUS: ReceivableTruthStatus = "UNVERIFIED";

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the receivable truth status for a given organization.
 * Pure function — no DB, no async, no side effects.
 */
export function resolveReceivableTruthStatus(
  orgSlug: string,
): ReceivableTruthStatus {
  return TENANT_TRUTH_STATUS[orgSlug] ?? DEFAULT_TRUTH_STATUS;
}

/**
 * Returns true only when overdue receivable data may be presented
 * as certified financial fact (warnings, attention items, alerts).
 */
export function isReceivableDataCertified(
  orgSlug: string,
): boolean {
  return resolveReceivableTruthStatus(orgSlug) === "CERTIFIED";
}

// ── UI copy for unverified state ──────────────────────────────────────────────

/**
 * Non-accusatory label for unverified receivable data.
 * Use this instead of "Cartera vencida" when truth status != CERTIFIED.
 */
export const UNVERIFIED_RECEIVABLE_LABEL = "Información de cartera en validación";
