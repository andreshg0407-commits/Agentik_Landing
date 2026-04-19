/**
 * Customer Command Center — unified data loader.
 *
 * Aggregates every available data source for a single customer into one
 * typed result object. All queries run with Promise.allSettled so a single
 * source failure never takes down the whole page.
 *
 * Architecture: source-agnostic.
 * Current sources:  CRM (SuiteCRM) · SAG/ERP · XML payments
 * Future expansion:
 *   - whatsappThreads: WhatsAppThread[]   (WhatsApp connector)
 *   - gocenRecords:    GocenRecord[]      (GOCEN government obligations)
 *   - loyaltyData:     LoyaltyProfile     (loyalty tier + redemptions)
 */

import { prisma }                         from "@/lib/prisma";
import { Prisma }                         from "@prisma/client";
import {
  getCustomer360,
  type Customer360,
  type CustomerProfile_type,
  type CRMOpportunity_type,
  type CRMActivity_type,
  type CRMQuote_type,
}                                         from "./service";
import {
  getCustomerLedgerKpis,
  getCustomerCommercialTimelineByKey,
}                                         from "@/lib/commercial-ledger/service";
import { getSalesAlerts, type BusinessAlertRow } from "@/lib/sales/alert-engine";
import type { CommercialFact }            from "@/lib/commercial-ledger/types";
import type { CustomerLedgerKpis }        from "@/lib/commercial-ledger/types";

// ── Output type ────────────────────────────────────────────────────────────────

export interface CustomerCommandData {
  // Identity & enriched profile (null = CustomerProfile not yet seeded)
  profile:               CustomerProfile_type | null;

  // Sales KPIs — SaleRecord raw SQL
  salesL30d:             number;
  salesL90d:             number;
  salesL12m:             number;
  salesAllTime:          number;
  avgTicket:             number | null;
  purchasePeriods:       number;          // distinct YYYYMM periods in L12M
  daysSinceLastPurchase: number | null;

  // Purchase intelligence — SaleRecord raw SQL (all-time)
  topLines:      Array<{ productLine: string; amount: number; share: number }>;
  topSellers:    Array<{ sellerSlug: string; sellerName: string; amount: number; share: number }>;
  topBranch:     { storeSlug: string; storeName: string; amount: number } | null;
  preferredChannel: string | null;
  monthlyTrend:  Array<{ period: string; amount: number }>;   // L12M periods

  // Commercial ledger (CRM + SAG + XML reconciliation)
  ledger:   CustomerLedgerKpis | null;
  timeline: CommercialFact[];             // crm_quote · sag_invoice · xml_payment

  // CRM data (empty arrays when CRM connector not active)
  opportunities:    CRMOpportunity_type[];
  recentActivities: CRMActivity_type[];
  quotes:           CRMQuote_type[];
  openOpportunities: number;
  openQuotes:       number;

  // SAG cartera — receivables summary + aging
  receivables: Customer360["receivables"] | null;

  // AI scoring
  aiInsight: Customer360["aiInsight"] | null;

  // Active business alerts for this customer
  activeAlerts: BusinessAlertRow[];

  // ── Expansion points (not yet populated) ─────────────────────────────────
  // whatsappThreads: WhatsAppThread[]
  // gocenRecords:    GocenRecord[]
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadCustomerCommandData(
  orgId:         string,
  customerKey:   string,   // NIT or CustomerProfile.slug (same for numeric NITs)
  currentPeriod: string,   // YYYYMM — used for alert scope
): Promise<CustomerCommandData> {

  // ── Tier 1: primary sources — fully parallel ──────────────────────────────
  const [c360R, ledgerR, timelineR, alertsR] = await Promise.allSettled([
    getCustomer360(orgId, customerKey),
    getCustomerLedgerKpis(orgId, customerKey),
    getCustomerCommercialTimelineByKey(orgId, customerKey),
    getSalesAlerts(orgId, currentPeriod),
  ]);

  const c360      = c360R.status     === "fulfilled" ? c360R.value     : null;
  const ledger    = ledgerR.status   === "fulfilled" ? ledgerR.value   : null;
  const timeline  = timelineR.status === "fulfilled" ? timelineR.value : [];
  const allAlerts = alertsR.status   === "fulfilled" ? alertsR.value   : [];

  const profile = c360?.profile ?? null;

  // NIT: prefer profile value; fall back when customerKey starts with digits
  const nit = profile?.nit ?? (/^\d/.test(customerKey) ? customerKey : null);

  // ── Tier 2: per-customer SQL — only when NIT is known ────────────────────
  let salesL30d        = 0;
  let salesL90d        = 0;
  let topBranch:       CustomerCommandData["topBranch"]    = null;
  let preferredChannel: string | null                      = null;
  let topSellers:      CustomerCommandData["topSellers"]   = [];

  if (nit) {
    const [l30R, l90R, branchR, channelR, sellersR] = await Promise.allSettled([

      // Sales last 30 days
      prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COALESCE(SUM("amount"), 0)::float8 AS total
        FROM   "SaleRecord"
        WHERE  "organizationId" = ${orgId}
          AND  "customerNit"    = ${nit}
          AND  "saleDate"       >= NOW() - INTERVAL '30 days'
          AND  "productLine"    NOT ILIKE 'Total %'
          AND  "productLine"    NOT ILIKE 'Subtotal%'
      `),

      // Sales last 90 days
      prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COALESCE(SUM("amount"), 0)::float8 AS total
        FROM   "SaleRecord"
        WHERE  "organizationId" = ${orgId}
          AND  "customerNit"    = ${nit}
          AND  "saleDate"       >= NOW() - INTERVAL '90 days'
          AND  "productLine"    NOT ILIKE 'Total %'
          AND  "productLine"    NOT ILIKE 'Subtotal%'
      `),

      // Top branch (all-time)
      prisma.$queryRaw<Array<{ store_slug: string; store_name: string; amount: number }>>(Prisma.sql`
        SELECT
          "storeSlug"           AS store_slug,
          MAX("storeName")      AS store_name,
          SUM("amount")::float8 AS amount
        FROM   "SaleRecord"
        WHERE  "organizationId" = ${orgId}
          AND  "customerNit"    = ${nit}
          AND  "productLine"    NOT ILIKE 'Total %'
          AND  "productLine"    NOT ILIKE 'Subtotal%'
        GROUP  BY "storeSlug"
        ORDER  BY amount DESC
        LIMIT  1
      `),

      // Preferred channel (all-time)
      prisma.$queryRaw<Array<{ channel: string; amount: number }>>(Prisma.sql`
        SELECT
          "channel"::text        AS channel,
          SUM("amount")::float8  AS amount
        FROM   "SaleRecord"
        WHERE  "organizationId" = ${orgId}
          AND  "customerNit"    = ${nit}
          AND  "productLine"    NOT ILIKE 'Total %'
          AND  "productLine"    NOT ILIKE 'Subtotal%'
        GROUP  BY "channel"
        ORDER  BY amount DESC
        LIMIT  1
      `),

      // Top 5 sellers (all-time)
      prisma.$queryRaw<Array<{ seller_slug: string; seller_name: string; amount: number }>>(Prisma.sql`
        SELECT
          "sellerSlug"           AS seller_slug,
          MAX("sellerName")      AS seller_name,
          SUM("amount")::float8  AS amount
        FROM   "SaleRecord"
        WHERE  "organizationId" = ${orgId}
          AND  "customerNit"    = ${nit}
          AND  "productLine"    NOT ILIKE 'Total %'
          AND  "productLine"    NOT ILIKE 'Subtotal%'
        GROUP  BY "sellerSlug"
        ORDER  BY amount DESC
        LIMIT  5
      `),
    ]);

    if (l30R.status    === "fulfilled") salesL30d = Number(l30R.value[0]?.total ?? 0);
    if (l90R.status    === "fulfilled") salesL90d = Number(l90R.value[0]?.total ?? 0);

    if (branchR.status === "fulfilled" && branchR.value[0]) {
      const b = branchR.value[0];
      topBranch = { storeSlug: b.store_slug, storeName: b.store_name, amount: Number(b.amount) };
    }

    if (channelR.status === "fulfilled" && channelR.value[0]) {
      preferredChannel = channelR.value[0].channel;
    }

    if (sellersR.status === "fulfilled") {
      const rows  = sellersR.value;
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      topSellers  = rows.map(r => ({
        sellerSlug: r.seller_slug,
        sellerName: r.seller_name,
        amount:     Number(r.amount),
        share:      total > 0 ? Math.round((Number(r.amount) / total) * 10000) / 100 : 0,
      }));
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  let daysSinceLastPurchase: number | null = null;
  if (profile?.lastPurchaseAt) {
    const diffMs = Date.now() - new Date(profile.lastPurchaseAt).getTime();
    daysSinceLastPurchase = Math.floor(diffMs / 86_400_000);
  }

  // Match alerts to this customer by entityLabel
  const customerNames = new Set(
    [customerKey, nit, profile?.name, profile?.legalName].filter(Boolean) as string[]
  );
  const activeAlerts = allAlerts.filter(
    a => a.entityType === "customer" && customerNames.has(a.entityLabel)
  );

  const openOpportunities = (c360?.opportunities ?? []).filter(o => o.status === "OPEN").length;
  const openQuotes        = (c360?.quotes        ?? []).filter(
    q => q.status === "OPEN" || q.status === "DRAFT" || q.status === "PENDING"
  ).length;

  return {
    profile,
    salesL30d,
    salesL90d,
    salesL12m:    Number(c360?.salesSummary.totalSalesL12    ?? 0),
    salesAllTime: Number(c360?.salesSummary.totalSalesAllTime ?? 0),
    avgTicket:    c360?.salesSummary.avgTicket    ?? null,
    purchasePeriods: c360?.salesSummary.purchasePeriods ?? 0,
    daysSinceLastPurchase,
    topLines:     c360?.salesSummary.topLines   ?? [],
    topSellers,
    topBranch,
    preferredChannel,
    monthlyTrend: c360?.salesSummary.monthlyTrend ?? [],
    ledger,
    timeline,
    opportunities:    c360?.opportunities    ?? [],
    recentActivities: c360?.recentActivities ?? [],
    quotes:           c360?.quotes           ?? [],
    openOpportunities,
    openQuotes,
    receivables: c360?.receivables ?? null,
    aiInsight:   c360?.aiInsight   ?? null,
    activeAlerts,
  };
}
