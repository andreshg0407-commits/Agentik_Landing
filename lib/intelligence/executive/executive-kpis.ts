/**
 * executive-kpis.ts
 *
 * KPI Engine — computes all executive KPIs from engine outputs.
 * No direct Prisma access. Operates on already-computed engine data.
 */

import type {
  CommercialData,
  InventoryData,
  ExecutiveKpis,
  DailyKpi,
} from "./executive-types";
import { buildKpi } from "./executive-utils";

export function computeKpis(
  commercial: CommercialData,
  inventory: InventoryData,
): ExecutiveKpis {
  const s = commercial.summary;
  const f = commercial.fulfillment;

  // Ticket promedio
  const ticketHoy = s.pedidosHoy.value > 0
    ? Math.round(s.valorPedidosHoy.value / s.pedidosHoy.value)
    : 0;
  const ticketAyer = s.pedidosHoy.previousValue > 0
    ? Math.round(s.valorPedidosHoy.previousValue / s.pedidosHoy.previousValue)
    : 0;

  return {
    pedidosDelDia: s.pedidosHoy,
    ventasDelDia: s.pedidosHoy, // alias — same metric
    valorVendido: s.valorPedidosHoy,
    clientesAtendidos: s.clientesHoy,
    vendedoresActivos: s.vendedoresHoy,
    ticketPromedio: buildKpi(ticketHoy, ticketAyer),
    pedidosCompletos: f.listos,
    pedidosParciales: f.parciales,
    pedidosBloqueados: f.bloqueados,
    referenciasAgotadas: inventory.agotados.length,
    referenciasCriticas: inventory.stockCritico.length,
    stockCritico: inventory.stockCritico.length,
    cumplimiento: f.fulfillmentPromedio,
  };
}
