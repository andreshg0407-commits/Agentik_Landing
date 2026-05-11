/**
 * lib/customer360/resolve-customer.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CUSTOMER IDENTITY RESOLUTION — read-path (query services)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is the ONLY approved way for query services to resolve a customer
 * before running SQL against SaleRecord, CustomerReceivable, or CollectionRecord.
 *
 * Companion to lib/customer360/identity.ts (which handles the write path:
 * SAG sync → CustomerProfile create/upsert).
 *
 * ── Why this resolver exists ─────────────────────────────────────────────────
 *
 * Three identity fields coexist on CustomerProfile:
 *   nit           — legacy, may have formatting variants ("901.383.501")
 *   nitNormalized — canonical normalized form ("901383501")
 *   sagTerceroId  — SAG internal integer PK (ka_nl_tercero)
 *
 * Downstream tables store different keys:
 *   SaleRecord.customerNit       = String(ka_nl_tercero)   [for SAG PYA SOAP]
 *   CustomerReceivable.customerNit = real NIT from TERCEROS JOIN
 *   CollectionRecord.customerNit   = real NIT from TERCEROS JOIN
 *   CollectionRecord.sagTerceroId  = ka_nl_tercero (integer)
 *
 * Querying with the wrong key produces silent zero-row results — no error,
 * just missing data (wrong LTV, zero sales, incomplete cartera).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const profile = await resolveCustomerForQuery(orgId, { customerId });
 *   if (!profile) return null; // customer not found
 *
 *   const saleKey = getSaleRecordNitKey(profile);   // for SaleRecord queries
 *   const rxKey   = getReceivableNitKey(profile);   // for CustomerReceivable queries
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 *
 *   RULE: Never query SaleRecord with real NIT when sagTerceroId is available.
 *   RULE: Never query CustomerReceivable with sagTerceroId — always use real NIT.
 *   RULE: This function NEVER creates a new CustomerProfile. Use identity.ts for that.
 *   RULE: All new query services MUST use this resolver before querying SaleRecord.
 */

import { prisma } from "@/lib/prisma";

// ── Re-export normalizeNit so callers don't need to import identity.ts ────────
export { normalizeNit } from "./identity";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolvedCustomer {
  /** CustomerProfile.id — the canonical primary key. Always present. */
  customerId:    string;
  /** Canonical NIT: digits only, no dots, dashes, or DV suffix. */
  nitNormalized: string | null;
  /** Legacy nit field — use nitNormalized when possible. */
  nit:           string | null;
  /**
   * SAG internal integer PK (ka_nl_tercero).
   * This is the value stored as SaleRecord.customerNit for the SAG PYA SOAP integration.
   * Null if the profile has not been linked yet via linkCustomerSagTerceroIds().
   */
  sagTerceroId:  number | null;
  /** URL-safe slug for navigation. */
  slug:          string;
  /** Display name. */
  name:          string;
  /** Which field was used to find this profile. */
  resolvedBy:    "customerId" | "sagTerceroId" | "nitNormalized" | "nit";
}

export interface ResolveCustomerInput {
  /** CustomerProfile.id — fastest, most precise. */
  customerId?:    string | null;
  /**
   * SAG internal integer PK (ka_nl_tercero).
   * Matches CustomerProfile.sagTerceroId.
   */
  sagTerceroId?:  number | null;
  /**
   * Raw NIT string from any source (may contain dots/dashes).
   * Will be normalized before lookup.
   */
  nit?:           string | null;
  /**
   * Pre-normalized NIT (digits only).
   * Use when the caller has already normalized.
   */
  nitNormalized?: string | null;
}

// ── Query key helpers ─────────────────────────────────────────────────────────

/**
 * Returns the correct lookup key for SaleRecord.customerNit queries.
 *
 * IMPORTANT: For the SAG PYA SOAP integration (Castillitos), SaleRecord.customerNit
 * stores String(ka_nl_tercero) — the SAG integer PK — NOT the real NIT.
 * Prefer sagTerceroId when available; fall back to nitNormalized only when
 * sagTerceroId has not been linked yet (run linkCustomerSagTerceroIds() to fix).
 *
 * LEGACY NOTE: If this returns nitNormalized (because sagTerceroId is null),
 * SaleRecord queries will return zero rows for SAG PYA SOAP tenants.
 * This is a known gap until linkCustomerSagTerceroIds() is run post-sync.
 * See ARCHITECTURE_ROADMAP.md § Sprint S1.
 */
export function getSaleRecordNitKey(profile: ResolvedCustomer): string | null {
  if (profile.sagTerceroId != null) return String(profile.sagTerceroId);
  // LEGACY_NIT_JOIN: sagTerceroId not linked yet — fall back to real NIT.
  // SaleRecord queries will miss rows for SAG PYA SOAP tenants until fixed.
  return profile.nitNormalized ?? profile.nit ?? null;
}

/**
 * Returns the correct lookup key for CustomerReceivable.customerNit queries.
 *
 * CustomerReceivable.customerNit always stores the real NIT from the TERCEROS JOIN.
 * Never use sagTerceroId for CustomerReceivable queries.
 */
export function getReceivableNitKey(profile: ResolvedCustomer): string | null {
  return profile.nitNormalized ?? profile.nit ?? null;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Look up a CustomerProfile by any available identity field.
 *
 * Resolution order (most reliable → least reliable):
 *   1. customerId      — exact FK match
 *   2. sagTerceroId    — exact integer match on CustomerProfile.sagTerceroId
 *   3. nitNormalized   — normalized NIT match
 *   4. nit (raw)       — raw NIT match (normalizes before lookup)
 *
 * Returns null when no profile is found. NEVER creates a new profile.
 *
 * @param organizationId  Organization scope — always required.
 * @param input           Any combination of identity fields.
 */
export async function resolveCustomerForQuery(
  organizationId: string,
  input: ResolveCustomerInput,
): Promise<ResolvedCustomer | null> {
  const db = prisma as any;

  const select = {
    id:           true,
    slug:         true,
    name:         true,
    nit:          true,
    nitNormalized: true,
    sagTerceroId: true,
  };

  // ── 1. By customerId (fastest, no normalization needed) ───────────────────
  if (input.customerId) {
    const row = await db.customerProfile.findFirst({
      where:  { id: input.customerId, organizationId },
      select,
    });
    if (row) return toResolved(row, "customerId");
  }

  // ── 2. By sagTerceroId ────────────────────────────────────────────────────
  if (input.sagTerceroId != null && input.sagTerceroId > 0) {
    const row = await db.customerProfile.findFirst({
      where:  { organizationId, sagTerceroId: input.sagTerceroId },
      select,
    });
    if (row) return toResolved(row, "sagTerceroId");
  }

  // ── 3. By nitNormalized ───────────────────────────────────────────────────
  const normalizedInput = input.nitNormalized ?? normalizeNitLocal(input.nit);
  if (normalizedInput) {
    const row = await db.customerProfile.findFirst({
      where:  { organizationId, nitNormalized: normalizedInput },
      select,
    });
    if (row) return toResolved(row, "nitNormalized");

    // Also try legacy `nit` field for profiles where nitNormalized was never set.
    // This covers CustomerProfiles created before nitNormalized was added to the schema.
    // LEGACY_NIT_JOIN: Remove this fallback once all profiles have nitNormalized populated.
    const legacy = await db.customerProfile.findFirst({
      where:  { organizationId, nit: normalizedInput },
      select,
    });
    if (legacy) return toResolved(legacy, "nit");
  }

  return null;
}

// ── Batch resolver ────────────────────────────────────────────────────────────

/**
 * Resolve multiple customers by NIT in one database round-trip.
 * Returns a Map<nit, ResolvedCustomer> keyed by the INPUT nit (normalized).
 *
 * Used by cartera-kpis.ts and receivables-snapshot.ts to enrich top-debtor rows.
 */
export async function resolveCustomersByNit(
  organizationId: string,
  rawNits:        (string | null | undefined)[],
): Promise<Map<string, ResolvedCustomer>> {
  const db = prisma as any;

  const normalized = [...new Set(
    rawNits
      .map(n => normalizeNitLocal(n))
      .filter((n): n is string => n !== null),
  )];

  if (normalized.length === 0) return new Map();

  const rows = await db.customerProfile.findMany({
    where: {
      organizationId,
      OR: [
        { nitNormalized: { in: normalized } },
        // LEGACY_NIT_JOIN: also match by legacy nit field for older profiles
        { nit: { in: normalized } },
      ],
    },
    select: {
      id:           true,
      slug:         true,
      name:         true,
      nit:          true,
      nitNormalized: true,
      sagTerceroId: true,
    },
  });

  const result = new Map<string, ResolvedCustomer>();
  for (const row of rows) {
    const resolved = toResolved(row, row.nitNormalized ? "nitNormalized" : "nit");
    // Index by both normalized and raw nit so callers can look up by either
    if (row.nitNormalized) result.set(row.nitNormalized, resolved);
    if (row.nit && row.nit !== row.nitNormalized) result.set(row.nit, resolved);
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type ProfileRow = {
  id:           string;
  slug:         string;
  name:         string;
  nit:          string | null;
  nitNormalized: string | null;
  sagTerceroId: number | null;
};

function toResolved(row: ProfileRow, resolvedBy: ResolvedCustomer["resolvedBy"]): ResolvedCustomer {
  return {
    customerId:    row.id,
    nitNormalized: row.nitNormalized ?? null,
    nit:           row.nit          ?? null,
    sagTerceroId:  row.sagTerceroId ?? null,
    slug:          row.slug,
    name:          row.name,
    resolvedBy,
  };
}

/**
 * Local NIT normalizer (mirrors normalizeNit from identity.ts without the import).
 * Strips dots, spaces, dashes, and DV suffix. Returns null for blank/zero input.
 */
function normalizeNitLocal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = String(raw).trim().replace(/[\s.\-]/g, "");
  if (!clean || clean === "0") return null;
  const digits = clean.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
