/**
 * seller-directory.ts
 *
 * COMMERCIAL-DATA-FOUNDATION-01 — Phase 2
 *
 * Dynamic seller directory derived from real CRM data.
 * Replaces the hardcoded DEFAULT_VENDOR_REGISTRY (removed in STABILIZATION-01).
 *
 * Source: CRMQuote.sellerName (8 distinct sellers in Castillitos).
 * No Prisma model — pure service layer over existing data.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getSellerTerceroMapping } from "@/lib/comercial/frontline/seller-tercero-mapping";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SellerActivityStatus = "activo" | "atencion" | "inactivo";

export interface CommercialSeller {
  sellerId: string;    // slug derived from sellerName
  sellerName: string;
  sellerSlug: string;  // normalized for joins
  crmQuoteCount: number;
  customerCount: number;
  totalAmount: number;
  firstActivityAt: string | null; // ISO
  lastActivityAt: string | null;  // ISO
  active: boolean;                // had activity in last 90 days (legacy compat)
  activityStatus: SellerActivityStatus; // 3-state rule (VENDEDORES-ACTIVITY-AUDIT-01)
}

export interface SellerDirectoryResult {
  sellers: CommercialSeller[];
  totalSellers: number;
  activeSellers: number;
  source: "crm_quotes";
  generatedAt: string;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Directory Builder ─────────────────────────────────────────────────────────

export async function buildSellerDirectory(
  organizationId: string,
): Promise<SellerDirectoryResult> {
  const db = prisma as any;

  const quotes = await db.cRMQuote.findMany({
    where: { organizationId },
    select: {
      sellerName: true,
      sellerSlug: true,
      amount: true,
      issuedAt: true,
      rawCrmJson: true,
    },
  });

  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // Aggregate by seller
  const sellerAgg = new Map<string, {
    name: string;
    slug: string;
    count: number;
    customers: Set<string>;
    totalAmount: number;
    firstAt: Date | null;
    lastAt: Date | null;
  }>();

  for (const q of quotes) {
    const name = q.sellerName as string;
    if (!name) continue;

    const slug = q.sellerSlug || toSlug(name);
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const customerId = raw.billing_account_id || null;

    const existing = sellerAgg.get(name);
    if (existing) {
      existing.count++;
      if (customerId) existing.customers.add(customerId);
      existing.totalAmount += Number(q.amount ?? 0);
      if (q.issuedAt) {
        if (!existing.firstAt || q.issuedAt < existing.firstAt) existing.firstAt = q.issuedAt;
        if (!existing.lastAt || q.issuedAt > existing.lastAt) existing.lastAt = q.issuedAt;
      }
    } else {
      const customers = new Set<string>();
      if (customerId) customers.add(customerId);
      sellerAgg.set(name, {
        name,
        slug,
        count: 1,
        customers,
        totalAmount: Number(q.amount ?? 0),
        firstAt: q.issuedAt ?? null,
        lastAt: q.issuedAt ?? null,
      });
    }
  }

  // Exclude sellers that lack a certified SAG commercial identity.
  // The seller-tercero mapping (CustomerOrderRecord.sellerTerceroId) is
  // the canonical authority: if a sellerName has no SAG tercero link,
  // it has no certified commercial identity (e.g. CRM system accounts
  // like "Administrator" that create quotes programmatically).
  // This filter uses identity, not name comparison.
  const terceroMapping = await getSellerTerceroMapping(organizationId);
  const certifiedSlugs = new Set(terceroMapping.map(e => e.sellerSlug));

  // COMMERCIAL-TRUTH-CLOSURE: supplement activity detection with SAG order counts.
  // A seller with SAG orders but no recent CRM quotes should NOT be "inactivo".
  // Query SAG order counts per sellerTerceroId, then map back to slugs.
  const terceroIds = terceroMapping.map(e => e.sellerTerceroId);
  const sagOrderCounts = new Map<string, number>(); // slug → SAG order count
  if (terceroIds.length > 0) {
    const sagRows = await db.customerOrderRecord.groupBy({
      by: ["sellerTerceroId"],
      where: {
        organizationId,
        sellerTerceroId: { in: terceroIds },
      },
      _count: { id: true },
    });
    // Build terceroId → slug map for reverse lookup
    const terceroToSlug = new Map<number, string>();
    for (const e of terceroMapping) {
      terceroToSlug.set(e.sellerTerceroId, e.sellerSlug);
    }
    for (const row of sagRows) {
      const slug = terceroToSlug.get(row.sellerTerceroId as number);
      if (slug) sagOrderCounts.set(slug, row._count.id);
    }
  }

  // Build SAG tercero name lookup for seller name fallback
  const terceroNameBySlug = new Map<string, string>();
  for (const e of terceroMapping) {
    terceroNameBySlug.set(e.sellerSlug, e.sellerName);
  }

  // Activity status formula:
  // activo    = CRM quote in last 90d
  // atencion  = has quotes OR customers OR SAG orders, but no CRM quote in 90d
  // inactivo  = 0 quotes + 0 customers + 0 SAG orders
  const sellers: CommercialSeller[] = [...sellerAgg.entries()]
    .filter(([, data]) => certifiedSlugs.has(data.slug))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, data]) => {
      const lastMs = data.lastAt ? new Date(data.lastAt).getTime() : 0;
      const recentActivity = lastMs > 0 && (now - lastMs) < ninetyDaysMs;
      const sagOrders = sagOrderCounts.get(data.slug) ?? 0;
      const hasCommercialPresence = data.count > 0 || data.customers.size > 0 || sagOrders > 0;

      let activityStatus: SellerActivityStatus;
      if (recentActivity) activityStatus = "activo";
      else if (hasCommercialPresence) activityStatus = "atencion";
      else activityStatus = "inactivo";

      // Seller identity: prefer CRM quote name, fall back to SAG tercero name
      const displayName = data.name || terceroNameBySlug.get(data.slug) || data.name;

      return {
        sellerId: toSlug(displayName),
        sellerName: displayName,
        sellerSlug: data.slug,
        crmQuoteCount: data.count,
        customerCount: data.customers.size,
        totalAmount: data.totalAmount,
        firstActivityAt: data.firstAt?.toISOString() ?? null,
        lastActivityAt: data.lastAt?.toISOString() ?? null,
        active: activityStatus !== "inactivo",
        activityStatus,
      };
    });

  const activeSellers = sellers.filter(s => s.active).length;

  console.log(`[SELLER] buildSellerDirectory: ${sellers.length} sellers (${activeSellers} active) from ${quotes.length} CRM quotes`);

  return {
    sellers,
    totalSellers: sellers.length,
    activeSellers,
    source: "crm_quotes",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get a single seller by slug.
 *
 * FAIL-CLOSED: If multiple seller names normalize to the same slug,
 * returns null instead of arbitrarily selecting the first match.
 * This prevents silent identity ambiguity.
 *
 * SELLER_IDENTITY_STATUS = IDENTITY_UNSTABLE — seller slugs are
 * name-derived and mutable. Universal immutable Seller identity
 * is BLOCKED_BY_MISSING_CANONICAL_CONTRACT.
 */
export async function getSellerBySlug(
  organizationId: string,
  slug: string,
): Promise<CommercialSeller | null> {
  const directory = await buildSellerDirectory(organizationId);
  const matches = directory.sellers.filter(s => s.sellerSlug === slug);

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    console.error(
      `[SELLER] getSellerBySlug: AMBIGUOUS slug "${slug}" matches ${matches.length} sellers: ${matches.map(m => m.sellerName).join(", ")}. Fail closed — returning null.`,
    );
    return null;
  }

  return matches[0];
}
