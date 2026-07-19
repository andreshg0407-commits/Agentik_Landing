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

  const sellers: CommercialSeller[] = [...sellerAgg.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, data]) => {
      const lastMs = data.lastAt ? new Date(data.lastAt).getTime() : 0;
      const recentActivity = lastMs > 0 && (now - lastMs) < ninetyDaysMs;
      const hasCommercialPresence = data.count > 0 || data.customers.size > 0;

      let activityStatus: SellerActivityStatus;
      if (recentActivity) activityStatus = "activo";
      else if (hasCommercialPresence) activityStatus = "atencion";
      else activityStatus = "inactivo";

      return {
        sellerId: toSlug(data.name),
        sellerName: data.name,
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
 */
export async function getSellerBySlug(
  organizationId: string,
  slug: string,
): Promise<CommercialSeller | null> {
  const directory = await buildSellerDirectory(organizationId);
  return directory.sellers.find(s => s.sellerSlug === slug) ?? null;
}
