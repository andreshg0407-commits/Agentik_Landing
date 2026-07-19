/**
 * lib/copilot/suggestions/suggestion-registry.ts
 *
 * Agentik Copilot — Suggestion Registry
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Declarative mapping: CapabilityId → SuggestionTemplate[].
 *
 * Each capability maps to 1–3 suggestion templates.
 * Templates are pure data — no logic, no calculations.
 * The generator consumes these templates and enriches them with runtime context.
 *
 * Total registered templates: 102
 */

import type { CapabilityId } from "../knowledge/capability-registry";
import type { SuggestionPriority, SuggestionCategory } from "./suggestion-types";

// ── Template ──────────────────────────────────────────────────────────────────

export interface SuggestionTemplate {
  title:       string;
  descripcion: string;
  priority:    SuggestionPriority;
  category:    SuggestionCategory;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const SUGGESTION_REGISTRY: Partial<Record<CapabilityId, SuggestionTemplate[]>> = {

  // ── Ventas ────────────────────────────────────────────────────────────────

  "ventas.analyze_performance": [
    {
      title:       "Analizar rendimiento de ventas",
      descripcion: "Evalúa el volumen y valor de ventas del período activo para detectar variaciones.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Comparar ventas contra período anterior",
      descripcion: "Contrasta el desempeño actual de ventas con el mismo período histórico.",
      priority:    "medium",
      category:    "analysis",
    },
  ],

  "ventas.detect_trends": [
    {
      title:       "Detectar tendencias de venta",
      descripcion: "Identifica patrones de crecimiento o contracción en el comportamiento de ventas.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Revisar categorías con mayor variación",
      descripcion: "Enfoca el análisis en las líneas de producto con mayores cambios de tendencia.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "ventas.rank_products": [
    {
      title:       "Revisar productos de mayor desempeño",
      descripcion: "Identifica las referencias con mayor volumen de ventas y margen en el período.",
      priority:    "medium",
      category:    "analysis",
    },
    {
      title:       "Detectar oportunidades en productos de bajo desempeño",
      descripcion: "Analiza referencias con ventas por debajo del promedio para definir estrategia.",
      priority:    "medium",
      category:    "opportunity",
    },
  ],

  "ventas.rank_customers": [
    {
      title:       "Revisar clientes estratégicos",
      descripcion: "Identifica los clientes de mayor valor y evalúa su comportamiento reciente.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Detectar clientes con caída en compras",
      descripcion: "Analiza clientes que históricamente compraban más y han reducido su actividad.",
      priority:    "high",
      category:    "alert",
    },
  ],

  // ── Clientes ─────────────────────────────────────────────────────────────

  "clientes.segment_by_value": [
    {
      title:       "Segmentar clientes por valor comercial",
      descripcion: "Agrupa clientes en segmentos según su contribución al ingreso total.",
      priority:    "medium",
      category:    "analysis",
    },
    {
      title:       "Identificar clientes de alto potencial",
      descripcion: "Detecta clientes con perfil de compra creciente y potencial de expansión.",
      priority:    "medium",
      category:    "opportunity",
    },
  ],

  "clientes.detect_churn_risk": [
    {
      title:       "Revisar clientes con riesgo de abandono",
      descripcion: "Identifica clientes con señales de inactividad que podrían estar perdiendo interés.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Priorizar retención de clientes en riesgo",
      descripcion: "Sugiere acciones de retención para clientes con mayor valor y riesgo detectado.",
      priority:    "high",
      category:    "action",
    },
  ],

  "clientes.analyze_payment_behavior": [
    {
      title:       "Analizar comportamiento de pago por cliente",
      descripcion: "Evalúa la puntualidad y consistencia de pagos para anticipar problemas de cartera.",
      priority:    "medium",
      category:    "analysis",
    },
  ],

  // ── Productos ─────────────────────────────────────────────────────────────

  "productos.analyze_margin": [
    {
      title:       "Analizar margen por referencia de producto",
      descripcion: "Compara el margen bruto de cada referencia para identificar las más rentables.",
      priority:    "medium",
      category:    "analysis",
    },
    {
      title:       "Detectar productos con margen crítico",
      descripcion: "Identifica referencias cuyo margen está por debajo del umbral mínimo operativo.",
      priority:    "high",
      category:    "alert",
    },
  ],

  "productos.detect_low_rotation": [
    {
      title:       "Revisar referencias con baja rotación",
      descripcion: "Identifica productos que no han alcanzado el umbral de ventas mínimo esperado.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Evaluar estrategia para productos de baja rotación",
      descripcion: "Analiza opciones para referencias estancadas: promoción, liquidación o descontinuación.",
      priority:    "medium",
      category:    "opportunity",
    },
  ],

  "productos.cross_domain_traceability": [
    {
      title:       "Validar consistencia de referencias entre dominios",
      descripcion: "Verifica que los códigos de producto sean coherentes entre ventas, inventario y compras.",
      priority:    "medium",
      category:    "review",
    },
  ],

  // ── Inventario ────────────────────────────────────────────────────────────

  "inventario.check_stock": [
    {
      title:       "Consultar stock disponible",
      descripcion: "Revisa los niveles actuales de inventario por producto y bodega.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "inventario.detect_stockout": [
    {
      title:       "Revisar quiebres de stock activos",
      descripcion: "Identifica referencias con stock en cero que pueden estar afectando ventas.",
      priority:    "critical",
      category:    "alert",
    },
    {
      title:       "Priorizar reposición de referencias críticas",
      descripcion: "Sugiere las referencias con mayor urgencia de reposición según demanda histórica.",
      priority:    "high",
      category:    "action",
    },
  ],

  "inventario.calculate_coverage": [
    {
      title:       "Analizar cobertura de inventario",
      descripcion: "Calcula cuántos días de venta puede cubrir el inventario disponible actual.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Detectar referencias con cobertura crítica",
      descripcion: "Identifica productos con menos de 7 días de cobertura para anticipar quiebres.",
      priority:    "critical",
      category:    "alert",
    },
  ],

  "inventario.flag_overstock": [
    {
      title:       "Revisar referencias con sobrestock",
      descripcion: "Identifica productos con exceso de inventario que generan capital inmovilizado.",
      priority:    "medium",
      category:    "alert",
    },
    {
      title:       "Evaluar opciones para reducir sobrestock",
      descripcion: "Analiza alternativas para referencias con exceso: promociones, transferencias o ajustes.",
      priority:    "medium",
      category:    "opportunity",
    },
  ],

  // ── Compras ───────────────────────────────────────────────────────────────

  "compras.track_open_orders": [
    {
      title:       "Revisar órdenes de compra abiertas",
      descripcion: "Monitorea el estado de las OC activas y verifica avances de recepción.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "compras.detect_overdue_orders": [
    {
      title:       "Revisar órdenes de compra vencidas",
      descripcion: "Identifica OC cuya fecha de compromiso fue superada y aún no han sido recibidas.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Contactar proveedores con OC vencidas",
      descripcion: "Sugiere gestión directa con proveedores que acumulan retrasos en entregas.",
      priority:    "high",
      category:    "action",
    },
  ],

  "compras.analyze_supplier_performance": [
    {
      title:       "Analizar cumplimiento de proveedores",
      descripcion: "Evalúa el SLA de entrega por proveedor para identificar incumplimientos recurrentes.",
      priority:    "medium",
      category:    "analysis",
    },
    {
      title:       "Identificar proveedores con riesgo de abastecimiento",
      descripcion: "Detecta proveedores con múltiples incumplimientos que pueden generar quiebres.",
      priority:    "high",
      category:    "alert",
    },
  ],

  // ── Cartera ───────────────────────────────────────────────────────────────

  "cartera.detect_overdue": [
    {
      title:       "Revisar cartera vencida",
      descripcion: "Identifica documentos de cobro con días de mora para priorizar gestión.",
      priority:    "critical",
      category:    "alert",
    },
    {
      title:       "Analizar concentración de cartera vencida",
      descripcion: "Evalúa si la cartera vencida está concentrada en pocos clientes o distribuida.",
      priority:    "high",
      category:    "analysis",
    },
  ],

  "cartera.prioritize_collection": [
    {
      title:       "Priorizar gestión de cobros",
      descripcion: "Ordena los documentos de cobro por impacto financiero y antigüedad de mora.",
      priority:    "high",
      category:    "action",
    },
    {
      title:       "Revisar clientes con mayor mora pendiente",
      descripcion: "Identifica los clientes con mayor exposición de cartera vencida para atención inmediata.",
      priority:    "critical",
      category:    "review",
    },
  ],

  "cartera.calculate_aging": [
    {
      title:       "Analizar antigüedad de cartera",
      descripcion: "Clasifica la cartera pendiente por rangos de antigüedad para evaluar riesgo.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Revisar cartera mayor a 90 días",
      descripcion: "Enfoca la atención en los documentos con más de 90 días de mora.",
      priority:    "critical",
      category:    "alert",
    },
  ],

  "cartera.project_cashflow": [
    {
      title:       "Proyectar flujo de caja por cobros",
      descripcion: "Estima los ingresos esperados por cobros de cartera en el período activo.",
      priority:    "high",
      category:    "analysis",
    },
  ],

  // ── Pagos ─────────────────────────────────────────────────────────────────

  "pagos.track_payments": [
    {
      title:       "Revisar pagos recibidos recientes",
      descripcion: "Monitorea los pagos recibidos y verifica su estado de aplicación.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "pagos.detect_unapplied": [
    {
      title:       "Revisar pagos sin aplicar",
      descripcion: "Identifica pagos recibidos que aún no han sido aplicados a un documento de cobro.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Aplicar pagos pendientes de asignación",
      descripcion: "Gestiona los pagos sin aplicar para mantener la cartera actualizada.",
      priority:    "high",
      category:    "action",
    },
  ],

  "pagos.analyze_payment_patterns": [
    {
      title:       "Analizar tendencias de pago",
      descripcion: "Evalúa el comportamiento histórico de pago para anticipar flujos futuros.",
      priority:    "medium",
      category:    "analysis",
    },
  ],

  // ── Recaudos ──────────────────────────────────────────────────────────────

  "recaudos.track_income": [
    {
      title:       "Revisar ingresos de caja del período",
      descripcion: "Monitorea los recaudos registrados para verificar completitud del período.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "recaudos.detect_unreconciled": [
    {
      title:       "Revisar recaudos sin conciliar",
      descripcion: "Identifica recaudos que no han sido cruzados con un movimiento bancario.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Priorizar conciliación de recaudos pendientes",
      descripcion: "Ordena los recaudos sin conciliar por valor para acelerar el cierre.",
      priority:    "high",
      category:    "action",
    },
  ],

  "recaudos.validate_consistency": [
    {
      title:       "Validar consistencia de recaudos",
      descripcion: "Verifica que los recaudos del período no tengan duplicados ni inconsistencias.",
      priority:    "medium",
      category:    "review",
    },
  ],

  // ── Bancos ────────────────────────────────────────────────────────────────

  "bancos.query_movements": [
    {
      title:       "Consultar movimientos bancarios",
      descripcion: "Revisa los movimientos del extracto bancario del período activo.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "bancos.calculate_balance": [
    {
      title:       "Calcular saldo bancario disponible",
      descripcion: "Obtiene el saldo real disponible en cuentas bancarias para validar liquidez.",
      priority:    "high",
      category:    "analysis",
    },
  ],

  "bancos.detect_unreconciled": [
    {
      title:       "Revisar movimientos bancarios sin conciliar",
      descripcion: "Identifica movimientos del extracto que no tienen correspondencia con recaudos.",
      priority:    "critical",
      category:    "alert",
    },
    {
      title:       "Analizar diferencias de conciliación bancaria",
      descripcion: "Evalúa el volumen y valor de diferencias sin conciliar para priorizar resolución.",
      priority:    "high",
      category:    "analysis",
    },
  ],

  "bancos.support_reconciliation": [
    {
      title:       "Iniciar proceso de conciliación bancaria",
      descripcion: "Prepara los datos bancarios para ejecutar el cruce con recaudos del período.",
      priority:    "high",
      category:    "action",
    },
  ],

  // ── Marketing ─────────────────────────────────────────────────────────────

  "marketing.generate_content": [
    {
      title:       "Crear contenido para nuevos productos",
      descripcion: "Genera piezas visuales o textuales para productos sin activos de marketing activos.",
      priority:    "medium",
      category:    "opportunity",
    },
    {
      title:       "Producir contenido para canal social",
      descripcion: "Crea contenido adaptado para publicación en canales digitales activos.",
      priority:    "medium",
      category:    "action",
    },
  ],

  "marketing.schedule_post": [
    {
      title:       "Programar publicaciones pendientes",
      descripcion: "Agenda contenido listo para publicación en los canales digitales activos.",
      priority:    "medium",
      category:    "action",
    },
    {
      title:       "Revisar calendario editorial activo",
      descripcion: "Verifica el estado de publicaciones programadas y detecta vacíos en el calendario.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "marketing.analyze_performance": [
    {
      title:       "Revisar rendimiento de campañas activas",
      descripcion: "Evalúa las métricas de alcance y conversión de las campañas en curso.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Detectar campañas con bajo rendimiento",
      descripcion: "Identifica campañas que no están alcanzando los objetivos esperados.",
      priority:    "high",
      category:    "alert",
    },
  ],

  "marketing.measure_conversion": [
    {
      title:       "Analizar conversión por campaña",
      descripcion: "Calcula la tasa de conversión de cada campaña activa para optimizar inversión.",
      priority:    "high",
      category:    "analysis",
    },
    {
      title:       "Detectar oportunidades de mejora en conversión",
      descripcion: "Identifica brechas entre alcance y conversión que representan oportunidades.",
      priority:    "medium",
      category:    "opportunity",
    },
  ],

  // ── Producción ────────────────────────────────────────────────────────────

  "produccion.track_orders": [
    {
      title:       "Revisar órdenes de producción activas",
      descripcion: "Monitorea el avance de órdenes de producción en curso y detecta retrasos.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "produccion.detect_bottlenecks": [
    {
      title:       "Detectar cuellos de botella en producción",
      descripcion: "Identifica bloqueos y retrasos en líneas de producción que afectan el flujo.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Priorizar resolución de cuellos de botella",
      descripcion: "Ordena los bloqueos productivos por impacto en tiempo y volumen de entrega.",
      priority:    "high",
      category:    "action",
    },
  ],

  "produccion.analyze_efficiency": [
    {
      title:       "Analizar eficiencia de líneas productivas",
      descripcion: "Evalúa la eficiencia real contra la capacidad instalada en el período activo.",
      priority:    "medium",
      category:    "analysis",
    },
  ],

  // ── Conciliación ──────────────────────────────────────────────────────────

  "conciliacion.reconcile_movements": [
    {
      title:       "Ejecutar conciliación bancaria del período",
      descripcion: "Cruza movimientos bancarios contra recaudos y pagos para cerrar el período.",
      priority:    "high",
      category:    "action",
    },
    {
      title:       "Revisar avance de conciliación",
      descripcion: "Evalúa qué porcentaje del período ha sido conciliado y qué queda pendiente.",
      priority:    "high",
      category:    "review",
    },
  ],

  "conciliacion.detect_exceptions": [
    {
      title:       "Revisar excepciones de conciliación",
      descripcion: "Identifica movimientos que no pudieron ser conciliados automáticamente.",
      priority:    "critical",
      category:    "alert",
    },
    {
      title:       "Gestionar excepciones pendientes de resolución",
      descripcion: "Prioriza y asigna las excepciones de conciliación que requieren revisión manual.",
      priority:    "high",
      category:    "action",
    },
  ],

  "conciliacion.generate_close_report": [
    {
      title:       "Generar reporte de cierre contable",
      descripcion: "Produce el reporte formal de cierre del período tras completar la conciliación.",
      priority:    "high",
      category:    "action",
    },
  ],

  // ── Tareas ────────────────────────────────────────────────────────────────

  "tareas.track_open_tasks": [
    {
      title:       "Revisar tareas operacionales abiertas",
      descripcion: "Consulta las tareas pendientes por usuario, agente o dominio activo.",
      priority:    "medium",
      category:    "review",
    },
  ],

  "tareas.detect_overdue": [
    {
      title:       "Revisar tareas vencidas sin completar",
      descripcion: "Identifica tareas cuya fecha límite fue superada y aún están pendientes.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Priorizar resolución de tareas críticas vencidas",
      descripcion: "Ordena las tareas vencidas por impacto operacional para atención inmediata.",
      priority:    "high",
      category:    "action",
    },
  ],

  "tareas.assign_priority": [
    {
      title:       "Revisar prioridades de tareas activas",
      descripcion: "Evalúa si las prioridades asignadas a tareas activas siguen siendo correctas.",
      priority:    "medium",
      category:    "review",
    },
  ],

  // ── Alertas ───────────────────────────────────────────────────────────────

  "alertas.generate_alert": [
    {
      title:       "Crear alerta operacional",
      descripcion: "Genera una alerta para notificar una condición que requiere atención.",
      priority:    "high",
      category:    "action",
    },
  ],

  "alertas.prioritize": [
    {
      title:       "Revisar alertas activas del sistema",
      descripcion: "Ordena y evalúa las alertas vigentes por severidad e impacto operacional.",
      priority:    "high",
      category:    "alert",
    },
    {
      title:       "Resolver alertas críticas pendientes",
      descripcion: "Identifica las alertas de mayor severidad que requieren acción inmediata.",
      priority:    "critical",
      category:    "action",
    },
  ],

  "alertas.notify": [
    {
      title:       "Notificar alertas a responsables",
      descripcion: "Envía notificaciones a los usuarios responsables de las alertas activas.",
      priority:    "medium",
      category:    "action",
    },
  ],
};

// ── Accessor ──────────────────────────────────────────────────────────────────

/**
 * Returns suggestion templates for a capability, or empty array if none registered.
 */
export function getTemplatesForCapability(capId: CapabilityId): SuggestionTemplate[] {
  return SUGGESTION_REGISTRY[capId] ?? [];
}

/**
 * Returns total number of registered templates across all capabilities.
 */
export function getTotalRegisteredTemplates(): number {
  return Object.values(SUGGESTION_REGISTRY).reduce(
    (sum, templates) => sum + (templates?.length ?? 0),
    0,
  );
}
