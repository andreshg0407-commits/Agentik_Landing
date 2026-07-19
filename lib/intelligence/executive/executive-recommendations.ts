/**
 * executive-recommendations.ts
 *
 * Recommendation Engine — builds David's recommendations from engine outputs.
 * No direct Prisma access. No text generation inside React.
 */

import type {
  CommercialData,
  InventoryData,
  ProductionData,
  ExecutiveRecommendation,
} from "./executive-types";

function rec(
  priority: number,
  severity: ExecutiveRecommendation["severity"],
  title: string,
  description: string,
  recommendedAction: string,
  source: string,
  opts?: {
    confidence?: number;
    relatedReference?: string;
    relatedOrder?: string;
    relatedCustomer?: string;
    relatedProductionOrder?: string;
  },
): ExecutiveRecommendation {
  return {
    priority,
    severity,
    title,
    description,
    recommendedAction,
    source,
    confidence: opts?.confidence ?? 0.9,
    relatedReference: opts?.relatedReference ?? null,
    relatedOrder: opts?.relatedOrder ?? null,
    relatedCustomer: opts?.relatedCustomer ?? null,
    relatedProductionOrder: opts?.relatedProductionOrder ?? null,
  };
}

export function computeRecommendations(
  commercial: CommercialData,
  inventory: InventoryData,
  production: ProductionData,
): ExecutiveRecommendation[] {
  const recs: ExecutiveRecommendation[] = [];

  // Agotados with orders
  const agotadosConPedidos = inventory.agotados.filter(a => a.pedidosAfectados > 0);
  if (agotadosConPedidos.length > 0) {
    const top = agotadosConPedidos[0];
    recs.push(rec(
      1, "critica",
      `${top.reference} agotada con pedidos`,
      `${top.reference} agotada y tiene ${top.pedidosAfectados} pedidos afectados.`,
      "Gestionar reposicion urgente o notificar a clientes afectados.",
      "inventory-engine",
      { relatedReference: top.reference },
    ));
  }

  // Stock critico
  if (inventory.stockCritico.length > 0) {
    recs.push(rec(
      2, "alta",
      `${inventory.stockCritico.length} variantes con stock critico`,
      `${inventory.stockCritico.length} variantes con stock critico (1-10 unidades).`,
      "Revisar niveles de inventario y priorizar reposicion de variantes criticas.",
      "inventory-engine",
    ));
  }

  // Fulfillment bloqueados
  if (commercial.fulfillment.bloqueados > 0) {
    recs.push(rec(
      3, "critica",
      `${commercial.fulfillment.bloqueados} pedidos bloqueados`,
      `${commercial.fulfillment.bloqueados} pedidos bloqueados por inventario insuficiente.`,
      "Revisar pedidos bloqueados y resolver restricciones de inventario.",
      "commercial-engine",
    ));
  }

  // Fulfillment promedio
  const fp = commercial.fulfillment.fulfillmentPromedio;
  if (fp > 0 && fp < 90) {
    recs.push(rec(
      4, "alta",
      `Fulfillment al ${fp}%`,
      `Fulfillment promedio al ${fp}%. Revisar disponibilidad.`,
      "Analizar referencias faltantes y priorizar reposicion.",
      "commercial-engine",
    ));
  }

  // Positive: good day
  const delta = commercial.summary.pedidosHoy.delta;
  if (delta > 0) {
    recs.push(rec(
      10, "info",
      `+${delta} pedidos vs ayer`,
      `Hoy ${delta} pedidos mas que ayer.`,
      "Mantener ritmo comercial.",
      "commercial-engine",
      { confidence: 1.0 },
    ));
  }

  // Production active but agotados present
  if (production.recentOrders > 0 && inventory.agotados.length > 0) {
    recs.push(rec(
      5, "info",
      "Produccion activa con referencias agotadas",
      `${production.recentOrders} OPs recientes. ${inventory.agotados.length} referencias agotadas (posiblemente importadas).`,
      "Verificar si las referencias agotadas son fabricadas o importadas.",
      "production-engine",
    ));
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, 7);
}
