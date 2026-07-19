/**
 * executive-alerts.ts
 *
 * Alert Engine — generates executive alerts from engine outputs.
 * No direct Prisma access. Operates on already-computed data.
 */

import type {
  CommercialData,
  InventoryData,
  ProductionData,
  ExecutiveAlert,
  AlertSeverity,
  AlertCategory,
} from "./executive-types";
import { nextAlertId } from "./executive-utils";

function alert(
  severity: AlertSeverity,
  title: string,
  description: string,
  category: AlertCategory,
  source: string,
  opts?: {
    priority?: number;
    action?: string;
    relatedReference?: string;
    relatedOrder?: string;
    relatedCustomer?: string;
    relatedProductionOrder?: string;
  },
): ExecutiveAlert {
  return {
    id: nextAlertId(),
    severity,
    title,
    description,
    category,
    source,
    priority: opts?.priority ?? (severity === "critica" ? 1 : severity === "alta" ? 2 : severity === "media" ? 3 : 4),
    action: opts?.action ?? null,
    relatedReference: opts?.relatedReference ?? null,
    relatedOrder: opts?.relatedOrder ?? null,
    relatedCustomer: opts?.relatedCustomer ?? null,
    relatedProductionOrder: opts?.relatedProductionOrder ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function computeAlerts(
  commercial: CommercialData,
  inventory: InventoryData,
  production: ProductionData,
): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  // Stock critico
  if (inventory.stockCritico.length > 0) {
    alerts.push(alert(
      "alta",
      `${inventory.stockCritico.length} variantes con stock critico`,
      `${inventory.stockCritico.length} variantes tienen entre 1 y 10 unidades disponibles.`,
      "stock_critico",
      "inventory-engine",
      { action: "Revisar niveles de inventario y priorizar reposicion." },
    ));
  }

  // Referencias agotadas con pedidos
  const agotadosConPedidos = inventory.agotados.filter(a => a.pedidosAfectados > 0);
  if (agotadosConPedidos.length > 0) {
    const top = agotadosConPedidos[0];
    alerts.push(alert(
      "critica",
      `${agotadosConPedidos.length} referencias agotadas con pedidos pendientes`,
      `${top.reference} agotada con ${top.pedidosAfectados} pedidos afectados.`,
      "referencia_agotada",
      "inventory-engine",
      { relatedReference: top.reference, action: "Gestionar reposicion urgente." },
    ));
  }

  // Pedidos bloqueados
  if (commercial.fulfillment.bloqueados > 0) {
    alerts.push(alert(
      "critica",
      `${commercial.fulfillment.bloqueados} pedidos bloqueados`,
      `${commercial.fulfillment.bloqueados} pedidos no pueden despacharse por inventario insuficiente.`,
      "pedido_bloqueado",
      "commercial-engine",
      { action: "Revisar pedidos bloqueados y resolver restricciones de inventario." },
    ));
  }

  // Production idle
  if (production.productionHealth === "idle") {
    alerts.push(alert(
      "media",
      "Produccion sin actividad reciente",
      "No se han creado ordenes de produccion en los ultimos 30 dias.",
      "produccion_detenida",
      "production-engine",
    ));
  }

  // Low fulfillment
  if (commercial.fulfillment.fulfillmentPromedio > 0 && commercial.fulfillment.fulfillmentPromedio < 70) {
    alerts.push(alert(
      "alta",
      `Fulfillment bajo: ${commercial.fulfillment.fulfillmentPromedio}%`,
      "El cumplimiento de pedidos esta por debajo del 70%. Revisar disponibilidad general.",
      "stock_critico",
      "commercial-engine",
      { action: "Analizar causas de bajo cumplimiento." },
    ));
  }

  return alerts.sort((a, b) => a.priority - b.priority);
}
