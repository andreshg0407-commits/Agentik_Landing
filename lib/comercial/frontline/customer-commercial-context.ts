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
 * Receivables: Canonical AR from SAG vw_agentik_cartera (CERTIFIED) with
 *   legacy CustomerReceivable (Prisma, UNVERIFIED) fallback.
 * Top products: customer-purchase-intelligence.ts (this sprint).
 * Seller: canonical-customer-service.ts (existing).
 * Orders: CustomerOrderRecord (Prisma) via customerNit.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/comercial/clientes/canonical-customer-service";
import { getCustomerTopProducts } from "./customer-purchase-intelligence";
import { resolveReceivableTruthStatus } from "./receivable-truth-status";
import { fetchCustomerArWithStatus } from "./canonical-ar-service";
import type {
  CustomerCommercialContext,
  CustomerReceivablesContext,
  FrontlineProvenance,
} from "./frontline-types";

const db = prisma as any;

// ── Canonical AR path ───────────────────────────────────────────────────────

/**
 * Try canonical AR from SAG vw_agentik_cartera.
 * Returns null if SAG is unavailable or customer has no open receivables.
 */
async function tryCanonicalAr(
  sagTerceroId: number,
): Promise<CustomerReceivablesContext | null> {
  const result = await fetchCustomerArWithStatus(sagTerceroId);

  if (result.status === "CERTIFIED_ZERO") {
    // Customer found, zero open AR — genuine certified zero
    return {
      totalReceivable: 0,
      overdueAmount: 0,
      overdueDocumentCount: 0,
      oldestOverdueDate: null,
      maxDaysOverdue: 0,
      currency: "COP",
      asOf: result.asOf.toISOString(),
      truthStatus: "CERTIFIED",
    };
  }

  if (result.status === "HAS_OPEN_AR") {
    const snapshot = result.snapshot;
    // Find oldest overdue date from documents
    let oldestOverdueDate: Date | null = null;
    for (const doc of snapshot.documents) {
      if (doc.diasMora !== null && doc.diasMora > 0 && doc.fechaVencimiento) {
        if (!oldestOverdueDate || doc.fechaVencimiento < oldestOverdueDate) {
          oldestOverdueDate = doc.fechaVencimiento;
        }
      }
    }

    return {
      totalReceivable: snapshot.totalPendiente,
      overdueAmount: snapshot.totalVencido,
      overdueDocumentCount: snapshot.overdueDocumentCount,
      oldestOverdueDate: oldestOverdueDate?.toISOString() ?? null,
      maxDaysOverdue: snapshot.maxDiasMora,
      currency: "COP",
      asOf: snapshot.asOf.toISOString(),
      truthStatus: "CERTIFIED",
    };
  }

  // SAG_UNAVAILABLE or IDENTITY_UNKNOWN — fall through to legacy
  return null;
}

// ── Legacy Prisma path ──────────────────────────────────────────────────────

/**
 * Build receivables summary from CustomerReceivable (Prisma).
 * Legacy path: paidAmount is always 0, so balanceDue over-reports.
 * Stamped UNVERIFIED to suppress overdue warnings.
 */
function buildLegacyReceivables(
  receivables: Array<{ balanceDue: unknown; daysOverdue: unknown; dueDate: Date | null }>,
): CustomerReceivablesContext | null {
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
    // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: legacy path always UNVERIFIED
    truthStatus: resolveReceivableTruthStatus("__default__"),
  };
}

// ── Receivables context (public API) ────────────────────────────────────────

/**
 * Build receivables summary for a customer.
 *
 * Strategy:
 *   1. If sagTerceroId is provided, try canonical AR from SAG vw_agentik_cartera.
 *      This path produces CERTIFIED data (SALDO_PENDIENTE pre-computed by SAG).
 *   2. Fall back to legacy CustomerReceivable (Prisma) — stamped UNVERIFIED.
 *
 * @param sagTerceroId  SAG customer PK (ka_nl_tercero). When provided,
 *                      enables the canonical AR path with CERTIFIED truth status.
 */
export async function getCustomerReceivables(
  orgId: string,
  customerId: string,
  sagTerceroId?: number | null,
): Promise<CustomerReceivablesContext | null> {
  // Path 1: Canonical AR from SAG (CERTIFIED)
  if (sagTerceroId != null && sagTerceroId > 0) {
    const canonical = await tryCanonicalAr(sagTerceroId);
    if (canonical) return canonical;
  }

  // Path 2: Legacy Prisma (UNVERIFIED)
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

  return buildLegacyReceivables(receivables);
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
    getCustomerReceivables(orgId, customerId, customer.sagTerceroId ?? null),
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
