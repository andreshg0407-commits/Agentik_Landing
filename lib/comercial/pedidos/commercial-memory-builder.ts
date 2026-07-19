/**
 * lib/comercial/pedidos/commercial-memory-builder.ts
 *
 * Builds commercial memory profiles from order data.
 * Infrastructure for David — no AI, only structured computation.
 *
 * Computes: Customer memory, Seller memory, Product memory.
 * All metrics consider orders from ALL origins (agentik, sag, importado, migrado).
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  OrderHeader,
  OrderLine,
  OrderSummary,
  OrderStatus,
} from "./order-types";
import type {
  CustomerCommercialMemory,
  SellerCommercialMemory,
  ProductCommercialMemory,
  CommercialFrequencyItem,
  OrderFulfillmentStatus,
} from "./order-core-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Load all order rows for an org ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOrderRows(orgId: string): Promise<any[]> {
  try {
    return await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }) as unknown[];
  } catch {
    return [];
  }
}

// ── Customer commercial memory ──────────────────────────────────────────────

export async function buildCustomerMemory(
  orgId:        string,
  customerCode: string,
): Promise<CustomerCommercialMemory> {
  const empty: CustomerCommercialMemory = {
    customerCode,
    customerName:       "",
    totalOrders:        0,
    avgOrdersPerMonth:  0,
    daysBetweenOrders:  null,
    daysSinceLastOrder: null,
    totalLifetimeValue: 0,
    avgTicketValue:     0,
    topReferences:      [],
    topSizes:           [],
    topColors:          [],
    topCategories:      [],
    reorderCandidates:  [],
    oneTimeBuys:        [],
    fulfillmentPercent: 0,
    avgDaysToInvoice:   null,
  };

  if (!customerCode) return empty;

  const now = Date.now();
  let customerName = "";
  let totalValue = 0;
  let matchCount = 0;
  const orderDates: number[] = [];
  const refMap   = new Map<string, { count: number; lastSeen: string }>();
  const sizeMap  = new Map<string, { count: number; lastSeen: string }>();
  const colorMap = new Map<string, { count: number; lastSeen: string }>();
  const catMap   = new Map<string, { count: number; lastSeen: string }>();
  let totalFulfillment = 0;
  let fulfillmentCount = 0;
  const daysToInvoice: number[] = [];

  // ── Source 1: AgentExecution ───────────────────────────────────────────────
  const rows = await loadOrderRows(orgId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matching = rows.filter((r: any) => {
    const meta   = (r.metadataJson ?? {}) as Record<string, unknown>;
    const header = meta.header as OrderHeader | undefined;
    const status = meta.status as string | undefined;
    return header?.customerCode === customerCode && status !== "cancelado";
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of matching) {
    const meta    = (r.metadataJson ?? {}) as Record<string, unknown>;
    const header  = meta.header as OrderHeader;
    const lines   = (meta.lines ?? []) as OrderLine[];
    const summary = (meta.summary ?? {}) as Partial<OrderSummary>;
    const fPct    = (meta.fulfillmentPercent as number | undefined) ?? 0;
    const date    = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const dateStr = date instanceof Date ? date.toISOString() : String(date);

    if (!customerName && header.customerName) customerName = header.customerName;

    const value = summary.totalValue ?? lines.filter(l => !l.removed).reduce((a, l) => a + l.lineTotal, 0);
    totalValue += value;
    orderDates.push(date instanceof Date ? date.getTime() : new Date(date).getTime());
    matchCount++;

    if (fPct > 0) { totalFulfillment += fPct; fulfillmentCount++; }

    const lastSyncAt = meta.lastSyncAt as string | null;
    const fStatus = meta.fulfillmentStatus as string | undefined;
    if (lastSyncAt && fStatus && fStatus !== "sin_factura") {
      const syncDate = new Date(lastSyncAt);
      const createdDate = date instanceof Date ? date : new Date(date);
      const diffDays = (syncDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0) daysToInvoice.push(diffDays);
    }

    const activeLines = lines.filter(l => !l.removed);
    for (const l of activeLines) {
      if (l.referenceCode) bumpMap(refMap, l.referenceCode, dateStr);
      if (l.size)          bumpMap(sizeMap, l.size, dateStr);
      if (l.color)         bumpMap(colorMap, l.color, dateStr);
      const cat = inferCategory(l.referenceCode);
      if (cat) bumpMap(catMap, cat, dateStr);
    }
  }

  // ── Source 2: CustomerOrderRecord (real SAG orders) ───────────────────────
  try {
    const corRecords = await prisma.customerOrderRecord.findMany({
      where: {
        organizationId: orgId,
        customerNit:    customerCode,
        status:         { not: "CANCELADO" },
      },
      orderBy: { orderDate: "desc" },
      take:    500,
      include: { lines: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of corRecords as any[]) {
      const orderDate = r.orderDate instanceof Date ? r.orderDate : new Date(r.orderDate);
      const dateStr   = orderDate instanceof Date ? orderDate.toISOString() : String(orderDate);

      if (!customerName && r.customerName) customerName = r.customerName;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawLines = (r.lines ?? []) as any[];
      const lineValues = rawLines.map((l: any) => {
        const qty = l.quantity != null ? Number(l.quantity) : 0;
        const uv  = l.unitValue != null ? Number(l.unitValue) : 0;
        return { qty, lineTotal: qty * uv, ref: l.referenceCode ?? "", size: l.size ?? "", color: l.color ?? "" };
      });

      const value = lineValues.length > 0
        ? lineValues.reduce((a, l) => a + l.lineTotal, 0)
        : Number(r.amount ?? 0);

      totalValue += value;
      orderDates.push(orderDate instanceof Date ? orderDate.getTime() : new Date(orderDate).getTime());
      matchCount++;

      for (const l of lineValues) {
        if (l.ref)   bumpMap(refMap, l.ref, dateStr);
        if (l.size)  bumpMap(sizeMap, l.size, dateStr);
        if (l.color) bumpMap(colorMap, l.color, dateStr);
        const cat = inferCategory(l.ref);
        if (cat) bumpMap(catMap, cat, dateStr);
      }
    }
  } catch {
    // CustomerOrderRecord not available
  }

  if (matchCount === 0) return empty;

  const totalOrders = matchCount;
  orderDates.sort((a, b) => a - b);

  // Frequency metrics
  const spanMs = orderDates.length >= 2 ? orderDates[orderDates.length - 1] - orderDates[0] : 0;
  const spanMonths = spanMs / (1000 * 60 * 60 * 24 * 30) || 1;
  const avgOrdersPerMonth = Math.round((totalOrders / spanMonths) * 10) / 10;

  const daysBetweenOrders = orderDates.length >= 2
    ? Math.round(computeAvgGap(orderDates))
    : null;

  const lastOrderMs = orderDates.length > 0 ? orderDates[orderDates.length - 1] : null;
  const daysSinceLastOrder = lastOrderMs !== null
    ? Math.round((now - lastOrderMs) / (1000 * 60 * 60 * 24))
    : null;

  const totalLineCount = [...refMap.values()].reduce((a, v) => a + v.count, 0);

  // Reorder candidates: bought >1 time, last seen >30 days ago
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reorderCandidates = [...refMap.entries()]
    .filter(([, v]) => v.count > 1 && v.lastSeen < thirtyDaysAgo)
    .map(([k]) => k)
    .slice(0, 15);

  const oneTimeBuys = [...refMap.entries()]
    .filter(([, v]) => v.count === 1)
    .map(([k]) => k)
    .slice(0, 20);

  return {
    customerCode,
    customerName,
    totalOrders,
    avgOrdersPerMonth,
    daysBetweenOrders,
    daysSinceLastOrder,
    totalLifetimeValue:  Math.round(totalValue),
    avgTicketValue:      totalOrders > 0 ? Math.round(totalValue / totalOrders) : 0,
    topReferences:       mapToFrequencyItems(refMap, totalLineCount).slice(0, 10),
    topSizes:            mapToFrequencyItems(sizeMap, totalLineCount).slice(0, 10),
    topColors:           mapToFrequencyItems(colorMap, totalLineCount).slice(0, 10),
    topCategories:       mapToFrequencyItems(catMap, totalLineCount).slice(0, 5),
    reorderCandidates,
    oneTimeBuys,
    fulfillmentPercent:  fulfillmentCount > 0 ? Math.round(totalFulfillment / fulfillmentCount) : 0,
    avgDaysToInvoice:    daysToInvoice.length > 0
      ? Math.round(daysToInvoice.reduce((a, d) => a + d, 0) / daysToInvoice.length * 10) / 10
      : null,
  };
}

// ── Seller commercial memory ────────────────────────────────────────────────

export async function buildSellerMemory(
  orgId:      string,
  sellerName: string,
): Promise<SellerCommercialMemory> {
  const empty: SellerCommercialMemory = {
    sellerName,
    sellerCode:         "",
    totalOrders:        0,
    activeCustomers:    0,
    avgOrdersPerMonth:  0,
    totalSalesValue:    0,
    avgTicketValue:     0,
    topReferences:      [],
    fulfillmentPercent: 0,
    avgDaysToInvoice:   null,
    conflictRate:       0,
  };

  const rows = await loadOrderRows(orgId);
  const normalizedSeller = sellerName.trim().toLowerCase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matching = rows.filter((r: any) => {
    const meta   = (r.metadataJson ?? {}) as Record<string, unknown>;
    const header = meta.header as OrderHeader | undefined;
    return header?.sellerName?.trim().toLowerCase() === normalizedSeller;
  });

  if (matching.length === 0) return empty;

  let sellerCode  = "";
  let totalValue  = 0;
  let conflicts   = 0;
  let totalFPct   = 0;
  let fCount      = 0;
  const customers = new Set<string>();
  const refMap    = new Map<string, { count: number; lastSeen: string }>();
  const orderDates: number[] = [];
  const daysToInvoice: number[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of matching) {
    const meta    = (r.metadataJson ?? {}) as Record<string, unknown>;
    const header  = meta.header as OrderHeader;
    const lines   = (meta.lines ?? []) as OrderLine[];
    const summary = (meta.summary ?? {}) as Partial<OrderSummary>;
    const status  = (meta.status as string) ?? "borrador";
    const fPct    = (meta.fulfillmentPercent as number | undefined) ?? 0;
    const date    = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const dateStr = date instanceof Date ? date.toISOString() : String(date);

    if (!sellerCode && header.sellerId) sellerCode = header.sellerId;
    if (header.customerCode) customers.add(header.customerCode);

    const value = summary.totalValue ?? lines.filter(l => !l.removed).reduce((a, l) => a + l.lineTotal, 0);
    totalValue += value;
    orderDates.push(date instanceof Date ? date.getTime() : new Date(date).getTime());

    if (status === "conflicto") conflicts++;
    if (fPct > 0) { totalFPct += fPct; fCount++; }

    const lastSyncAt = meta.lastSyncAt as string | null;
    const fStatus = meta.fulfillmentStatus as string | undefined;
    if (lastSyncAt && fStatus && fStatus !== "sin_factura") {
      const createdDate = date instanceof Date ? date : new Date(date);
      const diffDays = (new Date(lastSyncAt).getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0) daysToInvoice.push(diffDays);
    }

    for (const l of lines.filter(l => !l.removed)) {
      if (l.referenceCode) bumpMap(refMap, l.referenceCode, dateStr);
    }
  }

  const totalOrders = matching.length;
  orderDates.sort((a, b) => a - b);
  const spanMs = orderDates.length >= 2 ? orderDates[orderDates.length - 1] - orderDates[0] : 0;
  const spanMonths = spanMs / (1000 * 60 * 60 * 24 * 30) || 1;
  const totalLineCount = [...refMap.values()].reduce((a, v) => a + v.count, 0);

  return {
    sellerName,
    sellerCode,
    totalOrders,
    activeCustomers:    customers.size,
    avgOrdersPerMonth:  Math.round((totalOrders / spanMonths) * 10) / 10,
    totalSalesValue:    Math.round(totalValue),
    avgTicketValue:     totalOrders > 0 ? Math.round(totalValue / totalOrders) : 0,
    topReferences:      mapToFrequencyItems(refMap, totalLineCount).slice(0, 10),
    fulfillmentPercent: fCount > 0 ? Math.round(totalFPct / fCount) : 0,
    avgDaysToInvoice:   daysToInvoice.length > 0
      ? Math.round(daysToInvoice.reduce((a, d) => a + d, 0) / daysToInvoice.length * 10) / 10
      : null,
    conflictRate:       totalOrders > 0 ? Math.round((conflicts / totalOrders) * 100) : 0,
  };
}

// ── Product commercial memory ───────────────────────────────────────────────

export async function buildProductMemory(
  orgId:         string,
  referenceCode: string,
): Promise<ProductCommercialMemory> {
  const empty: ProductCommercialMemory = {
    referenceCode,
    productName:     "",
    totalOrdered:    0,
    totalInvoiced:   0,
    orderCount:      0,
    uniqueCustomers: 0,
    reorderRate:     0,
    avgReorderDays:  null,
    lastOrderDate:   null,
    isGrowing:       false,
    isShrinking:     false,
  };

  const rows = await loadOrderRows(orgId);
  const normalizedRef = referenceCode.toUpperCase();

  let productName  = "";
  let totalOrdered = 0;
  let totalInvoiced = 0;
  let orderCount   = 0;
  const customerOrders = new Map<string, number[]>(); // customerCode → timestamps
  const orderDates: number[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of rows) {
    const meta    = (r.metadataJson ?? {}) as Record<string, unknown>;
    const header  = meta.header as OrderHeader | undefined;
    const lines   = (meta.lines ?? []) as OrderLine[];
    const status  = (meta.status as string) ?? "borrador";
    const fPct    = (meta.fulfillmentPercent as number | undefined) ?? 0;
    if (status === "cancelado") continue;

    const matchingLines = lines.filter(
      l => !l.removed && l.referenceCode?.toUpperCase() === normalizedRef,
    );
    if (matchingLines.length === 0) continue;

    const date    = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const dateMs  = date instanceof Date ? date.getTime() : new Date(date).getTime();

    orderCount++;
    orderDates.push(dateMs);

    for (const l of matchingLines) {
      if (!productName && l.productName) productName = l.productName;
      totalOrdered += l.quantity;
      totalInvoiced += l.quantity * (fPct / 100);
    }

    if (header?.customerCode) {
      const existing = customerOrders.get(header.customerCode) ?? [];
      existing.push(dateMs);
      customerOrders.set(header.customerCode, existing);
    }
  }

  if (orderCount === 0) return empty;

  const uniqueCustomers = customerOrders.size;

  // Reorder rate: % of customers who ordered this product >1 time
  let repeatCustomers = 0;
  const reorderGaps: number[] = [];
  for (const [, dates] of customerOrders) {
    if (dates.length > 1) {
      repeatCustomers++;
      dates.sort((a, b) => a - b);
      for (let i = 1; i < dates.length; i++) {
        reorderGaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
    }
  }

  const reorderRate = uniqueCustomers > 0
    ? Math.round((repeatCustomers / uniqueCustomers) * 100)
    : 0;

  const avgReorderDays = reorderGaps.length > 0
    ? Math.round(reorderGaps.reduce((a, d) => a + d, 0) / reorderGaps.length)
    : null;

  // Trend detection: compare last 90 days vs previous 90 days
  orderDates.sort((a, b) => a - b);
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const recentOrders = orderDates.filter(d => d >= now - ninetyDaysMs).length;
  const previousOrders = orderDates.filter(
    d => d >= now - 2 * ninetyDaysMs && d < now - ninetyDaysMs,
  ).length;

  const lastOrderDate = orderDates.length > 0
    ? new Date(orderDates[orderDates.length - 1]).toISOString()
    : null;

  return {
    referenceCode,
    productName,
    totalOrdered:   Math.round(totalOrdered),
    totalInvoiced:  Math.round(totalInvoiced),
    orderCount,
    uniqueCustomers,
    reorderRate,
    avgReorderDays,
    lastOrderDate,
    isGrowing:   recentOrders > previousOrders,
    isShrinking: recentOrders < previousOrders && previousOrders > 0,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function bumpMap(
  map: Map<string, { count: number; lastSeen: string }>,
  key: string,
  date: string,
) {
  const existing = map.get(key);
  if (existing) {
    existing.count++;
    if (date > existing.lastSeen) existing.lastSeen = date;
  } else {
    map.set(key, { count: 1, lastSeen: date });
  }
}

function mapToFrequencyItems(
  map:   Map<string, { count: number; lastSeen: string }>,
  total: number,
): CommercialFrequencyItem[] {
  return [...map.entries()]
    .map(([value, { count, lastSeen }]) => ({
      value,
      count,
      lastSeen,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeAvgGap(sortedTimestamps: number[]): number {
  if (sortedTimestamps.length < 2) return 0;
  let totalGap = 0;
  for (let i = 1; i < sortedTimestamps.length; i++) {
    totalGap += sortedTimestamps[i] - sortedTimestamps[i - 1];
  }
  return (totalGap / (sortedTimestamps.length - 1)) / (1000 * 60 * 60 * 24);
}

function inferCategory(referenceCode: string): string | null {
  if (!referenceCode) return null;
  const parts = referenceCode.split("-");
  return parts.length > 1 ? parts[0] : null;
}
