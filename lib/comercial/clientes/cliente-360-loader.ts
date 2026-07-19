/**
 * cliente-360-loader.ts
 *
 * CLIENTES-360-01 Phase 2 + CLIENTES-DRAWER-PERF-REVIEW-01
 *
 * Loads all available data for a single customer:
 * - Profile + city + NIT
 * - Primary seller (from CRM quote history via client-seller-linker)
 * - CRM quotes
 * - SAG orders (via NIT)
 * - Receivables (cartera)
 * - Collection records (cobros)
 * - Sale records (facturas/remisiones via NIT)
 *
 * PERF-REVIEW-01 optimizations:
 * - Phase 1 parallel: profile + seller + receivables + collections
 * - Phase 2 parallel: crmQuotes + sagOrders + sales (need profile.nit/crmId)
 * - CRM quotes: raw SQL with JSON path filter instead of loading all + client filter
 * - Timing instrumentation via CLIENTE360_TIMING log
 *
 * Each block reports availability state.
 * NO fabricated data — if a source is empty, state = "no_disponible".
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity, resolveCrmCity } from "./city-resolver";
import { getCustomerPrimarySeller } from "@/lib/comercial/foundation/client-seller-linker";

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockState = "disponible" | "no_disponible";

export interface Cliente360Profile {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  status: string;
  segment: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  crmId: string | null;
  sagTerceroId: number | null;
  lastPurchaseAt: string | null;
  crmSyncedAt: string | null;
  erpSyncedAt: string | null;
}

export interface Cliente360Seller {
  state: BlockState;
  sellerName: string | null;
  confidence: number;
}

export interface Cliente360CrmQuote {
  id: string;
  quoteNumber: string | null;
  amount: number;
  issuedAt: string | null;
  stage: string;
  sellerName: string | null;
  sagOrderId: string | null; // id_sag_c — traceability to SAG
}

export interface Cliente360SagOrder {
  id: string;
  erpMovId: number | null;
  orderNumber: string | null;
  orderDate: string | null;
  amount: number;
  status: string;
  customerName: string | null;
}

export interface Cliente360Receivable {
  id: string;
  erpId: string | null;
  originalAmount: number;
  paidAmount: number;
  balanceDue: number;
  invoiceDate: string | null;
  dueDate: string | null;
  daysOverdue: number;
  agingBucket: string | null;
  status: string;
}

export interface Cliente360SaleRecord {
  id: string;
  comprobanteCode: string | null;
  amount: number;
  saleDate: string | null;
  productLine: string | null;
  sagSourceType: string | null; // OFICIAL / REMISION
  sellerSlug: string | null;
}

export interface Cliente360CollectionRecord {
  id: string;
  documentNumber: string | null;
  collectionDate: string | null;
  amount: number;
  appliedStatus: string | null;
}

export interface Cliente360Opportunity {
  id: string;
  type: string;
  title: string;
  reason: string;
}

export interface Cliente360Data {
  profile: Cliente360Profile;
  seller: Cliente360Seller;
  crmQuotes: { state: BlockState; items: Cliente360CrmQuote[] };
  sagOrders: { state: BlockState; items: Cliente360SagOrder[] };
  receivables: {
    state: BlockState;
    items: Cliente360Receivable[];
    totalBalance: number;
    totalOverdue: number;
    openCount: number;
  };
  sales: { state: BlockState; items: Cliente360SaleRecord[] };
  collections: { state: BlockState; items: Cliente360CollectionRecord[] };
  opportunities: Cliente360Opportunity[];
  loadedAt: string;
}

// ── Timing helper ────────────────────────────────────────────────────────────

function ms(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadCliente360(
  organizationId: string,
  clienteId: string,
): Promise<Cliente360Data | null> {
  const db = prisma as any;
  const t0 = performance.now();
  const timing: Record<string, string> = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: parallel — profile + seller + receivables + collections
  // These 4 queries are independent (all use orgId + clienteId, no cross-deps)
  // ═══════════════════════════════════════════════════════════════════════════

  const tP1 = performance.now();

  const [profileResult, sellerResult, rawReceivables, rawCollections] = await Promise.all([
    // 1. Profile
    (async () => {
      const t = performance.now();
      const r = await prisma.customerProfile.findFirst({
        where: { id: clienteId, organizationId },
        select: {
          id: true, name: true, nit: true, city: true, status: true,
          segment: true, email: true, phone: true, address: true,
          crmId: true, sagTerceroId: true, lastPurchaseAt: true,
          crmSyncedAt: true, erpSyncedAt: true,
          rawCrmJson: true, // single row — needed for city resolution
        },
      });
      timing.profile = ms(t);
      return r;
    })(),

    // 2. Seller (from CRM quote history)
    (async () => {
      const t = performance.now();
      const r = await getCustomerPrimarySeller(organizationId, clienteId);
      timing.seller = ms(t);
      return r;
    })(),

    // 3. Receivables (via customerId FK)
    (async () => {
      const t = performance.now();
      const r = await db.customerReceivable.findMany({
        where: { organizationId, customerId: clienteId },
        select: {
          id: true, erpId: true, originalAmount: true, paidAmount: true,
          balanceDue: true, invoiceDate: true, dueDate: true,
          daysOverdue: true, agingBucket: true, status: true,
        },
        orderBy: { dueDate: "desc" },
        take: 50,
      });
      timing.receivables = ms(t);
      return r;
    })(),

    // 4. Collections (via customerId FK)
    (async () => {
      const t = performance.now();
      const r = await db.collectionRecord.findMany({
        where: { organizationId, customerId: clienteId },
        select: {
          id: true, documentNumber: true, collectionDate: true,
          amount: true, appliedStatus: true,
        },
        orderBy: { collectionDate: "desc" },
        take: 50,
      });
      timing.collections = ms(t);
      return r;
    })(),
  ]);

  timing.phase1 = ms(tP1);

  const p = profileResult;
  if (!p) return null;

  // Resolve city
  const crmRaw = (p.rawCrmJson as any)?.raw ?? {};
  const crmBillingCity = crmRaw.billing_address_city as string | undefined;
  const resolvedCity = resolveCity(p.city) ?? resolveCrmCity(crmBillingCity);

  const profile: Cliente360Profile = {
    id: p.id, name: p.name, nit: p.nit, city: resolvedCity,
    status: p.status, segment: p.segment, email: p.email,
    phone: p.phone, address: p.address, crmId: p.crmId,
    sagTerceroId: p.sagTerceroId,
    lastPurchaseAt: p.lastPurchaseAt?.toISOString() ?? null,
    crmSyncedAt: p.crmSyncedAt?.toISOString() ?? null,
    erpSyncedAt: p.erpSyncedAt?.toISOString() ?? null,
  };

  const seller: Cliente360Seller = {
    state: sellerResult.sellerName ? "disponible" : "no_disponible",
    sellerName: sellerResult.sellerName,
    confidence: sellerResult.confidence,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: parallel — crmQuotes + sagOrders + sales (need profile.nit/crmId)
  // ═══════════════════════════════════════════════════════════════════════════

  const tP2 = performance.now();

  const [crmQuotesRaw, sagOrdersRaw, salesRaw] = await Promise.all([
    // CRM Quotes — use raw SQL with JSON path filter to avoid loading all org quotes
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      if (p.crmId) {
        rows = await db.$queryRawUnsafe(`
          SELECT id, "quoteNumber", amount, "issuedAt", "sellerName",
                 "rawCrmJson"->'raw'->>'stage' AS stage,
                 "rawCrmJson"->'raw'->>'id_sag_c' AS "sagOrderId"
          FROM "CRMQuote"
          WHERE "organizationId" = $1
            AND "rawCrmJson"->'raw'->>'billing_account_id' = $2
          ORDER BY "issuedAt" DESC
        `, organizationId, p.crmId);
      }
      timing.crmQuotes = ms(t);
      return rows;
    })(),

    // SAG Orders (via NIT)
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      if (p.nit) {
        rows = await db.customerOrderRecord.findMany({
          where: { organizationId, customerNit: p.nit },
          select: {
            id: true, erpMovId: true, orderNumber: true,
            orderDate: true, amount: true, status: true, customerName: true,
          },
          orderBy: { orderDate: "desc" },
          take: 50,
        });
      }
      timing.sagOrders = ms(t);
      return rows;
    })(),

    // Sales (via NIT)
    (async () => {
      const t = performance.now();
      let rows: any[] = [];
      if (p.nit) {
        rows = await db.saleRecord.findMany({
          where: { organizationId, customerNit: p.nit },
          select: {
            id: true, comprobanteCode: true, amount: true,
            saleDate: true, productLine: true, sagSourceType: true, sellerSlug: true,
          },
          orderBy: { saleDate: "desc" },
          take: 50,
        });
      }
      timing.sales = ms(t);
      return rows;
    })(),
  ]);

  timing.phase2 = ms(tP2);

  // ═══════════════════════════════════════════════════════════════════════════
  // Transform results
  // ═══════════════════════════════════════════════════════════════════════════

  const crmQuotes: Cliente360CrmQuote[] = crmQuotesRaw.map((q: any) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    amount: Number(q.amount ?? 0),
    issuedAt: q.issuedAt instanceof Date ? q.issuedAt.toISOString() : (q.issuedAt ?? null),
    stage: q.stage || "Desconocido",
    sellerName: q.sellerName,
    sagOrderId: q.sagOrderId || null,
  }));

  const sagOrders: Cliente360SagOrder[] = sagOrdersRaw.map((o: any) => ({
    id: o.id,
    erpMovId: o.erpMovId,
    orderNumber: o.orderNumber,
    orderDate: o.orderDate?.toISOString() ?? null,
    amount: Number(o.amount ?? 0),
    status: o.status,
    customerName: o.customerName,
  }));

  const receivableItems: Cliente360Receivable[] = rawReceivables.map((r: any) => ({
    id: r.id,
    erpId: r.erpId,
    originalAmount: Number(r.originalAmount ?? 0),
    paidAmount: Number(r.paidAmount ?? 0),
    balanceDue: Number(r.balanceDue ?? 0),
    invoiceDate: r.invoiceDate?.toISOString() ?? null,
    dueDate: r.dueDate?.toISOString() ?? null,
    daysOverdue: Number(r.daysOverdue ?? 0),
    agingBucket: r.agingBucket,
    status: r.status,
  }));

  const totalBalance = receivableItems.reduce((s, r) => s + r.balanceDue, 0);
  const totalOverdue = receivableItems
    .filter(r => r.daysOverdue > 0)
    .reduce((s, r) => s + r.balanceDue, 0);
  const openCount = receivableItems.filter(r => r.status === "OPEN" || r.status === "PARTIAL").length;

  const salesItems: Cliente360SaleRecord[] = salesRaw.map((s: any) => ({
    id: s.id,
    comprobanteCode: s.comprobanteCode,
    amount: Number(s.amount ?? 0),
    saleDate: s.saleDate?.toISOString() ?? null,
    productLine: s.productLine,
    sagSourceType: s.sagSourceType,
    sellerSlug: s.sellerSlug,
  }));

  const collectionItems: Cliente360CollectionRecord[] = rawCollections.map((c: any) => ({
    id: c.id,
    documentNumber: c.documentNumber,
    collectionDate: c.collectionDate?.toISOString() ?? null,
    amount: Number(c.amount ?? 0),
    appliedStatus: c.appliedStatus,
  }));

  // Opportunities (synchronous, no DB)
  const opportunities = computeOpportunities(
    profile, seller, crmQuotes, sagOrders, receivableItems, salesItems,
  );

  timing.total = ms(t0);

  // Payload size estimation
  const result: Cliente360Data = {
    profile,
    seller,
    crmQuotes: {
      state: crmQuotes.length > 0 ? "disponible" : "no_disponible",
      items: crmQuotes,
    },
    sagOrders: {
      state: sagOrders.length > 0 ? "disponible" : "no_disponible",
      items: sagOrders,
    },
    receivables: {
      state: receivableItems.length > 0 ? "disponible" : "no_disponible",
      items: receivableItems,
      totalBalance,
      totalOverdue,
      openCount,
    },
    sales: {
      state: salesItems.length > 0 ? "disponible" : "no_disponible",
      items: salesItems,
    },
    collections: {
      state: collectionItems.length > 0 ? "disponible" : "no_disponible",
      items: collectionItems,
    },
    opportunities,
    loadedAt: new Date().toISOString(),
  };

  const payloadKb = (JSON.stringify(result).length / 1024).toFixed(1);

  console.log(
    `[CLIENTE360_TIMING] ${p.name} — ` +
    `profile=${timing.profile} seller=${timing.seller} ` +
    `crmQuotes=${timing.crmQuotes} sagOrders=${timing.sagOrders} ` +
    `receivables=${timing.receivables} sales=${timing.sales} ` +
    `collections=${timing.collections} | ` +
    `phase1=${timing.phase1} phase2=${timing.phase2} | ` +
    `total=${timing.total} | ` +
    `payload=${payloadKb}KB | ` +
    `rows: quotes=${crmQuotes.length} sag=${sagOrders.length} ` +
    `recv=${receivableItems.length} sales=${salesItems.length} ` +
    `coll=${collectionItems.length} opps=${opportunities.length}`,
  );

  return result;
}

// ── Opportunity Engine ────────────────────────────────────────────────────────

function computeOpportunities(
  profile: Cliente360Profile,
  seller: Cliente360Seller,
  crmQuotes: Cliente360CrmQuote[],
  sagOrders: Cliente360SagOrder[],
  receivables: Cliente360Receivable[],
  sales: Cliente360SaleRecord[],
): Cliente360Opportunity[] {
  const ops: Cliente360Opportunity[] = [];
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  // 1. Sin pedido reciente > 90 dias
  const lastOrderDate = getLastActivityDate(crmQuotes, sagOrders, sales);
  if (lastOrderDate && (now - lastOrderDate) > NINETY_DAYS) {
    const days = Math.round((now - lastOrderDate) / (24 * 60 * 60 * 1000));
    ops.push({
      id: "opp_inactivo",
      type: "inactividad",
      title: "Cliente inactivo",
      reason: `Sin actividad comercial hace ${days} dias. Ultimo movimiento registrado hace mas de 90 dias.`,
    });
  }

  // 2. Cartera vencida
  const overdue = receivables.filter(r => r.daysOverdue > 0);
  if (overdue.length > 0) {
    const totalOverdue = overdue.reduce((s, r) => s + r.balanceDue, 0);
    const maxDays = Math.max(...overdue.map(r => r.daysOverdue));
    ops.push({
      id: "opp_cartera_vencida",
      type: "cartera",
      title: "Cartera vencida pendiente",
      reason: `${overdue.length} factura${overdue.length > 1 ? "s" : ""} vencida${overdue.length > 1 ? "s" : ""} por $${fmtNum(totalOverdue)}. Mayor mora: ${maxDays} dias.`,
    });
  }

  // 3. Pedidos CRM no facturados
  const noFacturado = crmQuotes.filter(
    q => q.stage !== "Facturado" && q.stage !== "Anulado",
  );
  if (noFacturado.length > 0) {
    ops.push({
      id: "opp_no_facturado",
      type: "conversion",
      title: "Pedidos sin facturar",
      reason: `${noFacturado.length} pedido${noFacturado.length > 1 ? "s" : ""} CRM en estado no facturado (${[...new Set(noFacturado.map(q => q.stage))].join(", ")}).`,
    });
  }

  // 4. Sin vendedor confiable
  if (seller.state === "no_disponible" || seller.confidence < 60) {
    ops.push({
      id: "opp_sin_vendedor",
      type: "asignacion",
      title: "Sin vendedor asignado",
      reason: seller.confidence > 0
        ? `Vendedor con ${seller.confidence}% de confianza (minimo requerido: 60%).`
        : "No hay historial de pedidos CRM para determinar vendedor principal.",
    });
  }

  // 5. SAG orders but no CRM activity
  if (sagOrders.length > 0 && crmQuotes.length === 0) {
    ops.push({
      id: "opp_sag_sin_crm",
      type: "trazabilidad",
      title: "Actividad SAG sin registro CRM",
      reason: `${sagOrders.length} pedido${sagOrders.length > 1 ? "s" : ""} en SAG pero sin cotizaciones CRM. El vendedor puede no estar registrando en CRM.`,
    });
  }

  return ops;
}

function getLastActivityDate(
  crmQuotes: Cliente360CrmQuote[],
  sagOrders: Cliente360SagOrder[],
  sales: Cliente360SaleRecord[],
): number | null {
  const dates: number[] = [];
  for (const q of crmQuotes) {
    if (q.issuedAt) dates.push(new Date(q.issuedAt).getTime());
  }
  for (const o of sagOrders) {
    if (o.orderDate) dates.push(new Date(o.orderDate).getTime());
  }
  for (const s of sales) {
    if (s.saleDate) dates.push(new Date(s.saleDate).getTime());
  }
  return dates.length > 0 ? Math.max(...dates) : null;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("es-CO");
}
