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
 * Promotion history:
 *   2026-08-14  castillitos → CERTIFIED
 *     Source: CURRENT = LUDISAM (Castillitos produccion desde 2026-07-21)
 *     Proof: _verify-cartera-sag-live.ts (11/11 PASS), _verify-cartera-certification.ts (23/23 PASS)
 *     - vw_agentik_cartera queryable on LUDISAM, fetchCertifiedArSnapshot returns CERTIFIED
 *     - Diana Alzate contrast: Prisma $7,727M phantom vs SAG $0.91M real
 *     - Non-Jupiter customers verified: Mayra Duque ($81.3M), Gloria Castano, Grupo Mayorista
 *     - SALDO_PENDIENTE pre-computed by SAG includes all collections
 *     - Canonical AR service handles SAG_UNAVAILABLE gracefully (falls back to UNVERIFIED)
 */
const TENANT_TRUTH_STATUS: Record<string, ReceivableTruthStatus> = {
  castillitos: "CERTIFIED",
};

const DEFAULT_TRUTH_STATUS: ReceivableTruthStatus = "UNVERIFIED";

/**
 * Slug lookup table for callers that pass organizationId (UUID) instead of slug.
 * Some consumers (org-alerts, sales-rep-alerts) receive UUID, not slug.
 * This allows the resolver to work with both without requiring a DB call.
 *
 * Only tenants that appear in TENANT_TRUTH_STATUS need an entry here.
 * Unknown UUIDs fall through to DEFAULT_TRUTH_STATUS (safe — UNVERIFIED).
 */
const ORG_ID_TO_SLUG: Record<string, string> = {};

/** Populated lazily on first call from Prisma. */
let slugLookupReady = false;

/**
 * Best-effort slug resolution: if orgIdOrSlug matches a known slug directly,
 * use it. Otherwise check the UUID→slug cache. Unknown inputs → default.
 */
function resolveSlug(orgIdOrSlug: string): string {
  if (TENANT_TRUTH_STATUS[orgIdOrSlug] !== undefined) return orgIdOrSlug;
  return ORG_ID_TO_SLUG[orgIdOrSlug] ?? orgIdOrSlug;
}

/**
 * Populate the UUID→slug cache from Prisma (called once, lazy).
 * Only loads orgs that are in TENANT_TRUTH_STATUS.
 * Fails silently — worst case is the gate stays closed (safe default).
 */
export async function warmTruthStatusCache(): Promise<void> {
  if (slugLookupReady) return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const slugs = Object.keys(TENANT_TRUTH_STATUS);
    if (slugs.length === 0) { slugLookupReady = true; return; }
    const orgs = await (prisma as any).organization.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
    for (const org of orgs) {
      ORG_ID_TO_SLUG[org.id] = org.slug;
    }
    slugLookupReady = true;
  } catch {
    // Safe fallback — UNVERIFIED for unknown UUIDs
  }
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the receivable truth status for a given organization.
 * Accepts either org slug ("castillitos") or org UUID.
 * Pure function after cache warm-up. No async, no side effects.
 */
export function resolveReceivableTruthStatus(
  orgIdOrSlug: string,
): ReceivableTruthStatus {
  return TENANT_TRUTH_STATUS[resolveSlug(orgIdOrSlug)] ?? DEFAULT_TRUTH_STATUS;
}

/**
 * Returns true only when overdue receivable data may be presented
 * as certified financial fact (warnings, attention items, alerts).
 * Accepts either org slug or org UUID.
 */
export function isReceivableDataCertified(
  orgIdOrSlug: string,
): boolean {
  return resolveReceivableTruthStatus(orgIdOrSlug) === "CERTIFIED";
}

// ── UI copy for unverified state ──────────────────────────────────────────────

/**
 * Non-accusatory label for unverified receivable data.
 * Use this instead of "Cartera vencida" when truth status != CERTIFIED.
 */
export const UNVERIFIED_RECEIVABLE_LABEL = "Información de cartera en validación";
