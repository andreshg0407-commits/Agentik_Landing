/**
 * commercial-engine.ts
 *
 * Consolidates all commercial intelligence: orders, fulfillment,
 * top references, top customers, top vendors.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildVariantCompositeKey } from "@/lib/comercial/pedidos/inventory-link-normalizer";
import type {
  CommercialData,
  CommercialSummary,
  FulfillmentSummary,
  TopReferenciaRow,
  TopClienteRow,
  TopVendedorRow,
} from "./executive-types";
import { startOfDay, startOfYesterday, buildKpi } from "./executive-utils";

// ── Main Entry ────────────────────────────────────────────────────────────────

export async function runCommercialEngine(orgId: string): Promise<CommercialData> {
  const today = startOfDay(new Date());
  const yesterday = startOfYesterday();

  const [summary, fulfillment, topReferencias, topClientes, topVendedores] =
    await Promise.all([
      buildSummary(orgId, today, yesterday),
      buildFulfillment(orgId),
      buildTopReferencias(orgId),
      buildTopClientes(orgId),
      buildTopVendedores(orgId),
    ]);

  return { summary, fulfillment, topReferencias, topClientes, topVendedores };
}

// ── Daily Summary ─────────────────────────────────────────────────────────────

async function buildSummary(
  orgId: string,
  today: Date,
  yesterday: Date,
): Promise<CommercialSummary> {
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const yesterdayEnd = new Date(today);

  const [quotesToday, quotesYesterday] = await Promise.all([
    prisma.cRMQuote.findMany({
      where: { organizationId: orgId, issuedAt: { gte: today, lt: todayEnd } },
      select: { amount: true, customerId: true, sellerName: true },
    }),
    prisma.cRMQuote.findMany({
      where: { organizationId: orgId, issuedAt: { gte: yesterday, lt: yesterdayEnd } },
      select: { amount: true, customerId: true, sellerName: true },
    }),
  ]);

  const [linesToday, linesYesterday] = await Promise.all([
    (prisma as any).cRMQuoteLine.findMany({
      where: { organizationId: orgId, quote: { issuedAt: { gte: today, lt: todayEnd } } },
      select: { reference: true },
    }).catch(() => [] as Array<{ reference: string }>),
    (prisma as any).cRMQuoteLine.findMany({
      where: { organizationId: orgId, quote: { issuedAt: { gte: yesterday, lt: yesterdayEnd } } },
      select: { reference: true },
    }).catch(() => [] as Array<{ reference: string }>),
  ]);

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

// ── Fulfillment ───────────────────────────────────────────────────────────────

async function buildFulfillment(orgId: string): Promise<FulfillmentSummary> {
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId },
    include: { quoteLines: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const allLines = quotes.flatMap(q =>
    (q.quoteLines as any[]).map((ql: any) => ({
      reference: ql.reference ?? "",
      size: ql.size ?? "",
      color: ql.color ?? "",
      qty: Number(ql.qty) || 0,
    }))
  );

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

  const invByVariant = new Map<string, number>();
  for (const il of inventoryLevels) {
    if (!il.variantId) continue;
    invByVariant.set(il.variantId, (invByVariant.get(il.variantId) ?? 0) + Math.max(0, il.quantity));
  }

  const variantBySku = new Map<string, string>();
  for (const v of matchedVariants) {
    if (v.sku) variantBySku.set(v.sku.toUpperCase(), v.id);
  }

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
    const completion = total > 0 ? Math.round((available / total) * 100) : 0;
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

// ── Top Referencias ───────────────────────────────────────────────────────────

async function buildTopReferencias(orgId: string): Promise<TopReferenciaRow[]> {
  const groups = await (prisma as any).cRMQuoteLine.groupBy({
    by: ["reference"],
    where: { organizationId: orgId },
    _sum: { qty: true, totalPrice: true },
    _count: { _all: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: 20,
  }).catch(() => []);

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

// ── Top Clientes ──────────────────────────────────────────────────────────────

async function buildTopClientes(orgId: string): Promise<TopClienteRow[]> {
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: { customerId: true, amount: true, issuedAt: true, rawCrmJson: true },
    orderBy: { issuedAt: "desc" },
  });

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

// ── Top Vendedores ────────────────────────────────────────────────────────────

async function buildTopVendedores(orgId: string): Promise<TopVendedorRow[]> {
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
