/**
 * lib/copilot/insights/insight-registry.ts
 *
 * Agentik Copilot — Signal → Insight Template Registry
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Declarative mapping: SignalId → InsightTemplate[].
 *
 * Templates are pure data — no logic, no calculations.
 * They use contextual possibility language (not data assertions).
 * When real signal evidence arrives, descriptions can be strengthened.
 *
 * Total registered templates: 50
 */

import type { SignalId }               from "./insight-signal-registry";
import type { InsightType, InsightSeverity } from "./insight-types";

// ── Template ──────────────────────────────────────────────────────────────────

export interface InsightTemplate {
  title:       string;
  description: string;
  type:        InsightType;
  severity:    InsightSeverity;
  /** Baseline confidence for this template (without real evidence) */
  baseConfidence: number;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const INSIGHT_REGISTRY: Partial<Record<SignalId, InsightTemplate[]>> = {

  // ── Cartera ──────────────────────────────────────────────────────────────

  "cartera.overdue_increase": [
    {
      title:          "Revisión de cartera vencida disponible",
      description:    "El contexto actual permite revisar el estado de cartera vencida y priorizar acciones de cobranza.",
      type:           "risk",
      severity:       "high",
      baseConfidence: 0.45,
    },
    {
      title:          "Aging de cartera disponible para análisis",
      description:    "Las capacidades activas permiten calcular la antigüedad de cartera y evaluar el perfil de mora.",
      type:           "explanation",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  "cartera.collection_stalled": [
    {
      title:          "Gestión de cobros puede requerir priorización",
      description:    "El contexto operativo sugiere que la gestión de cobros podría beneficiarse de una revisión de prioridades.",
      type:           "observation",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  "cartera.cashflow_gap": [
    {
      title:          "Proyección de flujo de caja activa",
      description:    "Las capacidades disponibles permiten proyectar cobros esperados y contrastarlos con la posición bancaria.",
      type:           "risk",
      severity:       "critical",
      baseConfidence: 0.5,
    },
  ],

  // ── Inventario ────────────────────────────────────────────────────────────

  "inventario.stockout_risk": [
    {
      title:          "Revisión de cobertura de inventario disponible",
      description:    "Las capacidades activas permiten analizar referencias con posible riesgo de agotamiento.",
      type:           "risk",
      severity:       "critical",
      baseConfidence: 0.45,
    },
    {
      title:          "Reposición de stock puede requerir atención",
      description:    "El contexto de inventario permite evaluar necesidades de reposición antes de que se materialicen quiebres.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  "inventario.overstock_detected": [
    {
      title:          "Análisis de sobrestock disponible",
      description:    "Las capacidades activas permiten identificar referencias con inventario por encima de la demanda esperada.",
      type:           "opportunity",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  "inventario.coverage_drop": [
    {
      title:          "Cobertura de inventario disponible para revisión",
      description:    "El contexto actual permite calcular cuántos días de venta cubre el inventario disponible.",
      type:           "trend",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  // ── Ventas ────────────────────────────────────────────────────────────────

  "ventas.performance_drop": [
    {
      title:          "Análisis de rendimiento de ventas disponible",
      description:    "Las capacidades activas permiten evaluar variaciones en el comportamiento de ventas del período.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
    {
      title:          "Tendencias de venta pueden mostrar patrones relevantes",
      description:    "El contexto comercial actual permite revisar tendencias y detectar cambios de dirección.",
      type:           "trend",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  "ventas.growth_opportunity": [
    {
      title:          "Oportunidades de crecimiento en ventas",
      description:    "El contexto actual permite identificar clientes y productos con potencial de expansión comercial.",
      type:           "opportunity",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  "ventas.trend_change": [
    {
      title:          "Cambio de tendencia en ventas posible de analizar",
      description:    "Las capacidades disponibles permiten detectar si existe un cambio de dirección en el comportamiento comercial.",
      type:           "trend",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  // ── Bancos ────────────────────────────────────────────────────────────────

  "bancos.unreconciled_movement": [
    {
      title:          "Movimientos bancarios sin conciliar disponibles para revisión",
      description:    "Las capacidades activas permiten identificar movimientos bancarios sin correspondencia con recaudos.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "bancos.balance_anomaly": [
    {
      title:          "Posición bancaria disponible para análisis",
      description:    "El contexto financiero permite calcular el saldo bancario real y detectar variaciones relevantes.",
      type:           "anomaly",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  // ── Conciliación ──────────────────────────────────────────────────────────

  "conciliacion.exceptions_pending": [
    {
      title:          "Excepciones de conciliación pueden estar pendientes",
      description:    "Las capacidades activas permiten detectar movimientos que no pudieron ser conciliados automáticamente.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
    {
      title:          "Proceso de cierre puede estar incompleto",
      description:    "El contexto de conciliación permite evaluar si el período tiene excepciones abiertas que bloquean el cierre.",
      type:           "risk",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  "conciliacion.period_open": [
    {
      title:          "Período contable abierto detectado",
      description:    "El contexto de conciliación sugiere que el período activo puede aún no haber completado el proceso de cierre.",
      type:           "observation",
      severity:       "medium",
      baseConfidence: 0.4,
    },
  ],

  // ── Pagos ─────────────────────────────────────────────────────────────────

  "pagos.unapplied_payment": [
    {
      title:          "Pagos sin aplicar pueden estar presentes",
      description:    "Las capacidades activas permiten detectar pagos recibidos que aún no han sido aplicados a un documento.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "pagos.payment_pattern_change": [
    {
      title:          "Patrones de pago disponibles para análisis",
      description:    "El contexto actual permite analizar si el comportamiento de pago del período presenta variaciones relevantes.",
      type:           "trend",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  // ── Recaudos ──────────────────────────────────────────────────────────────

  "recaudos.unreconciled_income": [
    {
      title:          "Recaudos sin conciliar disponibles para revisión",
      description:    "Las capacidades activas permiten identificar ingresos de caja sin cruce con movimientos bancarios.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "recaudos.consistency_issue": [
    {
      title:          "Consistencia de recaudos disponible para validar",
      description:    "El contexto permite verificar que los recaudos del período no presenten duplicados ni inconsistencias.",
      type:           "observation",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  // ── Marketing ─────────────────────────────────────────────────────────────

  "marketing.content_gap": [
    {
      title:          "Oportunidades de contenido sin cubrir",
      description:    "El contexto de marketing permite identificar productos o períodos sin cobertura activa de contenido.",
      type:           "opportunity",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  "marketing.campaign_underperforming": [
    {
      title:          "Rendimiento de campañas disponible para revisión",
      description:    "Las capacidades activas permiten evaluar si las campañas actuales están alcanzando los objetivos esperados.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "marketing.conversion_drop": [
    {
      title:          "Tasa de conversión disponible para análisis",
      description:    "El contexto de marketing permite revisar si la conversión de campañas activas ha variado respecto al patrón esperado.",
      type:           "trend",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  // ── Compras ───────────────────────────────────────────────────────────────

  "compras.delayed_order": [
    {
      title:          "Órdenes de compra vencidas disponibles para revisión",
      description:    "Las capacidades activas permiten identificar OC cuya fecha de compromiso fue superada.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "compras.supplier_risk": [
    {
      title:          "Desempeño de proveedores disponible para análisis",
      description:    "El contexto de compras permite evaluar el cumplimiento de SLA de entrega por proveedor.",
      type:           "risk",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  // ── Productos ─────────────────────────────────────────────────────────────

  "productos.low_margin": [
    {
      title:          "Análisis de margen por referencia disponible",
      description:    "Las capacidades activas permiten evaluar referencias cuyo margen pueda estar por debajo del umbral operativo.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  "productos.low_rotation": [
    {
      title:          "Baja rotación de producto posible de detectar",
      description:    "El contexto de productos permite identificar referencias con ventas por debajo del umbral histórico.",
      type:           "observation",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  "productos.traceability_gap": [
    {
      title:          "Trazabilidad entre dominios disponible para validar",
      description:    "Las capacidades activas permiten verificar consistencia de referencias entre ventas, inventario y compras.",
      type:           "anomaly",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  // ── Clientes ─────────────────────────────────────────────────────────────

  "clientes.churn_risk": [
    {
      title:          "Riesgo de abandono de clientes disponible para análisis",
      description:    "Las capacidades activas permiten identificar clientes con señales de reducción de actividad.",
      type:           "risk",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  "clientes.payment_behavior_change": [
    {
      title:          "Comportamiento de pago por cliente disponible para revisión",
      description:    "El contexto comercial permite analizar si el comportamiento de pago de clientes ha variado.",
      type:           "trend",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],

  // ── Tareas ────────────────────────────────────────────────────────────────

  "tareas.overdue_accumulation": [
    {
      title:          "Tareas vencidas disponibles para revisión",
      description:    "Las capacidades activas permiten identificar tareas cuya fecha límite fue superada sin completarse.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.45,
    },
  ],

  "tareas.priority_drift": [
    {
      title:          "Prioridades de tareas disponibles para evaluar",
      description:    "El contexto operativo permite revisar si la distribución de prioridades de tareas activas sigue siendo adecuada.",
      type:           "observation",
      severity:       "low",
      baseConfidence: 0.3,
    },
  ],

  // ── Alertas ───────────────────────────────────────────────────────────────

  "alertas.critical_unresolved": [
    {
      title:          "Alertas críticas activas disponibles para revisión",
      description:    "El contexto de alertas permite identificar y priorizar las condiciones críticas que permanecen sin resolución.",
      type:           "alert",
      severity:       "critical",
      baseConfidence: 0.5,
    },
  ],

  "alertas.volume_spike": [
    {
      title:          "Volumen de alertas disponible para análisis",
      description:    "Las capacidades activas permiten evaluar si el volumen de alertas activas supera el patrón operacional habitual.",
      type:           "anomaly",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  // ── Producción ────────────────────────────────────────────────────────────

  "produccion.bottleneck_detected": [
    {
      title:          "Bloqueos de producción disponibles para revisar",
      description:    "Las capacidades activas permiten identificar puntos de bloqueo en las líneas de producción.",
      type:           "alert",
      severity:       "high",
      baseConfidence: 0.4,
    },
  ],

  "produccion.efficiency_drop": [
    {
      title:          "Eficiencia productiva disponible para análisis",
      description:    "El contexto de producción permite evaluar si la eficiencia de las líneas ha variado respecto a la capacidad instalada.",
      type:           "trend",
      severity:       "medium",
      baseConfidence: 0.35,
    },
  ],
};

// ── Accessor ──────────────────────────────────────────────────────────────────

export function getInsightTemplates(signalId: SignalId): InsightTemplate[] {
  return INSIGHT_REGISTRY[signalId] ?? [];
}

export function getTotalInsightTemplateCount(): number {
  return Object.values(INSIGHT_REGISTRY).reduce(
    (sum, templates) => sum + (templates?.length ?? 0),
    0,
  );
}
