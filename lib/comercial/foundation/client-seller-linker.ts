/**
 * client-seller-linker.ts
 *
 * COMMERCIAL-DATA-FOUNDATION-01 — Phase 3
 *
 * Determines primary seller for each customer using CRM quote history.
 *
 * Strategy:
 *   1. Query all CRMQuotes for the org
 *   2. Resolve billing_account_id → CustomerProfile.crmId
 *   3. For each customer, count quotes per seller
 *   4. Primary seller = seller with most quotes for that customer
 *   5. Confidence = (primary seller quotes / total customer quotes) * 100
 *   6. If confidence < 60%, return null (NO guessing)
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClientSellerLink {
  profileId: string;
  customerName: string;
  primarySeller: string | null;
  primarySellerSlug: string | null;
  confidenceScore: number; // 0-100
  totalQuotes: number;
  primarySellerQuotes: number;
  alternativeSellers: { name: string; quotes: number }[];
}

export interface ClientSellerLinkReport {
  totalProfiles: number;
  linkedToSeller: number;
  highConfidence: number;   // >= 80%
  mediumConfidence: number; // 60-79%
  lowConfidence: number;    // < 60% (returned as null)
  noQuotes: number;
  links: ClientSellerLink[];
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

// ── Linker ────────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 60;

export async function buildClientSellerLinks(
  organizationId: string,
): Promise<ClientSellerLinkReport> {
  const db = prisma as any;

  // 1. Get all CRM quotes with billing_account_id and seller
  const quotes = await db.cRMQuote.findMany({
    where: { organizationId },
    select: { sellerName: true, rawCrmJson: true },
  });

  // 2. Get all customer profiles with crmId
  const profiles = await db.customerProfile.findMany({
    where: { organizationId },
    select: { id: true, name: true, crmId: true },
  });

  // Build crmId → profileId map
  const crmToProfile = new Map<string, { id: string; name: string }>();
  for (const p of profiles) {
    if (p.crmId) crmToProfile.set(p.crmId, { id: p.id, name: p.name });
  }

  // 3. Aggregate quotes per customer per seller
  const customerSellers = new Map<string, Map<string, number>>();
  const customerNames = new Map<string, string>();

  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const billingId = raw.billing_account_id as string | undefined;
    const sellerName = q.sellerName as string;
    if (!billingId || !sellerName) continue;

    const profile = crmToProfile.get(billingId);
    if (!profile) continue;

    customerNames.set(profile.id, profile.name);

    const sellers = customerSellers.get(profile.id) ?? new Map<string, number>();
    sellers.set(sellerName, (sellers.get(sellerName) ?? 0) + 1);
    customerSellers.set(profile.id, sellers);
  }

  // 4. Compute primary seller per customer
  const links: ClientSellerLink[] = [];
  let linked = 0;
  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;

  for (const [profileId, sellers] of customerSellers) {
    const total = [...sellers.values()].reduce((a, b) => a + b, 0);
    const sorted = [...sellers.entries()].sort((a, b) => b[1] - a[1]);
    const [primaryName, primaryCount] = sorted[0];
    const confidence = Math.round((primaryCount / total) * 100);

    const alternatives = sorted.slice(1).map(([name, quotes]) => ({ name, quotes }));

    if (confidence >= 80) highConf++;
    else if (confidence >= CONFIDENCE_THRESHOLD) medConf++;
    else lowConf++;

    const isLinked = confidence >= CONFIDENCE_THRESHOLD;
    if (isLinked) linked++;

    links.push({
      profileId,
      customerName: customerNames.get(profileId) ?? "Desconocido",
      primarySeller: isLinked ? primaryName : null,
      primarySellerSlug: isLinked ? toSlug(primaryName) : null,
      confidenceScore: confidence,
      totalQuotes: total,
      primarySellerQuotes: primaryCount,
      alternativeSellers: alternatives,
    });
  }

  // Customers with no quotes at all
  const noQuotes = profiles.length - customerSellers.size;

  console.log(`[CLIENT_LINK] buildClientSellerLinks: ${links.length} customers with quotes, ${linked} linked (>=${CONFIDENCE_THRESHOLD}% confidence), ${noQuotes} without quotes`);

  return {
    totalProfiles: profiles.length,
    linkedToSeller: linked,
    highConfidence: highConf,
    mediumConfidence: medConf,
    lowConfidence: lowConf,
    noQuotes,
    links,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get primary seller for a single customer.
 */
export async function getCustomerPrimarySeller(
  organizationId: string,
  profileId: string,
): Promise<{ sellerName: string | null; confidence: number }> {
  const report = await buildClientSellerLinks(organizationId);
  const link = report.links.find(l => l.profileId === profileId);
  if (!link) return { sellerName: null, confidence: 0 };
  return { sellerName: link.primarySeller, confidence: link.confidenceScore };
}
