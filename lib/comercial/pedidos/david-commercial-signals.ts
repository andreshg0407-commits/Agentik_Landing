/**
 * lib/comercial/pedidos/david-commercial-signals.ts
 *
 * Generates structured commercial insights from memory profiles.
 * David consumes these to provide contextual intelligence.
 *
 * No AI — deterministic signal generation from computed data.
 * No Prisma — pure domain logic, runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 */

import type {
  CustomerCommercialMemory,
  SellerCommercialMemory,
  ProductCommercialMemory,
  DavidCommercialInsight,
} from "./order-core-types";

// ── Generate customer insights ──────────────────────────────────────────────

export function buildCustomerInsights(
  memory: CustomerCommercialMemory,
): DavidCommercialInsight[] {
  const insights: DavidCommercialInsight[] = [];

  // Dormant customer
  if (memory.daysSinceLastOrder !== null && memory.daysSinceLastOrder > 60) {
    insights.push({
      type:       "customer_dormant",
      message:    `Han pasado ${memory.daysSinceLastOrder} dias desde la ultima compra de ${memory.customerName || memory.customerCode}.`,
      confidence: 95,
      data:       { daysSinceLastOrder: memory.daysSinceLastOrder },
      source:     "customer",
    });
  }

  // Purchase frequency
  if (memory.daysBetweenOrders !== null && memory.totalOrders >= 3) {
    insights.push({
      type:       "customer_frequency",
      message:    `${memory.customerName || memory.customerCode} compra en promedio cada ${memory.daysBetweenOrders} dias.`,
      confidence: memory.totalOrders >= 10 ? 90 : 70,
      data:       { daysBetweenOrders: memory.daysBetweenOrders, totalOrders: memory.totalOrders },
      source:     "customer",
    });
  }

  // Reorder opportunities
  if (memory.reorderCandidates.length > 0) {
    const refs = memory.reorderCandidates.slice(0, 3).join(", ");
    insights.push({
      type:       "customer_reorder",
      message:    `${memory.customerName || memory.customerCode} compraba frecuentemente: ${refs}. No ha reordenado recientemente.`,
      confidence: 80,
      data:       { reorderCandidates: memory.reorderCandidates },
      source:     "customer",
    });
  }

  // Size/color preferences
  if (memory.topSizes.length > 0) {
    const topSize = memory.topSizes[0];
    insights.push({
      type:       "customer_preference",
      message:    `Talla mas frecuente de ${memory.customerName || memory.customerCode}: ${topSize.value} (${topSize.percent}% de las lineas).`,
      confidence: topSize.percent >= 50 ? 90 : 70,
      data:       { topSize: topSize.value, percent: topSize.percent },
      source:     "customer",
    });
  }

  // Ticket value insight
  if (memory.totalOrders >= 3 && memory.avgTicketValue > 0) {
    insights.push({
      type:       "value_opportunity",
      message:    `Ticket promedio de ${memory.customerName || memory.customerCode}: $${memory.avgTicketValue.toLocaleString()}. Valor de vida: $${memory.totalLifetimeValue.toLocaleString()}.`,
      confidence: 85,
      data:       { avgTicketValue: memory.avgTicketValue, totalLifetimeValue: memory.totalLifetimeValue },
      source:     "customer",
    });
  }

  return insights;
}

// ── Generate seller insights ────────────────────────────────────────────────

export function buildSellerInsights(
  memory: SellerCommercialMemory,
): DavidCommercialInsight[] {
  const insights: DavidCommercialInsight[] = [];

  // Performance overview
  if (memory.totalOrders >= 5) {
    insights.push({
      type:       "seller_performance",
      message:    `${memory.sellerName} tiene ${memory.totalOrders} pedidos, ${memory.activeCustomers} clientes activos, ticket promedio $${memory.avgTicketValue.toLocaleString()}.`,
      confidence: 90,
      data:       {
        totalOrders:     memory.totalOrders,
        activeCustomers: memory.activeCustomers,
        avgTicketValue:  memory.avgTicketValue,
      },
      source:     "seller",
    });
  }

  // Conflict alert
  if (memory.conflictRate > 10) {
    insights.push({
      type:       "fulfillment_alert",
      message:    `${memory.sellerName} tiene ${memory.conflictRate}% de pedidos con conflictos. Revisar.`,
      confidence: 90,
      data:       { conflictRate: memory.conflictRate },
      source:     "seller",
    });
  }

  // Fulfillment alert
  if (memory.fulfillmentPercent > 0 && memory.fulfillmentPercent < 80) {
    insights.push({
      type:       "fulfillment_alert",
      message:    `Cumplimiento de ${memory.sellerName}: ${memory.fulfillmentPercent}%. Por debajo del objetivo.`,
      confidence: 85,
      data:       { fulfillmentPercent: memory.fulfillmentPercent },
      source:     "seller",
    });
  }

  return insights;
}

// ── Generate product insights ───────────────────────────────────────────────

export function buildProductInsights(
  memory: ProductCommercialMemory,
): DavidCommercialInsight[] {
  const insights: DavidCommercialInsight[] = [];

  // High reorder rate
  if (memory.reorderRate > 50) {
    insights.push({
      type:       "product_reorder",
      message:    `${memory.referenceCode} tiene ${memory.reorderRate}% de recompra. Alta fidelidad de producto.`,
      confidence: 85,
      data:       { reorderRate: memory.reorderRate, avgReorderDays: memory.avgReorderDays },
      source:     "product",
    });
  }

  // Growing demand
  if (memory.isGrowing) {
    insights.push({
      type:       "product_demand",
      message:    `${memory.referenceCode} tiene demanda creciente en los ultimos 90 dias.`,
      confidence: 75,
      data:       { isGrowing: true, orderCount: memory.orderCount },
      source:     "product",
    });
  }

  // Shrinking demand
  if (memory.isShrinking) {
    insights.push({
      type:       "product_demand",
      message:    `${memory.referenceCode}: la demanda esta disminuyendo comparado con el trimestre anterior.`,
      confidence: 75,
      data:       { isShrinking: true, orderCount: memory.orderCount },
      source:     "product",
    });
  }

  // Wide customer base
  if (memory.uniqueCustomers >= 5) {
    insights.push({
      type:       "product_demand",
      message:    `${memory.referenceCode} es comprado por ${memory.uniqueCustomers} clientes diferentes.`,
      confidence: 90,
      data:       { uniqueCustomers: memory.uniqueCustomers },
      source:     "product",
    });
  }

  return insights;
}
