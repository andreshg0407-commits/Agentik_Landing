/**
 * lib/marketing-studio/garment-fingerprint.ts
 *
 * Garment fingerprint engine — deterministic semantic hash.
 *
 * The fingerprint id (16-char hex) is derived from a canonicalised version of
 * the garment's semantic attributes so that identical garments across tenants
 * produce the same fingerprint id.  This enables deduplication and
 * cross-tenant preset recommendations.
 *
 * Algorithm (v2):
 *   1. Normalise each attribute (lowercase, trim, sort string arrays).
 *   2. Build a stable JSON string from the canonical fields only.
 *      v2 adds normalised detailLocks (pocket, stitching, wash, rise,
 *      embellishments) so jeans with different wash/pocket get distinct IDs.
 *   3. Compute two independent 32-bit DJB2 hashes → 64 bits total → 16 hex chars.
 *
 * Pure JS — no Node.js crypto import — safe for Edge runtime if needed later.
 *
 * Exports:
 *   computeGarmentFingerprint(tenantId, attrs, sku?)   → GarmentFingerprint
 *   fingerprintId(attrs)                               → 16-char hex (pure, no meta)
 *   FINGERPRINT_VERSION                                → current schema version
 */

import type { GarmentAttributes, GarmentFingerprint } from "./types";

// ── Version ───────────────────────────────────────────────────────────────────

/**
 * Increment when the canonicalisation algorithm changes.
 * v1 → v2: added detailLocks (pocket, stitching, wash, rise, embellishments)
 *           to the canonical form so garment variants get distinct fingerprints.
 */
export const FINGERPRINT_VERSION = 2;

// ── Hash primitive ────────────────────────────────────────────────────────────

/**
 * DJB2 hash — deterministic 32-bit unsigned integer for a given string.
 * Two calls with different salts give us 64 bits to minimise collisions.
 */
function djb2(str: string, seed = 5381): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function hashToHex16(canonical: string): string {
  const a = djb2(canonical, 5381).toString(16).padStart(8, "0");
  const b = djb2(canonical, 0x811c9dc5).toString(16).padStart(8, "0");
  return a + b;
}

// ── Canonicalisation ──────────────────────────────────────────────────────────

/**
 * Normalises GarmentAttributes into a deterministic canonical form.
 * Fields not relevant to identity (tags, ageGroup, notes) are excluded.
 *
 * v2 additions: detailLocks fields (pocket, stitching, wash, rise, embellishments)
 * are included so jeans variants with different detail locks get distinct IDs.
 */
function canonicalise(attrs: GarmentAttributes): object {
  const locks = attrs.detailLocks;
  return {
    category:     attrs.category.trim().toLowerCase(),
    colors:       [...attrs.colors].map(c => c.trim().toLowerCase()).sort(),
    pattern:      attrs.pattern?.trim().toLowerCase()      ?? null,
    fabric:       attrs.fabric?.trim().toLowerCase()       ?? null,
    fit:          attrs.fit?.trim().toLowerCase()          ?? null,
    gender:       attrs.gender.trim().toLowerCase(),
    priceSegment: attrs.priceSegment?.trim().toLowerCase() ?? null,
    // v2 — detail locks (null when absent so hash remains stable)
    dl_pocket:         locks?.pocket?.trim().toLowerCase()      ?? null,
    dl_stitching:      locks?.stitching?.trim().toLowerCase()   ?? null,
    dl_wash:           locks?.wash?.trim().toLowerCase()        ?? null,
    dl_rise:           locks?.rise?.trim().toLowerCase()        ?? null,
    dl_embellishments: locks?.embellishments
      ? [...locks.embellishments].map(e => e.trim().toLowerCase()).sort()
      : null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the 16-char hex fingerprint id for a given attribute set.
 * Pure function — no tenant or SKU context.
 */
export function fingerprintId(attrs: GarmentAttributes): string {
  const canonical = JSON.stringify(canonicalise(attrs));
  return hashToHex16(canonical);
}

/**
 * Builds a full GarmentFingerprint record for a tenant garment.
 *
 * @param tenantId  The tenant that owns this garment.
 * @param attrs     Semantic attributes of the garment.
 * @param sku       Optional ERP / catalogue SKU for this garment.
 */
export function computeGarmentFingerprint(
  tenantId: string,
  attrs:    GarmentAttributes,
  sku?:     string,
): GarmentFingerprint {
  return {
    id:         fingerprintId(attrs),
    tenantId,
    sku:        sku?.trim() || undefined,
    attributes: attrs,
    computedAt: new Date().toISOString(),
    version:    FINGERPRINT_VERSION,
  };
}

/**
 * Returns true when two fingerprints represent the same garment identity
 * (same id + same schema version).  Tenant and SKU are intentionally excluded
 * from equality so the same physical garment from different tenants matches.
 */
export function fingerprintsMatch(
  a: GarmentFingerprint,
  b: GarmentFingerprint,
): boolean {
  return a.id === b.id && a.version === b.version;
}
