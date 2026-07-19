/**
 * lib/operational-map/certification/core-kpi-governance-presets.ts
 *
 * Core KPI Governance Presets — 10 KPIs Núcleo.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Defines the complete operational governance metadata for the 10 core
 * KPIs of Agentik × Castillitos. These are the KPIs that will be presented
 * in SAG/DBA/business meetings and certified first.
 *
 * NO mocks. NO invented data. If a value is unknown, it is marked
 * explicitly as "pendiente validación" or left null.
 *
 * Keys match OPERATIONAL_KPI_REGISTRY entityKeys exactly.
 *
 * Sprint: AGENTIK-OPS-CERTIFICATION-CORE-10KPIS-01
 */

import type {
  KpiDependencyType,
  KpiCriticalityLevel,
} from "./operational-kpi-governance-types";
import type { KpiCertificationStatus } from "./operational-kpi-certification-types";

// ─── Preset shape ─────────────────────────────────────────────────────────────

export interface CoreKpiGovernancePreset {
  /** Matches entityKey in operational-kpi-registry.ts */
  kpiKey:              string;
  domain:              string;
  entityLabel:         string;

  /** Short operational definition for table display */
  kpiDefinition:       string;

  /** Business-level definition (3–5 sentences) */
  businessDefinition:  string;

  /** Symbolic formula expression */
  formulaExpression:   string;

  /** Plain-language formula explanation */
  formulaDescription:  string;

  /** Is the formula confirmed by business and DBA? */
  formulaStatus:       "confirmed" | "tentative" | "pending_business" | "pending_dba";

  dependencyType:      KpiDependencyType;
  criticality:         KpiCriticalityLevel;

  /** What SAG provides for this KPI */
  sagContributions:    string[];
  /** What Agentik computes for this KPI */
  agentikContributions: string[];

  priority:            "critical" | "high" | "medium" | "low";
  frequency:           "realtime" | "daily" | "weekly" | "monthly";

  /** Preset certification stage — reflects current actual state */
  certificationStatus: KpiCertificationStatus;

  /** DBA pending items */
  dbaPendingItems:     string[];

  /** AI copilot readiness description */
  aiCopilotReadiness:  string;
  aiReadinessActive:   boolean;

  /** Expected owners */
  ownerBusiness:  string;
  ownerTechnical: string;
  ownerSag:       string;
}

// ─── The 10 core KPI presets ──────────────────────────────────────────────────

export const CORE_KPI_GOVERNANCE_PRESETS: CoreKpiGovernancePreset[] = [

  // ── 1. Tasa de Cobertura de Inventario ─────────────────────────────────────
  {
    kpiKey:        "tasa_cobertura",
    domain:        "torre_control",
    entityLabel:   "Tasa de Cobertura de Inventario",
    kpiDefinition: "% de referencias activas con stock ≥ umbral mínimo operativo",

    businessDefinition:
      "Porcentaje de referencias activas que tienen stock suficiente para cubrir la demanda proyectada " +
      "de los próximos días según el ritmo de ventas reciente. Un valor bajo indica riesgo de " +
      "desabastecimiento operacional. Castillitos usa umbral de 7 días como mínimo operativo.",

    formulaExpression:
      "(COUNT(referencias WHERE dias_cobertura >= umbral_min) / COUNT(total_referencias_activas)) * 100",

    formulaDescription:
      "Cuenta las referencias cuyo stock actual cubre al menos el umbral mínimo operativo " +
      "(7 días de demanda promedio). Numerador: referencias OK. Denominador: total de referencias " +
      "activas con movimiento en los últimos 90 días. Umbral pendiente validación negocio.",

    formulaStatus:       "pending_dba",
    dependencyType:      "HYBRID",
    criticality:         "CRITICAL",

    sagContributions: [
      "Stock físico por referencia (quantityOnHand) — tabla SAG INVENTARIO pendiente confirmar",
      "Catálogo de referencias activas — tabla SAG ARTICULOS",
      "Movimientos de inventario recientes — para calcular velocidad",
    ],
    agentikContributions: [
      "Cálculo de velocidad de venta promedio 30 días (CommercialCoverageSnapshot)",
      "Aplicación del umbral mínimo operativo (configurable por tenant)",
      "Score de cobertura 0–100 por referencia",
      "Generación de alertas de quiebre inminente",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "reviewing",

    dbaPendingItems: [
      "Confirmar nombre de tabla SAG de inventario físico (INVSALDO o equivalente)",
      "Confirmar campo de cantidad disponible (CANTIDAD, SALDO, EXISTENCIA)",
      "Confirmar tabla SAG ARTICULOS y campo de estado activo/inactivo",
    ],

    aiCopilotReadiness:
      "Cuando SAG inventario esté certificado, Copilot explicará variaciones de cobertura, " +
      "identificará referencias en riesgo y recomendará órdenes de reposición automáticas.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Comercial",
    ownerTechnical: "Agentik — Módulo Inventario",
    ownerSag:       "DBA SAG Castillitos — pendiente asignar",
  },

  // ── 2. Cartera Vencida Total ───────────────────────────────────────────────
  {
    kpiKey:        "cartera_vencida_total",
    domain:        "torre_control",
    entityLabel:   "Cartera Vencida Total",
    kpiDefinition: "Suma de saldos de documentos vencidos de todos los clientes activos",

    businessDefinition:
      "Suma total de saldos de documentos comerciales (facturas FV, notas débito ND) que ya " +
      "superaron su fecha de vencimiento acordada. Indica el nivel de riesgo crediticio acumulado " +
      "y la efectividad histórica del proceso de cobranza. Un incremento sostenido es señal de " +
      "deterioro en la calidad de la cartera.",

    formulaExpression:
      "SUM(saldo_pendiente) WHERE fecha_vencimiento < CURRENT_DATE AND saldo_pendiente > 0 AND tipo_doc IN ('FV', 'ND')",

    formulaDescription:
      "Suma de saldos pendientes de todos los documentos tipo FV (factura de venta) y ND " +
      "(nota débito) cuya fecha de vencimiento ya pasó. " +
      "Tabla confirmada: CXCCXC (cartera por cobrar). " +
      "Campos pendientes de confirmar: nombre exacto de fecha_vencimiento y saldo_pendiente " +
      "en la instancia Castillitos.",

    formulaStatus:       "pending_dba",
    dependencyType:      "SAG_ONLY",
    criticality:         "CRITICAL",

    sagContributions: [
      "Tabla CXCCXC — cartera por cobrar (confirmada en auditoría SAG)",
      "Campo fecha_vencimiento — pendiente confirmar nombre exacto con DBA",
      "Campo saldo_pendiente / valor_saldo — pendiente confirmar nombre exacto",
      "Campo nit_cliente para agrupación por cliente",
      "Tipos de documento: FV (factura venta), ND (nota débito)",
    ],
    agentikContributions: [
      "Clasificación automática por tramo de mora (0-30, 31-60, 61-90, >90 días)",
      "Score de riesgo de mora por cliente (KPI 9)",
      "Alertas automáticas de cobranza por umbral de saldo vencido",
      "Integración con módulo de Cobranza para generación de tickets",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "reviewing",

    dbaPendingItems: [
      "Confirmar nombre del campo fecha_vencimiento en CXCCXC instancia Castillitos",
      "Confirmar nombre del campo saldo_pendiente / valor_saldo en CXCCXC",
      "Confirmar manejo de moneda (COP — sin conversión requerida)",
      "Confirmar filtro para excluir notas crédito y anticipos",
    ],

    aiCopilotReadiness:
      "Parcialmente activo. Copilot puede responder preguntas sobre cartera vencida por cliente " +
      "y tramo de mora. Precisión mejora cuando campos de fecha sean validados por DBA.",
    aiReadinessActive: true,

    ownerBusiness:  "Gerencia Financiera / Cobranza",
    ownerTechnical: "Agentik — Adaptador SAG CARTERA",
    ownerSag:       "DBA SAG Castillitos — CXCCXC",
  },

  // ── 3. Recaudos del Día ────────────────────────────────────────────────────
  {
    kpiKey:        "recaudos_dia",
    domain:        "torre_control",
    entityLabel:   "Recaudos del Día",
    kpiDefinition: "Suma de pagos recibidos y aplicados a cartera en el día actual",

    businessDefinition:
      "Suma total de pagos efectivamente recibidos y aplicados a documentos de cartera en el " +
      "día actual. Refleja la efectividad diaria del proceso de cobro y alimenta directamente " +
      "el cálculo de liquidez operativa. Se mide en COP.",

    formulaExpression:
      "SUM(valor_recaudo) WHERE fecha_aplicacion = CURRENT_DATE AND tipo_movimiento IN ('RC', 'PA', 'AB')",

    formulaDescription:
      "Suma de movimientos de cartera de tipo RC (recaudo), PA (pago) o AB (abono) " +
      "aplicados en la fecha actual. Los códigos exactos de tipo_movimiento deben ser " +
      "confirmados con DBA SAG Castillitos. Tabla fuente: CXCCXC o tabla de movimientos " +
      "de cartera (nombre pendiente de confirmar).",

    formulaStatus:       "pending_dba",
    dependencyType:      "SAG_ONLY",
    criticality:         "CRITICAL",

    sagContributions: [
      "Tabla de movimientos de cartera SAG — nombre exacto pendiente confirmar",
      "Campo tipo_movimiento con códigos RC (recaudo) / PA (pago) — pendiente confirmar",
      "Campo fecha_aplicacion para filtrar día actual",
      "Campo valor_recaudo / valor_movimiento",
    ],
    agentikContributions: [
      "Comparación automática vs objetivo diario de recaudos",
      "Alertas de cumplimiento / desviación vs meta",
      "Proyección mensual de recaudos basada en tendencia",
      "Desglose por representante y cliente",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "reviewing",

    dbaPendingItems: [
      "Confirmar nombre de tabla de movimientos de cartera (¿CXMMOV, CXCMOV o equivalente?)",
      "Confirmar códigos de tipo_movimiento para recaudos (RC, PA, AB u otros)",
      "Confirmar campo de fecha de aplicación vs fecha de registro",
      "Confirmar si aplican notas crédito como recaudo negativo",
    ],

    aiCopilotReadiness:
      "Copilot puede explicar nivel de cumplimiento de recaudos del día vs objetivo " +
      "y alertar sobre desvíos cuando la fuente SAG esté validada por DBA.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Financiera / Tesorería",
    ownerTechnical: "Agentik — Adaptador SAG CARTERA",
    ownerSag:       "DBA SAG Castillitos — tabla movimientos cartera",
  },

  // ── 4. Liquidez Operativa del Día ──────────────────────────────────────────
  {
    kpiKey:        "liquidez_operativa_dia",
    domain:        "torre_control",
    entityLabel:   "Liquidez Operativa del Día",
    kpiDefinition: "Efectivo disponible estimado al cierre del día",

    businessDefinition:
      "Estimación del efectivo disponible al cierre del día operativo. Combina el saldo " +
      "bancario de apertura con los recaudos del día menos los egresos ejecutados o programados. " +
      "Es crítico para decisiones de pago a proveedores y gestión de compromisos de caja. " +
      "Actualmente bloqueado por falta de integración bancaria.",

    formulaExpression:
      "saldo_banco_apertura + recaudos_dia - egresos_dia_ejecutados",

    formulaDescription:
      "Saldo inicial de cuentas bancarias (extracto bancario) más recaudos aplicados hoy " +
      "(SAG CARTERA) menos pagos ejecutados hoy (SAG CUENTAS POR PAGAR o banco). " +
      "BLOQUEADO: saldo_banco_apertura y egresos_dia requieren integración bancaria activa " +
      "o carga manual de extractos.",

    formulaStatus:       "pending_business",
    dependencyType:      "HYBRID",
    criticality:         "CRITICAL",

    sagContributions: [
      "Recaudos del día desde SAG CARTERA (KPI 3 — parcialmente disponible)",
      "Egresos / pagos a proveedores desde SAG CUENTAS POR PAGAR — pendiente confirmar tabla",
    ],
    agentikContributions: [
      "Saldo bancario — BLOQUEADO: requiere conector bancario o carga manual",
      "Consolidación de liquidez neta multi-cuenta",
      "Alertas automáticas de saldo mínimo operativo",
      "Proyección intradiaria de liquidez",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "blocked",

    dbaPendingItems: [
      "Integración bancaria: extracto o API Open Banking — BLOQUEADOR PRINCIPAL",
      "Confirmar tabla SAG CUENTAS POR PAGAR para egresos programados",
      "Definir SLA de actualización del extracto bancario con negocio",
    ],

    aiCopilotReadiness:
      "Disponible cuando se integre conector bancario. Copilot alertará sobre riesgos " +
      "de liquidez intradiaria y compromisos de pago vs disponibilidad real.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Financiera / Tesorería",
    ownerTechnical: "Agentik — Módulo Tesorería",
    ownerSag:       "N/A — requiere integración bancaria externa",
  },

  // ── 5. Pedidos Pendientes de Despacho ─────────────────────────────────────
  {
    kpiKey:        "pedidos_pendientes_despacho",
    domain:        "torre_control",
    entityLabel:   "Pedidos Pendientes de Despacho",
    kpiDefinition: "Pedidos aprobados sin remisión de despacho emitida",

    businessDefinition:
      "Conteo y valor total de pedidos que han sido confirmados y aprobados en SAG pero " +
      "aún no tienen remisión de despacho emitida. Indica la carga operativa pendiente del " +
      "área de logística y permite identificar cuellos de botella en el proceso de despacho.",

    formulaExpression:
      "COUNT(pedidos) WHERE estado_pedido = 'aprobado' AND estado_despacho IN ('pendiente', 'en_preparacion')",

    formulaDescription:
      "Conteo de documentos tipo PD (pedido) con estado aprobado y sin remisión emitida. " +
      "Los nombres de tabla, campo de estado y valores exactos del enum de estado " +
      "deben ser confirmados con DBA SAG. Tabla SAG probable: DOCPED, PEDIDOS o " +
      "equivalente en la configuración Castillitos.",

    formulaStatus:       "pending_dba",
    dependencyType:      "SAG_ONLY",
    criticality:         "OPERATIONAL",

    sagContributions: [
      "Tabla SAG PEDIDOS (DOCPED o equivalente) — nombre pendiente confirmar con DBA",
      "Campo estado_pedido — valores pendiente confirmar (¿'AP', 'PD', 'EN' u otros?)",
      "Campo estado_despacho — pendiente confirmar si existe o se infiere de ausencia de remisión",
      "Campo valor_pedido, fecha_pedido, nit_cliente",
    ],
    agentikContributions: [
      "Priorización de despachos por antigüedad de pedido",
      "Alertas de pedidos con más de N días sin despachar",
      "Agrupación por representante y zona",
      "Estimación de tiempo de despacho pendiente",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "draft",

    dbaPendingItems: [
      "Confirmar nombre de tabla SAG para pedidos (¿DOCPED, PEDIDOS, FAPED?)",
      "Confirmar estados posibles del campo estado_pedido",
      "Confirmar si el estado 'pendiente de despacho' es un estado explícito o se infiere",
      "Confirmar relación entre tabla de pedidos y tabla de remisiones",
    ],

    aiCopilotReadiness:
      "Disponible cuando SAG PEDIDOS esté conectado. Copilot priorizará despachos " +
      "automáticamente, alertará sobre pedidos bloqueados y estimará backlog logístico.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Logística / Despachos",
    ownerTechnical: "Agentik — Módulo Logística",
    ownerSag:       "DBA SAG Castillitos — tabla DOCPED o equivalente",
  },

  // ── 6. Ventas del Día ─────────────────────────────────────────────────────
  {
    kpiKey:        "ventas_dia_fuente1",
    domain:        "torre_control",
    entityLabel:   "Ventas del Día",
    kpiDefinition: "Valor neto facturado (FUENTE_1) en el día actual",

    businessDefinition:
      "Valor total de ventas facturadas con documentos tipo FV (factura de venta) de " +
      "FUENTE_1 emitidos en el día actual. Es el KPI comercial primario de seguimiento " +
      "diario. FUENTE_1 corresponde a las facturas de venta directa (no remisiones). " +
      "Se mide en COP sin IVA.",

    formulaExpression:
      "SUM(valor_neto) WHERE tipo_doc = 'FV' AND fuente = 'FUENTE_1' AND fecha_factura = CURRENT_DATE",

    formulaDescription:
      "Suma del valor neto (base gravable, sin IVA) de facturas de venta tipo FV " +
      "con clasificación FUENTE_1 emitidas en la fecha actual. " +
      "El campo 'fuente' o equivalente (k_sc_codigo_fuente) debe ser confirmado con DBA. " +
      "Tabla probable: FAENCFAC o equivalente para encabezados de factura.",

    formulaStatus:       "pending_dba",
    dependencyType:      "SAG_ONLY",
    criticality:         "CRITICAL",

    sagContributions: [
      "Tabla FAENCFAC (encabezado factura) — nombre pendiente confirmar con DBA",
      "Campo tipo_documento con valor 'FV' (factura de venta)",
      "Campo k_sc_codigo_fuente con valor FUENTE_1 — pendiente confirmar",
      "Campo valor_neto / base_gravable (sin IVA)",
      "Campo fecha_factura para filtrar día actual",
    ],
    agentikContributions: [
      "Comparación automática vs objetivo de ventas diario",
      "Desglose de ventas por representante, zona y línea de producto",
      "Alertas de incumplimiento de metas comerciales",
      "Proyección de cierre mensual basada en tendencia diaria",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "draft",

    dbaPendingItems: [
      "Confirmar nombre de tabla SAG para encabezados de factura (¿FAENCFAC?)",
      "Confirmar campo y valor para identificar FUENTE_1 (k_sc_codigo_fuente = 'FV' u otro)",
      "Confirmar campo de valor neto sin IVA",
      "Confirmar campo de fecha de emisión de factura",
    ],

    aiCopilotReadiness:
      "Copilot analizará rendimiento de ventas vs objetivo, identificará representantes " +
      "con bajo cumplimiento y proyectará cierre mensual cuando ODBC FACTURAS esté activo.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Comercial",
    ownerTechnical: "Agentik — ODBC V2 FACTURAS",
    ownerSag:       "DBA SAG Castillitos — FAENCFAC o equivalente",
  },

  // ── 7. Disponible en Banco Hoy ─────────────────────────────────────────────
  {
    kpiKey:        "disponible_banco_hoy",
    domain:        "tesoreria",
    entityLabel:   "Disponible en Banco Hoy",
    kpiDefinition: "Saldo real disponible en todas las cuentas bancarias activas",

    businessDefinition:
      "Saldo real disponible en todas las cuentas bancarias de la empresa al momento de " +
      "la consulta. Es la base para decisiones de pago a proveedores, compromisos de caja " +
      "y gestión de tesorería diaria. Requiere integración directa con el banco o carga " +
      "manual de extractos. Actualmente desconectado.",

    formulaExpression:
      "SUM(saldo_disponible) FROM cuentas_bancarias WHERE activa = true AND fecha = CURRENT_DATE",

    formulaDescription:
      "Suma de saldos disponibles (no retenidos) en todas las cuentas bancarias activas " +
      "de la empresa. Requiere extracto bancario diario o integración via API bancaria. " +
      "SAG no provee datos bancarios directamente — fuente es externa.",

    formulaStatus:       "pending_business",
    dependencyType:      "EXTERNAL",
    criticality:         "CRITICAL",

    sagContributions: [
      "SAG no provee saldos bancarios directamente",
      "SAG CUENTAS POR PAGAR puede informar compromisos de pago pendientes",
    ],
    agentikContributions: [
      "Consolidación de saldos multi-cuenta bancaria",
      "BLOQUEADO: requiere integración bancaria (API o extracto manual)",
      "Alertas de saldo mínimo operativo",
      "Proyección de disponibilidad con base en pagos programados",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "blocked",

    dbaPendingItems: [
      "Integración bancaria (Open Banking API o carga manual diaria de extractos) — BLOQUEADOR",
      "Definir formato de extracto bancario para carga manual como alternativa",
      "Confirmar qué cuentas bancarias incluir en el consolidado",
    ],

    aiCopilotReadiness:
      "Disponible cuando se integre conector bancario. Copilot gestionará alertas de " +
      "saldo mínimo, conflictos con compromisos de pago y recomendaciones de flujo de caja.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Financiera / Tesorería",
    ownerTechnical: "Agentik — Módulo Tesorería",
    ownerSag:       "N/A — fuente externa (banco)",
  },

  // ── 8. Disponibilidad Operacional por Referencia ───────────────────────────
  {
    kpiKey:        "disponibilidad_ref",
    domain:        "comercial",
    entityLabel:   "Disponibilidad Operacional por Referencia",
    kpiDefinition: "Cantidad neta disponible para vender por SKU (fórmula Agentik nativa)",

    businessDefinition:
      "Cantidad real disponible para vender de cada referencia, calculada como stock " +
      "físico menos reservas activas, asignaciones de ventas en curso y transferencias " +
      "pendientes. Fórmula nativa de Agentik activa en producción. Inputs de stock " +
      "físico provenientes de carga manual SAG.",

    formulaExpression:
      "operationalAvailableQty = physicalQty - reservedQty - salesAssigned - pendingTransfers",

    formulaDescription:
      "Fórmula Agentik nativa implementada en OperationalInventoryItem. " +
      "physicalQty = stock físico (desde carga manual SAG). " +
      "reservedQty = reservas activas en el sistema. " +
      "salesAssigned = unidades asignadas a pedidos activos no despachados. " +
      "pendingTransfers = unidades en tránsito entre bodegas.",

    formulaStatus:       "confirmed",
    dependencyType:      "HYBRID",
    criticality:         "OPERATIONAL",

    sagContributions: [
      "Stock físico por referencia (physicalQty) — carga manual actual, ODBC SAG pendiente",
      "Transferencias entre bodegas (movimientos de inventario)",
    ],
    agentikContributions: [
      "Modelo OperationalInventoryItem — ACTIVO en producción",
      "Cálculo de operationalAvailableQty — fórmula certificada",
      "Gestión de reservas y asignaciones de ventas",
      "Sincronización y actualización en tiempo real (post-carga manual)",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "technical_validated",

    dbaPendingItems: [
      "Automatizar sync de stock físico desde SAG (reemplazar carga manual actual)",
      "Confirmar tabla SAG de inventario para ODBC automático",
      "Validar consistencia de physicalQty entre SAG y OperationalInventoryItem",
    ],

    aiCopilotReadiness:
      "ACTIVO. Copilot puede responder preguntas sobre disponibilidad por referencia, " +
      "señalar referencias con quiebre inminente y recomendar reposiciones prioritarias.",
    aiReadinessActive: true,

    ownerBusiness:  "Gerencia Comercial / Operaciones",
    ownerTechnical: "Agentik — OperationalInventoryItem",
    ownerSag:       "DBA SAG Castillitos — tabla inventario para ODBC V2",
  },

  // ── 9. Score de Riesgo de Mora ─────────────────────────────────────────────
  {
    kpiKey:        "score_riesgo_mora",
    domain:        "torre_control",
    entityLabel:   "Score de Riesgo de Mora",
    kpiDefinition: "Score 0–100 de riesgo de mora por cliente (motor Agentik)",

    businessDefinition:
      "Score 0–100 por cliente que indica la probabilidad de que un saldo vencido no sea " +
      "recuperado en el corto plazo. Alimenta las decisiones automáticas de bloqueo de " +
      "crédito, priorización de cobranza y alertas a representantes. Score > 70 = riesgo " +
      "alto. Score calculado por motor Agentik sobre inputs de SAG CARTERA.",

    formulaExpression:
      "score = f(dias_mora_promedio, pct_cartera_vencida, frecuencia_pagos_90d, monto_total_deuda)",

    formulaDescription:
      "Función de scoring Agentik con 4 inputs desde SAG CARTERA: " +
      "(1) días promedio de mora en documentos vencidos, " +
      "(2) % cartera vencida sobre cartera total del cliente, " +
      "(3) frecuencia de pagos en los últimos 90 días, " +
      "(4) monto total de deuda activa. " +
      "Pesos de ponderación pendientes de validación y aprobación con área de cobranza.",

    formulaStatus:       "pending_business",
    dependencyType:      "HYBRID",
    criticality:         "OPERATIONAL",

    sagContributions: [
      "Saldo vencido y no vencido por cliente (CXCCXC — tabla confirmada)",
      "Historial de recaudos por cliente (movimientos cartera)",
      "Monto total de deuda activa por cliente",
    ],
    agentikContributions: [
      "Motor de scoring heurístico/ML — ACTIVO (parcial, inputs SAG no 100% validados)",
      "Ponderación de factores de riesgo (pendiente validación negocio)",
      "Umbral de bloqueo automático de crédito (configurable)",
      "Alertas de clientes que cruzan umbral de riesgo alto",
    ],

    priority:  "high",
    frequency: "daily",
    certificationStatus: "reviewing",

    dbaPendingItems: [
      "Confirmar campos de fecha_vencimiento y saldo en CXCCXC (ver también KPI 2)",
      "Confirmar tabla de movimientos de recaudos para historial de pagos (ver también KPI 3)",
      "Validar que los inputs de SAG cubren el universo completo de clientes activos",
    ],

    aiCopilotReadiness:
      "Parcialmente activo. Copilot puede explicar el score de un cliente específico, " +
      "listar clientes en riesgo alto y sugerir acciones de cobranza prioritarias. " +
      "Precisión mejora cuando inputs SAG sean validados al 100%.",
    aiReadinessActive: true,

    ownerBusiness:  "Gerencia Cobranza / Cartera",
    ownerTechnical: "Agentik — Motor de scoring",
    ownerSag:       "DBA SAG Castillitos — CXCCXC + tabla movimientos",
  },

  // ── 10. Pedidos Retenidos por Cartera ──────────────────────────────────────
  {
    kpiKey:        "pedidos_retenidos_cartera",
    domain:        "comercial",
    entityLabel:   "Pedidos Retenidos por Cartera",
    kpiDefinition: "Pedidos bloqueados por límite de crédito o cartera vencida del cliente",

    businessDefinition:
      "Pedidos que han sido bloqueados automáticamente porque el cliente tiene cartera " +
      "vencida que supera el límite de crédito autorizado o el umbral de retención. " +
      "Refleja el impacto financiero directo de la cartera vencida sobre las ventas " +
      "operativas. Cada pedido retenido es una venta en riesgo.",

    formulaExpression:
      "COUNT(pedidos) WHERE estado_retencion_cartera = true AND estado_pedido != 'anulado'",

    formulaDescription:
      "Conteo de pedidos con flag de retención por cartera activo y en estado no anulado. " +
      "El flag puede ser asignado por SAG (regla de límite de crédito) o por Agentik " +
      "(regla de cartera vencida). Pendiente confirmar si existe campo explícito de " +
      "retención en SAG PEDIDOS o si se debe inferir del estado del pedido.",

    formulaStatus:       "pending_dba",
    dependencyType:      "HYBRID",
    criticality:         "OPERATIONAL",

    sagContributions: [
      "SAG PEDIDOS: estado de retención por cartera — campo pendiente confirmar con DBA",
      "SAG CARTERA: límite de crédito autorizado por cliente",
      "SAG CARTERA: saldo vencido del cliente al momento del pedido",
    ],
    agentikContributions: [
      "Regla de bloqueo automático por cartera vencida (configurable por tenant)",
      "Alertas en tiempo real a representantes sobre pedidos retenidos",
      "Notificaciones automáticas a área de cartera para gestión de liberación",
      "Historial de retenciones por cliente",
    ],

    priority:  "critical",
    frequency: "daily",
    certificationStatus: "draft",

    dbaPendingItems: [
      "Confirmar si SAG tiene campo explícito de retención por cartera en tabla de pedidos",
      "Confirmar cómo se registra el límite de crédito por cliente en SAG",
      "Confirmar relación entre tabla pedidos y tabla de límites de crédito",
    ],

    aiCopilotReadiness:
      "Disponible cuando SAG PEDIDOS esté conectado. Copilot gestionará alertas de " +
      "retención en tiempo real, notificará al área de cartera y asistirá en la " +
      "liberación controlada de pedidos.",
    aiReadinessActive: false,

    ownerBusiness:  "Gerencia Comercial + Cobranza (doble ownership)",
    ownerTechnical: "Agentik — Reglas de crédito",
    ownerSag:       "DBA SAG Castillitos — tabla PEDIDOS + tabla límites crédito",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const CORE_KPI_KEYS = new Set(CORE_KPI_GOVERNANCE_PRESETS.map(p => p.kpiKey));

export function getCoreKpiPreset(kpiKey: string): CoreKpiGovernancePreset | null {
  return CORE_KPI_GOVERNANCE_PRESETS.find(p => p.kpiKey === kpiKey) ?? null;
}

// ─── Certification status display ─────────────────────────────────────────────

export const CERT_STATUS_DISPLAY: Record<KpiCertificationStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:               { label: "Pendiente de revisión",    color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
  reviewing:           { label: "En revisión",              color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  technical_validated: { label: "Validado técnicamente",    color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  business_validated:  { label: "Validado operativamente",  color: "#065f46", bg: "#ecfdf5", border: "#a7f3d0" },
  sag_validated:       { label: "Validado por SAG",         color: "#1e40af", bg: "#eff6ff", border: "#93c5fd" },
  certified:           { label: "Certificado",              color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  production_ready:    { label: "En producción",            color: "#14532d", bg: "#dcfce7", border: "#86efac" },
  blocked:             { label: "Requiere acceso adicional", color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
  deprecated:          { label: "Fuera de uso",             color: "#6b7280", bg: "#f3f4f6", border: "#d1d5db" },
};

export const FORMULA_STATUS_DISPLAY: Record<CoreKpiGovernancePreset["formulaStatus"], { label: string; color: string }> = {
  confirmed:        { label: "Confirmada",                    color: "#166534" },
  tentative:        { label: "Tentativa",                     color: "#92400e" },
  pending_business: { label: "Requiere validación operativa", color: "#1d4ed8" },
  pending_dba:      { label: "Requiere validación técnica",   color: "#7c2d92" },
};
