/**
 * lib/integrations/sag/data-contract/sag-data-contract.ts
 *
 * SAG Data Contract — Type System & Metadata
 *
 * This file defines the structural types and contract metadata for the
 * Agentik ↔ SAG data integration agreement established in the SAG
 * validation meeting (2026-05).
 *
 * SAG confirmed:
 * - pagosnew has no historical restriction (confirmed May 2026)
 * - Recommends batch queries for historical access
 * - Willing to create new views named per Agentik's requirements
 * - Recommends Data Warehouse architecture for large-scale reads
 *
 * Sprint: AGENTIK-SAG-DATA-CONTRACT-01
 * Owner: Agentik × SAG Integration Team
 */

// ── Access method agreed in meeting ───────────────────────────────────────────

export type SagAccessMethod =
  | "direct_query"       // Direct SQL/API query to SAG tables
  | "view"               // SAG-created view (vw_agentik_*)
  | "data_warehouse"     // SAG Data Warehouse extract
  | "batch_export"       // Scheduled batch file export
  | "api_endpoint"       // SAG REST/SOAP endpoint
  | "manual_upload";     // Manual file delivery (interim only)

// ── Data freshness / sync model ────────────────────────────────────────────────

export type SagSyncFrequency =
  | "realtime"           // Live connection, <1min lag
  | "near_realtime"      // Push/poll, 1–15min lag
  | "hourly"
  | "daily_eod"          // End-of-day batch
  | "weekly"
  | "on_demand";         // Manual trigger only

export type SagDataCurrency =
  | "live"               // Matches SAG production in real time
  | "T-1"                // Previous business day
  | "T-7"                // Previous week
  | "historical"         // Full history, no rolling window
  | "partial_historical"; // History from a specific cutoff date

// ── Field-level contract annotations ──────────────────────────────────────────

export type SagFieldType =
  | "string"
  | "number"
  | "decimal"
  | "date"               // ISO 8601 date only
  | "datetime"           // ISO 8601 datetime
  | "boolean"
  | "enum"
  | "json";

export type SagFieldStatus =
  | "confirmed"          // SAG confirmed field exists and is accessible
  | "agreed"             // Agreed in SAG meeting — same as confirmed but meeting-sourced
  | "pending_access"     // Field exists, access approval pending
  | "pending_view"       // Needs SAG to create a view exposing this field
  | "unconfirmed"        // Not yet verified with SAG
  | "derived"            // Calculated by Agentik from other SAG fields — not stored in SAG directly
  | "deprecated"         // Was used, SAG has moved to a replacement
  | "unavailable";       // SAG cannot expose this field

export interface SagField {
  campo:          string;                // SAG column/field name
  alias?:         string;                // Agentik canonical name if different
  tipo:           SagFieldType;
  obligatorio:    boolean;               // Required for Agentik to function
  status:         SagFieldStatus;
  descripcion:    string;
  /** Which Agentik KPIs depend on this field */
  kpiTraceability: AgentikKpi[];
  /** Which Agentik modules consume this field */
  modulosImpactados: AgentikModule[];
  /** SAG table or view this field lives in */
  fuenteSag:      string;
  notas?:         string;
}

// ── Agentik module registry ────────────────────────────────────────────────────

export type AgentikModule =
  | "conciliacion"
  | "tesoreria"
  | "cierre"
  | "planeacion"
  | "inventario_operativo"
  | "cartera"
  | "executive_dashboard"
  | "operational_map"
  | "alertas"
  | "cobranza"          // Gestión activa de cobros y seguimiento de mora
  | "comercial"         // Análisis comercial por sucursal, canal, cliente
  | "cliente_360"       // Vista 360° del cliente: ventas, pagos, saldo, comportamiento
  | "torre_control"     // Torre de control operacional: KPIs en tiempo real
  | "copilot"           // Agentik Copilot: respuestas operacionales conversacionales
  | "automatizaciones"  // Flujos automáticos basados en eventos de pago
  | "comercio_exterior"  // Módulo de comercio exterior: importaciones, pagos en moneda extranjera
  | "comisiones"         // Módulo de comisiones de vendedores: ranking, cálculo, liquidación
  | "logistica"          // Módulo de logística: despachos, entregas, SLA de servicio
  | "marketing_studio"   // Marketing Studio: campañas, atribución, ROI de canales digitales
  | "finanzas"           // Módulo financiero consolidado: cierre, conciliación, tesorería, planeación
  | "compras"            // Módulo de compras: órdenes de compra, proveedores, abastecimiento
  | "produccion"         // Módulo de producción: órdenes, consumo de materias primas, rendimientos
  | "ecommerce";         // Módulo de e-commerce: catálogo web, SEO, publicación digital

// ── Agentik KPI registry ───────────────────────────────────────────────────────

export type AgentikKpi =
  | "ventas_brutas"
  | "ventas_netas"
  | "pagos_recibidos"
  | "recaudos_dia"
  | "cartera_vencida"
  | "cartera_corriente"
  | "dias_cartera"
  | "inventario_disponible"
  | "inventario_en_transito"
  | "rotacion_inventario"
  | "costo_ventas"
  | "margen_bruto"
  | "ebitda"
  | "flujo_caja_operativo"
  | "saldo_bancos"
  | "cuentas_por_pagar"
  | "devoluciones"
  | "descuentos_comerciales"
  // ── Payment analytics KPIs (added sprint AGENTIK-SAG-PAYMENTS-CONTRACT-HARDENING-01)
  | "pagos_oportunos"       // % pagos recibidos antes o en fecha de vencimiento
  | "pagos_tardios"         // % pagos recibidos después del vencimiento
  | "dias_mora_promedio"    // Promedio de días entre vencimiento y fecha de pago
  | "tasa_recaudo"          // % de cartera recaudada en el período
  | "score_riesgo_cliente"  // Score de comportamiento de pago por cliente
  | "recaudo_por_sucursal"  // Recaudo agrupado por sede / sucursal
  | "recaudo_por_canal"     // Recaudo agrupado por canal de pago
  // ── Commercial & sales analytics KPIs (AGENTIK-SAG-VENTAS-CONTRACT-HARDENING-01)
  | "ventas_por_vendedor"   // Ventas agrupadas por ejecutivo comercial
  | "margen_por_vendedor"   // Margen bruto por ejecutivo — base para comisiones
  | "ticket_promedio"       // Valor promedio por transacción de venta
  | "sla_entrega"           // % pedidos entregados en el plazo comprometido
  | "ventas_por_ciudad"     // Segmentación geográfica de ventas por ciudad/región
  | "devoluciones_unidades" // Unidades físicas devueltas (complementa devoluciones en COP)
  | "ventas_por_canal"      // Ventas agrupadas por canal comercial (mostrador, distribución, etc.)
  // ── Product & delivery analytics (AGENTIK-SAG-VENTAS-FINAL-HARDENING-01)
  | "margen_por_producto"   // Margen bruto por referencia de producto
  | "rotacion_producto"     // Velocidad de rotación por referencia de producto
  | "ventas_por_referencia" // Ventas agrupadas por código/referencia de producto
  | "ventas_por_cliente"    // Ventas agrupadas por cliente (valor + frecuencia)
  | "cumplimiento_entrega"  // % de entregas realizadas en la fecha comprometida
  // ── Cartera enterprise analytics KPIs (AGENTIK-SAG-CARTERA-ENTERPRISE-HARDENING-01)
  | "cartera_critica"               // Saldo vencido > 90 días — requiere acción inmediata
  | "envejecimiento_cartera"        // Distribución de cartera por rango de mora (0-30, 31-60, 61-90, 91-180, 180+)
  | "promesas_pago_cumplidas"       // % de promesas de pago honradas en fecha acordada
  | "promesas_pago_incumplidas"     // Promesas de pago vencidas sin abono registrado
  | "cobertura_cupo"                // % de cupo de crédito utilizado por cliente
  | "cartera_por_vendedor"          // Saldo pendiente y mora agrupados por ejecutivo comercial
  | "cartera_por_sucursal"          // Distribución de cartera por sede / sucursal
  // ── Recaudos enterprise KPIs (AGENTIK-SAG-RECAUDOS-ENTERPRISE-HARDENING-01)
  | "recaudo_pendiente_aplicar"     // Monto de recaudos recibidos sin aplicar a documentos específicos
  | "recaudos_conciliados"          // Recaudos con cruce bancario confirmado (CONCILIADO = true)
  | "recaudos_no_conciliados"       // Recaudos sin cruce bancario — pendientes de conciliación
  // ── Bancos enterprise KPIs (AGENTIK-SAG-BANCOS-ENTERPRISE-HARDENING-01)
  | "saldo_bancario_actual"         // Saldo real por cuenta bancaria según extracto — distinto de saldo_bancos (contable)
  | "ingresos_bancarios_dia"        // Total de créditos bancarios del día por cuenta
  | "egresos_bancarios_dia"         // Total de débitos bancarios del día por cuenta
  | "movimientos_no_conciliados"    // Movimientos bancarios sin cruce con recaudos o pagos en SAG
  | "recaudos_sin_respaldo_bancario" // Recaudos en SAG sin movimiento bancario confirmado
  | "diferencias_conciliacion"      // Suma de diferencias monetarias detectadas en el proceso de conciliación
  // ── Inventario enterprise KPIs (AGENTIK-SAG-INVENTARIO-ENTERPRISE-HARDENING-01)
  | "cobertura_inventario"          // Semanas/días de ventas que el inventario actual puede cubrir
  | "quiebres_stock"                // Referencias con DISPONIBLE = 0 en bodegas activas de despacho
  | "inventario_comprometido"       // Unidades comprometidas por pedidos pendientes de surtir
  | "inventario_transito"           // Unidades en tránsito: compradas y en camino, aún no recibidas
  | "referencias_sin_movimiento"    // Referencias sin salidas en los últimos N días — riesgo de estancamiento
  // ── Inventario financial KPIs (AGENTIK-SAG-INVENTARIO-FINANCIAL-HARDENING-01)
  | "valor_inventario"              // Valor monetario total del inventario: EXISTENCIA × COSTO_PROMEDIO
  | "capital_trabajo"               // Capital inmovilizado en inventario — componente del capital de trabajo operativo
  | "inventario_inmovilizado"       // Inventario sin rotación valorizado — referencias estancadas × COSTO_PROMEDIO
  // ── Compras enterprise KPIs (AGENTIK-SAG-COMPRAS-ENTERPRISE-HARDENING-01)
  | "compras_pendientes"            // OC abiertas o aprobadas aún no recibidas completamente
  | "compras_vencidas"              // OC con FECHA_COMPROMISO vencida sin recepción completa
  | "cumplimiento_proveedores"      // % de OC recibidas completas en fecha comprometida
  | "lead_time_proveedor"           // Días promedio entre FECHA_OC y FECHA_RECEPCION_REAL por proveedor
  | "valor_compras_transito"        // Valor monetario total de OC enviadas y aún no recibidas
  | "compras_por_recibir"           // OC con ESTADO_OC = 'enviada' o 'parcial' — pendientes de recepción
  | "dependencia_proveedor"         // Porcentaje de referencias que dependen de un único proveedor
  | "compras_internacionales"       // Valor y volumen de OC con TIPO_COMPRA = 'internacional'
  // ── Compras final KPIs (AGENTIK-SAG-COMPRAS-FINAL-HARDENING-02)
  | "tiempo_aprobacion_oc"          // Días promedio entre FECHA_OC y FECHA_APROBACION_OC — eficiencia del proceso
  // ── Productos master data KPIs (AGENTIK-SAG-PRODUCTOS-ENTERPRISE-HARDENING-01)
  | "productos_activos"             // Referencias con ACTIVO = true y no descontinuadas
  | "productos_descontinuados"      // Referencias marcadas como DESCONTINUADO = true
  | "productos_sin_rotacion"        // Productos activos sin ventas registradas en los últimos N días
  | "productos_alto_margen"         // Productos con MARGEN_OBJETIVO por encima del umbral definido
  | "productos_bajo_margen"         // Productos con MARGEN_OBJETIVO por debajo del umbral mínimo rentable
  | "productos_sobrestock"          // Productos con EXISTENCIA muy superior a la demanda proyectada
  | "productos_quiebre_stock"       // Productos activos con DISPONIBLE = 0 en todas las bodegas
  | "productos_por_categoria"       // Distribución de referencias activas por CATEGORIA
  | "productos_por_marca"           // Distribución de referencias activas por MARCA
  // ── Productos final KPIs (AGENTIK-SAG-PRODUCTOS-FINAL-HARDENING-02)
  | "porcentaje_portafolio_importado" // % de referencias activas con ES_IMPORTADO = true
  | "productos_estrategicos"          // Referencias marcadas como PRODUCTO_ESTRATEGICO = true
  | "productos_sin_publicacion";      // Productos activos sin presencia digital (ESTADO_PUBLICACION = 'no_publicado')

// ── Domain contract ────────────────────────────────────────────────────────────

export type SagDomainId =
  | "ventas"
  | "pagos"
  | "recaudos"
  | "cartera"
  | "inventario"
  | "clientes"
  | "productos"
  | "bancos"
  | "compras"
  | "produccion";

export type ContractStatus =
  | "draft"              // Not yet reviewed with SAG
  | "in_review"          // Being reviewed in SAG meetings
  | "agreed"             // SAG confirmed data availability
  | "view_requested"     // Agentik submitted view creation request to SAG
  | "view_created"       // SAG created the vw_agentik_* view
  | "integrated"         // Agentik is reading live data
  | "blocked";           // Blocked — see `bloqueadores`

export interface SagDomainContract {
  id:              SagDomainId;
  nombre:          string;               // Human label in Spanish
  descripcion:     string;
  status:          ContractStatus;
  accessMethod:    SagAccessMethod;
  suggestedView?:  string;               // e.g. "vw_agentik_ventas"
  primaryTables:   string[];             // SAG source tables
  syncFrequency:   SagSyncFrequency;
  dataCurrency:    SagDataCurrency;
  historicalCutoff?: string;             // ISO date — from when history available
  fields:          SagField[];
  kpisEnabled:     AgentikKpi[];         // KPIs unlocked when domain is integrated
  modulosEnabled:  AgentikModule[];      // Modules enabled when domain is integrated
  bloqueadores?:   string[];             // Blockers delaying integration
  prioridad:       1 | 2 | 3;           // 1 = crítico, 2 = importante, 3 = deseado
  owner?:          string;               // SAG point of contact for this domain
  notas?:          string;
}

// ── View request catalog entry ─────────────────────────────────────────────────

export type ViewRequestStatus =
  | "not_submitted"
  | "submitted"
  | "in_progress_sag"
  | "ready"
  | "integrated";

export interface SagViewRequest {
  viewName:        string;               // e.g. "vw_agentik_ventas"
  domain:          SagDomainId;
  status:          ViewRequestStatus;
  requestedDate?:  string;               // ISO date
  readyDate?:      string;               // ISO date when SAG confirmed ready
  columns:         string[];             // Columns to include in the view
  filters?:        string[];             // Suggested WHERE clauses / partition hints
  frequency:       SagSyncFrequency;
  notas?:          string;
}

// ── Master contract envelope ───────────────────────────────────────────────────

export interface SagMasterContract {
  version:         string;               // semver e.g. "1.0.0"
  lastReviewedDate: string;              // ISO date of last SAG meeting
  accessMethodAgreed: SagAccessMethod;
  syncFrequencyAgreed: SagSyncFrequency;
  dataWarehouseRecommended: boolean;     // SAG recommended DW for large reads
  pagosnewHistoricalConfirmed: boolean;  // SAG confirmed no restriction on pagosnew
  domains:         SagDomainContract[];
  viewRequests:    SagViewRequest[];
}
