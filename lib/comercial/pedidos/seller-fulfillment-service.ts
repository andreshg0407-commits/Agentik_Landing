/**
 * lib/comercial/pedidos/seller-fulfillment-service.ts
 *
 * Seller fulfillment KPI computation.
 * Reads order data from AgentExecution, computes fulfillment metrics.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  OrderDraft,
  OrderHeader,
  OrderLine,
  OrderSummary,
} from "./order-types";
import type {
  OrderFulfillmentStatus,
  SellerFulfillmentKpi,
} from "./order-core-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Compute seller KPIs ──────────────────────────────────────────────────────

export async function computeSellerFulfillmentKpi(
  orgId:      string,
  sellerName: string,
): Promise<SellerFulfillmentKpi> {
  const empty: SellerFulfillmentKpi = {
    sellerName,
    sellerCode:              "",
    totalOrders:             0,
    totalOrderValue:         0,
    totalInvoicedValue:      0,
    fulfillmentPercent:      0,
    ordersFullyInvoiced:     0,
    ordersPartiallyInvoiced: 0,
    ordersWithDifferences:   0,
    ordersWithoutInvoice:    0,
    avgDaysToInvoice:        null,
    uniqueCustomers:         0,
    avgTicketValue:          0,
    topReferences:           [],
    worstFulfillmentRefs:    [],
  };

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
      const status = meta.status as string | undefined;
      return header?.sellerName?.trim().toLowerCase() === normalizedSeller
        && status !== "cancelado";
    });

    if (matching.length === 0) return empty;

    let totalOrderValue     = 0;
    let totalInvoicedValue  = 0;
    let fullyInvoiced       = 0;
    let partiallyInvoiced   = 0;
    let withDifferences     = 0;
    let withoutInvoice      = 0;
    let sellerCode          = "";
    const customers         = new Set<string>();
    const refCounts         = new Map<string, number>();
    const refFulfillment    = new Map<string, { ordered: number; invoiced: number }>();
    const daysToInvoice: number[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of matching) {
      const meta    = (r.metadataJson ?? {}) as Record<string, unknown>;
      const header  = meta.header as OrderHeader;
      const summary = (meta.summary ?? {}) as Partial<OrderSummary>;
      const lines   = (meta.lines ?? []) as OrderLine[];
      const fStatus = (meta.fulfillmentStatus as OrderFulfillmentStatus | undefined) ?? "sin_factura";
      const fPct    = (meta.fulfillmentPercent as number | undefined) ?? 0;

      if (!sellerCode && header.sellerId) sellerCode = header.sellerId;
      if (header.customerCode) customers.add(header.customerCode);
      else if (header.customerName) customers.add(header.customerName);

      const orderValue = summary.totalValue ?? lines.filter(l => !l.removed).reduce((a, l) => a + l.lineTotal, 0);
      totalOrderValue += orderValue;

      // Estimate invoiced value from fulfillment percent
      const invoicedValue = orderValue * (fPct / 100);
      totalInvoicedValue += invoicedValue;

      switch (fStatus) {
        case "facturado_completo":        fullyInvoiced++; break;
        case "facturado_parcial":         partiallyInvoiced++; break;
        case "facturado_con_diferencias": withDifferences++; break;
        case "sin_factura":
        default:                          withoutInvoice++; break;
      }

      // Track invoice timing
      const createdAt  = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      const lastSyncAt = meta.lastSyncAt as string | null;
      if (lastSyncAt && fStatus !== "sin_factura") {
        const syncDate = new Date(lastSyncAt);
        const diffDays = (syncDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0) daysToInvoice.push(diffDays);
      }

      // Track references
      const activeLines = lines.filter(l => !l.removed);
      for (const l of activeLines) {
        if (!l.referenceCode) continue;
        refCounts.set(l.referenceCode, (refCounts.get(l.referenceCode) ?? 0) + l.quantity);

        const rf = refFulfillment.get(l.referenceCode) ?? { ordered: 0, invoiced: 0 };
        rf.ordered  += l.quantity;
        rf.invoiced += l.quantity * (fPct / 100);
        refFulfillment.set(l.referenceCode, rf);
      }
    }

    const totalOrders = matching.length;
    const avgTicket   = totalOrders > 0 ? totalOrderValue / totalOrders : 0;
    const avgDays     = daysToInvoice.length > 0
      ? Math.round(daysToInvoice.reduce((a, d) => a + d, 0) / daysToInvoice.length * 10) / 10
      : null;

    const overallFulfillment = totalOrderValue > 0
      ? Math.round((totalInvoicedValue / totalOrderValue) * 100)
      : 0;

    const topReferences = [...refCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referenceCode, quantity]) => ({ referenceCode, quantity }));

    const worstFulfillmentRefs = [...refFulfillment.entries()]
      .map(([referenceCode, { ordered, invoiced }]) => ({
        referenceCode,
        fulfillmentPercent: ordered > 0 ? Math.round((invoiced / ordered) * 100) : 0,
      }))
      .filter(r => r.fulfillmentPercent < 80)
      .sort((a, b) => a.fulfillmentPercent - b.fulfillmentPercent)
      .slice(0, 10);

    return {
      sellerName,
      sellerCode,
      totalOrders,
      totalOrderValue:         Math.round(totalOrderValue),
      totalInvoicedValue:      Math.round(totalInvoicedValue),
      fulfillmentPercent:      overallFulfillment,
      ordersFullyInvoiced:     fullyInvoiced,
      ordersPartiallyInvoiced: partiallyInvoiced,
      ordersWithDifferences:   withDifferences,
      ordersWithoutInvoice:    withoutInvoice,
      avgDaysToInvoice:        avgDays,
      uniqueCustomers:         customers.size,
      avgTicketValue:          Math.round(avgTicket),
      topReferences,
      worstFulfillmentRefs,
    };
  } catch {
    return empty;
  }
}
