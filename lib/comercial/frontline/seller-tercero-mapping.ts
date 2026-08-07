/**
 * lib/comercial/frontline/seller-tercero-mapping.ts
 *
 * AGENTIK-SELLER-APP-V1-FINAL-CERT
 *
 * Canonical mapping: sellerSlug → sellerTerceroId (SAG integer).
 *
 * Source: CustomerOrderRecord.sellerTerceroId (persisted during SAG sync from
 * ka_nl_tercero_vend). The mapping is built once per tenant session by reading
 * DISTINCT (sellerName, sellerTerceroId) pairs from already-synced order data.
 *
 * This is NOT runtime name matching. The mapping is:
 *   1. Built once from persisted data (cached 10 min)
 *   2. Keyed by normalized slug (deterministic, no case sensitivity)
 *   3. Returns a stable integer — the authorization key for order queries
 *
 * Provenance: CustomerOrderRecord.sellerTerceroId ← SAG MOVIMIENTOS.ka_nl_tercero_vend
 *
 * Name matching is used ONLY during mapping construction (bootstrap) to connect
 * the CRM sellerSlug namespace to the SAG sellerTerceroId namespace. Once the
 * mapping is built, runtime lookups are slug → integer with zero name matching.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

const db = prisma as any;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SellerTerceroEntry {
  sellerName: string;       // SAG UPPERCASE name (display only)
  sellerTerceroId: number;  // SAG ka_nl_tercero_vend (authorization key)
  sellerSlug: string;       // normalized slug for lookup
}

// ── Slug normalization (must match seller-directory.ts toSlug) ────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const cache = new Map<string, { entries: SellerTerceroEntry[]; builtAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// ── Build canonical mapping ──────────────────────────────────────────────────

/**
 * Build the canonical sellerSlug → sellerTerceroId mapping for an organization.
 *
 * Reads DISTINCT (sellerName, sellerTerceroId) from persisted CustomerOrderRecord
 * data. Each sellerName is normalized to a slug. The mapping is cached for 10 min.
 *
 * This is a bootstrap read — not a runtime name authority. The slug is the lookup
 * key, the integer is the authorization value.
 */
async function buildSellerTerceroMapping(
  organizationId: string,
): Promise<SellerTerceroEntry[]> {
  const cached = cache.get(organizationId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL) {
    return cached.entries;
  }

  const rows = await db.customerOrderRecord.findMany({
    where: {
      organizationId,
      sellerTerceroId: { not: null },
    },
    distinct: ["sellerTerceroId"],
    select: { sellerName: true, sellerTerceroId: true },
  });

  const entries: SellerTerceroEntry[] = [];
  const seen = new Set<number>();

  for (const r of rows) {
    const id = r.sellerTerceroId as number;
    if (seen.has(id)) continue;
    seen.add(id);

    const name = (r.sellerName as string) ?? "";
    entries.push({
      sellerName: name,
      sellerTerceroId: id,
      sellerSlug: toSlug(name),
    });
  }

  cache.set(organizationId, { entries, builtAt: Date.now() });
  return entries;
}

// ── Public lookup ────────────────────────────────────────────────────────────

/**
 * Resolve sellerTerceroId from a sellerSlug.
 *
 * Lookup is slug-based (deterministic, case-insensitive by construction).
 * No runtime name matching. Returns the SAG integer as a string, or null.
 *
 * Provenance: CustomerOrderRecord.sellerTerceroId ← SAG ka_nl_tercero_vend
 */
export async function lookupSellerTerceroId(
  organizationId: string,
  sellerSlug: string,
): Promise<string | null> {
  if (!sellerSlug) return null;

  const mapping = await buildSellerTerceroMapping(organizationId);
  const normalizedSlug = sellerSlug.toLowerCase();

  const entry = mapping.find(e => e.sellerSlug === normalizedSlug);
  if (entry) {
    return String(entry.sellerTerceroId);
  }

  return null;
}

/**
 * Resolve sellerTerceroId from a sellerName (bootstrap/migration only).
 *
 * This function exists for the initial connection between CRM seller names
 * (mixed case) and SAG sellerTerceroId. It normalizes both to slugs and
 * compares. This is NOT the runtime authorization lookup — use
 * lookupSellerTerceroId(orgId, sellerSlug) for that.
 */
export async function bootstrapSellerTerceroId(
  organizationId: string,
  sellerName: string | null,
): Promise<string | null> {
  if (!sellerName) return null;

  const mapping = await buildSellerTerceroMapping(organizationId);
  const nameSlug = toSlug(sellerName);

  const entry = mapping.find(e => e.sellerSlug === nameSlug);
  if (entry) {
    return String(entry.sellerTerceroId);
  }

  return null;
}

/**
 * Get the full mapping for diagnostics/testing.
 */
export async function getSellerTerceroMapping(
  organizationId: string,
): Promise<SellerTerceroEntry[]> {
  return buildSellerTerceroMapping(organizationId);
}
