/**
 * lib/comercial/frontline/frontline-attention-service.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01 — Phase 4
 *
 * Provider-agnostic attention aggregator for seller-facing alerts.
 * Composes signals from existing domains — no recalculation.
 *
 * Domains:
 *   - Maletas: reuses emitPortfolioAttentionSignals() from copilot domain tools
 *   - Cartera: contextual CUSTOMER_OVERDUE signal
 *   - Orders: lifecycle state mapping from CustomerOrderRecord
 *
 * No LLM. No prose. Structured items only.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { emitPortfolioAttentionSignals } from "@/lib/comercial/maletas/portfolio-copilot-domain-tools";
import { getCustomerReceivables } from "./customer-commercial-context";
import { getSellerInactiveCustomers } from "./seller-inactive-customers";
import type {
  FrontlineAttentionItem,
  FrontlineAttentionResult,
  FrontlineProvenance,
} from "./frontline-types";

const db = prisma as any;

// ── Maletas attention ───────────────────────────────────────────────────────

/**
 * Map existing portfolio attention signals to frontline contract.
 * Filters by sellerId when scoped.
 */
async function getPortfolioAttention(
  orgId: string,
  sellerId: string | null,
  orgSlug: string,
): Promise<FrontlineAttentionItem[]> {
  try {
    const result = await emitPortfolioAttentionSignals(orgId);
    const now = new Date().toISOString();
    const provenance: FrontlineProvenance = {
      source: "portfolio-copilot-domain-tools",
      asOf: now,
    };

    return result.items
      .filter(item => !sellerId || item.sellerId === sellerId || item.sellerId === null)
      .filter(item =>
        item.type === "PORTFOLIO_WITHDRAWAL_REQUIRED" ||
        item.type === "PORTFOLIO_SUPPLY_REQUIRED" ||
        item.type === "PORTFOLIO_COVERAGE_AT_RISK"
      )
      .map(item => {
        let frontlineType: FrontlineAttentionItem["type"];
        let deepLink: string | undefined;

        if (item.type === "PORTFOLIO_WITHDRAWAL_REQUIRED") {
          frontlineType = "SAMPLE_WITHDRAWAL_REQUIRED";
          deepLink = `/${orgSlug}/comercial/maletas?vendor=${item.sellerId}&tab=retiro`;
        } else if (item.type === "PORTFOLIO_SUPPLY_REQUIRED") {
          frontlineType = "PORTFOLIO_SUPPLY_REQUIRED";
          deepLink = `/${orgSlug}/comercial/maletas?tab=surtido`;
        } else {
          frontlineType = "PORTFOLIO_COVERAGE_AT_RISK";
          deepLink = `/${orgSlug}/comercial/maletas?vendor=${item.sellerId}&tab=surtido`;
        }

        // Carry product image for withdrawal alerts (P0: retiro must show photo)
        const imageUrl = frontlineType === "SAMPLE_WITHDRAWAL_REQUIRED"
          ? (item.evidence?.firstRetiroImageUrl as string | null) ?? null
          : undefined;

        return {
          type: frontlineType,
          severity: item.severity,
          organizationId: orgId,
          sellerId: item.sellerId,
          portfolioId: item.portfolioId ?? undefined,
          referenceCode: frontlineType === "SAMPLE_WITHDRAWAL_REQUIRED"
            ? (item.evidence?.firstRetiroRef as string | null) ?? undefined
            : undefined,
          title: item.title,
          evidence: item.evidence,
          suggestedAction: item.suggestedAction ?? undefined,
          deepLink,
          imageUrl,
          createdAt: item.createdAt,
          deduplicationKey: `frontline:${item.deduplicationKey}`,
          provenance,
        };
      });
  } catch {
    return [];
  }
}

// ── Order attention ─────────────────────────────────────────────────────────

/**
 * Map order lifecycle states to frontline attention.
 * Only maps states that are already canonical in CustomerOrderStatus.
 */
async function getOrderAttention(
  orgId: string,
  sellerId: string | null,
  orgSlug: string,
): Promise<FrontlineAttentionItem[]> {
  const now = new Date().toISOString();
  const provenance: FrontlineProvenance = {
    source: "CustomerOrderRecord lifecycle",
    asOf: now,
  };

  const items: FrontlineAttentionItem[] = [];

  // PENDIENTE orders older than 3 days = ORDER_PENDING_SYNC
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const sellerFilter = sellerId
    ? { sellerName: { contains: sellerId, mode: "insensitive" as const } }
    : {};

  const pendingOrders = await db.customerOrderRecord.findMany({
    where: {
      organizationId: orgId,
      status: "PENDIENTE",
      orderDate: { lt: threeDaysAgo },
      ...sellerFilter,
    },
    select: { id: true, orderNumber: true, customerName: true, orderDate: true },
    take: 10,
    orderBy: { orderDate: "asc" },
  });

  for (const order of pendingOrders) {
    const daysPending = Math.floor(
      (Date.now() - new Date(order.orderDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    items.push({
      type: "ORDER_PENDING_SYNC",
      severity: daysPending >= 7 ? "warning" : "info",
      organizationId: orgId,
      sellerId,
      orderId: order.id,
      title: `Pedido ${order.orderNumber} pendiente hace ${daysPending} dias`,
      evidence: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        daysPending,
      },
      suggestedAction: "Verificar estado del pedido en SAG",
      deepLink: `/${orgSlug}/comercial/pedidos?order=${order.id}`,
      createdAt: now,
      deduplicationKey: `frontline:order_pending:${orgId}:${order.id}`,
      provenance,
    });
  }

  // CONFIRMADO orders (recently confirmed — informational)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const confirmedOrders = await db.customerOrderRecord.findMany({
    where: {
      organizationId: orgId,
      status: "CONFIRMADO",
      syncedAt: { gte: sevenDaysAgo },
      ...sellerFilter,
    },
    select: { id: true, orderNumber: true, customerName: true },
    take: 5,
    orderBy: { syncedAt: "desc" },
  });

  for (const order of confirmedOrders) {
    items.push({
      type: "ORDER_CONFIRMED",
      severity: "info",
      organizationId: orgId,
      sellerId,
      orderId: order.id,
      title: `Pedido ${order.orderNumber} confirmado`,
      evidence: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
      },
      deepLink: `/${orgSlug}/comercial/pedidos?order=${order.id}`,
      createdAt: now,
      deduplicationKey: `frontline:order_confirmed:${orgId}:${order.id}`,
      provenance,
    });
  }

  return items;
}

// ── Customer overdue attention (contextual) ─────────────────────────────────

/**
 * Emit CUSTOMER_OVERDUE_WHILE_ORDERING signal.
 * Contextual: called during order creation, not bulk-aggregated.
 */
export async function emitCustomerOverdueAttention(
  orgId: string,
  customerId: string,
  sellerId: string | null,
  orgSlug: string,
): Promise<FrontlineAttentionItem | null> {
  const receivables = await getCustomerReceivables(orgId, customerId);
  if (!receivables || receivables.overdueAmount <= 0) return null;

  // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: suppress overdue attention
  // when receivable data is not certified (no payment application reconciliation).
  if (receivables.truthStatus !== "CERTIFIED") return null;

  // Hard business rule (Section F): only trigger when maxDaysOverdue > 30
  if (receivables.maxDaysOverdue <= 30) return null;

  const now = new Date().toISOString();
  return {
    type: "CUSTOMER_OVERDUE_WHILE_ORDERING",
    severity: receivables.maxDaysOverdue >= 60 ? "critical" : "warning",
    organizationId: orgId,
    sellerId,
    customerId,
    title: `Cartera vencida: $${fmtCOP(receivables.overdueAmount)} · hasta ${receivables.maxDaysOverdue} dias`,
    evidence: {
      overdueAmount: receivables.overdueAmount,
      overdueDocumentCount: receivables.overdueDocumentCount,
      maxDaysOverdue: receivables.maxDaysOverdue,
      asOf: receivables.asOf,
    },
    suggestedAction: "Revisar cartera antes de crear pedido",
    deepLink: `/${orgSlug}/comercial/clientes/${customerId}`,
    createdAt: now,
    deduplicationKey: `frontline:customer_overdue:${orgId}:${customerId}`,
    provenance: {
      source: "CustomerReceivable (Prisma)",
      asOf: now,
    },
  };
}

// ── Inactive customer attention ──────────────────────────────────────────────

/**
 * Emit CUSTOMER_INACTIVE_90D signals for a seller's inactive customers.
 * Deterministic: customer.lastPurchaseDate > 90 days ago.
 * NOT contextual — surfaces on Seller Home.
 */
async function getInactiveCustomerAttention(
  orgId: string,
  sellerId: string | null,
  orgSlug: string,
): Promise<FrontlineAttentionItem[]> {
  if (!sellerId) return [];

  try {
    const result = await getSellerInactiveCustomers(orgId, sellerId, { inactiveDays: 90 });
    const now = new Date().toISOString();
    const provenance: FrontlineProvenance = {
      source: "seller-inactive-customers",
      asOf: now,
    };

    return result.items.slice(0, 10).map(item => ({
      type: "CUSTOMER_INACTIVE_90D" as const,
      severity: (item.daysSinceLastPurchase ?? 0) > 180 ? "warning" : "info" as const,
      organizationId: orgId,
      sellerId,
      customerId: item.customerId,
      title: item.classification === "NO_PURCHASE_HISTORY"
        ? `${item.customerName}: sin historial de compras`
        : `${item.customerName}: ${item.daysSinceLastPurchase} dias sin comprar`,
      evidence: {
        customerId: item.customerId,
        customerName: item.customerName,
        classification: item.classification,
        lastPurchaseDate: item.lastPurchaseDate,
        daysSinceLastPurchase: item.daysSinceLastPurchase,
        receivables: item.receivables,
      },
      suggestedAction: "Crear pedido",
      deepLink: `/${orgSlug}/comercial/clientes/${item.customerId}`,
      createdAt: now,
      deduplicationKey: `frontline:inactive_90d:${orgId}:${sellerId}:${item.customerId}`,
      provenance,
    }));
  } catch {
    return [];
  }
}

// ── Aggregated seller attention ─────────────────────────────────────────────

/**
 * Get all attention items for a seller (or all sellers for admin).
 * Structured items only. No prose. No LLM.
 */
export async function getSellerAttention(
  orgId: string,
  sellerId: string | null,
  orgSlug?: string,
): Promise<FrontlineAttentionResult> {
  const now = new Date().toISOString();
  const slug = orgSlug ?? "org";

  // Parallel: portfolio + orders + inactive customers
  const [portfolioItems, orderItems, inactiveItems] = await Promise.all([
    getPortfolioAttention(orgId, sellerId, slug),
    getOrderAttention(orgId, sellerId, slug),
    getInactiveCustomerAttention(orgId, sellerId, slug),
  ]);

  const items = [...portfolioItems, ...orderItems, ...inactiveItems];

  // Sort by severity then date
  const severityRank = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) =>
    (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2) ||
    b.createdAt.localeCompare(a.createdAt)
  );

  // Deduplicate
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    if (seen.has(item.deduplicationKey)) return false;
    seen.add(item.deduplicationKey);
    return true;
  });

  return {
    items: deduped,
    provenance: {
      source: "frontline-attention-service (composed)",
      asOf: now,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("es-CO");
}
