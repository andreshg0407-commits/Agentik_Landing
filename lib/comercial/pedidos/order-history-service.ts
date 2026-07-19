/**
 * lib/comercial/pedidos/order-history-service.ts
 *
 * Customer and seller commercial history derived from order data.
 * Queries AgentExecution + CustomerOrderRecord (real SAG orders).
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 * Sprint: PEDIDOS-DETAIL-AND-SELLER-HISTORY-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  OrderHeader,
  OrderLine,
  OrderStatus,
  OrderSummary,
} from "./order-types";
import type {
  CustomerOrderHistory,
  CustomerOrderEntry,
  CustomerPreferences,
  FrequencyItem,
  SellerOrderHistory,
  SellerOrderEntry,
} from "./order-history-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Customer history ──────────────────────────────────────────────────────────

export async function getCustomerHistory(
  orgId:        string,
  customerCode: string,
): Promise<CustomerOrderHistory> {
  const empty: CustomerOrderHistory = {
    customerCode,
    customerName:   "",
    totalOrders:    0,
    totalUnits:     0,
    totalValue:     0,
    firstOrderDate: null,
    lastOrderDate:  null,
    orders:         [],
    preferences:    { topReferences: [], topSizes: [], topColors: [], topLines: [], oneTimeBuys: [] },
  };

  if (!customerCode) return empty;

  const entries: CustomerOrderEntry[] = [];
  let totalUnits = 0;
  let totalValue = 0;
  let customerName = "";
  const allLines: { line: OrderLine; date: string }[] = [];

  // ── Source 1: AgentExecution (Agentik-created orders) ──────────────────────
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "desc" },
      take:    1000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matching = (rows as any[]).filter((r: any) => {
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
      const status  = (meta.status as string) ?? "borrador";
      const origin  = (meta.origin as string) ?? "agentik";
      const date    = r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt);

      if (!customerName && header.customerName) customerName = header.customerName;

      const activeLines = lines.filter(l => !l.removed);
      const refs        = [...new Set(activeLines.map(l => l.referenceCode).filter(Boolean))];
      const units       = summary.totalUnits ?? activeLines.reduce((a, l) => a + l.quantity, 0);
      const value       = summary.totalValue ?? activeLines.reduce((a, l) => a + l.lineTotal, 0);

      totalUnits += units;
      totalValue += value;

      entries.push({
        orderId:     r.id,
        consecutivo: (meta.consecutivo as number) ?? 0,
        date,
        sellerName:  header.sellerName ?? "",
        channel:     header.channel ?? "",
        totalUnits:  units,
        totalValue:  value,
        status,
        origin,
        references:  refs,
      });

      for (const l of activeLines) {
        allLines.push({ line: l, date });
      }
    }
  } catch {
    // AgentExecution not available
  }

  // ── Source 2: CustomerOrderRecord (real SAG orders) ────────────────────────
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
      const orderDate = r.orderDate instanceof Date ? r.orderDate.toISOString() : String(r.orderDate);

      if (!customerName && r.customerName) customerName = r.customerName;

      const rawLines: OrderLine[] = (r.lines ?? []).map((l: any) => ({
        id:             l.id,
        referenceCode:  l.referenceCode ?? "",
        productName:    l.articleName ?? l.referenceCode ?? "",
        size:           l.size ?? "",
        color:          l.color ?? "",
        quantity:       l.quantity != null ? Number(l.quantity) : 0,
        availableUnits: null,
        unitPrice:      l.unitValue != null ? Number(l.unitValue) : 0,
        lineTotal:      l.quantity != null && l.unitValue != null
          ? Number(l.quantity) * Number(l.unitValue) : 0,
        removed:        false,
        comment:        "",
      }));

      const units = rawLines.reduce((a, l) => a + l.quantity, 0);
      const value = rawLines.length > 0
        ? rawLines.reduce((a, l) => a + l.lineTotal, 0)
        : Number(r.amount ?? 0);
      const refs  = [...new Set(rawLines.map(l => l.referenceCode).filter(Boolean))];

      totalUnits += units;
      totalValue += value;

      entries.push({
        orderId:     r.id,
        consecutivo: r.orderNumber ? parseInt(r.orderNumber, 10) || 0 : 0,
        date:        orderDate,
        sellerName:  "",
        channel:     "",
        totalUnits:  units,
        totalValue:  value,
        status:      corStatusToHistoryStatus(r.status),
        origin:      "sag_customer_order",
        references:  refs,
      });

      for (const l of rawLines) {
        allLines.push({ line: l, date: orderDate });
      }
    }
  } catch {
    // CustomerOrderRecord not available
  }

  if (entries.length === 0) return empty;

  // Sort all entries by date descending
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));

  const firstDate = entries[entries.length - 1].date;
  const lastDate  = entries[0].date;

  const preferences = buildPreferences(allLines);

  return {
    customerCode,
    customerName,
    totalOrders:    entries.length,
    totalUnits,
    totalValue,
    firstOrderDate: firstDate,
    lastOrderDate:  lastDate,
    orders:         entries,
    preferences,
  };
}

// ── Seller history ────────────────────────────────────────────────────────────

export async function getSellerHistory(
  orgId:      string,
  sellerName: string,
): Promise<SellerOrderHistory> {
  const empty: SellerOrderHistory = {
    sellerName,
    totalOrders:     0,
    totalSynced:     0,
    totalDrafts:     0,
    totalConflicts:  0,
    totalCancelled:  0,
    totalValue:      0,
    totalUnits:      0,
    uniqueCustomers: 0,
    orders:          [],
  };

  // SAG orders have no seller — return empty if sellerName is blank
  if (!sellerName.trim()) return empty;

  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "desc" },
      take:    1000,
    });

    const normalizedSeller = sellerName.trim().toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matching = (rows as any[]).filter((r: any) => {
      const meta   = (r.metadataJson ?? {}) as Record<string, unknown>;
      const header = meta.header as OrderHeader | undefined;
      return header?.sellerName?.trim().toLowerCase() === normalizedSeller;
    });

    if (matching.length === 0) return empty;

    const entries: SellerOrderEntry[] = [];
    let totalValue     = 0;
    let totalUnits     = 0;
    let totalSynced    = 0;
    let totalDrafts    = 0;
    let totalConflicts = 0;
    let totalCancelled = 0;
    const customers    = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of matching) {
      const meta    = (r.metadataJson ?? {}) as Record<string, unknown>;
      const header  = meta.header as OrderHeader;
      const summary = (meta.summary ?? {}) as Partial<OrderSummary>;
      const status  = (meta.status as OrderStatus) ?? "borrador";
      const origin  = (meta.origin as string) ?? "agentik";
      const date    = r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt);

      const units = summary.totalUnits ?? 0;
      const value = summary.totalValue ?? 0;

      totalUnits += units;
      totalValue += value;

      if (status === "sincronizado")  totalSynced++;
      if (status === "borrador")      totalDrafts++;
      if (status === "conflicto")     totalConflicts++;
      if (status === "cancelado")     totalCancelled++;

      if (header.customerCode) customers.add(header.customerCode);
      else if (header.customerName) customers.add(header.customerName);

      entries.push({
        orderId:      r.id,
        consecutivo:  (meta.consecutivo as number) ?? 0,
        date,
        customerName: header.customerName ?? "",
        totalUnits:   units,
        totalValue:   value,
        status,
        origin,
      });
    }

    return {
      sellerName,
      totalOrders:     entries.length,
      totalSynced,
      totalDrafts,
      totalConflicts,
      totalCancelled,
      totalValue,
      totalUnits,
      uniqueCustomers: customers.size,
      orders:          entries,
    };
  } catch {
    return empty;
  }
}

// ── COR status → history-friendly label ─────────────────────────────────────

function corStatusToHistoryStatus(status: string): string {
  switch (status) {
    case "FACTURADO":   return "sincronizado";
    case "CONFIRMADO":  return "sincronizado";
    case "DESPACHADO":  return "sincronizado";
    case "PENDIENTE":   return "pendiente_sag";
    case "CANCELADO":   return "cancelado";
    default:            return "pendiente_sag";
  }
}

// ── Build customer preferences from line data ─────────────────────────────────

function buildPreferences(
  allLines: { line: OrderLine; date: string }[],
): CustomerPreferences {
  const refMap   = new Map<string, { count: number; lastSeen: string }>();
  const sizeMap  = new Map<string, { count: number; lastSeen: string }>();
  const colorMap = new Map<string, { count: number; lastSeen: string }>();
  const lineMap  = new Map<string, { count: number; lastSeen: string }>();

  for (const { line, date } of allLines) {
    if (line.referenceCode) bumpMap(refMap, line.referenceCode, date);
    if (line.size)          bumpMap(sizeMap, line.size, date);
    if (line.color)         bumpMap(colorMap, line.color, date);
    // "line" in the product sense — inferred from referenceCode prefix
    const productLine = inferProductLine(line.referenceCode);
    if (productLine) bumpMap(lineMap, productLine, date);
  }

  const topReferences = mapToFrequency(refMap).slice(0, 10);
  const topSizes      = mapToFrequency(sizeMap).slice(0, 10);
  const topColors     = mapToFrequency(colorMap).slice(0, 10);
  const topLines      = mapToFrequency(lineMap).slice(0, 5);

  // One-time buys: references bought exactly once
  const oneTimeBuys = [...refMap.entries()]
    .filter(([, v]) => v.count === 1)
    .map(([k]) => k)
    .slice(0, 20);

  return { topReferences, topSizes, topColors, topLines, oneTimeBuys };
}

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

function mapToFrequency(
  map: Map<string, { count: number; lastSeen: string }>,
): FrequencyItem[] {
  return [...map.entries()]
    .map(([value, { count, lastSeen }]) => ({ value, count, lastSeen }))
    .sort((a, b) => b.count - a.count);
}

function inferProductLine(referenceCode: string): string | null {
  if (!referenceCode) return null;
  // Common pattern: first segment before dash is the product line
  const parts = referenceCode.split("-");
  return parts.length > 1 ? parts[0] : null;
}
