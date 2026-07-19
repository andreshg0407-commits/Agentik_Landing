/**
 * lib/reports/executive-dashboard.ts
 *
 * Server-side data aggregation for the Executive Daily Dashboard.
 * All queries optimized: no N+1, batch aggregations.
 *
 * Sprint: INFORMES-EJECUTIVOS-CASTILLITOS-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildVariantCompositeKey } from "@/lib/comercial/pedidos/inventory-link-normalizer";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DailyKpi {
  value: number;
  previousValue: number;
  delta: number;       // value - previousValue
  deltaPercent: number; // percentage change
}

export interface DailySummary {
  pedidosHoy: DailyKpi;
  valorPedidosHoy: DailyKpi;
  clientesHoy: DailyKpi;
  referenciasHoy: DailyKpi;
  vendedoresHoy: DailyKpi;
}

export interface FulfillmentSummary {
  totalPedidos: number;
  listos: number;
  parciales: number;
  bloqueados: number;
  sinValidar: number;
  fulfillmentPromedio: number;
}

export interface AgotadoRow {
  reference: string;
  productName: string;
  variantesAgotadas: number;
  totalVariantes: number;
  pedidosAfectados: number;
}

export interface StockCriticoRow {
  reference: string;
  color: string;
  size: string;
  disponible: number;
  productName: string;
}

export interface TopReferenciaRow {
  reference: string;
  productName: string;
  unidades: number;
  valor: number;
}

export interface TopClienteRow {
  customerName: string;
  valor: number;
  pedidos: number;
  ultimaCompra: string;
}

export interface TopVendedorRow {
  sellerName: string;
  pedidos: number;
  valor: number;
  ticketPromedio: number;
}

export interface DavidRecommendation {
  message: string;
  severity: "critica" | "alta" | "info";
  metric: string;
}

export interface ExecutiveDashboardData {
  summary: DailySummary;
  fulfillment: FulfillmentSummary;
  agotados: AgotadoRow[];
  stockCritico: StockCriticoRow[];
  topReferencias: TopReferenciaRow[];
  topClientes: TopClienteRow[];
  topVendedores: TopVendedorRow[];
  davidRecommendations: DavidRecommendation[];
  generatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return startOfDay(d);
}

function buildKpi(value: number, previousValue: number): DailyKpi {
  const delta = value - previousValue;
  const deltaPercent = previousValue > 0 ? Math.round((delta / previousValue) * 100) : value > 0 ? 100 : 0;
  return { value, previousValue, delta, deltaPercent };
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function getExecutiveDashboard(orgId: string): Promise<ExecutiveDashboardData> {
  const today = startOfDay(new Date());
  const yesterday = startOfYesterday();

  const [
    summary,
    fulfillment,
    agotados,
    stockCritico,
    topReferencias,
    topClientes,
    topVendedores,
  ] = await Promise.all([
    getDailySummary(orgId, today, yesterday),
    getFulfillmentSummary(orgId),
    getAgotados(orgId),
    getStockCritico(orgId),
    getTopReferencias(orgId),
    getTopClientes(orgId),
    getTopVendedores(orgId),
  ]);

  const davidRecommendations = buildDavidRecommendations(
    summary, fulfillment, agotados, stockCritico,
  );

  return {
    summary,
    fulfillment,
    agotados,
    stockCritico,
    topReferencias,
    topClientes,
    topVendedores,
    davidRecommendations,
    generatedAt: new Date().toISOString(),
  };
}

// ── Daily Summary ────────────────────────────────────────────────────────────

async function getDailySummary(
  orgId: string, today: Date, yesterday: Date,
): Promise<DailySummary> {
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const yesterdayEnd = new Date(today); // yesterday end = today start

  // Today's quotes
  const quotesToday = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId, issuedAt: { gte: today, lt: todayEnd } },
    select: { amount: true, customerId: true, sellerName: true },
    // include quoteLines for references
  });

  const quotesYesterday = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId, issuedAt: { gte: yesterday, lt: yesterdayEnd } },
    select: { amount: true, customerId: true, sellerName: true },
  });

  // Today's lines for reference count
  const linesToday = await (prisma as any).cRMQuoteLine.findMany({
    where: {
      organizationId: orgId,
      quote: { issuedAt: { gte: today, lt: todayEnd } },
    },
    select: { reference: true },
  }).catch(() => [] as Array<{ reference: string }>);

  const linesYesterday = await (prisma as any).cRMQuoteLine.findMany({
    where: {
      organizationId: orgId,
      quote: { issuedAt: { gte: yesterday, lt: yesterdayEnd } },
    },
    select: { reference: true },
  }).catch(() => [] as Array<{ reference: string }>);

  const sumAmount = (quotes: Array<{ amount: any }>) =>
    quotes.reduce((s, q) => s + (Number(q.amount) || 0), 0);

  const uniqueCustomers = (quotes: Array<{ customerId: string | null }>) =>
    new Set(quotes.map(q => q.customerId).filter(Boolean)).size;

  const uniqueSellers = (quotes: Array<{ sellerName: string | null }>) =>
    new Set(quotes.map(q => q.sellerName).filter(Boolean)).size;

  const uniqueRefs = (lines: Array<{ reference: string }>) =>
    new Set(lines.map(l => l.reference).filter(Boolean)).size;

  return {
    pedidosHoy: buildKpi(quotesToday.length, quotesYesterday.length),
    valorPedidosHoy: buildKpi(sumAmount(quotesToday), sumAmount(quotesYesterday)),
    clientesHoy: buildKpi(uniqueCustomers(quotesToday), uniqueCustomers(quotesYesterday)),
    referenciasHoy: buildKpi(uniqueRefs(linesToday), uniqueRefs(linesYesterday)),
    vendedoresHoy: buildKpi(uniqueSellers(quotesToday), uniqueSellers(quotesYesterday)),
  };
}

// ── Fulfillment Summary ──────────────────────────────────────────────────────

async function getFulfillmentSummary(orgId: string): Promise<FulfillmentSummary> {
  // Get all quotes with lines
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId },
    include: { quoteLines: true },
    orderBy: { createdAt: "desc" },
    take: 100, // last 100 for performance
  });

  // Batch resolve inventory for all lines
  const allLines = quotes.flatMap(q =>
    (q.quoteLines as any[]).map((ql: any) => ({
      id: ql.id,
      reference: ql.reference ?? "",
      size: ql.size ?? "",
      color: ql.color ?? "",
      qty: Number(ql.qty) || 0,
    }))
  );

  // Build composite keys and resolve inventory
  const compositeKeys = allLines.map(l => buildVariantCompositeKey(l.reference, l.size, l.color));
  const uniqueKeys = [...new Set(compositeKeys)];

  const matchedVariants = uniqueKeys.length > 0
    ? await prisma.productVariant.findMany({
        where: { organizationId: orgId, sku: { in: uniqueKeys } },
        select: { id: true, sku: true },
      })
    : [];

  const variantIds = matchedVariants.map(v => v.id);
  const inventoryLevels = variantIds.length > 0
    ? await prisma.productInventoryLevel.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, quantity: true },
      })
    : [];

  // Build availability index
  const invByVariant = new Map<string, number>();
  for (const il of inventoryLevels) {
    if (!il.variantId) continue;
    invByVariant.set(il.variantId, (invByVariant.get(il.variantId) ?? 0) + Math.max(0, il.quantity));
  }

  const variantBySku = new Map<string, string>();
  for (const v of matchedVariants) {
    if (v.sku) variantBySku.set(v.sku.toUpperCase(), v.id);
  }

  // Evaluate each quote
  let listos = 0, parciales = 0, bloqueados = 0, sinValidar = 0;
  let totalCompletion = 0;

  for (const q of quotes) {
    const qLines = (q.quoteLines as any[]);
    if (qLines.length === 0) { sinValidar++; continue; }

    let available = 0, partial = 0, outOfStock = 0, unknown = 0;

    for (const ql of qLines) {
      const key = buildVariantCompositeKey(ql.reference, ql.size, ql.color);
      const variantId = variantBySku.get(key);
      if (!variantId) { unknown++; continue; }

      const avail = invByVariant.get(variantId) ?? 0;
      const qty = Number(ql.qty) || 0;

      if (avail <= 0) outOfStock++;
      else if (avail < qty) partial++;
      else available++;
    }

    const total = qLines.length;
    const dispatchable = available;
    const completion = total > 0 ? Math.round((dispatchable / total) * 100) : 0;
    totalCompletion += completion;

    if (unknown === total) sinValidar++;
    else if (outOfStock > 0) bloqueados++;
    else if (partial > 0) parciales++;
    else listos++;
  }

  return {
    totalPedidos: quotes.length,
    listos,
    parciales,
    bloqueados,
    sinValidar,
    fulfillmentPromedio: quotes.length > 0 ? Math.round(totalCompletion / quotes.length) : 0,
  };
}

// ── Agotados ─────────────────────────────────────────────────────────────────

async function getAgotados(orgId: string): Promise<AgotadoRow[]> {
  // Find variants with 0 stock
  const zeroStock = await prisma.productInventoryLevel.findMany({
    where: { organizationId: orgId, quantity: { lte: 0 } },
    select: { variantId: true, productId: true },
  });

  if (zeroStock.length === 0) return [];

  // Group by product
  const productVariantCounts = new Map<string, number>();
  for (const z of zeroStock) {
    const key = z.productId;
    productVariantCounts.set(key, (productVariantCounts.get(key) ?? 0) + 1);
  }

  // Get product info and total variant counts
  const productIds = [...productVariantCounts.keys()].slice(0, 50);
  const products = await prisma.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, _count: { select: { variants: true } } },
  });

  // Count affected orders per reference
  const skus = products.map(p => p.sku).filter(Boolean) as string[];
  const affectedLines = skus.length > 0
    ? await (prisma as any).cRMQuoteLine.groupBy({
        by: ["reference"],
        where: { organizationId: orgId, reference: { in: skus } },
        _count: { _all: true },
      }).catch(() => [])
    : [];

  const pedidosByRef = new Map<string, number>();
  for (const al of affectedLines) {
    pedidosByRef.set(al.reference, al._count._all);
  }

  return products
    .map(p => ({
      reference: p.sku ?? "",
      productName: p.name,
      variantesAgotadas: productVariantCounts.get(p.id) ?? 0,
      totalVariantes: p._count.variants,
      pedidosAfectados: pedidosByRef.get(p.sku ?? "") ?? 0,
    }))
    .sort((a, b) => b.pedidosAfectados - a.pedidosAfectados || b.variantesAgotadas - a.variantesAgotadas)
    .slice(0, 20);
}

// ── Stock Crítico ────────────────────────────────────────────────────────────

async function getStockCritico(orgId: string): Promise<StockCriticoRow[]> {
  const critical = await prisma.productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      quantity: { gt: 0, lte: 10 },
      variantId: { not: null },
    },
    include: {
      variant: { select: { sku: true, attributes: true } },
      product: { select: { sku: true, name: true } },
    },
    orderBy: { quantity: "asc" },
    take: 30,
  });

  return critical.map(c => {
    const attrs = (c.variant?.attributes ?? {}) as Record<string, string>;
    return {
      reference: c.product?.sku ?? "",
      color: attrs.color ?? attrs.Color ?? "",
      size: attrs.talla ?? attrs.size ?? attrs.Talla ?? "",
      disponible: c.quantity,
      productName: c.product?.name ?? "",
    };
  });
}

// ── Top Referencias ──────────────────────────────────────────────────────────

async function getTopReferencias(orgId: string): Promise<TopReferenciaRow[]> {
  const groups = await (prisma as any).cRMQuoteLine.groupBy({
    by: ["reference"],
    where: { organizationId: orgId },
    _sum: { qty: true, totalPrice: true },
    _count: { _all: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: 20,
  }).catch(() => []);

  // Get product names
  const refs = groups.map((g: any) => g.reference).filter(Boolean);
  const products = refs.length > 0
    ? await prisma.productEntity.findMany({
        where: { organizationId: orgId, sku: { in: refs } },
        select: { sku: true, name: true },
      })
    : [];

  const nameByRef = new Map<string, string>();
  for (const p of products) {
    if (p.sku) nameByRef.set(p.sku, p.name);
  }

  return groups.map((g: any) => ({
    reference: g.reference ?? "",
    productName: nameByRef.get(g.reference) ?? g.reference ?? "",
    unidades: Number(g._sum?.qty) || 0,
    valor: Number(g._sum?.totalPrice) || 0,
  }));
}

// ── Top Clientes ─────────────────────────────────────────────────────────────

async function getTopClientes(orgId: string): Promise<TopClienteRow[]> {
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: {
      customerId: true,
      amount: true,
      issuedAt: true,
      rawCrmJson: true,
    },
    orderBy: { issuedAt: "desc" },
  });

  // Group by customer
  const byCustomer = new Map<string, { valor: number; pedidos: number; ultimaCompra: string; name: string }>();

  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? (q.rawCrmJson as any) ?? {};
    const customerName = (raw.billing_account as string) ?? q.customerId ?? "";
    if (!customerName) continue;

    const existing = byCustomer.get(customerName) ?? {
      valor: 0, pedidos: 0,
      ultimaCompra: q.issuedAt?.toISOString() ?? "",
      name: customerName,
    };
    existing.valor += Number(q.amount) || 0;
    existing.pedidos += 1;
    byCustomer.set(customerName, existing);
  }

  return [...byCustomer.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 20)
    .map(c => ({
      customerName: c.name,
      valor: c.valor,
      pedidos: c.pedidos,
      ultimaCompra: c.ultimaCompra ? new Date(c.ultimaCompra).toISOString().slice(0, 10) : "",
    }));
}

// ── Top Vendedores ───────────────────────────────────────────────────────────

async function getTopVendedores(orgId: string): Promise<TopVendedorRow[]> {
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: { sellerName: true, amount: true },
  });

  const bySeller = new Map<string, { pedidos: number; valor: number }>();

  for (const q of quotes) {
    const name = q.sellerName ?? "";
    if (!name) continue;
    const existing = bySeller.get(name) ?? { pedidos: 0, valor: 0 };
    existing.pedidos += 1;
    existing.valor += Number(q.amount) || 0;
    bySeller.set(name, existing);
  }

  return [...bySeller.entries()]
    .map(([name, data]) => ({
      sellerName: name,
      pedidos: data.pedidos,
      valor: data.valor,
      ticketPromedio: data.pedidos > 0 ? Math.round(data.valor / data.pedidos) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 15);
}

// ── David Recommendations ────────────────────────────────────────────────────

function buildDavidRecommendations(
  summary: DailySummary,
  fulfillment: FulfillmentSummary,
  agotados: AgotadoRow[],
  stockCritico: StockCriticoRow[],
): DavidRecommendation[] {
  const recs: DavidRecommendation[] = [];

  // Agotados with orders
  const agotadosConPedidos = agotados.filter(a => a.pedidosAfectados > 0);
  if (agotadosConPedidos.length > 0) {
    const top = agotadosConPedidos[0];
    recs.push({
      message: `${top.reference} agotada y tiene ${top.pedidosAfectados} pedidos afectados.`,
      severity: "critica",
      metric: `${agotadosConPedidos.length} ref agotadas con pedidos`,
    });
  }

  // Stock crítico
  if (stockCritico.length > 0) {
    recs.push({
      message: `${stockCritico.length} variantes con stock critico (1-10 unidades).`,
      severity: "alta",
      metric: `${stockCritico.length} variantes`,
    });
  }

  // Fulfillment bloqueados
  if (fulfillment.bloqueados > 0) {
    recs.push({
      message: `${fulfillment.bloqueados} pedidos bloqueados por inventario insuficiente.`,
      severity: "critica",
      metric: `${fulfillment.bloqueados} bloqueados`,
    });
  }

  // Fulfillment promedio
  if (fulfillment.fulfillmentPromedio < 90 && fulfillment.fulfillmentPromedio > 0) {
    recs.push({
      message: `Fulfillment promedio al ${fulfillment.fulfillmentPromedio}%. Revisar disponibilidad.`,
      severity: "alta",
      metric: `${fulfillment.fulfillmentPromedio}%`,
    });
  }

  // Positive: good day
  if (summary.pedidosHoy.delta > 0) {
    recs.push({
      message: `Hoy ${summary.pedidosHoy.delta} pedidos mas que ayer.`,
      severity: "info",
      metric: `+${summary.pedidosHoy.delta}`,
    });
  }

  return recs.slice(0, 5);
}
