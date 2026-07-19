/**
 * shared/identifiers.ts
 *
 * Canonical identifier utilities for the Commercial Data Layer.
 * All IDs are deterministic, tenant-scoped, and reversible.
 */

// ── Canonical ID Format ─────────────────────────────────────────────────────
// Format: {tenantId}:{domain}:{entityType}:{encodedKey}
// Example: castillitos:PRODUCT:ProductProfile:REF-001

const SEPARATOR = ":";

export interface CanonicalIdComponents {
  readonly tenantId: string;
  readonly domain: string;
  readonly entityType: string;
  readonly naturalKey: string;
}

// ── Build ───────────────────────────────────────────────────────────────────

export function buildCanonicalId(components: CanonicalIdComponents): string {
  const { tenantId, domain, entityType, naturalKey } = components;
  const encoded = encodeKey(naturalKey);
  return [tenantId, domain, entityType, encoded].join(SEPARATOR);
}

// ── Parse ───────────────────────────────────────────────────────────────────

export function parseCanonicalId(canonicalId: string): CanonicalIdComponents | null {
  const parts = canonicalId.split(SEPARATOR);
  if (parts.length < 4) return null;

  const [tenantId, domain, entityType, ...rest] = parts;
  const encodedKey = rest.join(SEPARATOR);
  const naturalKey = decodeKey(encodedKey);

  if (!tenantId || !domain || !entityType || !naturalKey) return null;

  return { tenantId, domain, entityType, naturalKey };
}

// ── Tenant-Scoped Key ───────────────────────────────────────────────────────

export function buildTenantScopedKey(tenantId: string, key: string): string {
  return `${tenantId}${SEPARATOR}${key}`;
}

// ── External Reference Key ──────────────────────────────────────────────────

export function buildExternalReferenceKey(
  tenantId: string,
  system: string,
  externalId: string
): string {
  return [tenantId, system, encodeKey(externalId)].join(SEPARATOR);
}

// ── Natural Key ─────────────────────────────────────────────────────────────

export function buildNaturalKey(parts: string[]): string {
  return parts.map(encodeKey).join(SEPARATOR);
}

// ── Validation ──────────────────────────────────────────────────────────────

export function isCanonicalId(value: string): boolean {
  const parts = value.split(SEPARATOR);
  return parts.length >= 4 && parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0 && parts[3].length > 0;
}

// ── Comparison ──────────────────────────────────────────────────────────────

export function compareCanonicalIds(a: string, b: string): boolean {
  return a === b;
}

// ── Encoding ────────────────────────────────────────────────────────────────
// Encode/decode keys to handle special characters safely.
// Uses percent-encoding for the separator character and percent sign.

function encodeKey(key: string): string {
  return key
    .replace(/%/g, "%25")
    .replace(/:/g, "%3A");
}

function decodeKey(encoded: string): string {
  return encoded
    .replace(/%3A/g, ":")
    .replace(/%25/g, "%");
}
