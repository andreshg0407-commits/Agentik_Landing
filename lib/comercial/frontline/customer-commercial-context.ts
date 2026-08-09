/**
 * lib/comercial/frontline/customer-commercial-context.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01 — Phase 2
 *
 * Single shared authority for customer commercial context.
 * Composes certified facts from existing engines — no duplication.
 *
 * Consumers: Cliente detail, Pedidos Crear pedido, Seller App, Copilot.
 *
 * Receivables: CustomerReceivable (Prisma) via customerId FK.
 * Top products: customer-purchase-intelligence.ts (this sprint).
 * Seller: canonical-customer-service.ts (existing).
 * Orders: CustomerOrderRecord (Prisma) via customerNit.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/comercial/clientes/canonical-customer-service";
import { getCustomerTopProducts } from "./customer-purchase-intelligence";
import { resolveReceivableTruthStatus } from "./receivable-truth-status";
import type {
  CustomerCommercialContext,
  CustomerReceivablesContext,
  FrontlineProvenance,
} from "./frontline-types";

const db = prisma as any;

// ── Receivables context ─────────────────────────────────────────────────────

/**
 * Build receivables summary from CustomerReceivable (Prisma).
 * Reuses existing cartera authority — no new engine.
 */
export async function getCustomerReceivables(
  orgId: string,
  customerId: string,
): Promise<CustomerReceivablesContext | null> {
  const receivables = await db.customerReceivable.findMany({
    where: {
      organizationId: orgId,
      customerId,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    select: {
      balanceDue: true,
      daysOverdue: true,
      dueDate: true,
    },
  });

  if (receivables.length === 0) return null;

  let totalReceivable = 0;
  let overdueAmount = 0;
  let overdueDocumentCount = 0;
  let maxDaysOverdue = 0;
  let oldestOverdueDate: Date | null = null;

  for (const r of receivables) {
    const balance = Number(r.balanceDue ?? 0);
    totalReceivable += balance;

    const daysOverdue = Number(r.daysOverdue ?? 0);
    if (daysOverdue > 0) {
      overdueAmount += balance;
      overdueDocumentCount++;
      if (daysOverdue > maxDaysOverdue) maxDaysOverdue = daysOverdue;
      if (r.dueDate && (!oldestOverdueDate || r.dueDate < oldestOverdueDate)) {
        oldestOverdueDate = r.dueDate;
      }
    }
  }

  return {
    totalReceivable,
    overdueAmount,
    overdueDocumentCount,
    oldestOverdueDate: oldestOverdueDate?.toISOString() ?? null,
    maxDaysOverdue,
    currency: "COP",
    asOf: new Date().toISOString(),
    // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: stamp truth status.
    // Currently all tenants are UNVERIFIED (no certified recon pipeline).
    truthStatus: resolveReceivableTruthStatus("__default__"),
  };
}

// ── Customer commercial context ─────────────────────────────────────────────

/**
 * Canonical customer commercial context.
 * Composes: identity + seller + receivables + top products + recent orders.
 */
export async function getCustomerCommercialContext(
  orgId: string,
  customerId: string,
): Promise<CustomerCommercialContext | null> {
  const now = new Date().toISOString();
  const provenance: FrontlineProvenance = {
    source: "customer-commercial-context (composed)",
    asOf: now,
  };

  // Load customer identity from canonical service
  const customer = await getCustomer(orgId, customerId);
  if (!customer) return null;

  // Parallel: receivables + top products by units + top products by value + recent orders count
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const [receivables, topByUnits, topByValue, recentOrderCount] = await Promise.all([
    getCustomerReceivables(orgId, customerId),
    getCustomerTopProducts(orgId, customerId, { ranking: "UNITS", limit: 5 }),
    getCustomerTopProducts(orgId, customerId, { ranking: "SALES_VALUE", limit: 5 }),
    // Count orders in last 12 months
    // CustomerOrderRecord.customerNit = ka_nl_tercero (SAG PK as string)
    customer.sagTerceroId != null
      ? db.customerOrderRecord.count({
          where: {
            organizationId: orgId,
            customerNit: String(customer.sagTerceroId),
            orderDate: { gte: twelveMonthsAgo },
          },
        })
      : Promise.resolve(0),
  ]);

  // Resolve last purchase date from profile or top products
  const lastPurchaseDates = [
    ...topByUnits.products.map(p => p.lastPurchaseDate).filter(Boolean),
    ...topByValue.products.map(p => p.lastPurchaseDate).filter(Boolean),
  ].sort().reverse();
  const lastPurchaseDate = lastPurchaseDates[0] ?? null;

  return {
    customerId,
    customerName: customer.legalName,
    nitNormalized: customer.nitNormalized ?? null,

    seller: {
      sellerName: customer.seller?.name ?? null,
      sellerSlug: customer.seller?.sagCode ?? null,
      source: customer.seller?.source ?? "UNAVAILABLE",
      confidence: customer.seller?.confidence ?? "UNAVAILABLE",
    },

    receivables,

    topProductsByUnits: topByUnits.products,
    topProductsBySalesValue: topByValue.products,

    lastPurchaseDate,
    totalOrdersL12: recentOrderCount,

    provenance,
  };
}
