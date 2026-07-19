/**
 * commercial-identity-map.ts
 *
 * COMMERCIAL-DATA-FOUNDATION-01 — Phase 1
 *
 * Resolves cross-system identity keys between CRM, SAG, and Agentik.
 * This is the single source of truth for how commercial entities link.
 *
 * Identity chains:
 *   Cliente: CRM.billing_account_id → CustomerProfile.crmId → CustomerProfile.nit → SAG.ka_nl_tercero
 *   Pedido:  CRM.id_sag_c → CustomerOrderRecord.erpMovId
 *   Vendedor: CRM.sellerName → slugify → sellerSlug (no SAG link yet)
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IdentityLink {
  crmId: string | null;
  profileId: string | null;
  nit: string | null;
  sagTerceroId: string | null;
  linkMethod: "crm_billing_account" | "nit_match" | "crm_id_direct" | "unlinked";
  confidence: number; // 0-100
}

export interface OrderIdentityLink {
  crmQuoteId: string | null;
  sagMovId: string | null;  // id_sag_c from CRM rawJson
  erpMovId: string | null;  // CustomerOrderRecord.erpMovId
  linkMethod: "id_sag_c" | "unlinked";
  crmStage: string | null;
  linked: boolean;
}

export interface SellerIdentity {
  sellerName: string;
  sellerSlug: string;
  crmQuoteCount: number;
  firstActivity: string | null; // ISO
  lastActivity: string | null;  // ISO
  sagName: string | null; // from old registry or future SAG link
}

export interface CommercialIdentityReport {
  clients: {
    totalProfiles: number;
    withCrmId: number;
    withNit: number;
    withSagTerceroId: number;
    crmBillingMatched: number;
    nitMatchedToOrders: number;
  };
  orders: {
    totalCrmQuotes: number;
    withIdSagC: number;
    matchedToSagOrder: number;
    totalSagOrders: number;
    crmStageDistribution: Record<string, number>;
  };
  sellers: {
    totalFromCrm: number;
    sellerList: SellerIdentity[];
  };
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

// ── Identity Report Builder ──────────────────────────────────────────────────

export async function buildCommercialIdentityReport(
  organizationId: string,
): Promise<CommercialIdentityReport> {
  const db = prisma as any;

  // ── Client identity counts ────────────────────────────────────────────────
  const [totalProfiles, withCrmId, withNit, withSagTerceroId] = await Promise.all([
    db.customerProfile.count({ where: { organizationId } }),
    db.customerProfile.count({ where: { organizationId, crmId: { not: null } } }),
    db.customerProfile.count({ where: { organizationId, nit: { not: null } } }),
    db.customerProfile.count({ where: { organizationId, sagTerceroId: { not: null } } }),
  ]);

  // CRM billing_account_id → CustomerProfile.crmId match
  const allQuotes = await db.cRMQuote.findMany({
    where: { organizationId },
    select: { rawCrmJson: true },
  });
  const profileCrmIds = await db.customerProfile.findMany({
    where: { organizationId, crmId: { not: null } },
    select: { crmId: true },
  });
  const crmIdSet = new Set(profileCrmIds.map((p: any) => p.crmId));
  let crmBillingMatched = 0;
  for (const q of allQuotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    if (raw.billing_account_id && crmIdSet.has(raw.billing_account_id)) {
      crmBillingMatched++;
    }
  }

  // NIT match: CustomerOrderRecord.customerNit → CustomerProfile.nit
  const orderNits = await db.customerOrderRecord.findMany({
    where: { organizationId },
    select: { customerNit: true },
  });
  const profileNits = await db.customerProfile.findMany({
    where: { organizationId, nit: { not: null } },
    select: { nit: true },
  });
  const nitSet = new Set(profileNits.map((p: any) => p.nit));
  let nitMatchedToOrders = 0;
  for (const o of orderNits) {
    if (o.customerNit && nitSet.has(o.customerNit)) nitMatchedToOrders++;
  }

  // ── Order identity ────────────────────────────────────────────────────────
  const totalCrmQuotes = allQuotes.length;
  let withIdSagC = 0;
  let matchedToSagOrder = 0;
  const stageDistribution: Record<string, number> = {};

  const sagOrders = await db.customerOrderRecord.findMany({
    where: { organizationId },
    select: { erpMovId: true },
  });
  const erpSet = new Set(sagOrders.map((o: any) => String(o.erpMovId)));

  for (const q of allQuotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const stage = (raw.stage as string) || "EMPTY";
    stageDistribution[stage] = (stageDistribution[stage] || 0) + 1;

    if (raw.id_sag_c && raw.id_sag_c !== "") {
      withIdSagC++;
      if (erpSet.has(raw.id_sag_c)) matchedToSagOrder++;
    }
  }

  // ── Seller identity ──────────────────────────────────────────────────────
  const sellerQuotes = await db.cRMQuote.findMany({
    where: { organizationId },
    select: { sellerName: true, issuedAt: true },
    orderBy: { issuedAt: "asc" },
  });

  const sellerMap = new Map<string, { count: number; first: Date | null; last: Date | null }>();
  for (const q of sellerQuotes) {
    const name = q.sellerName as string;
    if (!name) continue;
    const existing = sellerMap.get(name);
    if (existing) {
      existing.count++;
      if (q.issuedAt && (!existing.last || q.issuedAt > existing.last)) {
        existing.last = q.issuedAt;
      }
    } else {
      sellerMap.set(name, { count: 1, first: q.issuedAt, last: q.issuedAt });
    }
  }

  const sellerList: SellerIdentity[] = [...sellerMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => ({
      sellerName: name,
      sellerSlug: toSlug(name),
      crmQuoteCount: data.count,
      firstActivity: data.first?.toISOString() ?? null,
      lastActivity: data.last?.toISOString() ?? null,
      sagName: null,
    }));

  console.log(`[COMMERCIAL_FOUNDATION] Identity report: ${totalProfiles} profiles, ${totalCrmQuotes} CRM quotes, ${sagOrders.length} SAG orders, ${sellerList.length} sellers`);

  return {
    clients: {
      totalProfiles,
      withCrmId,
      withNit,
      withSagTerceroId,
      crmBillingMatched,
      nitMatchedToOrders,
    },
    orders: {
      totalCrmQuotes,
      withIdSagC,
      matchedToSagOrder,
      totalSagOrders: sagOrders.length,
      crmStageDistribution: stageDistribution,
    },
    sellers: {
      totalFromCrm: sellerList.length,
      sellerList,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Single customer identity resolution ──────────────────────────────────────

export async function resolveCustomerIdentity(
  organizationId: string,
  profileId: string,
): Promise<IdentityLink> {
  const db = prisma as any;

  const profile = await db.customerProfile.findUnique({
    where: { id: profileId },
    select: { id: true, crmId: true, nit: true, sagTerceroId: true },
  });

  if (!profile) {
    return { crmId: null, profileId: null, nit: null, sagTerceroId: null, linkMethod: "unlinked", confidence: 0 };
  }

  let confidence = 30; // base: profile exists
  let method: IdentityLink["linkMethod"] = "unlinked";

  if (profile.crmId) {
    confidence += 30;
    method = "crm_id_direct";
  }
  if (profile.nit) {
    confidence += 20;
    if (method === "unlinked") method = "nit_match";
  }
  if (profile.sagTerceroId) {
    confidence += 20;
    if (method === "unlinked") method = "nit_match";
  }

  return {
    crmId: profile.crmId,
    profileId: profile.id,
    nit: profile.nit,
    sagTerceroId: profile.sagTerceroId,
    linkMethod: method,
    confidence: Math.min(confidence, 100),
  };
}
