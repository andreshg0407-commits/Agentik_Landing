/**
 * seller-metrics.ts
 *
 * COMMERCIAL-DATA-FOUNDATION-01 — Phase 5
 *
 * Seller performance metrics from CRM data.
 * Only computes metrics where data has confirmed traceability.
 *
 * Computes: pedidos, clientes, actividad reciente.
 * Does NOT compute: ventas (requires confirmed CRM→SAG→factura traceability).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { SellerActivityStatus } from "./seller-directory";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SellerMetrics {
  sellerName: string;
  sellerSlug: string;
  // Pedidos
  totalQuotes: number;
  quotesFacturado: number;
  quotesGestionado: number;
  quotesPendiente: number;
  quotesAnulado: number;
  // Traceability
  quotesWithSagId: number;   // has id_sag_c → confirmed in SAG
  traceabilityRate: number;  // quotesWithSagId / totalQuotes * 100
  // Clientes
  uniqueCustomers: number;
  customersLinkedToProfile: number;
  // Activity
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  isActive: boolean; // legacy compat: true when not "inactivo"
  activityStatus: SellerActivityStatus; // 3-state rule (VENDEDORES-ACTIVITY-AUDIT-01)
  // Amounts (CRM-reported, not SAG-confirmed)
  totalCrmAmount: number;
  avgCrmAmount: number;
}

export interface SellerMetricsReport {
  sellers: SellerMetrics[];
  totalSellers: number;
  activeSellers: number;
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

// ── Metrics Builder ──────────────────────────────────────────────────────────

export async function buildSellerMetrics(
  organizationId: string,
): Promise<SellerMetricsReport> {
  const db = prisma as any;

  const quotes = await db.cRMQuote.findMany({
    where: { organizationId },
    select: {
      sellerName: true,
      amount: true,
      issuedAt: true,
      rawCrmJson: true,
    },
  });

  // Profile crmIds for customer linking
  const profileCrmIds = await db.customerProfile.findMany({
    where: { organizationId, crmId: { not: null } },
    select: { crmId: true },
  });
  const profileCrmSet = new Set(profileCrmIds.map((p: any) => p.crmId));

  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // Aggregate per seller
  const agg = new Map<string, {
    count: number;
    facturado: number;
    gestionado: number;
    pendiente: number;
    anulado: number;
    withSagId: number;
    customers: Set<string>;
    customersLinked: Set<string>;
    totalAmount: number;
    firstAt: Date | null;
    lastAt: Date | null;
  }>();

  for (const q of quotes) {
    const name = q.sellerName as string;
    if (!name) continue;

    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const stage = (raw.stage as string) || "";
    const billingId = raw.billing_account_id as string | undefined;
    const hasSag = raw.id_sag_c && raw.id_sag_c !== "";

    const entry = agg.get(name) ?? {
      count: 0, facturado: 0, gestionado: 0, pendiente: 0, anulado: 0,
      withSagId: 0, customers: new Set<string>(), customersLinked: new Set<string>(),
      totalAmount: 0, firstAt: null, lastAt: null,
    };

    entry.count++;
    entry.totalAmount += Number(q.amount ?? 0);
    if (hasSag) entry.withSagId++;
    if (billingId) {
      entry.customers.add(billingId);
      if (profileCrmSet.has(billingId)) entry.customersLinked.add(billingId);
    }

    if (stage === "Facturado") entry.facturado++;
    else if (stage.startsWith("Gestionado")) entry.gestionado++;
    else if (stage === "Pendiente" || stage === "No_Gestionado" || stage === "Confirmado" || stage === "Remisionado") entry.pendiente++;
    else if (stage === "Anulado") entry.anulado++;

    if (q.issuedAt) {
      if (!entry.firstAt || q.issuedAt < entry.firstAt) entry.firstAt = q.issuedAt;
      if (!entry.lastAt || q.issuedAt > entry.lastAt) entry.lastAt = q.issuedAt;
    }

    agg.set(name, entry);
  }

  const sellers: SellerMetrics[] = [...agg.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => {
      const lastMs = data.lastAt ? new Date(data.lastAt).getTime() : null;
      const daysSince = lastMs ? Math.round((now - lastMs) / (24 * 60 * 60 * 1000)) : null;

      const recentActivity = lastMs !== null && (now - lastMs) < ninetyDaysMs;
      const hasCommercialPresence = data.count > 0 || data.customers.size > 0;
      const activityStatus: SellerActivityStatus = recentActivity
        ? "activo"
        : hasCommercialPresence
          ? "atencion"
          : "inactivo";

      return {
        sellerName: name,
        sellerSlug: toSlug(name),
        totalQuotes: data.count,
        quotesFacturado: data.facturado,
        quotesGestionado: data.gestionado,
        quotesPendiente: data.pendiente,
        quotesAnulado: data.anulado,
        quotesWithSagId: data.withSagId,
        traceabilityRate: data.count > 0 ? Math.round((data.withSagId / data.count) * 100) : 0,
        uniqueCustomers: data.customers.size,
        customersLinkedToProfile: data.customersLinked.size,
        firstActivityAt: data.firstAt?.toISOString() ?? null,
        lastActivityAt: data.lastAt?.toISOString() ?? null,
        daysSinceLastActivity: daysSince,
        isActive: activityStatus !== "inactivo",
        activityStatus,
        totalCrmAmount: data.totalAmount,
        avgCrmAmount: data.count > 0 ? Math.round(data.totalAmount / data.count) : 0,
      };
    });

  const activeSellers = sellers.filter(s => s.isActive).length;

  console.log(`[SELLER] buildSellerMetrics: ${sellers.length} sellers, ${activeSellers} active, total ${quotes.length} quotes`);

  return {
    sellers,
    totalSellers: sellers.length,
    activeSellers,
    generatedAt: new Date().toISOString(),
  };
}
