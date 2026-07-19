/**
 * lib/copilot/knowledge/domain-registry.ts
 *
 * Agentik Knowledge Foundation — Domain Registry
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Canonical business domains of the Agentik platform.
 * ERP-agnostic and multi-tenant. No SAG, no Castillitos,
 * no hardcoded tenant data.
 *
 * Domains are the top-level conceptual groupings of business knowledge.
 * All agents, capabilities, and actions reference domains — never tables.
 */

// ── Domain ID union ────────────────────────────────────────────────────────────

export type DomainId =
  | "ventas"
  | "clientes"
  | "productos"
  | "inventario"
  | "compras"
  | "cartera"
  | "pagos"
  | "recaudos"
  | "bancos"
  | "marketing"
  | "produccion"
  | "conciliacion"
  | "tareas"
  | "alertas";

// ── Domain definition interface ────────────────────────────────────────────────

export interface DomainDefinition {
  id:          DomainId;
  nombre:      string;
  descripcion: string;
  objetivos:   string[];
  entidades:   string[];    // EntityId references — string to avoid circular import
  capacidades: string[];    // CapabilityId references
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const DOMAIN_REGISTRY: Record<DomainId, DomainDefinition> = {

  ventas: {
    id:          "ventas",
    nombre:      "Ventas",
    descripcion: "Gestión y análisis de transacciones comerciales de venta.",
    objetivos: [
      "Monitorear el volumen y valor de ventas por período.",
      "Identificar tendencias de demanda por producto, cliente y canal.",
      "Analizar el rendimiento de vendedores y equipos comerciales.",
      "Detectar oportunidades de crecimiento y riesgo de contracción.",
    ],
    entidades:   ["invoice", "sales_line", "customer", "product"],
    capacidades: [
      "ventas.analyze_performance",
      "ventas.detect_trends",
      "ventas.rank_products",
      "ventas.rank_customers",
    ],
  },

  clientes: {
    id:          "clientes",
    nombre:      "Clientes",
    descripcion: "Maestro de clientes con atributos comerciales y financieros.",
    objetivos: [
      "Mantener el registro canónico de clientes de la organización.",
      "Analizar el comportamiento de compra y pago por cliente.",
      "Identificar clientes de alto valor y clientes en riesgo.",
      "Soportar la segmentación comercial y financiera.",
    ],
    entidades:   ["customer"],
    capacidades: [
      "clientes.segment_by_value",
      "clientes.detect_churn_risk",
      "clientes.analyze_payment_behavior",
    ],
  },

  productos: {
    id:          "productos",
    nombre:      "Productos",
    descripcion: "Maestro de artículos con atributos comerciales, operativos y logísticos.",
    objetivos: [
      "Mantener el registro canónico de referencias de producto.",
      "Soportar la trazabilidad entre ventas, inventario y compras.",
      "Analizar el rendimiento comercial y financiero por referencia.",
      "Identificar productos con bajo margen o alta rotación.",
    ],
    entidades:   ["product"],
    capacidades: [
      "productos.analyze_margin",
      "productos.detect_low_rotation",
      "productos.cross_domain_traceability",
    ],
  },

  inventario: {
    id:          "inventario",
    nombre:      "Inventario",
    descripcion: "Saldos de existencias por referencia, variante y ubicación.",
    objetivos: [
      "Conocer el stock disponible en tiempo real por producto y bodega.",
      "Detectar quiebres de stock y situaciones de sobrestock.",
      "Calcular cobertura de inventario frente a la demanda histórica.",
      "Soportar decisiones de reabastecimiento y transferencias.",
    ],
    entidades:   ["inventory_position", "product"],
    capacidades: [
      "inventario.check_stock",
      "inventario.detect_stockout",
      "inventario.calculate_coverage",
      "inventario.flag_overstock",
    ],
  },

  compras: {
    id:          "compras",
    nombre:      "Compras",
    descripcion: "Órdenes de compra, recepciones y gestión de proveedores.",
    objetivos: [
      "Monitorear el estado de órdenes de compra activas.",
      "Detectar OC vencidas y proveedores con incumplimientos.",
      "Analizar cumplimiento de SLA por proveedor.",
      "Soportar la planificación de abastecimiento.",
    ],
    entidades:   ["purchase_order", "product"],
    capacidades: [
      "compras.track_open_orders",
      "compras.detect_overdue_orders",
      "compras.analyze_supplier_performance",
    ],
  },

  cartera: {
    id:          "cartera",
    nombre:      "Cartera",
    descripcion: "Documentos de cobro pendientes y análisis de envejecimiento.",
    objetivos: [
      "Conocer el saldo pendiente de cobro por cliente y antigüedad.",
      "Priorizar la gestión de cobros por impacto financiero.",
      "Detectar clientes con mora crítica y riesgo de incobrabilidad.",
      "Soportar la proyección de flujo de caja por cobros esperados.",
    ],
    entidades:   ["collection", "customer", "invoice"],
    capacidades: [
      "cartera.detect_overdue",
      "cartera.prioritize_collection",
      "cartera.calculate_aging",
      "cartera.project_cashflow",
    ],
  },

  pagos: {
    id:          "pagos",
    nombre:      "Pagos",
    descripcion: "Registros de pago aplicados a documentos de cartera.",
    objetivos: [
      "Registrar y consultar pagos recibidos de clientes.",
      "Validar la correcta aplicación de pagos a documentos.",
      "Analizar tendencias de comportamiento de pago.",
      "Detectar pagos pendientes de aplicar.",
    ],
    entidades:   ["payment", "invoice", "customer"],
    capacidades: [
      "pagos.track_payments",
      "pagos.detect_unapplied",
      "pagos.analyze_payment_patterns",
    ],
  },

  recaudos: {
    id:          "recaudos",
    nombre:      "Recaudos",
    descripcion: "Ingresos de caja registrados en el sistema de cartera.",
    objetivos: [
      "Registrar y consultar ingresos de caja y transferencias.",
      "Identificar recaudos sin conciliar con extracto bancario.",
      "Detectar recaudos reversados o con inconsistencias.",
      "Soportar el proceso de conciliación bancaria.",
    ],
    entidades:   ["collection", "bank_movement"],
    capacidades: [
      "recaudos.track_income",
      "recaudos.detect_unreconciled",
      "recaudos.validate_consistency",
    ],
  },

  bancos: {
    id:          "bancos",
    nombre:      "Bancos",
    descripcion: "Movimientos del extracto bancario por cuenta y entidad financiera.",
    objetivos: [
      "Consultar movimientos bancarios registrados en el sistema.",
      "Calcular el saldo disponible real por cuenta.",
      "Identificar movimientos bancarios sin conciliar.",
      "Soportar el proceso de conciliación automática y manual.",
    ],
    entidades:   ["bank_movement"],
    capacidades: [
      "bancos.query_movements",
      "bancos.calculate_balance",
      "bancos.detect_unreconciled",
      "bancos.support_reconciliation",
    ],
  },

  marketing: {
    id:          "marketing",
    nombre:      "Marketing",
    descripcion: "Campañas, contenidos y analítica de demanda.",
    objetivos: [
      "Gestionar campañas de marketing multicanal.",
      "Generar y distribuir contenido para canales digitales.",
      "Analizar el rendimiento de campañas y conversión.",
      "Identificar oportunidades de crecimiento de demanda.",
    ],
    entidades:   ["campaign", "marketing_asset", "customer"],
    capacidades: [
      "marketing.generate_content",
      "marketing.schedule_post",
      "marketing.analyze_performance",
      "marketing.measure_conversion",
    ],
  },

  produccion: {
    id:          "produccion",
    nombre:      "Producción",
    descripcion: "Órdenes de producción, capacidad y seguimiento de manufactura.",
    objetivos: [
      "Monitorear el estado de órdenes de producción activas.",
      "Detectar cuellos de botella y bloqueos en planta.",
      "Analizar la eficiencia de líneas de producción.",
      "Soportar la planificación de capacidad productiva.",
    ],
    entidades:   ["product", "inventory_position"],
    capacidades: [
      "produccion.track_orders",
      "produccion.detect_bottlenecks",
      "produccion.analyze_efficiency",
    ],
  },

  conciliacion: {
    id:          "conciliacion",
    nombre:      "Conciliación",
    descripcion: "Cruce y validación entre flujos financieros y operativos.",
    objetivos: [
      "Conciliar movimientos bancarios contra recaudos y pagos.",
      "Identificar y gestionar excepciones de conciliación.",
      "Generar el cierre contable del período.",
      "Garantizar la trazabilidad completa entre documentos financieros.",
    ],
    entidades:   ["bank_movement", "collection", "payment", "invoice"],
    capacidades: [
      "conciliacion.reconcile_movements",
      "conciliacion.detect_exceptions",
      "conciliacion.generate_close_report",
    ],
  },

  tareas: {
    id:          "tareas",
    nombre:      "Tareas",
    descripcion: "Gestión de tareas operativas y seguimiento de acuerdos.",
    objetivos: [
      "Registrar y gestionar tareas asignadas a equipos o agentes.",
      "Monitorear el estado y prioridad de tareas pendientes.",
      "Detectar tareas vencidas o sin responsable asignado.",
      "Soportar el seguimiento de acuerdos de reuniones operativas.",
    ],
    entidades:   ["task"],
    capacidades: [
      "tareas.track_open_tasks",
      "tareas.detect_overdue",
      "tareas.assign_priority",
    ],
  },

  alertas: {
    id:          "alertas",
    nombre:      "Alertas",
    descripcion: "Sistema de alertas operacionales basadas en umbrales y condiciones.",
    objetivos: [
      "Generar alertas automáticas cuando se superan umbrales definidos.",
      "Priorizar alertas por impacto operacional y financiero.",
      "Notificar a los responsables correspondientes.",
      "Registrar el historial de alertas y resoluciones.",
    ],
    entidades:   ["alert"],
    capacidades: [
      "alertas.generate_alert",
      "alertas.prioritize",
      "alertas.notify",
    ],
  },
};

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getDomain(id: DomainId): DomainDefinition {
  return DOMAIN_REGISTRY[id];
}

export function getAllDomains(): DomainDefinition[] {
  return Object.values(DOMAIN_REGISTRY);
}

export function getDomainsForEntities(entityIds: string[]): DomainDefinition[] {
  return getAllDomains().filter(d =>
    entityIds.some(e => d.entidades.includes(e))
  );
}
