/**
 * lib/operational-map/operational-source-map.ts
 *
 * Agentik Operational Source Map — Structured Config Layer
 *
 * ─── PURPOSE ──────────────────────────────────────────────────────────────────
 * Machine-readable version of docs/architecture/agentik-operational-source-map.md.
 *
 * Designed for reuse in:
 *   - Onboarding wizards (which fields need SAG validation?)
 *   - Copilot knowledge base (what does each entity mean?)
 *   - Integration diagnostics (which flows are live vs. pending?)
 *   - SAG validation forms (generate checklist for tech meeting)
 *   - Dashboard metadata (KPI provenance badges)
 *   - Connector health checks (is the source data current?)
 *   - Tenant setup workflows
 *
 * ─── STATUS VALUES ────────────────────────────────────────────────────────────
 *   confirmed        — data flow verified and working
 *   pending_sag      — SAG field/table/behavior needs validation in tech meeting
 *   interno_agentik  — entirely within Agentik, no SAG dependency
 *   crm              — sourced from CRM connector
 *   futuro           — planned, not yet implemented
 *
 * ─── PRIORITY VALUES ──────────────────────────────────────────────────────────
 *   critical — blocks operation if data is absent or stale
 *   high     — daily operational impact
 *   medium   — intelligence / analytics value
 *   low      — enrichment / nice-to-have
 *
 * ─── SAG_CONFIRMAR ────────────────────────────────────────────────────────────
 * Any possibleSources entry of "SAG_CONFIRMAR" means the SAG table name,
 * field name, or WHERE behavior has NOT been validated with the Castillitos
 * SAG PYA instance. Must be confirmed before ODBC V2 connector is built.
 *
 * Sprint: AGENTIK-OPERATIONAL-SOURCE-MAP-01
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

export type OperationalSourceStatus =
  | "confirmed"
  | "pending_sag"
  | "interno_agentik"
  | "crm"
  | "futuro";

export type OperationalSourcePriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type OperationalSourceOfTruth =
  | "SAG"          // SAG PYA ERP is the legal/fiscal/physical truth
  | "Agentik"      // Agentik computes and owns this entity
  | "CRM"          // CRM connector is the source
  | "Banco"        // Bank statement is the source
  | "SAG+Agentik"; // Hybrid: SAG provides raw data, Agentik augments

export type OperationalFrequency =
  | "realtime"
  | "5m"
  | "15m"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "on_demand"
  | "event_driven"
  | "manual"
  | "static";

export type OperationalDomainKey =
  | "torre_control"
  | "comercial"
  | "inventario"
  | "produccion"
  | "cartera"
  | "cobranza"
  | "tesoreria"
  | "finanzas"
  | "crm_pedidos"
  | "customer_360"
  | "logistica"
  | "inteligencia_operacional"
  | "conciliacion";

// ─── Entity definition ────────────────────────────────────────────────────────

export interface OperationalSourceEntity {
  /** Unique machine key for this entity within its domain */
  key:                string;
  /** Human-readable label (Spanish, enterprise tone) */
  label:              string;
  /** Precise operational definition — what this number means and why it matters */
  definition:         string;
  /** The event or record that originates this data */
  eventOrigin:        string;
  /** Which system is the source of truth for this entity */
  sourceOfTruth:      OperationalSourceOfTruth;
  /**
   * Possible SAG sources. Use "SAG_CONFIRMAR" for fields not yet validated
   * with the Castillitos SAG PYA instance.
   */
  possibleSources:    string[];
  /** Agentik Prisma model(s) that store or compute this entity */
  agentikModels:      string[];
  /** How often this data must be refreshed for operational use */
  frequency:          OperationalFrequency;
  /** Operational impact of stale or missing data */
  priority:           OperationalSourcePriority;
  /** Which Agentik domains/modules consume this entity */
  consumedBy:         OperationalDomainKey[];
  /** True if Agentik generates/computes this entity (false = Agentik only imports) */
  generatedByAgentik: boolean;
  /** Implementation and data flow status */
  status:             OperationalSourceStatus;
  /** Validation questions to bring to the SAG technical meeting */
  sagValidationQuestions?: string[];
}

export interface OperationalSourceDomain {
  key:         OperationalDomainKey;
  label:       string;
  description: string;
  /** Which SAG tables this domain reads from (partial — SAG_CONFIRMAR for unverified) */
  sagTables:   string[];
  entities:    OperationalSourceEntity[];
}

// ─── Source map ───────────────────────────────────────────────────────────────

export const OPERATIONAL_SOURCE_MAP: OperationalSourceDomain[] = [

  // ── D01 — Torre de Control ────────────────────────────────────────────────
  {
    key:         "torre_control",
    label:       "Torre de Control",
    description: "Agregado maestro del estado operacional del negocio. Composición pura de Agentik sobre todos los demás dominios.",
    sagTables:   [],
    entities: [
      {
        key:                "operational_health_score",
        label:              "Estado operacional global",
        definition:         "Semáforo 0–100 que sintetiza la salud operacional del negocio: inventario, cartera, conciliación, producción. Calculado por FinancialRuntimeSnapshot.",
        eventOrigin:        "FinancialRuntimeSnapshot (generado por motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["FinancialRuntimeSnapshot"],
        frequency:          "15m",
        priority:           "critical",
        consumedBy:         ["torre_control", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "active_alerts",
        label:              "Alertas operacionales activas",
        definition:         "Lista de BusinessAlert y CopilotSignalRecord activos con severidad (critical/warning/info) y acción sugerida.",
        eventOrigin:        "BusinessAlert, CopilotSignalRecord",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["BusinessAlert", "CopilotSignalRecord"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["torre_control", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "reconciliation_health",
        label:              "Salud de conciliación",
        definition:         "% de movimientos bancarios conciliados contra registros SAG. 100% = todos los movimientos tienen contrapartida.",
        eventOrigin:        "FinancialRuntimeSnapshot.reconciliationHealth",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["FinancialRuntimeSnapshot", "BankReconciliation"],
        frequency:          "15m",
        priority:           "high",
        consumedBy:         ["torre_control", "finanzas", "tesoreria"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
    ],
  },

  // ── D02 — Comercial / Coberturas ──────────────────────────────────────────
  {
    key:         "comercial",
    label:       "Comercial / Coberturas",
    description: "Portafolio de venta por vendedor, cobertura de referencias, presión operacional y señales de producción.",
    sagTables:   ["INVENTARIO (pending)", "DOCUMENTOS (placeholder)"],
    entities: [
      {
        key:                "vendor_bag",
        label:              "Portafolio de venta por vendedor",
        definition:         "Bag asignada a un vendedor con un set de referencias, cantidades comprometidas, mínimas e ideales para una temporada.",
        eventOrigin:        "VendorCommercialBag creado por coordinador en Agentik",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["VendorCommercialBag", "VendorBagItem"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["comercial", "inventario", "produccion", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "coverage_snapshot",
        label:              "Snapshot de cobertura por referencia",
        definition:         "Estado de disponibilidad de cada referencia en el momento del snapshot. Base para calcular presión y construir portafolios.",
        eventOrigin:        "CommercialCoverageSnapshot ← SAG INVENTARIO sync",
        sourceOfTruth:      "SAG+Agentik",
        possibleSources:    ["SELECT * FROM INVENTARIO — tabla SAG_CONFIRMAR, campo SALDO/EXISTENCIA SAG_CONFIRMAR"],
        agentikModels:      ["CommercialCoverageSnapshot"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["comercial", "inventario", "produccion", "inteligencia_operacional"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿Nombre real de la tabla de inventario: INVENTARIO, SALDOS, EXISTENCIAS?",
          "¿Campo de saldo disponible: SALDO, EXISTENCIA, CANTIDAD?",
          "¿El disponible SAG descuenta PD autorizados en Castillitos?",
          "¿Existe FECHA_MODIFICACION para sync incremental?",
        ],
      },
      {
        key:                "operational_reservation",
        label:              "Reserva operacional",
        definition:         "Bloqueo de unidades en Agentik para un pedido o portafolio confirmado, antes de que SAG registre el PD. Reduce disponibilidad operacional.",
        eventOrigin:        "OperationalReservation creada por CRM bridge o coordinador",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["OperationalReservation", "OperationalReservationEvent"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["comercial", "inventario", "crm_pedidos"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "production_signal",
        label:              "Señal de producción",
        definition:         "Alerta generada automáticamente cuando el stock de una referencia cae bajo el mínimo en ≥1 portafolio activo. Indica que producción debe actuar.",
        eventOrigin:        "CommercialProductionSignal generado por motor de cobertura",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["CommercialProductionSignal"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["comercial", "produccion", "torre_control", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "dead_stock_signal",
        label:              "Stock muerto",
        definition:         "Referencia con saldo físico > 0 y demanda (portafolios activos + órdenes CRM) = 0 por más de N días.",
        eventOrigin:        "CommercialDeadStockSignal generado por motor",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SAG INVENTARIO (base de saldo físico)"],
        agentikModels:      ["CommercialDeadStockSignal"],
        frequency:          "daily",
        priority:           "medium",
        consumedBy:         ["comercial", "produccion", "finanzas"],
        generatedByAgentik: true,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿FECHA_MODIFICACION en INVENTARIO para detectar sin movimiento?",
        ],
      },
    ],
  },

  // ── D03 — Inventario ──────────────────────────────────────────────────────
  {
    key:         "inventario",
    label:       "Inventario",
    description: "Disponibilidad física y operacional de producto. SAG es source-of-truth físico. Agentik es source-of-truth operacional.",
    sagTables:   ["INVENTARIO (pending)", "ARTICULOS (pending)"],
    entities: [
      {
        key:                "physical_stock",
        label:              "Saldo físico en bodega",
        definition:         "Unidades físicamente presentes en bodega según el kardex SAG. Fuente de physicalQty en OperationalInventoryItem.",
        eventOrigin:        "SAG INVENTARIO (CODIGO, BODEGA, SALDO/EXISTENCIA)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM INVENTARIO — SAG_CONFIRMAR tabla y campo"],
        agentikModels:      ["CommercialCoverageSnapshot"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["inventario", "comercial", "produccion", "inteligencia_operacional"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿Nombre tabla: INVENTARIO, SALDOS, EXISTENCIAS, SALDOS_INVENTARIO?",
          "¿Campo cantidad: SALDO, EXISTENCIA, CANTIDAD?",
          "¿BODEGA field presente para segregar por bodega?",
          "¿COSTO_PROMEDIO disponible en misma tabla o en ARTICULOS?",
          "¿Timeout en query completo de inventario?",
        ],
      },
      {
        key:                "operational_available_qty",
        label:              "Disponibilidad operacional",
        definition:         "physicalQty − reservedQty − salesAssignedQty − pendingTransfersQty. Fórmula Agentik. Único número válido para asignar portafolios o confirmar pedidos.",
        eventOrigin:        "OperationalInventoryItem (calculado por motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SAG physicalQty como input"],
        agentikModels:      ["OperationalInventoryItem"],
        frequency:          "on_demand",
        priority:           "critical",
        consumedBy:         ["inventario", "comercial", "crm_pedidos", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "pending_sag",
      },
      {
        key:                "sag_reported_disponible",
        label:              "Disponible SAG (informacional)",
        definition:         "Valor de 'disponible' reportado por SAG. Almacenado como sagReportedAvailableQty. NO usado como verdad operacional por parametrización inconsistente entre empresas SAG.",
        eventOrigin:        "SAG INVENTARIO.disponible (o SALDO si coincide)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SAG_CONFIRMAR — ¿descuenta PD autorizados en Castillitos?"],
        agentikModels:      ["OperationalInventoryItem.sagReportedAvailableQty"],
        frequency:          "daily",
        priority:           "medium",
        consumedBy:         ["inventario"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿El disponible SAG en Castillitos descuenta PD autorizados o no?",
          "¿Hay parámetro de empresa que controle esto?",
        ],
      },
      {
        key:                "article_catalog",
        label:              "Catálogo de artículos",
        definition:         "Maestro de productos SAG: código, descripción, grupo, sub-grupo, línea, precio, IVA, activo.",
        eventOrigin:        "SAG ARTICULOS",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM ARTICULOS — status pending"],
        agentikModels:      ["ProductSnapshot"],
        frequency:          "weekly",
        priority:           "high",
        consumedBy:         ["inventario", "comercial", "crm_pedidos", "customer_360"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿Tabla: ARTICULOS, PRODUCTOS, ITEMS?",
          "¿Campo precio: PRECIO, PRECIO_1, PV1?",
          "¿ACTIVO = 1 o ACTIVO = 'S'?",
          "¿FECHA_MODIFICACION para incremental?",
          "¿MANEJA_TALLA_COLOR flag presente?",
        ],
      },
    ],
  },

  // ── D04 — Producción ──────────────────────────────────────────────────────
  {
    key:         "produccion",
    label:       "Producción",
    description: "Señales de producción generadas por Agentik + feed de OPs desde SAG (futuro).",
    sagTables:   ["OPs: SAG_CONFIRMAR"],
    entities: [
      {
        key:                "production_signal_aggregate",
        label:              "Presión de producción agregada",
        definition:         "Total de unidades faltantes × urgencia por línea (LT/CS) para todos los portafolios activos. Base para planificación de producción.",
        eventOrigin:        "CommercialProductionSignal (motor cobertura Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["CommercialProductionSignal"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["produccion", "torre_control", "finanzas"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "sag_production_order",
        label:              "Orden de Producción SAG",
        definition:         "OP registrada en SAG con estado, artículo, cantidad y fecha estimada de completación.",
        eventOrigin:        "SAG tabla OPs (SAG_CONFIRMAR)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SAG_CONFIRMAR — ¿nombre tabla OPs? ¿campos estado, artículo, cantidad, fecha?"],
        agentikModels:      [],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["produccion", "inventario", "torre_control"],
        generatedByAgentik: false,
        status:             "futuro",
        sagValidationQuestions: [
          "¿Existe tabla de Órdenes de Producción en Castillitos SAG?",
          "¿Nombre de tabla?",
          "¿Campos: número OP, artículo, cantidad, estado, fecha estimada?",
          "¿SAG actualiza inventario automáticamente al completar OP?",
        ],
      },
    ],
  },

  // ── D05 — Cartera ─────────────────────────────────────────────────────────
  {
    key:         "cartera",
    label:       "Cartera (Cuentas por Cobrar)",
    description: "Estado legal de lo que los clientes deben. SAG es source-of-truth absoluto. Solo FUENTE_1 crea cartera.",
    sagTables:   ["CARTERA (validated)"],
    entities: [
      {
        key:                "receivable_balance",
        label:              "Saldo de cartera por cliente",
        definition:         "Total adeudado por un NIT según SAG CARTERA. Suma de todos los documentos abiertos (SALDO > 0).",
        eventOrigin:        "SELECT * FROM CARTERA — status validated",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM CARTERA"],
        agentikModels:      ["CustomerReceivable"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["cartera", "cobranza", "tesoreria", "customer_360", "finanzas"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "overdue_days",
        label:              "Días de mora",
        definition:         "Número de días que un documento lleva vencido sin pago según SAG. Campo DIAS_MORA en CARTERA.",
        eventOrigin:        "SAG CARTERA.DIAS_MORA",
        sourceOfTruth:      "SAG",
        possibleSources:    ["CARTERA.DIAS_MORA — validated"],
        agentikModels:      ["CustomerReceivable.overdueDays"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["cartera", "cobranza", "customer_360"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "receivable_opening",
        label:              "Apertura de cartera (FUENTE_1 gate)",
        definition:         "Solo facturas FUENTE_1 crean CustomerReceivable en Agentik. Remisiones FUENTE_2 NO generan AR.",
        eventOrigin:        "SaleRecord.sagSourceType = OFICIAL → CustomerReceivable",
        sourceOfTruth:      "SAG+Agentik",
        possibleSources:    ["SaleRecord.sagSourceType"],
        agentikModels:      ["SaleRecord", "CustomerReceivable"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["cartera", "finanzas", "conciliacion"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
    ],
  },

  // ── D06 — Cobranza ────────────────────────────────────────────────────────
  {
    key:         "cobranza",
    label:       "Cobranza",
    description: "Gestión operacional del recaudo. Recibos de caja SAG + lógica de imputación y scoring Agentik.",
    sagTables:   ["MOVIMIENTOS (parcialmente validado — R1/R2/RS)"],
    entities: [
      {
        key:                "collection_receipt",
        label:              "Recibo de caja",
        definition:         "Pago recibido registrado en SAG con comprobanteCode R1/R2/RS. Fuente: SAG MOVIMIENTOS. Importado como CollectionRecord.",
        eventOrigin:        "SAG MOVIMIENTOS filtrado por comprobanteCode IN (R1, R2, RS, RC, RG, RA, SI)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM MOVIMIENTOS — validado para FUENTE_1/FUENTE_2"],
        agentikModels:      ["CollectionRecord"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["cobranza", "tesoreria", "conciliacion", "cartera"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "collection_scoring",
        label:              "Scoring de cobranza",
        definition:         "Priorización de gestión por cliente: riesgo × monto × antigüedad de mora. Calculado por Agentik sobre CollectionRecord + CustomerReceivable.",
        eventOrigin:        "Motor scoring Agentik",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["CopilotSignalRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["cobranza", "customer_360", "torre_control"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "daily_collection",
        label:              "Recaudo del día",
        definition:         "Suma de CollectionRecord.amount con collectionDate = hoy. Entrada de caja real confirmada por SAG.",
        eventOrigin:        "CollectionRecord.collectionDate = today",
        sourceOfTruth:      "SAG",
        possibleSources:    ["MOVIMIENTOS filtrado por fecha"],
        agentikModels:      ["CollectionRecord"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["cobranza", "tesoreria", "torre_control"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
    ],
  },

  // ── D07 — Tesorería ───────────────────────────────────────────────────────
  {
    key:         "tesoreria",
    label:       "Tesorería",
    description: "Posición de caja real y proyectada. Banco es SOT para saldos. Agentik agrega y proyecta.",
    sagTables:   ["SAG_CONFIRMAR — SAG probablemente no expone saldos bancarios"],
    entities: [
      {
        key:                "bank_movement",
        label:              "Movimiento bancario",
        definition:         "Entrada o salida en extracto bancario importado (CSV/OFX). Fuente: banco, no SAG.",
        eventOrigin:        "BankStatementUpload → BankMovement",
        sourceOfTruth:      "Banco",
        possibleSources:    ["Extracto bancario CSV/OFX — no SAG"],
        agentikModels:      ["BankMovement", "BankAccount", "BankSyncSession"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["tesoreria", "conciliacion", "finanzas"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "cash_position",
        label:              "Posición de caja actual",
        definition:         "Saldo bancario real = BankMovement.balanceAfter del último movimiento por cuenta.",
        eventOrigin:        "BankMovement.balanceAfter (último registro)",
        sourceOfTruth:      "Banco",
        possibleSources:    [],
        agentikModels:      ["BankMovement", "BankAccount"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["tesoreria", "torre_control"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
      {
        key:                "cash_projection",
        label:              "Proyección de caja",
        definition:         "Posición de caja proyectada a N días = saldo actual + cobros esperados (CustomerReceivable vencimiento) − salidas comprometidas.",
        eventOrigin:        "FinancialRuntimeSnapshot (motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["CustomerReceivable (SAG CARTERA)", "CollectionRecord (SAG MOVIMIENTOS)"],
        agentikModels:      ["FinancialRuntimeSnapshot"],
        frequency:          "15m",
        priority:           "critical",
        consumedBy:         ["tesoreria", "torre_control", "finanzas"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "bank_reconciliation",
        label:              "Conciliación bancaria",
        definition:         "Cruce BankMovement (banco) vs. CollectionRecord (SAG MOVIMIENTOS). Identifica diferencias entre lo que el banco registró y lo que SAG registró.",
        eventOrigin:        "BankReconciliation (motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["BankMovement (banco)", "CollectionRecord (SAG MOVIMIENTOS)"],
        agentikModels:      ["BankReconciliation"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["tesoreria", "finanzas", "conciliacion"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
    ],
  },

  // ── D08 — Finanzas / Cierre ───────────────────────────────────────────────
  {
    key:         "finanzas",
    label:       "Finanzas / Cierre",
    description: "P&L, presupuesto vs ejecución, cierre de período. SAG es SOT para datos históricos contables.",
    sagTables:   ["DOCUMENTOS (placeholder)", "MOVIMIENTOS (partial)"],
    entities: [
      {
        key:                "recognized_revenue",
        label:              "Ingresos reconocidos (ventas)",
        definition:         "Suma de SaleRecord FUENTE_1 del período. Solo facturas oficiales. Base del P&L.",
        eventOrigin:        "SaleRecord.sagSourceType = OFICIAL (import SAG)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["DOCUMENTOS TIPO_DOC = FV — placeholder", "FUENTES.xlsx import actual"],
        agentikModels:      ["SaleRecord"],
        frequency:          "daily",
        priority:           "critical",
        consumedBy:         ["finanzas", "torre_control", "conciliacion"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "dispatch_pipeline",
        label:              "Pipeline de conversión (remisiones)",
        definition:         "Suma de SaleRecord FUENTE_2. Despachos realizados pendientes de factura. Señal de demanda y forecast, NO ingreso reconocido.",
        eventOrigin:        "SaleRecord.sagSourceType = REMISION (import SAG)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["DOCUMENTOS TIPO_DOC = REM — pendiente_sag"],
        agentikModels:      ["SaleRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["finanzas", "crm_pedidos", "torre_control"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "conversion_rate_f2_f1",
        label:              "Tasa de conversión Remisión → Factura",
        definition:         "% de FUENTE_2 (remisiones) que se convirtieron a FUENTE_1 (factura oficial) en el período. Indicador de eficiencia operacional y riesgo de no-cobro.",
        eventOrigin:        "Cruce SaleRecord FUENTE_2 → FUENTE_1 (Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SaleRecord (SAG import)"],
        agentikModels:      ["SaleRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["finanzas", "torre_control"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
      {
        key:                "budget_execution",
        label:              "Ejecución vs presupuesto",
        definition:         "Desvío entre ingresos reales (SaleRecord FUENTE_1) y Budget.lines para el período. Alerta automática cuando desvío > umbral.",
        eventOrigin:        "Budget vs SaleRecord (cruce Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SaleRecord (SAG)", "Budget (Agentik)"],
        agentikModels:      ["Budget", "SaleRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["finanzas", "torre_control"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "gross_margin_estimated",
        label:              "Margen bruto estimado",
        definition:         "Ingresos FUENTE_1 − (physicalQty × COSTO_PROMEDIO SAG). Aproximación hasta que SAG confirme campo de costo.",
        eventOrigin:        "SaleRecord FUENTE_1 + INVENTARIO.COSTO_PROMEDIO",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SAG_CONFIRMAR — ¿COSTO_PROMEDIO en INVENTARIO o en ARTICULOS?"],
        agentikModels:      ["SaleRecord", "CommercialCoverageSnapshot"],
        frequency:          "monthly",
        priority:           "high",
        consumedBy:         ["finanzas"],
        generatedByAgentik: true,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿COSTO_PROMEDIO está en tabla INVENTARIO o en ARTICULOS?",
          "¿Es costo promedio ponderado o costo estándar?",
        ],
      },
    ],
  },

  // ── D09 — CRM / Pedidos ───────────────────────────────────────────────────
  {
    key:         "crm_pedidos",
    label:       "CRM / Pedidos",
    description: "Pipeline comercial pre-SAG. Oportunidades, cotizaciones, pedidos. CRM → Agentik bridge activo.",
    sagTables:   ["PEDIDOS (placeholder — SAG_CONFIRMAR existencia)"],
    entities: [
      {
        key:                "crm_opportunity",
        label:              "Oportunidad comercial",
        definition:         "Deal en pipeline CRM: cliente, monto estimado, etapa, vendedor.",
        eventOrigin:        "CRMOpportunity (conector CRM)",
        sourceOfTruth:      "CRM",
        possibleSources:    [],
        agentikModels:      ["CRMOpportunity"],
        frequency:          "event_driven",
        priority:           "high",
        consumedBy:         ["crm_pedidos", "customer_360", "finanzas"],
        generatedByAgentik: false,
        status:             "crm",
      },
      {
        key:                "crm_quote",
        label:              "Cotización",
        definition:         "Propuesta formal con líneas de precio confirmado. Puede generar pedido y reserva operacional.",
        eventOrigin:        "CRMQuote / CRMQuoteLine",
        sourceOfTruth:      "CRM",
        possibleSources:    ["SAG LISTAS_PRECIOS para validar precio — placeholder"],
        agentikModels:      ["CRMQuote", "CRMQuoteLine"],
        frequency:          "event_driven",
        priority:           "high",
        consumedBy:         ["crm_pedidos", "inventario", "customer_360"],
        generatedByAgentik: false,
        status:             "crm",
      },
      {
        key:                "pre_sag_reservation",
        label:              "Reserva pre-SAG",
        definition:         "Bloqueo de inventario Agentik para pedido CRM confirmado, antes de que exista PD en SAG. Evita sobrecomprometer stock.",
        eventOrigin:        "CustomerOrderRecord → OperationalReservation (bridge CRM→Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["OperationalReservation", "CustomerOrderRecord"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["crm_pedidos", "inventario", "comercial"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "sag_write_order",
        label:              "Pedido enviado a SAG (PD)",
        definition:         "Pedido confirmado en Agentik → escrito como PD en SAG. Requiere aprobación humana. Usa SagWriteOperation layer.",
        eventOrigin:        "SagWriteOperation.type = PD",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SAG_CONFIRMAR — ¿tabla PEDIDOS existe en Castillitos?", "¿ESTADO values para PD pendiente vs facturado?"],
        agentikModels:      ["SagWriteOperation"],
        frequency:          "event_driven",
        priority:           "high",
        consumedBy:         ["crm_pedidos", "inventario"],
        generatedByAgentik: true,
        status:             "futuro",
        sagValidationQuestions: [
          "¿Existe tabla PEDIDOS en Castillitos SAG?",
          "¿Qué campos son obligatorios para crear un PD?",
          "¿ESTADO values: PENDIENTE, FACTURADO, ANULADO?",
        ],
      },
    ],
  },

  // ── D10 — Customer 360 ────────────────────────────────────────────────────
  {
    key:         "customer_360",
    label:       "Customer 360",
    description: "Vista unificada del cliente cruzando SAG, CRM y comportamiento operacional.",
    sagTables:   ["TERCEROS (validated)", "CARTERA (validated)", "DOCUMENTOS (placeholder)"],
    entities: [
      {
        key:                "customer_master",
        label:              "Maestro de clientes",
        definition:         "Datos SAG: NIT, nombre, ciudad, vendedor asignado, condición de pago, tipo de precio. Base del CustomerProfile.",
        eventOrigin:        "SELECT * FROM TERCEROS — validated",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM TERCEROS"],
        agentikModels:      ["CustomerProfile"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["customer_360", "cartera", "cobranza", "crm_pedidos"],
        generatedByAgentik: false,
        status:             "confirmed",
      },
      {
        key:                "customer_purchase_history",
        label:              "Historial de compras",
        definition:         "Documentos SAG por NIT: FV, NC, REM con fecha, monto, estado.",
        eventOrigin:        "SELECT * FROM DOCUMENTOS WHERE NIT = '{nit}' — placeholder",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SELECT * FROM DOCUMENTOS WHERE NIT = '{nit}' — pendiente_sag"],
        agentikModels:      ["SaleRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["customer_360"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿Tabla: DOCUMENTOS o FACTURAS?",
          "¿TIPO_DOC para factura de venta en Castillitos?",
          "¿WHERE NIT funciona en consultaSagJson?",
        ],
      },
      {
        key:                "customer_risk_score",
        label:              "Scoring de riesgo del cliente",
        definition:         "Puntuación Agentik de comportamiento de pago: mora histórica, monto, frecuencia de recaudo.",
        eventOrigin:        "CollectionRecord + CustomerReceivable (cálculo Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["CustomerProfile"],
        frequency:          "weekly",
        priority:           "medium",
        consumedBy:         ["customer_360", "cobranza", "crm_pedidos"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
    ],
  },

  // ── D11 — Logística ───────────────────────────────────────────────────────
  {
    key:         "logistica",
    label:       "Logística",
    description: "Despachos y traslados. Parcialmente cubierto via FUENTE_2. Sin modelo logístico propio.",
    sagTables:   ["DOCUMENTOS tipo REM (pendiente_sag)", "BODEGAS (SAG_CONFIRMAR)"],
    entities: [
      {
        key:                "dispatch_confirmed",
        label:              "Remisión emitida (despacho confirmado)",
        definition:         "FUENTE_2: producto salió físicamente de bodega. Señal operacional de despacho. No crea AR ni ingreso reconocido.",
        eventOrigin:        "SaleRecord.sagSourceType = REMISION",
        sourceOfTruth:      "SAG",
        possibleSources:    ["DOCUMENTOS tipo REM — pendiente_sag"],
        agentikModels:      ["SaleRecord"],
        frequency:          "daily",
        priority:           "high",
        consumedBy:         ["logistica", "inventario", "customer_360"],
        generatedByAgentik: false,
        status:             "pending_sag",
      },
      {
        key:                "warehouse_catalog",
        label:              "Catálogo de bodegas",
        definition:         "Lista de bodegas SAG con código y nombre. Necesario para queries de inventario por bodega.",
        eventOrigin:        "SAG tabla BODEGAS (SAG_CONFIRMAR)",
        sourceOfTruth:      "SAG",
        possibleSources:    ["SAG_CONFIRMAR — tabla BODEGAS o equivalente"],
        agentikModels:      [],
        frequency:          "static",
        priority:           "medium",
        consumedBy:         ["logistica", "inventario"],
        generatedByAgentik: false,
        status:             "pending_sag",
        sagValidationQuestions: [
          "¿Nombre de tabla de bodegas en Castillitos SAG?",
          "¿Campos: código bodega, nombre, tipo?",
          "¿Cuántas bodegas activas tiene Castillitos?",
        ],
      },
    ],
  },

  // ── D12 — Inteligencia Operacional ────────────────────────────────────────
  {
    key:         "inteligencia_operacional",
    label:       "Inteligencia Operacional",
    description: "Motor de explicabilidad y señales cruzadas. 100% Agentik. Consume de todos los dominios.",
    sagTables:   [],
    entities: [
      {
        key:                "intelligence_snapshot",
        label:              "Snapshot de inteligencia operacional",
        definition:         "Estado operacional de todas las referencias: status, why[], impacts[], suggestions[]. Cada número tiene explicación en lenguaje humano.",
        eventOrigin:        "OperationalIntelligenceSnapshot (motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["OperationalIntelligenceSnapshot"],
        frequency:          "15m",
        priority:           "critical",
        consumedBy:         ["torre_control", "inteligencia_operacional"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
      {
        key:                "copilot_signal",
        label:              "Señal de copilot",
        definition:         "Señal activa generada por motor de inteligencia para un agente IA específico (Luca, Diego, David, Laura, Sofía, Mila, Pablo).",
        eventOrigin:        "CopilotSignalRecord (motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["CopilotSignalRecord"],
        frequency:          "event_driven",
        priority:           "high",
        consumedBy:         ["inteligencia_operacional", "torre_control"],
        generatedByAgentik: true,
        status:             "interno_agentik",
      },
    ],
  },

  // ── D13 — Conciliación ────────────────────────────────────────────────────
  {
    key:         "conciliacion",
    label:       "Conciliación",
    description: "Cruce y resolución de diferencias entre fuentes. Motor 100% Agentik.",
    sagTables:   [],
    entities: [
      {
        key:                "reconciliation_session",
        label:              "Sesión de conciliación",
        definition:         "Conciliación de un período y tipo (ventas vs banco, cartera vs cobros). Produce ReconSummary con matchRate.",
        eventOrigin:        "ReconciliationSession (iniciada manualmente o por schedule)",
        sourceOfTruth:      "Agentik",
        possibleSources:    ["SaleRecord", "BankMovement", "CollectionRecord", "CustomerReceivable"],
        agentikModels:      ["ReconciliationSession", "ReconciliationRun", "ReconciliationEvent"],
        frequency:          "weekly",
        priority:           "critical",
        consumedBy:         ["conciliacion", "finanzas", "torre_control"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
      {
        key:                "reconciliation_exception",
        label:              "Excepción de conciliación",
        definition:         "Item que no pudo ser conciliado automáticamente. Requiere revisión humana. Detiene el cierre del período si no se resuelve.",
        eventOrigin:        "ReconciliationException (motor Agentik)",
        sourceOfTruth:      "Agentik",
        possibleSources:    [],
        agentikModels:      ["ReconciliationException"],
        frequency:          "event_driven",
        priority:           "critical",
        consumedBy:         ["conciliacion", "finanzas"],
        generatedByAgentik: true,
        status:             "confirmed",
      },
    ],
  },

];

// ─── Helper utilities ─────────────────────────────────────────────────────────

/**
 * Returns all entities that need SAG validation.
 * Use to generate the SAG technical meeting checklist.
 */
export function getSagPendingEntities(): OperationalSourceEntity[] {
  return OPERATIONAL_SOURCE_MAP.flatMap(d =>
    d.entities.filter(e => e.status === "pending_sag"),
  );
}

/**
 * Returns all SAG validation questions across all entities.
 * Use to build the technical meeting form.
 */
export function getAllSagValidationQuestions(): Array<{
  domain:   string;
  entityKey: string;
  entityLabel: string;
  question: string;
}> {
  return OPERATIONAL_SOURCE_MAP.flatMap(domain =>
    domain.entities.flatMap(entity =>
      (entity.sagValidationQuestions ?? []).map(question => ({
        domain:      domain.label,
        entityKey:   entity.key,
        entityLabel: entity.label,
        question,
      })),
    ),
  );
}

/**
 * Returns entities filtered by domain key.
 */
export function getDomainEntities(
  domainKey: OperationalDomainKey,
): OperationalSourceEntity[] {
  return OPERATIONAL_SOURCE_MAP
    .find(d => d.key === domainKey)
    ?.entities ?? [];
}

/**
 * Returns entities that Agentik generates (generatedByAgentik = true).
 * These are computed assets owned by Agentik, not imports from SAG.
 */
export function getAgentikOwnedEntities(): OperationalSourceEntity[] {
  return OPERATIONAL_SOURCE_MAP.flatMap(d =>
    d.entities.filter(e => e.generatedByAgentik),
  );
}

/**
 * Returns entities by priority level.
 */
export function getEntitiesByPriority(
  priority: OperationalSourcePriority,
): OperationalSourceEntity[] {
  return OPERATIONAL_SOURCE_MAP.flatMap(d =>
    d.entities.filter(e => e.priority === priority),
  );
}

/**
 * Returns all entities that a given domain consumes.
 * Useful for rendering dependency maps.
 */
export function getEntitiesConsumedBy(
  domainKey: OperationalDomainKey,
): OperationalSourceEntity[] {
  return OPERATIONAL_SOURCE_MAP.flatMap(d =>
    d.entities.filter(e => e.consumedBy.includes(domainKey)),
  );
}
