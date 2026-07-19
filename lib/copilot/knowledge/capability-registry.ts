/**
 * lib/copilot/knowledge/capability-registry.ts
 *
 * Agentik Knowledge Foundation — Business Capability Registry
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Defines what each domain KNOWS how to do.
 * Capabilities are analytical or observational — knowledge, not execution.
 * Format: "domain.capability_name"
 *
 * NOTE: Distinct from lib/copilot/capability-registry.ts, which is
 * agent-centric. This registry is domain-centric and serves as the
 * knowledge foundation that all agents build upon.
 */

import type { DomainId } from "./domain-registry";
import type { EntityId } from "./entity-registry";

// ── Capability ID union ────────────────────────────────────────────────────────

export type CapabilityId =
  | "ventas.analyze_performance"
  | "ventas.detect_trends"
  | "ventas.rank_products"
  | "ventas.rank_customers"
  | "clientes.segment_by_value"
  | "clientes.detect_churn_risk"
  | "clientes.analyze_payment_behavior"
  | "productos.analyze_margin"
  | "productos.detect_low_rotation"
  | "productos.cross_domain_traceability"
  | "inventario.check_stock"
  | "inventario.detect_stockout"
  | "inventario.calculate_coverage"
  | "inventario.flag_overstock"
  | "compras.track_open_orders"
  | "compras.detect_overdue_orders"
  | "compras.analyze_supplier_performance"
  | "cartera.detect_overdue"
  | "cartera.prioritize_collection"
  | "cartera.calculate_aging"
  | "cartera.project_cashflow"
  | "pagos.track_payments"
  | "pagos.detect_unapplied"
  | "pagos.analyze_payment_patterns"
  | "recaudos.track_income"
  | "recaudos.detect_unreconciled"
  | "recaudos.validate_consistency"
  | "bancos.query_movements"
  | "bancos.calculate_balance"
  | "bancos.detect_unreconciled"
  | "bancos.support_reconciliation"
  | "marketing.generate_content"
  | "marketing.schedule_post"
  | "marketing.analyze_performance"
  | "marketing.measure_conversion"
  | "produccion.track_orders"
  | "produccion.detect_bottlenecks"
  | "produccion.analyze_efficiency"
  | "conciliacion.reconcile_movements"
  | "conciliacion.detect_exceptions"
  | "conciliacion.generate_close_report"
  | "tareas.track_open_tasks"
  | "tareas.detect_overdue"
  | "tareas.assign_priority"
  | "alertas.generate_alert"
  | "alertas.prioritize"
  | "alertas.notify";

// ── Output types ───────────────────────────────────────────────────────────────

export type CapabilityOutputType =
  | "insight"        // Analytical conclusion
  | "metric"         // Computed numeric value
  | "list"           // Ordered or filtered list of entities
  | "alert"          // Condition-based notification
  | "recommendation" // Suggested next action
  | "report";        // Structured summary document

// ── Capability definition ──────────────────────────────────────────────────────

export interface BusinessCapability {
  id:               CapabilityId;
  domain:           DomainId;
  name:             string;
  descripcion:      string;
  requiredEntities: EntityId[];
  outputType:       CapabilityOutputType;
  dependencies:     CapabilityId[];
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const BUSINESS_CAPABILITY_REGISTRY: Record<CapabilityId, BusinessCapability> = {

  // ── Ventas ────────────────────────────────────────────────────────────────

  "ventas.analyze_performance": {
    id: "ventas.analyze_performance", domain: "ventas",
    name: "Analizar rendimiento de ventas",
    descripcion: "Evalúa el volumen, valor y evolución de ventas en un período dado.",
    requiredEntities: ["invoice", "sales_line"],
    outputType: "metric",
    dependencies: [],
  },
  "ventas.detect_trends": {
    id: "ventas.detect_trends", domain: "ventas",
    name: "Detectar tendencias de venta",
    descripcion: "Identifica patrones de crecimiento o contracción en ventas por período.",
    requiredEntities: ["invoice"],
    outputType: "insight",
    dependencies: ["ventas.analyze_performance"],
  },
  "ventas.rank_products": {
    id: "ventas.rank_products", domain: "ventas",
    name: "Rankear productos por desempeño",
    descripcion: "Ordena los productos según volumen vendido, valor o margen.",
    requiredEntities: ["sales_line", "product"],
    outputType: "list",
    dependencies: ["ventas.analyze_performance"],
  },
  "ventas.rank_customers": {
    id: "ventas.rank_customers", domain: "ventas",
    name: "Rankear clientes por valor",
    descripcion: "Ordena los clientes según valor de compras en el período.",
    requiredEntities: ["invoice", "customer"],
    outputType: "list",
    dependencies: ["ventas.analyze_performance"],
  },

  // ── Clientes ──────────────────────────────────────────────────────────────

  "clientes.segment_by_value": {
    id: "clientes.segment_by_value", domain: "clientes",
    name: "Segmentar clientes por valor",
    descripcion: "Agrupa clientes según su valor comercial y frecuencia de compra.",
    requiredEntities: ["customer", "invoice"],
    outputType: "list",
    dependencies: ["ventas.rank_customers"],
  },
  "clientes.detect_churn_risk": {
    id: "clientes.detect_churn_risk", domain: "clientes",
    name: "Detectar riesgo de abandono",
    descripcion: "Identifica clientes con señales de inactividad o reducción de compras.",
    requiredEntities: ["customer", "invoice"],
    outputType: "alert",
    dependencies: ["ventas.detect_trends"],
  },
  "clientes.analyze_payment_behavior": {
    id: "clientes.analyze_payment_behavior", domain: "clientes",
    name: "Analizar comportamiento de pago",
    descripcion: "Evalúa la puntualidad y consistencia de pagos históricos por cliente.",
    requiredEntities: ["customer", "payment", "collection"],
    outputType: "insight",
    dependencies: ["pagos.analyze_payment_patterns"],
  },

  // ── Productos ─────────────────────────────────────────────────────────────

  "productos.analyze_margin": {
    id: "productos.analyze_margin", domain: "productos",
    name: "Analizar margen por producto",
    descripcion: "Calcula y compara el margen bruto por referencia de producto.",
    requiredEntities: ["product", "sales_line"],
    outputType: "metric",
    dependencies: ["ventas.rank_products"],
  },
  "productos.detect_low_rotation": {
    id: "productos.detect_low_rotation", domain: "productos",
    name: "Detectar baja rotación",
    descripcion: "Identifica referencias con ventas por debajo del umbral histórico.",
    requiredEntities: ["product", "inventory_position", "sales_line"],
    outputType: "alert",
    dependencies: ["inventario.check_stock"],
  },
  "productos.cross_domain_traceability": {
    id: "productos.cross_domain_traceability", domain: "productos",
    name: "Trazabilidad entre dominios",
    descripcion: "Valida la consistencia del código de referencia entre ventas, inventario y compras.",
    requiredEntities: ["product", "invoice", "inventory_position", "purchase_order"],
    outputType: "report",
    dependencies: [],
  },

  // ── Inventario ────────────────────────────────────────────────────────────

  "inventario.check_stock": {
    id: "inventario.check_stock", domain: "inventario",
    name: "Consultar stock disponible",
    descripcion: "Obtiene el stock disponible actual por producto, variante y bodega.",
    requiredEntities: ["inventory_position"],
    outputType: "metric",
    dependencies: [],
  },
  "inventario.detect_stockout": {
    id: "inventario.detect_stockout", domain: "inventario",
    name: "Detectar quiebres de stock",
    descripcion: "Identifica productos con stock disponible en cero o por debajo del mínimo.",
    requiredEntities: ["inventory_position", "product"],
    outputType: "alert",
    dependencies: ["inventario.check_stock"],
  },
  "inventario.calculate_coverage": {
    id: "inventario.calculate_coverage", domain: "inventario",
    name: "Calcular cobertura de inventario",
    descripcion: "Estima cuántos días de venta puede cubrir el stock disponible actual.",
    requiredEntities: ["inventory_position", "sales_line"],
    outputType: "metric",
    dependencies: ["inventario.check_stock", "ventas.analyze_performance"],
  },
  "inventario.flag_overstock": {
    id: "inventario.flag_overstock", domain: "inventario",
    name: "Detectar sobrestock",
    descripcion: "Identifica referencias con exceso de inventario relativo a la demanda.",
    requiredEntities: ["inventory_position", "sales_line"],
    outputType: "alert",
    dependencies: ["inventario.calculate_coverage"],
  },

  // ── Compras ───────────────────────────────────────────────────────────────

  "compras.track_open_orders": {
    id: "compras.track_open_orders", domain: "compras",
    name: "Rastrear órdenes abiertas",
    descripcion: "Lista y monitorea las órdenes de compra activas con su estado de recepción.",
    requiredEntities: ["purchase_order"],
    outputType: "list",
    dependencies: [],
  },
  "compras.detect_overdue_orders": {
    id: "compras.detect_overdue_orders", domain: "compras",
    name: "Detectar OC vencidas",
    descripcion: "Identifica órdenes de compra cuya fecha de compromiso ya fue superada.",
    requiredEntities: ["purchase_order"],
    outputType: "alert",
    dependencies: ["compras.track_open_orders"],
  },
  "compras.analyze_supplier_performance": {
    id: "compras.analyze_supplier_performance", domain: "compras",
    name: "Analizar desempeño de proveedores",
    descripcion: "Evalúa el cumplimiento de SLA de entrega por proveedor.",
    requiredEntities: ["purchase_order"],
    outputType: "insight",
    dependencies: ["compras.track_open_orders"],
  },

  // ── Cartera ───────────────────────────────────────────────────────────────

  "cartera.detect_overdue": {
    id: "cartera.detect_overdue", domain: "cartera",
    name: "Detectar cartera vencida",
    descripcion: "Identifica documentos de cobro con días de mora activos.",
    requiredEntities: ["collection"],
    outputType: "alert",
    dependencies: [],
  },
  "cartera.prioritize_collection": {
    id: "cartera.prioritize_collection", domain: "cartera",
    name: "Priorizar cobros",
    descripcion: "Ordena los documentos de cobro por impacto financiero y antigüedad.",
    requiredEntities: ["collection", "customer"],
    outputType: "list",
    dependencies: ["cartera.detect_overdue"],
  },
  "cartera.calculate_aging": {
    id: "cartera.calculate_aging", domain: "cartera",
    name: "Calcular antigüedad de cartera",
    descripcion: "Agrupa la cartera pendiente por rangos de antigüedad (0-30, 31-60, 61-90, >90 días).",
    requiredEntities: ["collection"],
    outputType: "report",
    dependencies: ["cartera.detect_overdue"],
  },
  "cartera.project_cashflow": {
    id: "cartera.project_cashflow", domain: "cartera",
    name: "Proyectar cobros esperados",
    descripcion: "Estima el flujo de caja esperado por cobros de cartera en el período.",
    requiredEntities: ["collection"],
    outputType: "metric",
    dependencies: ["cartera.calculate_aging"],
  },

  // ── Pagos ─────────────────────────────────────────────────────────────────

  "pagos.track_payments": {
    id: "pagos.track_payments", domain: "pagos",
    name: "Rastrear pagos recibidos",
    descripcion: "Lista y monitorea los pagos recibidos con su estado de aplicación.",
    requiredEntities: ["payment"],
    outputType: "list",
    dependencies: [],
  },
  "pagos.detect_unapplied": {
    id: "pagos.detect_unapplied", domain: "pagos",
    name: "Detectar pagos sin aplicar",
    descripcion: "Identifica pagos recibidos que aún no han sido aplicados a un documento.",
    requiredEntities: ["payment"],
    outputType: "alert",
    dependencies: ["pagos.track_payments"],
  },
  "pagos.analyze_payment_patterns": {
    id: "pagos.analyze_payment_patterns", domain: "pagos",
    name: "Analizar patrones de pago",
    descripcion: "Evalúa tendencias y comportamiento histórico de pago por cliente.",
    requiredEntities: ["payment", "customer"],
    outputType: "insight",
    dependencies: ["pagos.track_payments"],
  },

  // ── Recaudos ──────────────────────────────────────────────────────────────

  "recaudos.track_income": {
    id: "recaudos.track_income", domain: "recaudos",
    name: "Rastrear ingresos de caja",
    descripcion: "Lista y monitorea los recaudos registrados en el período.",
    requiredEntities: ["collection"],
    outputType: "list",
    dependencies: [],
  },
  "recaudos.detect_unreconciled": {
    id: "recaudos.detect_unreconciled", domain: "recaudos",
    name: "Detectar recaudos sin conciliar",
    descripcion: "Identifica recaudos que no han sido cruzados con un movimiento bancario.",
    requiredEntities: ["collection", "bank_movement"],
    outputType: "alert",
    dependencies: ["recaudos.track_income"],
  },
  "recaudos.validate_consistency": {
    id: "recaudos.validate_consistency", domain: "recaudos",
    name: "Validar consistencia de recaudos",
    descripcion: "Verifica que los recaudos registrados no tengan inconsistencias ni duplicados.",
    requiredEntities: ["collection"],
    outputType: "report",
    dependencies: ["recaudos.track_income"],
  },

  // ── Bancos ────────────────────────────────────────────────────────────────

  "bancos.query_movements": {
    id: "bancos.query_movements", domain: "bancos",
    name: "Consultar movimientos bancarios",
    descripcion: "Obtiene los movimientos del extracto bancario en un período dado.",
    requiredEntities: ["bank_movement"],
    outputType: "list",
    dependencies: [],
  },
  "bancos.calculate_balance": {
    id: "bancos.calculate_balance", domain: "bancos",
    name: "Calcular saldo bancario",
    descripcion: "Calcula el saldo disponible real en las cuentas bancarias.",
    requiredEntities: ["bank_movement"],
    outputType: "metric",
    dependencies: ["bancos.query_movements"],
  },
  "bancos.detect_unreconciled": {
    id: "bancos.detect_unreconciled", domain: "bancos",
    name: "Detectar movimientos sin conciliar",
    descripcion: "Identifica movimientos bancarios que no tienen correspondencia con recaudos.",
    requiredEntities: ["bank_movement", "collection"],
    outputType: "alert",
    dependencies: ["bancos.query_movements"],
  },
  "bancos.support_reconciliation": {
    id: "bancos.support_reconciliation", domain: "bancos",
    name: "Soportar conciliación bancaria",
    descripcion: "Provee los datos necesarios para ejecutar el proceso de conciliación bancaria.",
    requiredEntities: ["bank_movement", "collection"],
    outputType: "report",
    dependencies: ["bancos.detect_unreconciled", "recaudos.detect_unreconciled"],
  },

  // ── Marketing ─────────────────────────────────────────────────────────────

  "marketing.generate_content": {
    id: "marketing.generate_content", domain: "marketing",
    name: "Generar contenido",
    descripcion: "Produce piezas de contenido para canales digitales de marketing.",
    requiredEntities: ["marketing_asset"],
    outputType: "recommendation",
    dependencies: [],
  },
  "marketing.schedule_post": {
    id: "marketing.schedule_post", domain: "marketing",
    name: "Programar publicación",
    descripcion: "Agenda la publicación de contenido en canales digitales.",
    requiredEntities: ["marketing_asset", "campaign"],
    outputType: "recommendation",
    dependencies: ["marketing.generate_content"],
  },
  "marketing.analyze_performance": {
    id: "marketing.analyze_performance", domain: "marketing",
    name: "Analizar rendimiento de campañas",
    descripcion: "Evalúa el rendimiento de campañas según métricas de alcance y conversión.",
    requiredEntities: ["campaign"],
    outputType: "metric",
    dependencies: [],
  },
  "marketing.measure_conversion": {
    id: "marketing.measure_conversion", domain: "marketing",
    name: "Medir conversión",
    descripcion: "Calcula la tasa de conversión de campañas activas.",
    requiredEntities: ["campaign", "customer"],
    outputType: "metric",
    dependencies: ["marketing.analyze_performance"],
  },

  // ── Producción ────────────────────────────────────────────────────────────

  "produccion.track_orders": {
    id: "produccion.track_orders", domain: "produccion",
    name: "Rastrear órdenes de producción",
    descripcion: "Lista y monitorea órdenes de producción activas con su avance.",
    requiredEntities: ["product"],
    outputType: "list",
    dependencies: [],
  },
  "produccion.detect_bottlenecks": {
    id: "produccion.detect_bottlenecks", domain: "produccion",
    name: "Detectar cuellos de botella",
    descripcion: "Identifica bloqueos y retrasos en las líneas de producción.",
    requiredEntities: ["product"],
    outputType: "alert",
    dependencies: ["produccion.track_orders"],
  },
  "produccion.analyze_efficiency": {
    id: "produccion.analyze_efficiency", domain: "produccion",
    name: "Analizar eficiencia productiva",
    descripcion: "Evalúa la eficiencia de líneas de producción contra la capacidad instalada.",
    requiredEntities: ["product"],
    outputType: "insight",
    dependencies: ["produccion.track_orders"],
  },

  // ── Conciliación ──────────────────────────────────────────────────────────

  "conciliacion.reconcile_movements": {
    id: "conciliacion.reconcile_movements", domain: "conciliacion",
    name: "Conciliar movimientos",
    descripcion: "Cruza movimientos bancarios contra recaudos y pagos registrados.",
    requiredEntities: ["bank_movement", "collection", "payment"],
    outputType: "report",
    dependencies: ["bancos.query_movements", "recaudos.track_income"],
  },
  "conciliacion.detect_exceptions": {
    id: "conciliacion.detect_exceptions", domain: "conciliacion",
    name: "Detectar excepciones de conciliación",
    descripcion: "Identifica movimientos que no pudieron ser conciliados automáticamente.",
    requiredEntities: ["bank_movement", "collection"],
    outputType: "alert",
    dependencies: ["conciliacion.reconcile_movements"],
  },
  "conciliacion.generate_close_report": {
    id: "conciliacion.generate_close_report", domain: "conciliacion",
    name: "Generar reporte de cierre",
    descripcion: "Produce el reporte de cierre del período contable tras la conciliación.",
    requiredEntities: ["bank_movement", "collection", "payment", "invoice"],
    outputType: "report",
    dependencies: ["conciliacion.reconcile_movements", "conciliacion.detect_exceptions"],
  },

  // ── Tareas ────────────────────────────────────────────────────────────────

  "tareas.track_open_tasks": {
    id: "tareas.track_open_tasks", domain: "tareas",
    name: "Rastrear tareas abiertas",
    descripcion: "Lista las tareas pendientes por usuario, agente o dominio.",
    requiredEntities: ["task"],
    outputType: "list",
    dependencies: [],
  },
  "tareas.detect_overdue": {
    id: "tareas.detect_overdue", domain: "tareas",
    name: "Detectar tareas vencidas",
    descripcion: "Identifica tareas cuya fecha límite fue superada sin completarse.",
    requiredEntities: ["task"],
    outputType: "alert",
    dependencies: ["tareas.track_open_tasks"],
  },
  "tareas.assign_priority": {
    id: "tareas.assign_priority", domain: "tareas",
    name: "Asignar prioridad de tareas",
    descripcion: "Ordena y clasifica tareas según urgencia, impacto y contexto operacional.",
    requiredEntities: ["task"],
    outputType: "recommendation",
    dependencies: ["tareas.track_open_tasks"],
  },

  // ── Alertas ───────────────────────────────────────────────────────────────

  "alertas.generate_alert": {
    id: "alertas.generate_alert", domain: "alertas",
    name: "Generar alerta",
    descripcion: "Crea una alerta operacional cuando se supera un umbral o condición.",
    requiredEntities: ["alert"],
    outputType: "alert",
    dependencies: [],
  },
  "alertas.prioritize": {
    id: "alertas.prioritize", domain: "alertas",
    name: "Priorizar alertas",
    descripcion: "Ordena alertas activas por severidad e impacto operacional.",
    requiredEntities: ["alert"],
    outputType: "list",
    dependencies: ["alertas.generate_alert"],
  },
  "alertas.notify": {
    id: "alertas.notify", domain: "alertas",
    name: "Notificar alertas",
    descripcion: "Envía notificaciones a los responsables correspondientes.",
    requiredEntities: ["alert", "task"],
    outputType: "recommendation",
    dependencies: ["alertas.prioritize"],
  },
};

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getCapability(id: CapabilityId): BusinessCapability {
  return BUSINESS_CAPABILITY_REGISTRY[id];
}

export function getCapabilitiesForDomain(domainId: DomainId): BusinessCapability[] {
  return Object.values(BUSINESS_CAPABILITY_REGISTRY).filter(c => c.domain === domainId);
}

export function getCapabilitiesRequiringEntity(entityId: EntityId): BusinessCapability[] {
  return Object.values(BUSINESS_CAPABILITY_REGISTRY).filter(c =>
    c.requiredEntities.includes(entityId)
  );
}
