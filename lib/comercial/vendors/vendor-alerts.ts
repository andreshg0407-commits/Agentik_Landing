/**
 * vendor-alerts.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Vendor Alert Engine — generates alerts from vendor state.
 *
 * All alert logic lives HERE, never in React components.
 * Prepared for future Business Event Engine integration.
 *
 * Pure computation — receives assembled data, returns alerts.
 */

import type {
  VendorAlert,
  VendorAlertType,
  VendorAlertSeverity,
  VendorCommercialKpis,
  VendorActiveCaseSnapshot,
  VendorOrderSummary,
  VendorCustomerSummary,
  VendorFulfillment,
} from "./vendor-types";
import { nextAlertId } from "./vendor-utils";

// ── Alert Computation ────────────────────────────────────────────────────────

interface AlertInput {
  commercial: VendorCommercialKpis;
  activeCase: VendorActiveCaseSnapshot;
  orders: VendorOrderSummary;
  customers: VendorCustomerSummary;
  fulfillment: VendorFulfillment;
}

export function computeVendorAlerts(input: AlertInput): VendorAlert[] {
  const alerts: VendorAlert[] = [];
  const now = new Date().toISOString();

  // ── Depleted references ────────────────────────────────────────────────
  if (input.activeCase.depletedReferences > 0) {
    alerts.push(buildAlert(
      "depleted_references",
      input.activeCase.depletedReferences >= 5 ? "critical" : "high",
      `${input.activeCase.depletedReferences} referencia(s) agotada(s) en maleta`,
      `La maleta tiene ${input.activeCase.depletedReferences} de ${input.activeCase.totalReferences} referencias sin disponibilidad. Considerar actualizar maleta.`,
      input.activeCase.depletedReferences,
      input.activeCase.caseId,
      now,
    ));
  }

  // ── Blocked orders ─────────────────────────────────────────────────────
  if (input.orders.ordersBlocked > 0) {
    alerts.push(buildAlert(
      "blocked_orders",
      input.orders.ordersBlocked >= 3 ? "critical" : "high",
      `${input.orders.ordersBlocked} pedido(s) bloqueado(s)`,
      `Hay ${input.orders.ordersBlocked} pedidos bloqueados que requieren atencion inmediata.`,
      input.orders.ordersBlocked,
      null,
      now,
    ));
  }

  // ── Unattended customers ───────────────────────────────────────────────
  if (input.customers.customersWithoutOrders > 3) {
    alerts.push(buildAlert(
      "unattended_customers",
      input.customers.customersWithoutOrders > 10 ? "high" : "medium",
      `${input.customers.customersWithoutOrders} cliente(s) sin atencion este mes`,
      `${input.customers.customersWithoutOrders} de ${input.customers.activeCustomers} clientes activos no han realizado pedidos este mes.`,
      input.customers.customersWithoutOrders,
      null,
      now,
    ));
  }

  // ── Stale case ─────────────────────────────────────────────────────────
  if (input.activeCase.lastSyncedAt) {
    const syncAge = Date.now() - new Date(input.activeCase.lastSyncedAt).getTime();
    const daysSinceSync = syncAge / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 7) {
      alerts.push(buildAlert(
        "stale_case",
        daysSinceSync > 14 ? "high" : "medium",
        "Maleta desactualizada",
        `La maleta no se ha actualizado en ${Math.round(daysSinceSync)} dias. Puede contener informacion obsoleta.`,
        Math.round(daysSinceSync),
        input.activeCase.caseId,
        now,
      ));
    }
  }

  // ── Orders waiting production ──────────────────────────────────────────
  if (input.orders.ordersWaitingProduction > 0) {
    alerts.push(buildAlert(
      "orders_waiting_production",
      "medium",
      `${input.orders.ordersWaitingProduction} pedido(s) esperando produccion`,
      `Hay pedidos pendientes por falta de produccion. Verificar estado de ordenes de produccion.`,
      input.orders.ordersWaitingProduction,
      null,
      now,
    ));
  }

  // ── Orders waiting inventory ───────────────────────────────────────────
  if (input.orders.ordersWaitingInventory > 0) {
    alerts.push(buildAlert(
      "orders_waiting_inventory",
      "medium",
      `${input.orders.ordersWaitingInventory} pedido(s) esperando inventario`,
      `Hay pedidos que no pueden despacharse por falta de inventario.`,
      input.orders.ordersWaitingInventory,
      null,
      now,
    ));
  }

  // ── Low fulfillment ────────────────────────────────────────────────────
  if (input.fulfillment.totalOrders >= 5 && input.fulfillment.fulfillmentRate < 60) {
    alerts.push(buildAlert(
      "low_fulfillment",
      input.fulfillment.fulfillmentRate < 40 ? "critical" : "high",
      `Cumplimiento bajo: ${input.fulfillment.fulfillmentRate}%`,
      `El cumplimiento de facturacion es ${input.fulfillment.fulfillmentRate}% sobre ${input.fulfillment.totalOrders} pedidos. Investigar causas.`,
      input.fulfillment.fulfillmentRate,
      null,
      now,
    ));
  }

  // ── Goal at risk ───────────────────────────────────────────────────────
  if (input.commercial.goalPercent !== null && input.commercial.goalPercent < 50) {
    const dayOfMonth = new Date().getDate();
    if (dayOfMonth > 15) {
      alerts.push(buildAlert(
        "goal_at_risk",
        "high",
        `Meta en riesgo: ${input.commercial.goalPercent}%`,
        `A dia ${dayOfMonth} del mes, el cumplimiento de meta es solo ${input.commercial.goalPercent}%. Se requiere accion.`,
        input.commercial.goalPercent,
        null,
        now,
      ));
    }
  }

  // Sort by severity
  const severityOrder: Record<VendorAlertSeverity, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ── Builder ──────────────────────────────────────────────────────────────────

function buildAlert(
  type: VendorAlertType,
  severity: VendorAlertSeverity,
  title: string,
  description: string,
  metric: number | null,
  entityId: string | null,
  createdAt: string,
): VendorAlert {
  return { id: nextAlertId(), type, severity, title, description, metric, entityId, createdAt };
}
