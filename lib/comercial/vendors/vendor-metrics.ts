/**
 * vendor-metrics.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Computes commercial KPIs for a single vendor from CRM/SAG data.
 *
 * Reuses executive commercial engine patterns — does NOT duplicate queries.
 * SERVER ONLY.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { VendorCommercialKpis, VendorTopCustomer, VendorCustomerSummary, VendorOrderSummary } from "./vendor-types";
import { toSlug, startOfToday, startOfWeek, startOfMonth, endOfToday } from "./vendor-utils";

// ── Commercial KPIs ──────────────────────────────────────────────────────────

export async function computeVendorCommercialKpis(
  orgId: string,
  vendorName: string,
  allVendorNames: string[],
): Promise<VendorCommercialKpis> {
  const today = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();
  const todayEnd = endOfToday();

  const sellerSlug = toSlug(vendorName);

  // Fetch all quotes for this vendor this month
  const quotesMonth = await prisma.cRMQuote.findMany({
    where: {
      organizationId: orgId,
      sellerSlug,
      issuedAt: { gte: monthStart, lt: todayEnd },
    },
    select: { amount: true, customerId: true, issuedAt: true },
  });

  // Partition by period
  const quotesToday = quotesMonth.filter(q => q.issuedAt && q.issuedAt >= today);
  const quotesWeek = quotesMonth.filter(q => q.issuedAt && q.issuedAt >= weekStart);

  // Fetch lines for today to count unique references
  const linesToday = await (prisma as any).cRMQuoteLine.findMany({
    where: {
      organizationId: orgId,
      quote: { sellerSlug, issuedAt: { gte: today, lt: todayEnd } },
    },
    select: { reference: true },
  }).catch(() => [] as Array<{ reference: string }>);

  const sum = (qs: Array<{ amount: any }>) =>
    qs.reduce((s, q) => s + (Number(q.amount) || 0), 0);

  const salesToday = sum(quotesToday);
  const salesWeek = sum(quotesWeek);
  const salesMonth = sum(quotesMonth);

  const ordersToday = quotesToday.length;
  const ordersMonth = quotesMonth.length;
  const customersToday = new Set(quotesToday.map(q => q.customerId).filter(Boolean)).size;
  const referencesToday = new Set(linesToday.map((l: any) => l.reference).filter(Boolean)).size;

  // Compute days elapsed this month for daily average
  const dayOfMonth = new Date().getDate();
  const avgDailySales = dayOfMonth > 0 ? Math.round(salesMonth / dayOfMonth) : 0;
  const ticketPromedio = ordersMonth > 0 ? Math.round(salesMonth / ordersMonth) : 0;

  // Ranking: compare against all vendors
  const allQuotes = await prisma.cRMQuote.findMany({
    where: {
      organizationId: orgId,
      issuedAt: { gte: monthStart, lt: todayEnd },
    },
    select: { sellerName: true, amount: true },
  });

  const byVendor = new Map<string, number>();
  for (const q of allQuotes) {
    const name = q.sellerName ?? "";
    if (!name) continue;
    byVendor.set(name, (byVendor.get(name) ?? 0) + (Number(q.amount) || 0));
  }

  const sorted = [...byVendor.entries()].sort((a, b) => b[1] - a[1]);
  const rankIdx = sorted.findIndex(([n]) => toSlug(n) === sellerSlug);
  const ranking = rankIdx >= 0 ? rankIdx + 1 : null;

  return {
    salesToday,
    salesWeek,
    salesMonth,
    salesGoal: null, // V2: tenant-configurable goals
    goalPercent: null,
    avgDailySales,
    ticketPromedio,
    ordersToday,
    ordersMonth,
    customersToday,
    referencesToday,
    ranking,
    rankingTotal: sorted.length,
  };
}

// ── Customer Summary ─────────────────────────────────────────────────────────

export async function computeVendorCustomerSummary(
  orgId: string,
  vendorName: string,
): Promise<VendorCustomerSummary> {
  const sellerSlug = toSlug(vendorName);
  const monthStart = startOfMonth();
  const todayEnd = endOfToday();

  // All customers assigned to this vendor
  const customers = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, sellerSlug },
    select: { id: true, name: true, nit: true },
  });

  const activeCustomers = customers.length;
  const customerIds = customers.map(c => c.id);

  // Quotes this month for this vendor's customers
  const quotesMonth = customerIds.length > 0
    ? await prisma.cRMQuote.findMany({
        where: {
          organizationId: orgId,
          sellerSlug,
          issuedAt: { gte: monthStart, lt: todayEnd },
        },
        select: { customerId: true, amount: true, issuedAt: true },
      })
    : [];

  const customersWithOrders = new Set(quotesMonth.map(q => q.customerId).filter(Boolean));
  const customersVisited = customersWithOrders.size;
  const customersWithoutOrders = Math.max(0, activeCustomers - customersVisited);

  // Customers with outstanding cartera — check via SaleRecord (invoices)
  const customersWithCartera = 0; // V2: integrate finance/cartera module

  // Top customers by value
  const byCustomer = new Map<string, { valor: number; pedidos: number; ultimaCompra: string }>();
  for (const q of quotesMonth) {
    const cid = q.customerId ?? "";
    if (!cid) continue;
    const ex = byCustomer.get(cid) ?? { valor: 0, pedidos: 0, ultimaCompra: "" };
    ex.valor += Number(q.amount) || 0;
    ex.pedidos += 1;
    if (q.issuedAt) {
      const iso = q.issuedAt.toISOString().slice(0, 10);
      if (!ex.ultimaCompra || iso > ex.ultimaCompra) ex.ultimaCompra = iso;
    }
    byCustomer.set(cid, ex);
  }

  const customerNameMap = new Map(customers.map(c => [c.id, c.name]));

  const topCustomers: VendorTopCustomer[] = [...byCustomer.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 10)
    .map(([cid, data]) => ({
      customerName: customerNameMap.get(cid) ?? cid,
      valor: Math.round(data.valor),
      pedidos: data.pedidos,
      ultimaCompra: data.ultimaCompra || null,
    }));

  return {
    activeCustomers,
    customersVisited,
    customersWithoutOrders,
    customersWithCartera,
    customersWithPendingOrders: 0, // V2: cross-reference with pedidos module
    topCustomers,
  };
}

// ── Order Summary ────────────────────────────────────────────────────────────

export async function computeVendorOrderSummary(
  orgId: string,
  vendorName: string,
): Promise<VendorOrderSummary> {
  const sellerSlug = toSlug(vendorName);
  const today = startOfToday();
  const todayEnd = endOfToday();

  // Orders today
  const ordersToday = await prisma.cRMQuote.count({
    where: {
      organizationId: orgId,
      sellerSlug,
      issuedAt: { gte: today, lt: todayEnd },
    },
  });

  // All open quotes (status-based) — CRMQuote.status is QuoteStatus enum
  const openQuotes = await prisma.cRMQuote.findMany({
    where: {
      organizationId: orgId,
      sellerSlug,
      status: { notIn: ["ACCEPTED", "REJECTED", "EXPIRED"] },
    },
    select: { status: true },
  });

  const ordersOpen = openQuotes.length;
  const ordersBlocked = 0; // V2: blocked status not yet modeled in QuoteStatus enum

  return {
    ordersToday,
    ordersOpen,
    ordersBlocked,
    ordersDelivered: 0, // V2: cross-reference with dispatch
    ordersWaitingInventory: 0, // V2: cross-reference with inventory
    ordersWaitingProduction: 0, // V2: cross-reference with production
  };
}
