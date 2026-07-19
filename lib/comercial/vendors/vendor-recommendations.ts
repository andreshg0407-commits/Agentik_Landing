/**
 * vendor-recommendations.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Vendor Recommendation Engine — generates actionable suggestions.
 *
 * David will consume these recommendations in a future sprint.
 * All recommendations carry suggestedOnly: true per BUSINESS-ENGINE-01.
 *
 * Pure computation — receives assembled data, returns recommendations.
 */

import type {
  VendorRecommendation,
  VendorRecommendationType,
  VendorCommercialKpis,
  VendorActiveCaseSnapshot,
  VendorOrderSummary,
  VendorCustomerSummary,
  VendorFulfillment,
} from "./vendor-types";
import { nextRecId } from "./vendor-utils";

// ── Recommendation Computation ───────────────────────────────────────────────

interface RecInput {
  commercial: VendorCommercialKpis;
  activeCase: VendorActiveCaseSnapshot;
  orders: VendorOrderSummary;
  customers: VendorCustomerSummary;
  fulfillment: VendorFulfillment;
}

export function computeVendorRecommendations(input: RecInput): VendorRecommendation[] {
  const recs: VendorRecommendation[] = [];

  // ── Update case if depleted ────────────────────────────────────────────
  if (input.activeCase.depletedReferences >= 3) {
    recs.push(buildRec(
      "update_case",
      "Actualizar maleta",
      `La maleta tiene ${input.activeCase.depletedReferences} referencias agotadas. Considerar reemplazar con referencias disponibles.`,
      1,
      input.activeCase.caseId,
    ));
  }

  // ── Remove depleted references ─────────────────────────────────────────
  if (input.activeCase.depletedReferences > 0 && input.activeCase.totalReferences > 0) {
    recs.push(buildRec(
      "remove_depleted_reference",
      "Retirar referencias agotadas",
      `Retirar ${input.activeCase.depletedReferences} referencia(s) sin disponibilidad para liberar espacio en la maleta.`,
      2,
      input.activeCase.caseId,
    ));
  }

  // ── Visit unattended customers ─────────────────────────────────────────
  if (input.customers.customersWithoutOrders > 0) {
    recs.push(buildRec(
      "visit_customer",
      "Visitar clientes sin atencion",
      `${input.customers.customersWithoutOrders} cliente(s) no han realizado pedidos este mes. Priorizar visitas para reactivar demanda.`,
      3,
      null,
    ));
  }

  // ── Follow up cartera ──────────────────────────────────────────────────
  if (input.customers.customersWithCartera > 0) {
    recs.push(buildRec(
      "follow_up_cartera",
      "Seguimiento de cartera",
      `${input.customers.customersWithCartera} cliente(s) con saldo pendiente. Coordinar cobro para liberar credito.`,
      4,
      null,
    ));
  }

  // ── Prioritize blocked orders ──────────────────────────────────────────
  if (input.orders.ordersBlocked > 0) {
    recs.push(buildRec(
      "prioritize_order",
      "Priorizar pedidos bloqueados",
      `Gestionar ${input.orders.ordersBlocked} pedido(s) bloqueado(s). Verificar inventario o autorizacion necesaria.`,
      2,
      null,
    ));
  }

  // ── Add new references if case is thin ─────────────────────────────────
  if (
    input.activeCase.totalReferences > 0 &&
    input.activeCase.totalReferences - input.activeCase.depletedReferences < 10
  ) {
    recs.push(buildRec(
      "add_new_reference",
      "Agregar nuevas referencias",
      `La maleta tiene solo ${input.activeCase.totalReferences - input.activeCase.depletedReferences} referencias activas. Considerar agregar nuevas lineas.`,
      5,
      input.activeCase.caseId,
    ));
  }

  // ── Replenish critical references ──────────────────────────────────────
  if (input.activeCase.criticalReferences > 0) {
    recs.push(buildRec(
      "replenish_reference",
      "Reponer referencias criticas",
      `${input.activeCase.criticalReferences} referencia(s) por debajo del minimo. Solicitar reposicion antes de que se agoten.`,
      2,
      input.activeCase.caseId,
    ));
  }

  // ── Call top customers who haven't ordered recently ────────────────────
  if (input.customers.topCustomers.length > 0) {
    const stale = input.customers.topCustomers.filter(c => {
      if (!c.ultimaCompra) return true;
      const daysSince = (Date.now() - new Date(c.ultimaCompra).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    });
    if (stale.length > 0) {
      recs.push(buildRec(
        "call_customer",
        "Llamar clientes importantes",
        `${stale.length} cliente(s) importantes no han comprado en mas de 30 dias. Contactar para mantener relacion comercial.`,
        3,
        null,
      ));
    }
  }

  // Sort by priority
  recs.sort((a, b) => a.priority - b.priority);

  return recs;
}

// ── Builder ──────────────────────────────────────────────────────────────────

function buildRec(
  type: VendorRecommendationType,
  title: string,
  description: string,
  priority: number,
  entityId: string | null,
): VendorRecommendation {
  return { id: nextRecId(), type, title, description, priority, entityId, suggestedOnly: true };
}
