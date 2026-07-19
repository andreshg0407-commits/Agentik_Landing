/**
 * executive-types.ts
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03 — Executive Intelligence Engine types.
 * Single source of truth for the ExecutiveDashboard model.
 * All consumers (Dashboard, David, API) import from here exclusively.
 */

// ── KPI ───────────────────────────────────────────────────────────────────────

export interface DailyKpi {
  value: number;
  previousValue: number;
  delta: number;
  deltaPercent: number;
}

// ── Commercial ────────────────────────────────────────────────────────────────

export interface CommercialSummary {
  pedidosHoy: DailyKpi;
  valorPedidosHoy: DailyKpi;
  clientesHoy: DailyKpi;
  referenciasHoy: DailyKpi;
  vendedoresHoy: DailyKpi;
}

export interface FulfillmentSummary {
  totalPedidos: number;
  listos: number;
  parciales: number;
  bloqueados: number;
  sinValidar: number;
  fulfillmentPromedio: number;
}

export interface TopReferenciaRow {
  reference: string;
  productName: string;
  unidades: number;
  valor: number;
}

export interface TopClienteRow {
  customerName: string;
  valor: number;
  pedidos: number;
  ultimaCompra: string;
}

export interface TopVendedorRow {
  sellerName: string;
  pedidos: number;
  valor: number;
  ticketPromedio: number;
}

export interface CommercialData {
  summary: CommercialSummary;
  fulfillment: FulfillmentSummary;
  topReferencias: TopReferenciaRow[];
  topClientes: TopClienteRow[];
  topVendedores: TopVendedorRow[];
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface AgotadoRow {
  reference: string;
  productName: string;
  variantesAgotadas: number;
  totalVariantes: number;
  pedidosAfectados: number;
}

export interface StockCriticoRow {
  reference: string;
  color: string;
  size: string;
  disponible: number;
  productName: string;
}

export interface InventoryData {
  agotados: AgotadoRow[];
  stockCritico: StockCriticoRow[];
  totalVariantes: number;
  variantesAgotadas: number;
  variantesDisponibles: number;
  cobertura: number;
  lastSync: string | null;
}

// ── Production ────────────────────────────────────────────────────────────────

export interface ProductionData {
  openProductionOrders: number;
  closedProductionOrders: number;
  referencesInProduction: number;
  totalQuantityOrdered: number;
  recentOrders: number;
  productionHealth: "active" | "idle" | "unknown";
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export type AlertSeverity = "critica" | "alta" | "media" | "info";
export type AlertCategory =
  | "stock_critico"
  | "referencia_agotada"
  | "pedido_bloqueado"
  | "sync_error"
  | "cliente_bloqueado"
  | "produccion_detenida"
  | "cobranza_critica"
  | "sag_error";

export interface ExecutiveAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  category: AlertCategory;
  source: string;
  priority: number;
  action: string | null;
  relatedReference: string | null;
  relatedOrder: string | null;
  relatedCustomer: string | null;
  relatedProductionOrder: string | null;
  createdAt: string;
}

// ── Recommendations ───────────────────────────────────────────────────────────

export type RecommendationSeverity = "critica" | "alta" | "info";

export interface ExecutiveRecommendation {
  priority: number;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  source: string;
  confidence: number;
  relatedReference: string | null;
  relatedOrder: string | null;
  relatedCustomer: string | null;
  relatedProductionOrder: string | null;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "pedido_creado"
  | "pedido_sincronizado"
  | "pedido_entregado"
  | "inventario_agotado"
  | "inventario_recuperado"
  | "nueva_op"
  | "op_cerrada"
  | "entrada_pt"
  | "traslado_bodega"
  | "pago_recibido"
  | "cobranza_realizada"
  | "alerta_ia"
  | "actividad_usuario";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  source: string;
  reference: string | null;
  occurredAt: string;
}

// ── KPI Engine ────────────────────────────────────────────────────────────────

export interface ExecutiveKpis {
  pedidosDelDia: DailyKpi;
  ventasDelDia: DailyKpi;
  valorVendido: DailyKpi;
  clientesAtendidos: DailyKpi;
  vendedoresActivos: DailyKpi;
  ticketPromedio: DailyKpi;
  pedidosCompletos: number;
  pedidosParciales: number;
  pedidosBloqueados: number;
  referenciasAgotadas: number;
  referenciasCriticas: number;
  stockCritico: number;
  cumplimiento: number;
}

// ── Health ─────────────────────────────────────────────────────────────────────

export interface ExecutiveHealth {
  commercial: "healthy" | "degraded" | "unavailable";
  inventory: "healthy" | "degraded" | "unavailable";
  production: "healthy" | "degraded" | "unavailable";
  overall: "healthy" | "degraded" | "unavailable";
}

// ── Main Model ────────────────────────────────────────────────────────────────

export interface ExecutiveDashboard {
  summary: CommercialSummary;
  commercial: CommercialData;
  inventory: InventoryData;
  production: ProductionData;
  kpis: ExecutiveKpis;
  alerts: ExecutiveAlert[];
  recommendations: ExecutiveRecommendation[];
  timeline: TimelineEvent[];
  health: ExecutiveHealth;
  lastSync: string | null;
  generatedAt: string;

  // ── Convenience accessors (derived from above) ──────────────────────────
  agotados: AgotadoRow[];
  stockCritico: StockCriticoRow[];
  topReferencias: TopReferenciaRow[];
  topClientes: TopClienteRow[];
  topVendedores: TopVendedorRow[];
  fulfillment: FulfillmentSummary;
}
