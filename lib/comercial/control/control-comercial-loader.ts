/**
 * lib/comercial/control/control-comercial-loader.ts
 *
 * CONTROL-COMERCIAL-02
 * Executive Commercial Dashboard — full data loader.
 *
 * Data sources:
 *   - SaleRecord        → ventas (OFICIAL + REMISION)
 *   - CRMQuote          → pedidos CRM, vendor ranking, customer→city mapping
 *   - CollectionRecord  → recaudos
 *   - CustomerReceivable→ cartera total + vencida
 *   - CustomerProfile   → clientes, geografia
 *   - CommercialCoverageSnapshot → inventario
 *
 * Smart period fallback: if current month has no data, uses the latest
 * month with data and labels it accordingly.
 *
 * No Prisma changes. No SAG adapter changes. No engine changes.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Decision engine integration (COMMERCIAL-DATA-CONNECTIVITY-01) ────────────
import { loadImportReferenceInputs, buildImportPolicyContext } from "@/lib/comercial/importaciones/import-data-loader";
import { loadProductionSubgroupInputs, buildProductionContext } from "@/lib/comercial/produccion/production-data-loader";
import { loadSalesRepData, listSellerSlugs } from "@/lib/comercial/sales-reps/sales-rep-data-loader";
import { evaluateLowRotation, evaluateRepurchase, buildNextContainerRecommendations, evaluateInventoryAging } from "@/lib/comercial/importaciones/import-decision-engine";
import { evaluateProductionNeed, evaluatePriority } from "@/lib/comercial/produccion/production-decision-engine";
import { evaluateMalletOutOfStock, evaluateCustomerReceivablesAlert, evaluateCustomerInactivity } from "@/lib/comercial/sales-reps/sales-rep-decision-engine";
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "@/lib/comercial/importaciones/import-policy-pack-config";
import { CASTILLITOS_PRODUCTION_PLANNING_CONFIG } from "@/lib/comercial/produccion/production-planning-config";
import { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG } from "@/lib/comercial/sales-reps/sales-rep-policy-pack-config";
import { buildAllImportBusinessDecisions } from "@/lib/comercial/importaciones/import-business-decisions";
import { buildAllProductionBusinessDecisions } from "@/lib/comercial/produccion/production-business-decisions";
import { buildOutOfStockDecisions, buildOverdueReceivableDecisions, buildInactiveCustomerDecisions } from "@/lib/comercial/sales-reps/sales-rep-business-decisions";
import { aggregateCommercialDecisions } from "@/lib/comercial/business-policy/commercial-decision-aggregator";
import type { BusinessDecision } from "@/lib/comercial/business-policy/business-decision-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ControlAlerta {
  id: string;
  severity: "critical" | "warning" | "info";
  module: string;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

export interface VendorRankRow {
  name: string;
  slug: string;
  valorCrm: number;
  pedidosCrm: number;
  clientesCrm: number;
  carteraAsociada: number;
  ultimoPedido: string | null;
  ranking: number;
}

export interface GeoRow {
  city: string;
  department: string | null;
  clientes: number;
  pedidos: number;
  valorPedidos: number;
  carteraVencida: number;
}

export interface CustomerHighlight {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  reason: "top_buyer" | "top_collector" | "high_risk" | "no_recent_purchase";
  label: string;
  value: number;
  detail: string;
}

export interface ChannelRow {
  channel: string;
  pedidos: number;
  valor: number;
  clientes: number;
  status: "activo" | "sin_datos" | "pendiente_integracion";
}

export interface CarteraBloque {
  carteraTotal: number;
  carteraVencida: number;
  pctVencida: number;
  clientesConMora: number;
  topMorosoName: string | null;
  topMorosoMonto: number;
}

export interface InsightEjecutivo {
  id: string;
  text: string;
  severity: "neutral" | "warning" | "critical";
}

export interface DecisionsSummary {
  totalDecisions: number;
  criticalDecisions: number;
  highDecisions: number;
  domains: string[];
  endpointUrl: string;
}

export interface ControlComercialSnapshot {
  // KPI header — ventas
  ventasMes: number;
  ventasSemana: number;
  ventasHoy: number;
  periodoVentas: string; // "Julio 2026" or "Junio 2026 (último disponible)"
  // KPI header — pedidos
  pedidosMes: number;
  pedidosTotal: number;
  ticketPromedio: number;
  periodoPedidos: string;
  // KPI header — clientes
  clientesActivos: number;
  clientesNuevos: number;
  // KPI header — vendors
  vendedoresOperativos: number;
  // KPI header — recaudos
  recaudosMes: number;
  periodoRecaudos: string;
  // Cartera bloque
  cartera: CarteraBloque;
  // Inventario
  refsTotales: number;
  refsCriticas: number;
  refsAgotadas: number;
  refsConOp: number;
  // Vendor ranking
  vendorRanking: VendorRankRow[];
  // Geography
  geoTable: GeoRow[];
  // Customer highlights
  customerHighlights: CustomerHighlight[];
  // Channels
  channels: ChannelRow[];
  // Insights
  insights: InsightEjecutivo[];
  // Alertas
  alertas: ControlAlerta[];
  // BusinessDecision summary (COMMERCIAL-DATA-CONNECTIVITY-01)
  decisionsSummary: DecisionsSummary | null;
  // Meta
  loadedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}
function startOfMonth(): Date {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}
function prevMonthStart(): Date {
  const d = startOfMonth();
  d.setMonth(d.getMonth() - 1);
  return d;
}

function toSlug(name: string): string {
  return name.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function mesLabel(d: Date): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtCop(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString("es-CO");
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadControlComercial(
  organizationId: string,
  orgSlug: string,
): Promise<ControlComercialSnapshot> {
  const db = prisma as any;
  const today = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();
  const prevStart = prevMonthStart();
  const endDay = new Date(today); endDay.setDate(endDay.getDate() + 1);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. VENTAS (SaleRecord) — smart period fallback
  // ═══════════════════════════════════════════════════════════════════════════
  let ventasMes = 0, ventasSemana = 0, ventasHoy = 0;
  let periodoVentas = mesLabel(monthStart);
  let salesPeriodStart = monthStart;
  let salesPeriodEnd = endDay;

  // Channel aggregation
  const channelMap = new Map<string, { pedidos: number; valor: number; clientes: Set<string> }>();

  try {
    // Check if current month has data
    const currentMonthCount = await db.saleRecord.count({
      where: { organizationId, saleDate: { gte: monthStart, lt: endDay } },
    });

    if (currentMonthCount === 0) {
      // Fallback to last month with data
      const latestSale = await db.saleRecord.findFirst({
        where: { organizationId },
        orderBy: { saleDate: "desc" },
        select: { saleDate: true },
      });
      if (latestSale?.saleDate) {
        const ld = new Date(latestSale.saleDate);
        salesPeriodStart = new Date(ld.getFullYear(), ld.getMonth(), 1);
        salesPeriodEnd = new Date(ld.getFullYear(), ld.getMonth() + 1, 1);
        periodoVentas = `${mesLabel(salesPeriodStart)} (ultimo disponible)`;
      }
    }

    const salesPeriod = await db.saleRecord.findMany({
      where: {
        organizationId,
        saleDate: { gte: salesPeriodStart, lt: salesPeriodEnd },
      },
      select: {
        saleDate: true, amount: true, sellerName: true,
        channel: true, storeSlug: true, storeName: true,
      },
    });

    for (const s of salesPeriod) {
      const amt = Number(s.amount) || 0;
      ventasMes += amt;
      if (s.saleDate >= weekStart) ventasSemana += amt;
      if (s.saleDate >= today) ventasHoy += amt;

      // Channel aggregation
      const ch = s.channel ?? "OTRO";
      const entry = channelMap.get(ch) ?? { pedidos: 0, valor: 0, clientes: new Set<string>() };
      entry.pedidos += 1;
      entry.valor += amt;
      if (s.storeSlug) entry.clientes.add(s.storeSlug);
      channelMap.set(ch, entry);
    }
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PEDIDOS CRM (CRMQuote) — smart period fallback
  // ═══════════════════════════════════════════════════════════════════════════
  let pedidosMes = 0, pedidosTotal = 0, ticketPromedio = 0;
  let periodoPedidos = mesLabel(monthStart);
  let quotesPeriodStart = monthStart;
  let quotesPeriodEnd = endDay;

  // For vendor ranking — ALL quotes (not just current period)
  type QuoteRow = { sellerSlug: string | null; sellerName: string | null; amount: any; customerId: string | null; issuedAt: Date | null };
  let allQuotes: QuoteRow[] = [];

  try {
    pedidosTotal = await db.cRMQuote.count({ where: { organizationId } });

    const currentCount = await db.cRMQuote.count({
      where: { organizationId, issuedAt: { gte: monthStart, lt: endDay } },
    });

    if (currentCount === 0) {
      const latestQ = await db.cRMQuote.findFirst({
        where: { organizationId },
        orderBy: { issuedAt: "desc" },
        select: { issuedAt: true },
      });
      if (latestQ?.issuedAt) {
        const ld = new Date(latestQ.issuedAt);
        quotesPeriodStart = new Date(ld.getFullYear(), ld.getMonth(), 1);
        quotesPeriodEnd = new Date(ld.getFullYear(), ld.getMonth() + 1, 1);
        periodoPedidos = `${mesLabel(quotesPeriodStart)} (ultimo disponible)`;
      }
    }

    const periodQuotes = await db.cRMQuote.findMany({
      where: { organizationId, issuedAt: { gte: quotesPeriodStart, lt: quotesPeriodEnd } },
      select: { amount: true },
    });
    pedidosMes = periodQuotes.length;
    const totalVal = periodQuotes.reduce((s: number, q: any) => s + (Number(q.amount) || 0), 0);
    ticketPromedio = pedidosMes > 0 ? Math.round(totalVal / pedidosMes) : 0;

    // All quotes for vendor ranking + geography
    allQuotes = await db.cRMQuote.findMany({
      where: { organizationId },
      select: { sellerSlug: true, sellerName: true, amount: true, customerId: true, issuedAt: true },
    });
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CLIENTES
  // ═══════════════════════════════════════════════════════════════════════════
  let clientesActivos = 0, clientesNuevos = 0;
  // Customer city map for geo enrichment
  const customerCityMap = new Map<string, { city: string | null; dept: string | null }>();
  try {
    clientesActivos = await db.customerProfile.count({
      where: { organizationId, status: "ACTIVE" },
    });
    // "New" = created this month
    clientesNuevos = await db.customerProfile.count({
      where: { organizationId, createdAt: { gte: monthStart } },
    });
    // Load city map for geo enrichment
    const profiles = await db.customerProfile.findMany({
      where: { organizationId },
      select: { id: true, city: true, department: true, lastPurchaseAt: true },
    });
    for (const p of profiles) {
      customerCityMap.set(p.id, { city: p.city, dept: p.department });
    }
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CARTERA (CustomerReceivable)
  // ═══════════════════════════════════════════════════════════════════════════
  let carteraTotal = 0, carteraVencida = 0;
  const carteraPorCliente = new Map<string, number>();
  try {
    const allRec = await db.customerReceivable.findMany({
      where: { organizationId, balanceDue: { gt: 0 } },
      select: { customerId: true, balanceDue: true, daysOverdue: true },
    });
    for (const r of allRec) {
      const bal = Number(r.balanceDue) || 0;
      carteraTotal += bal;
      if ((r.daysOverdue ?? 0) > 0) {
        carteraVencida += bal;
      }
      if (r.customerId) {
        carteraPorCliente.set(r.customerId, (carteraPorCliente.get(r.customerId) ?? 0) + bal);
      }
    }
  } catch { /* Graceful */ }

  const clientesConMora = carteraPorCliente.size;
  const pctVencida = carteraTotal > 0 ? Math.round((carteraVencida / carteraTotal) * 100) : 0;

  // Top moroso
  let topMorosoName: string | null = null;
  let topMorosoMonto = 0;
  if (carteraPorCliente.size > 0) {
    const sorted = [...carteraPorCliente.entries()].sort((a, b) => b[1] - a[1]);
    const topId = sorted[0][0];
    topMorosoMonto = sorted[0][1];
    try {
      const prof = await db.customerProfile.findUnique({
        where: { id: topId },
        select: { name: true },
      });
      topMorosoName = prof?.name ?? null;
    } catch { /* Graceful */ }
  }

  const cartera: CarteraBloque = {
    carteraTotal,
    carteraVencida,
    pctVencida,
    clientesConMora,
    topMorosoName,
    topMorosoMonto,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RECAUDOS (CollectionRecord) — smart period fallback
  // ═══════════════════════════════════════════════════════════════════════════
  let recaudosMes = 0;
  let periodoRecaudos = mesLabel(monthStart);
  const recaudoPorCliente = new Map<string, number>();
  try {
    const currentCollCount = await db.collectionRecord.count({
      where: { organizationId, collectionDate: { gte: monthStart, lt: endDay } },
    });

    let collStart = monthStart, collEnd = endDay;
    if (currentCollCount === 0) {
      const latestC = await db.collectionRecord.findFirst({
        where: { organizationId },
        orderBy: { collectionDate: "desc" },
        select: { collectionDate: true },
      });
      if (latestC?.collectionDate) {
        const ld = new Date(latestC.collectionDate);
        collStart = new Date(ld.getFullYear(), ld.getMonth(), 1);
        collEnd = new Date(ld.getFullYear(), ld.getMonth() + 1, 1);
        periodoRecaudos = `${mesLabel(collStart)} (ultimo disponible)`;
      }
    }

    const collections = await db.collectionRecord.findMany({
      where: { organizationId, collectionDate: { gte: collStart, lt: collEnd } },
      select: { customerId: true, amount: true },
    });
    for (const c of collections) {
      const amt = Number(c.amount) || 0;
      recaudosMes += amt;
      if (c.customerId) {
        recaudoPorCliente.set(c.customerId, (recaudoPorCliente.get(c.customerId) ?? 0) + amt);
      }
    }
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. INVENTARIO (CommercialCoverageSnapshot)
  // ═══════════════════════════════════════════════════════════════════════════
  let refsTotales = 0, refsCriticas = 0, refsAgotadas = 0, refsConOp = 0;
  try {
    const latestSnap = await db.commercialCoverageSnapshot.findFirst({
      where: { organizationId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });
    if (latestSnap) {
      const allRefs = await db.commercialCoverageSnapshot.findMany({
        where: { organizationId, snapshotAt: latestSnap.snapshotAt },
        select: { disponible: true, pendingOrdersQty: true },
      });
      refsTotales = allRefs.length;
      for (const ref of allRefs) {
        if (ref.disponible <= 0) refsAgotadas++;
        else if (ref.disponible <= 20) refsCriticas++;
        if (ref.pendingOrdersQty && ref.pendingOrdersQty > 0) refsConOp++;
      }
    }
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. VENDOR RANKING (CRMQuote — all-time, ranked by value)
  // ═══════════════════════════════════════════════════════════════════════════
  const vendorMap = new Map<string, {
    name: string; valor: number; pedidos: number;
    customers: Set<string>; lastDate: Date | null;
  }>();

  for (const q of allQuotes) {
    const slug = q.sellerSlug ?? toSlug(q.sellerName ?? "");
    if (!slug) continue;
    const entry = vendorMap.get(slug) ?? {
      name: q.sellerName ?? slug,
      valor: 0, pedidos: 0,
      customers: new Set<string>(),
      lastDate: null,
    };
    entry.valor += Number(q.amount) || 0;
    entry.pedidos += 1;
    if (q.customerId) entry.customers.add(q.customerId);
    if (q.issuedAt && (!entry.lastDate || q.issuedAt > entry.lastDate)) {
      entry.lastDate = q.issuedAt;
    }
    vendorMap.set(slug, entry);
  }

  // Enrich with cartera per vendor (via their customers)
  const vendorCartera = new Map<string, number>();
  for (const [slug, v] of vendorMap) {
    let vc = 0;
    for (const cid of v.customers) {
      vc += carteraPorCliente.get(cid) ?? 0;
    }
    vendorCartera.set(slug, vc);
  }

  const vendorRanking: VendorRankRow[] = [...vendorMap.entries()]
    .map(([slug, v]) => ({
      name: v.name,
      slug,
      valorCrm: v.valor,
      pedidosCrm: v.pedidos,
      clientesCrm: v.customers.size,
      carteraAsociada: vendorCartera.get(slug) ?? 0,
      ultimoPedido: v.lastDate?.toISOString()?.slice(0, 10) ?? null,
      ranking: 0,
    }))
    .sort((a, b) => b.valorCrm - a.valorCrm)
    .map((v, i) => ({ ...v, ranking: i + 1 }))
    .slice(0, 15);

  const vendedoresOperativos = vendorMap.size;

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GEOGRAPHY TABLE (CustomerProfile cities + CRMQuote enrichment)
  // ═══════════════════════════════════════════════════════════════════════════
  const geoTable: GeoRow[] = [];
  try {
    // Group customers by city
    const cityGroups = new Map<string, { dept: string | null; clienteIds: Set<string> }>();
    for (const [cid, geo] of customerCityMap) {
      const city = (geo.city ?? "").trim();
      if (!city || /^\d+$/.test(city)) continue;
      const entry = cityGroups.get(city) ?? { dept: geo.dept, clienteIds: new Set<string>() };
      entry.clienteIds.add(cid);
      cityGroups.set(city, entry);
    }

    // Enrich with CRMQuote data per city
    const cityQuoteMap = new Map<string, { pedidos: number; valor: number }>();
    for (const q of allQuotes) {
      if (!q.customerId) continue;
      const geo = customerCityMap.get(q.customerId);
      const city = (geo?.city ?? "").trim();
      if (!city || /^\d+$/.test(city)) continue;
      const entry = cityQuoteMap.get(city) ?? { pedidos: 0, valor: 0 };
      entry.pedidos += 1;
      entry.valor += Number(q.amount) || 0;
      cityQuoteMap.set(city, entry);
    }

    for (const [city, data] of cityGroups) {
      let carteraCity = 0;
      for (const cid of data.clienteIds) {
        carteraCity += carteraPorCliente.get(cid) ?? 0;
      }
      const quoteData = cityQuoteMap.get(city);
      geoTable.push({
        city,
        department: data.dept,
        clientes: data.clienteIds.size,
        pedidos: quoteData?.pedidos ?? 0,
        valorPedidos: quoteData?.valor ?? 0,
        carteraVencida: carteraCity,
      });
    }

    geoTable.sort((a, b) => b.clientes - a.clientes);
    geoTable.splice(20);
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. CUSTOMER HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  const customerHighlights: CustomerHighlight[] = [];
  try {
    // Top buyers (CRMQuote — all time since period may be empty)
    const buyerAgg = new Map<string, { count: number; total: number }>();
    for (const q of allQuotes) {
      if (!q.customerId) continue;
      const entry = buyerAgg.get(q.customerId) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(q.amount) || 0;
      buyerAgg.set(q.customerId, entry);
    }

    const topBuyers = [...buyerAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3);

    if (topBuyers.length > 0) {
      const bIds = topBuyers.map(([id]) => id);
      const bProfs = await db.customerProfile.findMany({
        where: { id: { in: bIds } },
        select: { id: true, name: true, nit: true, city: true },
      });
      const bMap = new Map<string, any>(bProfs.map((p: any) => [p.id, p]));

      for (const [cid, data] of topBuyers) {
        const p = bMap.get(cid);
        if (!p) continue;
        customerHighlights.push({
          id: cid, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "top_buyer", label: "Mayor comprador",
          value: data.total,
          detail: `${data.count} pedidos \u2014 $${fmtCop(data.total)}`,
        });
      }
    }

    // High risk (top overdue)
    const topRisk = [...carteraPorCliente.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topRisk.length > 0) {
      const rIds = topRisk.map(([id]) => id);
      const rProfs = await db.customerProfile.findMany({
        where: { id: { in: rIds } },
        select: { id: true, name: true, nit: true, city: true },
      });
      const rMap = new Map<string, any>(rProfs.map((p: any) => [p.id, p]));

      for (const [cid, bal] of topRisk) {
        const p = rMap.get(cid);
        if (!p) continue;
        customerHighlights.push({
          id: cid, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "high_risk", label: "Mayor cartera vencida",
          value: bal,
          detail: `Cartera: $${fmtCop(bal)}`,
        });
      }
    }

    // Top collectors
    const topColl = [...recaudoPorCliente.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topColl.length > 0) {
      const cIds = topColl.map(([id]) => id);
      const cProfs = await db.customerProfile.findMany({
        where: { id: { in: cIds } },
        select: { id: true, name: true, nit: true, city: true },
      });
      const cMap = new Map<string, any>(cProfs.map((p: any) => [p.id, p]));

      for (const [cid, amt] of topColl) {
        const p = cMap.get(cid);
        if (!p) continue;
        customerHighlights.push({
          id: cid, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "top_collector", label: "Mayor recaudo",
          value: amt,
          detail: `Recaudo: $${fmtCop(amt)}`,
        });
      }
    }

    // No recent purchase (>90 days since last quote, has cartera)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const staleCustomers: { id: string; lastQuote: Date }[] = [];
    const customerLastQuote = new Map<string, Date>();
    for (const q of allQuotes) {
      if (!q.customerId || !q.issuedAt) continue;
      const prev = customerLastQuote.get(q.customerId);
      if (!prev || q.issuedAt > prev) customerLastQuote.set(q.customerId, q.issuedAt);
    }
    for (const [cid, lastQ] of customerLastQuote) {
      if (lastQ < ninetyDaysAgo && carteraPorCliente.has(cid)) {
        staleCustomers.push({ id: cid, lastQuote: lastQ });
      }
    }
    staleCustomers.sort((a, b) => a.lastQuote.getTime() - b.lastQuote.getTime());
    const topStale = staleCustomers.slice(0, 2);
    if (topStale.length > 0) {
      const sIds = topStale.map(s => s.id);
      const sProfs = await db.customerProfile.findMany({
        where: { id: { in: sIds } },
        select: { id: true, name: true, nit: true, city: true },
      });
      const sMap = new Map<string, any>(sProfs.map((p: any) => [p.id, p]));
      for (const s of topStale) {
        const p = sMap.get(s.id);
        if (!p) continue;
        const days = Math.round((Date.now() - s.lastQuote.getTime()) / 86400000);
        customerHighlights.push({
          id: s.id, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "no_recent_purchase", label: "Sin compra reciente",
          value: carteraPorCliente.get(s.id) ?? 0,
          detail: `${days} dias sin pedido \u2014 tiene cartera activa`,
        });
      }
    }
  } catch { /* Graceful */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. CHANNELS
  // ═══════════════════════════════════════════════════════════════════════════
  const CHANNEL_LABELS: Record<string, string> = {
    ALMACEN: "Almacen",
    EMPRESA: "Empresa / Mayorista",
    ONLINE: "Online",
    OTRO: "Otro / SAG",
  };

  const channels: ChannelRow[] = [];
  // Configured channels
  const knownChannels = ["ALMACEN", "EMPRESA", "ONLINE", "OTRO"];
  for (const ch of knownChannels) {
    const data = channelMap.get(ch);
    channels.push({
      channel: CHANNEL_LABELS[ch] ?? ch,
      pedidos: data?.pedidos ?? 0,
      valor: data?.valor ?? 0,
      clientes: data?.clientes.size ?? 0,
      status: data ? "activo" : "sin_datos",
    });
  }
  // Any additional channels from data
  for (const [ch, data] of channelMap) {
    if (knownChannels.includes(ch)) continue;
    channels.push({
      channel: CHANNEL_LABELS[ch] ?? ch,
      pedidos: data.pedidos,
      valor: data.valor,
      clientes: data.clientes.size,
      status: "activo",
    });
  }
  channels.sort((a, b) => b.valor - a.valor);

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. INSIGHTS EJECUTIVOS (deterministic rules)
  // ═══════════════════════════════════════════════════════════════════════════
  const insights: InsightEjecutivo[] = [];
  let insightSeq = 0;

  // Geography concentration
  if (geoTable.length > 0 && clientesActivos > 0) {
    const topCity = geoTable[0];
    const pct = Math.round((topCity.clientes / clientesActivos) * 100);
    if (pct > 50) {
      insights.push({
        id: `ins-${++insightSeq}`,
        text: `${topCity.city} concentra ${pct}% de los clientes activos.`,
        severity: pct > 80 ? "warning" : "neutral",
      });
    }
  }

  // Vendor concentration
  if (vendorRanking.length >= 3) {
    const top3Val = vendorRanking.slice(0, 3).reduce((s, v) => s + v.valorCrm, 0);
    const totalVal = vendorRanking.reduce((s, v) => s + v.valorCrm, 0);
    if (totalVal > 0) {
      const pct = Math.round((top3Val / totalVal) * 100);
      insights.push({
        id: `ins-${++insightSeq}`,
        text: `Los top 3 vendedores concentran ${pct}% del valor CRM.`,
        severity: pct > 80 ? "warning" : "neutral",
      });
    }
  }

  // Cartera concentration
  if (carteraPorCliente.size > 0 && carteraVencida > 0) {
    const sortedC = [...carteraPorCliente.values()].sort((a, b) => b - a);
    const top5Sum = sortedC.slice(0, 5).reduce((s, v) => s + v, 0);
    const pctC = Math.round((top5Sum / carteraVencida) * 100);
    insights.push({
      id: `ins-${++insightSeq}`,
      text: `${Math.min(5, sortedC.length)} clientes concentran ${pctC}% de la cartera vencida.`,
      severity: pctC > 80 ? "critical" : "warning",
    });
  }

  // Inventory
  if (refsAgotadas > 0) {
    insights.push({
      id: `ins-${++insightSeq}`,
      text: `${refsAgotadas} referencias estan agotadas en inventario.`,
      severity: refsAgotadas > 20 ? "critical" : "warning",
    });
  }

  // Geo cartera
  const citiesWithCartera = geoTable.filter(g => g.carteraVencida > 0);
  if (citiesWithCartera.length > 0) {
    const topCarteraCity = citiesWithCartera.sort((a, b) => b.carteraVencida - a.carteraVencida)[0];
    insights.push({
      id: `ins-${++insightSeq}`,
      text: `${topCarteraCity.city} tiene la mayor cartera vencida: $${fmtCop(topCarteraCity.carteraVencida)}.`,
      severity: "warning",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. ALERTAS (with actions)
  // ═══════════════════════════════════════════════════════════════════════════
  const alertas: ControlAlerta[] = [];

  if (refsAgotadas > 5) {
    alertas.push({
      id: "alert-inv-agotadas",
      severity: "critical",
      module: "Inventario",
      title: `${refsAgotadas} referencias agotadas`,
      detail: "Referencias con disponibilidad cero que requieren reposicion inmediata.",
      action: { label: "Ver inventario", href: `/${orgSlug}/comercial/inventario` },
    });
  }

  if (carteraVencida > 0) {
    alertas.push({
      id: "alert-cli-cartera",
      severity: clientesConMora > 50 ? "critical" : "warning",
      module: "Cartera",
      title: `${clientesConMora} clientes con $${fmtCop(carteraVencida)} vencida`,
      detail: `${pctVencida}% de la cartera total esta vencida.`,
      action: { label: "Ver clientes", href: `/${orgSlug}/comercial/clientes` },
    });
  }

  if (refsCriticas > 20) {
    alertas.push({
      id: "alert-inv-criticas",
      severity: "warning",
      module: "Inventario",
      title: `${refsCriticas} referencias en nivel critico (<20 uds)`,
      detail: "Proximamente pueden agotarse si no se reabastecen.",
      action: { label: "Ver inventario", href: `/${orgSlug}/comercial/inventario` },
    });
  }

  if (vendedoresOperativos > 0) {
    const noActivity = vendorRanking.filter(v => v.pedidosCrm === 0);
    if (noActivity.length > 0) {
      alertas.push({
        id: "alert-vendor-inactive",
        severity: "info",
        module: "Vendedores",
        title: `${noActivity.length} vendedor(es) sin pedidos registrados`,
        detail: "Vendedores con registro CRM pero sin actividad de pedidos.",
        action: { label: "Ver vendedores", href: `/${orgSlug}/comercial/vendedores` },
      });
    }
  }

  const sevOrder = { critical: 0, warning: 1, info: 2 };
  alertas.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  alertas.splice(10);

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. BUSINESS DECISIONS SUMMARY (COMMERCIAL-DATA-CONNECTIVITY-01)
  // ═══════════════════════════════════════════════════════════════════════════
  let decisionsSummary: DecisionsSummary | null = null;
  try {
    const allDec: BusinessDecision[] = [];

    // Importaciones
    try {
      const ictx = buildImportPolicyContext(organizationId);
      const iItems = await loadImportReferenceInputs(organizationId);
      const iConfig = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;
      const lr = evaluateLowRotation(ictx, iItems, iConfig);
      const rp = iItems.map(item => evaluateRepurchase(ictx, item, iConfig));
      const nc = buildNextContainerRecommendations(ictx, iItems, rp, iConfig);
      const ag = evaluateInventoryAging(ictx, iItems, iConfig);
      allDec.push(...buildAllImportBusinessDecisions(organizationId, lr, rp, nc.items, ag));
    } catch { /* Graceful */ }

    // Produccion
    try {
      const pctx = buildProductionContext(organizationId);
      const pItems = await loadProductionSubgroupInputs(organizationId);
      const pConfig = CASTILLITOS_PRODUCTION_PLANNING_CONFIG;
      const needs = evaluateProductionNeed(pctx, pItems, pConfig);
      const pris = pItems.map(item => evaluatePriority(pctx, item, pConfig));
      allDec.push(...buildAllProductionBusinessDecisions(needs, pris, organizationId));
    } catch { /* Graceful */ }

    // Vendedores (top 10 sellers for control dashboard)
    try {
      const slugs = (await listSellerSlugs(organizationId)).slice(0, 10);
      const sConfig = CASTILLITOS_SALESREP_POLICY_PACK_CONFIG;
      for (const slug of slugs) {
        try {
          const d = await loadSalesRepData(organizationId, slug);
          if (d.malletState) {
            const oos = evaluateMalletOutOfStock(d.context, d.malletState.malletId, d.malletItems, sConfig);
            allDec.push(...buildOutOfStockDecisions(oos, organizationId));
          }
          const ov = d.customers.map(c => evaluateCustomerReceivablesAlert(d.context, c, sConfig));
          allDec.push(...buildOverdueReceivableDecisions(ov, organizationId));
          const ic = d.customers.map(c => evaluateCustomerInactivity(d.context, c, sConfig));
          allDec.push(...buildInactiveCustomerDecisions(ic, organizationId));
        } catch { /* Skip seller */ }
      }
    } catch { /* Graceful */ }

    const summary = aggregateCommercialDecisions(organizationId, allDec);
    decisionsSummary = {
      totalDecisions: summary.totalDecisions,
      criticalDecisions: summary.criticalDecisions,
      highDecisions: summary.highDecisions,
      domains: summary.domains,
      endpointUrl: `/${orgSlug}/api/comercial/decisions`,
    };
  } catch { /* Graceful — decisions are additive, never break the loader */ }

  console.log(`[COMERCIAL] control: ventas=$${fmtCop(ventasMes)} (${periodoVentas}), cartera=$${fmtCop(carteraTotal)} (${pctVencida}%venc), recaudos=$${fmtCop(recaudosMes)}, vendors=${vendedoresOperativos}, geo=${geoTable.length}, alerts=${alertas.length}, decisions=${decisionsSummary?.totalDecisions ?? 0}`);

  return {
    ventasMes, ventasSemana, ventasHoy, periodoVentas,
    pedidosMes, pedidosTotal, ticketPromedio, periodoPedidos,
    clientesActivos, clientesNuevos,
    vendedoresOperativos,
    recaudosMes, periodoRecaudos,
    cartera,
    refsTotales, refsCriticas, refsAgotadas, refsConOp,
    vendorRanking, geoTable, customerHighlights,
    channels, insights, alertas,
    decisionsSummary,
    loadedAt: new Date().toISOString(),
  };
}
