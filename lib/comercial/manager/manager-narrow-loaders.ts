/**
 * lib/comercial/manager/manager-narrow-loaders.ts
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 *
 * Narrow, route-specific data loaders for Manager commercial surfaces.
 * Each loader queries ONLY the Prisma data its route actually renders.
 *
 * Replaces the monolithic loadControlComercial() which runs 13 sequential
 * query blocks + decision engines (120-600s) when each route needs 1-2 queries.
 *
 * Rules:
 *   - Every query scoped by organizationId
 *   - No cross-domain aggregation
 *   - No decision engine evaluation
 *   - No vendor ranking, geo, channels, insights, alertas
 *   - Each function returns ONLY the fields the route renders
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";

// ── Helpers (copied from control-comercial-loader.ts) ────────────────────────

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function mesLabel(d: Date): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

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

function fmtCop(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m.toLocaleString("es-CO", { minimumFractionDigits: m >= 1000 ? 0 : 1, maximumFractionDigits: m >= 1000 ? 0 : 1 })} M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString("es-CO")} K`;
  return `$${n.toLocaleString("es-CO")}`;
}

// ── Ventas narrow loader ─────────────────────────────────────────────────────

export interface NarrowVentasData {
  ventasMes: number;
  ventasSemana: number;
  ventasHoy: number;
  periodoVentas: string;
  loadedAt: string;
}

export async function loadNarrowVentas(organizationId: string): Promise<NarrowVentasData> {
  const db = prisma as any;
  const today = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();
  const endDay = new Date(today); endDay.setDate(endDay.getDate() + 1);

  let ventasMes = 0, ventasSemana = 0, ventasHoy = 0;
  let periodoVentas = mesLabel(monthStart);

  try {
    const currentMonthCount = await db.saleRecord.count({
      where: { organizationId, saleDate: { gte: monthStart, lt: endDay } },
    });

    let salesPeriodStart = monthStart;
    let salesPeriodEnd = endDay;

    if (currentMonthCount === 0) {
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
      where: { organizationId, saleDate: { gte: salesPeriodStart, lt: salesPeriodEnd } },
      select: { saleDate: true, amount: true },
    });

    for (const s of salesPeriod) {
      const amt = Number(s.amount) || 0;
      ventasMes += amt;
      if (s.saleDate >= weekStart) ventasSemana += amt;
      if (s.saleDate >= today) ventasHoy += amt;
    }
  } catch { /* Graceful */ }

  return { ventasMes, ventasSemana, ventasHoy, periodoVentas, loadedAt: new Date().toISOString() };
}

// ── Pedidos narrow loader ────────────────────────────────────────────────────
// Source: CustomerOrderRecord (SAG PD — canonical orders).
// Excludes CANCELADO. CRM quotes appear only as a separate secondary signal.

export interface NarrowPedidosData {
  // Primary: canonical orders (CustomerOrderRecord)
  pedidosMes: number;
  pedidosTotal: number;
  montoMes: number;
  periodoPedidos: string;
  // Secondary signal: CRM quotes (separate, never mixed into totals)
  cotizacionesCrm: number;
  // Freshness
  loadedAt: string;
}

/** Canonical order statuses to include. CANCELADO excluded. */
const PEDIDOS_VALID_STATUSES = ["PENDIENTE", "CONFIRMADO", "DESPACHADO", "FACTURADO"];

export async function loadNarrowPedidos(organizationId: string): Promise<NarrowPedidosData> {
  const db = prisma as any;
  const monthStart = startOfMonth();
  const endDay = new Date(startOfToday()); endDay.setDate(endDay.getDate() + 1);

  let pedidosMes = 0, pedidosTotal = 0, montoMes = 0;
  let periodoPedidos = mesLabel(monthStart);
  let cotizacionesCrm = 0;

  try {
    // Total canonical orders (excluding cancelled)
    const [totalCount, crmCount] = await Promise.all([
      db.customerOrderRecord.count({
        where: { organizationId, status: { in: PEDIDOS_VALID_STATUSES } },
      }),
      db.cRMQuote.count({ where: { organizationId } }),
    ]);
    pedidosTotal = totalCount;
    cotizacionesCrm = crmCount;

    // Smart period fallback for orders
    let ordersPeriodStart = monthStart;
    let ordersPeriodEnd = endDay;

    const currentMonthCount = await db.customerOrderRecord.count({
      where: {
        organizationId,
        status: { in: PEDIDOS_VALID_STATUSES },
        orderDate: { gte: monthStart, lt: endDay },
      },
    });

    if (currentMonthCount === 0) {
      const latestOrder = await db.customerOrderRecord.findFirst({
        where: { organizationId, status: { in: PEDIDOS_VALID_STATUSES } },
        orderBy: { orderDate: "desc" },
        select: { orderDate: true },
      });
      if (latestOrder?.orderDate) {
        const ld = new Date(latestOrder.orderDate);
        ordersPeriodStart = new Date(ld.getFullYear(), ld.getMonth(), 1);
        ordersPeriodEnd = new Date(ld.getFullYear(), ld.getMonth() + 1, 1);
        periodoPedidos = `${mesLabel(ordersPeriodStart)} (ultimo disponible)`;
      }
    }

    // Aggregate period orders
    const periodAgg = await db.customerOrderRecord.aggregate({
      where: {
        organizationId,
        status: { in: PEDIDOS_VALID_STATUSES },
        orderDate: { gte: ordersPeriodStart, lt: ordersPeriodEnd },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    pedidosMes = periodAgg._count._all ?? 0;
    montoMes = Number(periodAgg._sum.amount ?? 0);
  } catch { /* Graceful */ }

  return {
    pedidosMes, pedidosTotal, montoMes, periodoPedidos,
    cotizacionesCrm, loadedAt: new Date().toISOString(),
  };
}

// ── Clientes narrow loader ───────────────────────────────────────────────────

export interface NarrowClienteHighlight {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  reason: "top_buyer" | "top_collector" | "high_risk" | "no_recent_purchase";
  label: string;
  value: number;
  detail: string;
}

export interface NarrowClientesData {
  clientesActivos: number;
  clientesNuevos: number;
  customerHighlights: NarrowClienteHighlight[];
  loadedAt: string;
}

export async function loadNarrowClientes(organizationId: string): Promise<NarrowClientesData> {
  const db = prisma as any;
  const monthStart = startOfMonth();

  let clientesActivos = 0, clientesNuevos = 0;
  const customerHighlights: NarrowClienteHighlight[] = [];

  try {
    // DATA-TRUST-REMEDIATION-01 / Carril E: Gate receivable query behind certification.
    // "Mayor cartera vencida" must not surface uncertified overdue data.
    await warmTruthStatusCache();
    const arCertified = isReceivableDataCertified(organizationId);

    // Run counts + aggregations in parallel
    const [activeCount, newCount, buyerGroups, riskGroups] = await Promise.all([
      db.customerProfile.count({ where: { organizationId, status: "ACTIVE" } }),
      db.customerProfile.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      // Top buyers: DB-level groupBy instead of pulling all quotes
      db.cRMQuote.groupBy({
        by: ["customerId"],
        where: { organizationId, customerId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 3,
      }).catch(() => [] as any[]),
      // High risk: DB-level groupBy on overdue receivables
      // Suppressed entirely when receivable data is not certified (fail-closed).
      arCertified
        ? db.customerReceivable.groupBy({
            by: ["customerId"],
            where: { organizationId, balanceDue: { gt: 0 }, daysOverdue: { gt: 0 }, customerId: { not: null } },
            _sum: { balanceDue: true },
            orderBy: { _sum: { balanceDue: "desc" } },
            take: 3,
          }).catch(() => [] as any[])
        : ([] as any[]),
    ]);

    clientesActivos = activeCount;
    clientesNuevos = newCount;

    // Resolve profiles for top buyers + top risk in one query
    const allHighlightIds = [
      ...buyerGroups.map((g: any) => g.customerId),
      ...riskGroups.map((g: any) => g.customerId),
    ].filter(Boolean);

    if (allHighlightIds.length > 0) {
      const profiles = await db.customerProfile.findMany({
        where: { id: { in: allHighlightIds } },
        select: { id: true, name: true, nit: true, city: true, identityStatus: true },
      });
      const pMap = new Map<string, any>(profiles.map((p: any) => [p.id, p]));

      // Exclude non-commercial profiles from executive rankings using the
      // canonical IdentityStatus enum (Prisma schema).  CONSUMIDOR_FINAL is
      // set by resolveCustomerIdentity() — never by name comparison.
      // These profiles remain in aggregate totals (clientesActivos) but are
      // not executive-relevant for buyer/risk highlights.
      const NON_COMMERCIAL_IDENTITY_STATUSES = new Set(["CONSUMIDOR_FINAL", "DUPLICATE"]);

      for (const g of buyerGroups) {
        const p = pMap.get(g.customerId);
        if (!p || NON_COMMERCIAL_IDENTITY_STATUSES.has(p.identityStatus)) continue;
        const total = Number(g._sum?.amount) || 0;
        const count = g._count?.id ?? 0;
        customerHighlights.push({
          id: g.customerId, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "top_buyer", label: "Mayor comprador",
          value: total,
          detail: `${count} pedidos \u2014 $${fmtCop(total)}`,
        });
      }

      for (const g of riskGroups) {
        const p = pMap.get(g.customerId);
        if (!p || NON_COMMERCIAL_IDENTITY_STATUSES.has(p.identityStatus)) continue;
        const bal = Number(g._sum?.balanceDue) || 0;
        customerHighlights.push({
          id: g.customerId, name: p.name ?? "\u2014", nit: p.nit, city: p.city,
          reason: "high_risk", label: "Mayor cartera vencida",
          value: bal,
          detail: `Cartera: $${fmtCop(bal)}`,
        });
      }
    }
  } catch { /* Graceful */ }

  return { clientesActivos, clientesNuevos, customerHighlights, loadedAt: new Date().toISOString() };
}

// ── Inventario narrow loader ─────────────────────────────────────────────────

export interface NarrowInventarioData {
  refsTotales: number;
  refsCriticas: number;
  refsAgotadas: number;
  loadedAt: string;
}

export async function loadNarrowInventario(organizationId: string): Promise<NarrowInventarioData> {
  const db = prisma as any;
  let refsTotales = 0, refsCriticas = 0, refsAgotadas = 0;

  try {
    const latestSnap = await db.commercialCoverageSnapshot.findFirst({
      where: { organizationId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });
    if (latestSnap) {
      const allRefs = await db.commercialCoverageSnapshot.findMany({
        where: { organizationId, snapshotAt: latestSnap.snapshotAt },
        select: { disponible: true },
      });
      refsTotales = allRefs.length;
      for (const ref of allRefs) {
        if (ref.disponible <= 0) refsAgotadas++;
        else if (ref.disponible <= 20) refsCriticas++;
      }
    }
  } catch { /* Graceful */ }

  return { refsTotales, refsCriticas, refsAgotadas, loadedAt: new Date().toISOString() };
}

// ── Vendedores narrow loader ─────────────────────────────────────────────────
// REMOVED: loadNarrowVendedoresCount is eliminated.
//
// The KPI "Vendedores operativos" MUST share the exact same universe as the
// rendered seller card list (activo + atencion only). The count is derived
// from the seller directory at the route level — not from a separate query.
//
// See: assembleVendedoresPAFromNarrow which applies the fail-closed filter
// and uses the filtered count for both KPI and card list.

export interface NarrowVendedoresData {
  vendedoresOperativos: number;
  loadedAt: string;
}

// ── Importaciones — canonical cache consumer ────────────────────────────────
//
// SINGLE TRUTH: Manager and Desktop consume the SAME result produced by
// buildImportSupplyIntelligence(). This loader is a thin projection of the
// cached canonical result — no parallel business rules, no local constants.
//
// Product lines, warehouse IDs, and classification thresholds are all resolved
// by the canonical service (import-service.ts + import-intelligence-service.ts)
// via warehouse-master.ts and import-policy-pack-config.ts.
//
// Cache: server-side in-memory, 5-minute TTL.
// On failure: serves last certified result (STALE) or SOURCE_UNAVAILABLE.
// No SOAP per navigation. No hardcoded "5" or "33".

import {
  getCachedImportIntelligence,
  projectManagerKpis,
  type CachedImportTruthState,
  type ImportSourceFreshness,
} from "@/lib/comercial/importaciones/import-intelligence-cache";

export type NarrowImportacionesTruthState = "CERTIFIED" | "STALE" | "SOURCE_UNAVAILABLE";

export interface NarrowImportacionesData {
  totalRefs: number;
  lowRotationCount: number;
  recompraInmediataCount: number;
  sinFechaCount: number;
  /** Composite freshness from all participating sources (products, inventory, orders).
   *  = MIN(productEntityAsOf, inventoryAsOf, orderLinesAsOf). */
  sourceAsOf: string | null;
  /** Per-source freshness for transparency */
  sourceFreshness: ImportSourceFreshness;
  /** CERTIFIED = fresh canonical result. STALE = serving previous result after refresh failure.
   *  SOURCE_UNAVAILABLE = no result ever computed successfully. */
  truthState: NarrowImportacionesTruthState;
  /** Explanation when truthState is not CERTIFIED. */
  unavailableCause: string | null;
  /** Timestamp when the canonical result was computed. */
  computedAt: string;
}

export async function loadNarrowImportaciones(organizationId: string): Promise<NarrowImportacionesData> {
  const cached = await getCachedImportIntelligence(organizationId);
  const kpis = projectManagerKpis(cached);

  return {
    totalRefs: kpis.totalRefs,
    lowRotationCount: kpis.lowRotationCount,
    recompraInmediataCount: kpis.recompraInmediataCount,
    sinFechaCount: kpis.sinFechaCount,
    sourceAsOf: cached.freshness.compositeAsOf,
    sourceFreshness: cached.freshness,
    truthState: cached.truthState,
    unavailableCause: cached.staleCause,
    computedAt: cached.computedAt,
  };
}
