/**
 * lib/copilot/insights/insight-signal-registry.ts
 *
 * Agentik Copilot — Business Signal Registry
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Declarative registry of observable business signals.
 *
 * A signal declares what type of business phenomenon can be observed.
 * Signals do NOT calculate values — they identify phenomena.
 * When real data sources are wired, signals become the bridge between
 * raw facts and actionable insights.
 *
 * Signal ID format: {domain}.{event_name}
 * Total registered signals: 34
 */

import type { DomainId }     from "../knowledge/domain-registry";
import type { CapabilityId } from "../knowledge/capability-registry";
import type { ActionId }     from "../knowledge/action-registry";
import type { InsightType, InsightSeverity } from "./insight-types";

// ── Signal ID union ───────────────────────────────────────────────────────────

export type SignalId =
  // Cartera
  | "cartera.overdue_increase"
  | "cartera.collection_stalled"
  | "cartera.cashflow_gap"
  // Inventario
  | "inventario.stockout_risk"
  | "inventario.overstock_detected"
  | "inventario.coverage_drop"
  // Ventas
  | "ventas.performance_drop"
  | "ventas.growth_opportunity"
  | "ventas.trend_change"
  // Bancos
  | "bancos.unreconciled_movement"
  | "bancos.balance_anomaly"
  // Conciliación
  | "conciliacion.exceptions_pending"
  | "conciliacion.period_open"
  // Pagos
  | "pagos.unapplied_payment"
  | "pagos.payment_pattern_change"
  // Recaudos
  | "recaudos.unreconciled_income"
  | "recaudos.consistency_issue"
  // Marketing
  | "marketing.content_gap"
  | "marketing.campaign_underperforming"
  | "marketing.conversion_drop"
  // Compras
  | "compras.delayed_order"
  | "compras.supplier_risk"
  // Productos
  | "productos.low_margin"
  | "productos.low_rotation"
  | "productos.traceability_gap"
  // Clientes
  | "clientes.churn_risk"
  | "clientes.payment_behavior_change"
  // Tareas
  | "tareas.overdue_accumulation"
  | "tareas.priority_drift"
  // Alertas
  | "alertas.critical_unresolved"
  | "alertas.volume_spike"
  // Producción
  | "produccion.bottleneck_detected"
  | "produccion.efficiency_drop";

// ── Signal definition ─────────────────────────────────────────────────────────

export interface BusinessSignal {
  id:                    SignalId;
  domainId:              DomainId;
  /** Entity types this signal relates to */
  relatedEntityIds:      string[];
  description:           string;
  defaultSeverity:       InsightSeverity;
  /** Insight types this signal can generate */
  possibleInsightTypes:  InsightType[];
  /** Capabilities that provide data for detecting this signal */
  suggestedCapabilityIds: CapabilityId[];
  /** Actions that address the condition behind this signal */
  suggestedActionIds:    ActionId[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const SIGNAL_REGISTRY: Record<SignalId, BusinessSignal> = {

  // ── Cartera ──────────────────────────────────────────────────────────────

  "cartera.overdue_increase": {
    id: "cartera.overdue_increase", domainId: "cartera",
    relatedEntityIds:       ["collection", "customer"],
    description:            "Se detecta una condición de incremento en documentos con días de mora.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["risk", "alert"],
    suggestedCapabilityIds: ["cartera.detect_overdue", "cartera.calculate_aging"],
    suggestedActionIds:     ["create_alert", "flag_for_review"],
  },

  "cartera.collection_stalled": {
    id: "cartera.collection_stalled", domainId: "cartera",
    relatedEntityIds:       ["collection"],
    description:            "La gestión de cobros no está avanzando al ritmo esperado.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["risk", "observation"],
    suggestedCapabilityIds: ["cartera.prioritize_collection"],
    suggestedActionIds:     ["draft_collection_message", "create_task"],
  },

  "cartera.cashflow_gap": {
    id: "cartera.cashflow_gap", domainId: "cartera",
    relatedEntityIds:       ["collection"],
    description:            "Existe una brecha entre cobros proyectados y flujo de caja disponible.",
    defaultSeverity:        "critical",
    possibleInsightTypes:   ["risk", "alert"],
    suggestedCapabilityIds: ["cartera.project_cashflow", "bancos.calculate_balance"],
    suggestedActionIds:     ["create_alert", "request_approval"],
  },

  // ── Inventario ────────────────────────────────────────────────────────────

  "inventario.stockout_risk": {
    id: "inventario.stockout_risk", domainId: "inventario",
    relatedEntityIds:       ["inventory_position", "product"],
    description:            "Una o más referencias presentan condición de riesgo de agotamiento.",
    defaultSeverity:        "critical",
    possibleInsightTypes:   ["risk", "alert"],
    suggestedCapabilityIds: ["inventario.detect_stockout", "inventario.calculate_coverage"],
    suggestedActionIds:     ["create_purchase_suggestion", "create_alert"],
  },

  "inventario.overstock_detected": {
    id: "inventario.overstock_detected", domainId: "inventario",
    relatedEntityIds:       ["inventory_position"],
    description:            "Se detectan referencias con inventario por encima de la demanda proyectada.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["observation", "opportunity"],
    suggestedCapabilityIds: ["inventario.flag_overstock", "inventario.calculate_coverage"],
    suggestedActionIds:     ["generate_report", "create_task"],
  },

  "inventario.coverage_drop": {
    id: "inventario.coverage_drop", domainId: "inventario",
    relatedEntityIds:       ["inventory_position", "sales_line"],
    description:            "La cobertura de inventario ha disminuido y puede ser insuficiente.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["risk", "trend"],
    suggestedCapabilityIds: ["inventario.calculate_coverage"],
    suggestedActionIds:     ["create_purchase_suggestion"],
  },

  // ── Ventas ────────────────────────────────────────────────────────────────

  "ventas.performance_drop": {
    id: "ventas.performance_drop", domainId: "ventas",
    relatedEntityIds:       ["invoice", "sales_line"],
    description:            "El rendimiento de ventas presenta variaciones negativas respecto al patrón esperado.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "anomaly", "trend"],
    suggestedCapabilityIds: ["ventas.analyze_performance", "ventas.detect_trends"],
    suggestedActionIds:     ["generate_report", "create_alert"],
  },

  "ventas.growth_opportunity": {
    id: "ventas.growth_opportunity", domainId: "ventas",
    relatedEntityIds:       ["customer", "product"],
    description:            "Existen condiciones que sugieren oportunidades de crecimiento en ventas.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["opportunity"],
    suggestedCapabilityIds: ["ventas.rank_customers", "ventas.rank_products"],
    suggestedActionIds:     ["generate_report"],
  },

  "ventas.trend_change": {
    id: "ventas.trend_change", domainId: "ventas",
    relatedEntityIds:       ["invoice"],
    description:            "Se detecta un cambio de tendencia en el comportamiento de ventas.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["trend", "observation"],
    suggestedCapabilityIds: ["ventas.detect_trends", "ventas.analyze_performance"],
    suggestedActionIds:     ["generate_report"],
  },

  // ── Bancos ────────────────────────────────────────────────────────────────

  "bancos.unreconciled_movement": {
    id: "bancos.unreconciled_movement", domainId: "bancos",
    relatedEntityIds:       ["bank_movement"],
    description:            "Existen movimientos bancarios sin correspondencia con recaudos registrados.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "anomaly"],
    suggestedCapabilityIds: ["bancos.detect_unreconciled", "bancos.support_reconciliation"],
    suggestedActionIds:     ["flag_for_review", "close_reconciliation_item"],
  },

  "bancos.balance_anomaly": {
    id: "bancos.balance_anomaly", domainId: "bancos",
    relatedEntityIds:       ["bank_movement"],
    description:            "El saldo bancario presenta una variación que merece revisión.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["anomaly", "alert"],
    suggestedCapabilityIds: ["bancos.calculate_balance", "bancos.query_movements"],
    suggestedActionIds:     ["create_alert", "flag_for_review"],
  },

  // ── Conciliación ──────────────────────────────────────────────────────────

  "conciliacion.exceptions_pending": {
    id: "conciliacion.exceptions_pending", domainId: "conciliacion",
    relatedEntityIds:       ["bank_movement", "collection"],
    description:            "Hay excepciones de conciliación que aún no han sido resueltas.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["conciliacion.detect_exceptions"],
    suggestedActionIds:     ["close_reconciliation_item", "flag_for_review"],
  },

  "conciliacion.period_open": {
    id: "conciliacion.period_open", domainId: "conciliacion",
    relatedEntityIds:       ["bank_movement"],
    description:            "El período contable permanece abierto sin conciliación completada.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["observation", "risk"],
    suggestedCapabilityIds: ["conciliacion.reconcile_movements"],
    suggestedActionIds:     ["generate_report", "create_task"],
  },

  // ── Pagos ─────────────────────────────────────────────────────────────────

  "pagos.unapplied_payment": {
    id: "pagos.unapplied_payment", domainId: "pagos",
    relatedEntityIds:       ["payment"],
    description:            "Existen pagos recibidos que no han sido aplicados a un documento.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "observation"],
    suggestedCapabilityIds: ["pagos.detect_unapplied", "pagos.track_payments"],
    suggestedActionIds:     ["flag_for_review", "create_task"],
  },

  "pagos.payment_pattern_change": {
    id: "pagos.payment_pattern_change", domainId: "pagos",
    relatedEntityIds:       ["payment", "customer"],
    description:            "El comportamiento histórico de pagos presenta variaciones respecto a períodos anteriores.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["trend", "observation"],
    suggestedCapabilityIds: ["pagos.analyze_payment_patterns"],
    suggestedActionIds:     ["generate_report"],
  },

  // ── Recaudos ──────────────────────────────────────────────────────────────

  "recaudos.unreconciled_income": {
    id: "recaudos.unreconciled_income", domainId: "recaudos",
    relatedEntityIds:       ["collection", "bank_movement"],
    description:            "Hay ingresos de caja que no han sido cruzados con movimientos bancarios.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["recaudos.detect_unreconciled"],
    suggestedActionIds:     ["flag_for_review", "close_reconciliation_item"],
  },

  "recaudos.consistency_issue": {
    id: "recaudos.consistency_issue", domainId: "recaudos",
    relatedEntityIds:       ["collection"],
    description:            "Los recaudos del período presentan posibles inconsistencias de registro.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["anomaly", "observation"],
    suggestedCapabilityIds: ["recaudos.validate_consistency"],
    suggestedActionIds:     ["flag_for_review"],
  },

  // ── Marketing ─────────────────────────────────────────────────────────────

  "marketing.content_gap": {
    id: "marketing.content_gap", domainId: "marketing",
    relatedEntityIds:       ["product", "marketing_asset"],
    description:            "Existen productos o períodos sin cobertura de contenido de marketing.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["opportunity", "observation"],
    suggestedCapabilityIds: ["marketing.generate_content", "marketing.analyze_performance"],
    suggestedActionIds:     ["generate_photo", "generate_video"],
  },

  "marketing.campaign_underperforming": {
    id: "marketing.campaign_underperforming", domainId: "marketing",
    relatedEntityIds:       ["campaign"],
    description:            "Una o más campañas no están alcanzando los objetivos de rendimiento esperados.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["marketing.analyze_performance", "marketing.measure_conversion"],
    suggestedActionIds:     ["create_alert", "generate_report"],
  },

  "marketing.conversion_drop": {
    id: "marketing.conversion_drop", domainId: "marketing",
    relatedEntityIds:       ["campaign", "customer"],
    description:            "La tasa de conversión de campañas activas presenta variación negativa.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["trend", "alert"],
    suggestedCapabilityIds: ["marketing.measure_conversion"],
    suggestedActionIds:     ["create_alert"],
  },

  // ── Compras ───────────────────────────────────────────────────────────────

  "compras.delayed_order": {
    id: "compras.delayed_order", domainId: "compras",
    relatedEntityIds:       ["purchase_order"],
    description:            "Existen órdenes de compra cuya fecha de compromiso de entrega fue superada.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["compras.detect_overdue_orders"],
    suggestedActionIds:     ["create_task", "create_alert"],
  },

  "compras.supplier_risk": {
    id: "compras.supplier_risk", domainId: "compras",
    relatedEntityIds:       ["purchase_order"],
    description:            "Uno o más proveedores presentan comportamiento que puede generar riesgo de abastecimiento.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["risk", "observation"],
    suggestedCapabilityIds: ["compras.analyze_supplier_performance"],
    suggestedActionIds:     ["create_alert", "flag_for_review"],
  },

  // ── Productos ─────────────────────────────────────────────────────────────

  "productos.low_margin": {
    id: "productos.low_margin", domainId: "productos",
    relatedEntityIds:       ["product", "sales_line"],
    description:            "Algunas referencias presentan margen por debajo del umbral operativo esperado.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["productos.analyze_margin"],
    suggestedActionIds:     ["generate_report", "flag_for_review"],
  },

  "productos.low_rotation": {
    id: "productos.low_rotation", domainId: "productos",
    relatedEntityIds:       ["product", "inventory_position"],
    description:            "Existen referencias con ventas por debajo del umbral histórico esperado.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["observation", "opportunity"],
    suggestedCapabilityIds: ["productos.detect_low_rotation"],
    suggestedActionIds:     ["generate_report", "create_task"],
  },

  "productos.traceability_gap": {
    id: "productos.traceability_gap", domainId: "productos",
    relatedEntityIds:       ["product"],
    description:            "Se detectan inconsistencias en la trazabilidad de referencias entre dominios.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["anomaly", "observation"],
    suggestedCapabilityIds: ["productos.cross_domain_traceability"],
    suggestedActionIds:     ["flag_for_review"],
  },

  // ── Clientes ─────────────────────────────────────────────────────────────

  "clientes.churn_risk": {
    id: "clientes.churn_risk", domainId: "clientes",
    relatedEntityIds:       ["customer"],
    description:            "Clientes con señales de inactividad o reducción de compras que podrían desertar.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["risk", "alert"],
    suggestedCapabilityIds: ["clientes.detect_churn_risk"],
    suggestedActionIds:     ["draft_collection_message", "send_whatsapp"],
  },

  "clientes.payment_behavior_change": {
    id: "clientes.payment_behavior_change", domainId: "clientes",
    relatedEntityIds:       ["customer", "payment"],
    description:            "El comportamiento de pago de uno o más clientes ha variado respecto al patrón histórico.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["trend", "observation"],
    suggestedCapabilityIds: ["clientes.analyze_payment_behavior"],
    suggestedActionIds:     ["create_task", "generate_report"],
  },

  // ── Tareas ────────────────────────────────────────────────────────────────

  "tareas.overdue_accumulation": {
    id: "tareas.overdue_accumulation", domainId: "tareas",
    relatedEntityIds:       ["task"],
    description:            "El volumen de tareas vencidas sin resolver está acumulándose.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["tareas.detect_overdue"],
    suggestedActionIds:     ["assign_task", "create_task"],
  },

  "tareas.priority_drift": {
    id: "tareas.priority_drift", domainId: "tareas",
    relatedEntityIds:       ["task"],
    description:            "La distribución de prioridades de las tareas activas puede necesitar revisión.",
    defaultSeverity:        "low",
    possibleInsightTypes:   ["observation"],
    suggestedCapabilityIds: ["tareas.assign_priority", "tareas.track_open_tasks"],
    suggestedActionIds:     ["create_task"],
  },

  // ── Alertas ───────────────────────────────────────────────────────────────

  "alertas.critical_unresolved": {
    id: "alertas.critical_unresolved", domainId: "alertas",
    relatedEntityIds:       ["alert"],
    description:            "Hay alertas críticas activas que permanecen sin resolución.",
    defaultSeverity:        "critical",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["alertas.prioritize"],
    suggestedActionIds:     ["create_alert", "create_task"],
  },

  "alertas.volume_spike": {
    id: "alertas.volume_spike", domainId: "alertas",
    relatedEntityIds:       ["alert"],
    description:            "El volumen de alertas activas supera el patrón operacional habitual.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["anomaly", "observation"],
    suggestedCapabilityIds: ["alertas.prioritize", "alertas.generate_alert"],
    suggestedActionIds:     ["create_task"],
  },

  // ── Producción ────────────────────────────────────────────────────────────

  "produccion.bottleneck_detected": {
    id: "produccion.bottleneck_detected", domainId: "produccion",
    relatedEntityIds:       ["product"],
    description:            "Se detectan bloqueos o retrasos en el flujo de producción.",
    defaultSeverity:        "high",
    possibleInsightTypes:   ["alert", "risk"],
    suggestedCapabilityIds: ["produccion.detect_bottlenecks"],
    suggestedActionIds:     ["create_task", "create_alert"],
  },

  "produccion.efficiency_drop": {
    id: "produccion.efficiency_drop", domainId: "produccion",
    relatedEntityIds:       ["product"],
    description:            "La eficiencia de producción ha disminuido respecto a la capacidad instalada.",
    defaultSeverity:        "medium",
    possibleInsightTypes:   ["observation", "trend"],
    suggestedCapabilityIds: ["produccion.analyze_efficiency"],
    suggestedActionIds:     ["generate_report"],
  },
};

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getSignal(id: SignalId): BusinessSignal {
  return SIGNAL_REGISTRY[id];
}

export function getAllSignals(): BusinessSignal[] {
  return Object.values(SIGNAL_REGISTRY);
}

export function getSignalsForDomain(domainId: DomainId): BusinessSignal[] {
  return getAllSignals().filter(s => s.domainId === domainId);
}

export function getTotalSignalCount(): number {
  return Object.keys(SIGNAL_REGISTRY).length;
}
