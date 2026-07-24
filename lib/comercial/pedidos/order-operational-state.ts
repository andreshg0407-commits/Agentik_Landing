/**
 * lib/comercial/pedidos/order-operational-state.ts
 *
 * Composite operational state resolver for orders.
 * Derives a single user-facing state from multiple independent dimensions:
 *   admin status + reservation + SAG sync + fulfillment.
 *
 * Pure function — no DB, no side effects.
 *
 * Sprint: AGENTIK-ORDERS-OPERATIONS-REFINEMENT-01
 */

import type { OrderStatus, OrderOrigin, OrderSyncState, SellerDisplayStatus } from "./order-types";
import { resolveSellerDisplayStatus } from "./order-authority";

// ── Operational state ────────────────────────────────────────────────────────

export type OperationalState =
  | "borrador"
  | "sin_reserva"
  | "reservado"
  | "conflicto_inventario"
  | "reserva_expirada"
  | "listo_para_sag"
  | "en_simulacion"
  | "en_cola"
  | "enviando"
  | "sincronizado"
  | "rechazado"
  | "cancelado"
  | "facturado"
  | "despachado";

export interface OperationalStateInput {
  status: OrderStatus;
  origin: OrderOrigin;
  syncState: OrderSyncState;
  sagOrderId: string | null;
  sagError: string | null;
  fulfillmentStatus: string;
  /** Whether the order has active reservations */
  hasReservation?: boolean;
  /** Whether any reservation conflict exists */
  hasConflict?: boolean;
  /** Whether reservation has expired */
  reservationExpired?: boolean;
  /** SAG write mode for the tenant */
  sagWriteMode?: "DISABLED" | "SIMULATION" | "LIVE";
}

/**
 * Resolves the composite operational state for an order.
 *
 * Priority (highest wins):
 * 1. cancelado — terminal
 * 2. rechazado — SAG error on sent order
 * 3. reserva_expirada — reservation TTL exceeded
 * 4. conflicto_inventario — reservation conflict
 * 5. despachado / facturado — post-sync fulfillment
 * 6. sincronizado — SAG confirmed
 * 7. enviando / en_cola / en_simulacion — in-flight
 * 8. listo_para_sag — ready to send
 * 9. reservado — reservation active
 * 10. sin_reserva — draft without reservation
 * 11. borrador — initial state
 */
export function resolveOperationalState(input: OperationalStateInput): OperationalState {
  const {
    status, origin, syncState, sagOrderId, sagError,
    fulfillmentStatus,
    hasReservation, hasConflict, reservationExpired,
    sagWriteMode,
  } = input;

  // Terminal states
  if (status === "cancelado") return "cancelado";

  // SAG rejection (has error + was sent)
  if (status === "conflicto" && sagError) return "rechazado";
  if (status === "conflicto") return "conflicto_inventario";

  // Reservation problems override "ready" states
  if (reservationExpired && status !== "sincronizado") return "reserva_expirada";
  if (hasConflict && status !== "sincronizado") return "conflicto_inventario";

  // Post-sync fulfillment
  if (status === "sincronizado" || syncState === "sincronizado") {
    if (fulfillmentStatus === "facturado_completo" || fulfillmentStatus === "facturado_parcial") {
      return "facturado";
    }
    // SAG historical orders that are DESPACHADO
    if (fulfillmentStatus === "despachado") return "despachado";
    return "sincronizado";
  }

  // In-flight to SAG
  if (status === "pendiente_sag") {
    if (sagWriteMode === "SIMULATION") return "en_simulacion";
    if (sagOrderId) return "enviando";
    return "en_cola";
  }

  // Ready to send
  if (status === "listo_para_enviar") return "listo_para_sag";

  // Draft states
  if (status === "borrador") {
    if (hasReservation) return "reservado";
    return "borrador";
  }

  return "borrador";
}

// ── Display labels ───────────────────────────────────────────────────────────

export const OPERATIONAL_STATE_LABEL: Record<OperationalState, string> = {
  borrador:              "Borrador",
  sin_reserva:           "Sin reserva",
  reservado:             "Reservado",
  conflicto_inventario:  "Conflicto inventario",
  reserva_expirada:      "Reserva expirada",
  listo_para_sag:        "Listo para SAG",
  en_simulacion:         "En simulacion",
  en_cola:               "En cola",
  enviando:              "Enviando",
  sincronizado:          "Sincronizado",
  rechazado:             "Rechazado",
  cancelado:             "Cancelado",
  facturado:             "Facturado",
  despachado:            "Despachado",
};

export const OPERATIONAL_STATE_COLOR: Record<OperationalState, { bg: string; text: string }> = {
  borrador:              { bg: "#f5f5f5", text: "#737373" },
  sin_reserva:           { bg: "#f5f5f5", text: "#737373" },
  reservado:             { bg: "#dbeafe", text: "#004AAD" },
  conflicto_inventario:  { bg: "#fee2e2", text: "#dc2626" },
  reserva_expirada:      { bg: "#fef3c7", text: "#d97706" },
  listo_para_sag:        { bg: "#dbeafe", text: "#004AAD" },
  en_simulacion:         { bg: "#fef3c7", text: "#d97706" },
  en_cola:               { bg: "#fef3c7", text: "#d97706" },
  enviando:              { bg: "#fef3c7", text: "#d97706" },
  sincronizado:          { bg: "#dcfce7", text: "#16a34a" },
  rechazado:             { bg: "#fee2e2", text: "#dc2626" },
  cancelado:             { bg: "#f5f5f5", text: "#a3a3a3" },
  facturado:             { bg: "#dcfce7", text: "#16a34a" },
  despachado:            { bg: "#dcfce7", text: "#16a34a" },
};

// ── Seller display text ──────────────────────────────────────────────────────

/**
 * Returns the appropriate seller display text based on origin and resolution.
 */
export function resolveSellerDisplayText(
  origin: string,
  sellerName: string | null | undefined,
  sellerSource: string | null | undefined,
  sellerConfidence: string | null | undefined,
): { text: string; secondary: string | null; status: SellerDisplayStatus } {
  const displayStatus = resolveSellerDisplayStatus(sellerSource, sellerConfidence);

  if (sellerName && sellerName.trim()) {
    const isHistorical = origin === "SAG_HISTORICAL" || origin === "sag_customer_order" || origin === "sag";
    const isCrm = origin === "CRM_LEGACY";

    if (displayStatus === "CRM_INFERRED") {
      return { text: sellerName, secondary: "Inferido", status: displayStatus };
    }
    if (displayStatus === "SAG_CONFIRMED" || isHistorical || isCrm) {
      return { text: sellerName, secondary: null, status: displayStatus };
    }
    return { text: sellerName, secondary: null, status: displayStatus };
  }

  // No seller name
  const isAgentik = origin === "agentik" || origin === "AGENTIK_NATIVE";
  if (isAgentik) {
    return { text: "Sin vendedor asignado", secondary: null, status: "UNAVAILABLE" };
  }

  return { text: "No informado por SAG", secondary: null, status: "UNAVAILABLE" };
}

// ── Calibrated KPI system (AGENTIK-ORDERS-KPI-CALIBRATION-01) ───────────────

export type CalibratedKpiKey =
  | "valor_pedidos_hoy"
  | "pedidos_de_hoy"
  | "pendientes_envio_sag"
  | "sincronizados_agentik"
  | "con_conflicto";

export interface CalibratedKpi {
  key: CalibratedKpiKey;
  label: string;
  value: number;
  formatted: string;
  tooltip: string;
  /** Whether this is a monetary KPI */
  monetary: boolean;
}

export interface CalibratedKpiStats {
  valorPedidosHoy: number;
  pedidosDeHoy: number;
  pendientesEnvioSag: number;
  sincronizadosAgentik: number;
  conConflicto: number;
}

/** Minimal order shape for KPI computation */
export interface OrderKpiInput {
  status: OrderStatus;
  origin: OrderOrigin;
  syncState: OrderSyncState;
  totalValue: number;
  createdAt: string;
  sagOrderId?: string | null;
  sagError?: string | null;
  /** Whether reservation conflict exists */
  hasConflict?: boolean;
  /** Whether reservation has expired */
  reservationExpired?: boolean;
}

/**
 * Returns true if origin is AGENTIK_NATIVE (canonical or legacy).
 */
function isAgentikNative(origin: string): boolean {
  return origin === "AGENTIK_NATIVE" || origin === "agentik";
}

/**
 * Returns true if order's commercial date falls on the given calendar day.
 * Uses createdAt as proxy for commercial date (header.orderDate is only in OrderDraft).
 * The `todayStart` is pre-computed in tenant timezone.
 */
function isOrderToday(createdAt: string, todayStart: Date, tomorrowStart: Date): boolean {
  const d = new Date(createdAt);
  return d >= todayStart && d < tomorrowStart;
}

/**
 * Computes calibrated KPI stats from the FULL (unfiltered) order dataset.
 *
 * Rules:
 * - "Valor pedidos hoy" / "Pedidos de hoy": commercial date = today, excludes cancelados.
 * - "Pendientes de envio a SAG": AGENTIK_NATIVE only, status in [listo_para_enviar, pendiente_sag, conflicto without terminal rejection].
 *   Excludes SAG_HISTORICAL, CRM_LEGACY, borradores, sincronizados, cancelados.
 * - "Sincronizados con SAG": AGENTIK_NATIVE only, status === sincronizado.
 *   Does NOT include SAG_HISTORICAL (those 9,562 go to origin filter, not this KPI).
 * - "Con conflicto": any origin, orders requiring intervention — conflicto, reserva_expirada, reservation conflict.
 *
 * @param allOrders  The COMPLETE unfiltered order list — never a page or filtered subset.
 * @param tenantTimezoneOffset  Timezone offset in minutes (e.g., -300 for COT America/Bogota).
 */
export function computeCalibratedKpiStats(
  allOrders: OrderKpiInput[],
  tenantTimezoneOffset: number = -300,
): CalibratedKpiStats {
  // Compute today boundaries in tenant timezone
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tenantMs = utcMs - tenantTimezoneOffset * 60_000;
  const tenantNow = new Date(tenantMs);
  const todayStart = new Date(Date.UTC(
    tenantNow.getUTCFullYear(), tenantNow.getUTCMonth(), tenantNow.getUTCDate(),
  ));
  // Adjust back to UTC
  todayStart.setMinutes(todayStart.getMinutes() + tenantTimezoneOffset);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);

  let valorHoy = 0;
  let pedidosHoy = 0;
  let pendientesSag = 0;
  let sincronizadosAgentik = 0;
  let conConflicto = 0;

  for (const o of allOrders) {
    const cancelled = o.status === "cancelado";

    // Today KPIs: any non-cancelled order with today's commercial date
    if (!cancelled && isOrderToday(o.createdAt, todayStart, tomorrowStart)) {
      pedidosHoy++;
      valorHoy += o.totalValue;
    }

    // Pendientes de envio a SAG: AGENTIK_NATIVE only
    if (isAgentikNative(o.origin) && !cancelled) {
      if (o.status === "listo_para_enviar" || o.status === "pendiente_sag") {
        pendientesSag++;
      }
      // Conflicto that is retryable (SAG rejected but can be fixed)
      if (o.status === "conflicto" && !o.sagError) {
        pendientesSag++;
      }
    }

    // Sincronizados con SAG: AGENTIK_NATIVE only, successful sync
    if (isAgentikNative(o.origin) && o.status === "sincronizado") {
      sincronizadosAgentik++;
    }

    // Con conflicto: any origin, requires intervention
    if (o.status === "conflicto") {
      conConflicto++;
    }
    if (o.hasConflict && o.status !== "sincronizado" && o.status !== "cancelado") {
      // Reservation conflict not already counted
      if (o.status !== "conflicto") conConflicto++;
    }
    if (o.reservationExpired && o.status !== "sincronizado" && o.status !== "cancelado") {
      conConflicto++;
    }
  }

  return {
    valorPedidosHoy: valorHoy,
    pedidosDeHoy: pedidosHoy,
    pendientesEnvioSag: pendientesSag,
    sincronizadosAgentik,
    conConflicto,
  };
}

/**
 * Formats a monetary value for display.
 */
function formatCurrency(value: number): string {
  if (value === 0) return "\u2014";
  return "$" + Math.round(value).toLocaleString("es-CO");
}

export function buildCalibratedKpis(stats: CalibratedKpiStats): CalibratedKpi[] {
  return [
    {
      key: "valor_pedidos_hoy",
      label: "Valor pedidos hoy",
      value: stats.valorPedidosHoy,
      formatted: formatCurrency(stats.valorPedidosHoy),
      tooltip: "Suma del valor total de pedidos con fecha comercial de hoy. Excluye cancelados.",
      monetary: true,
    },
    {
      key: "pedidos_de_hoy",
      label: "Pedidos de hoy",
      value: stats.pedidosDeHoy,
      formatted: stats.pedidosDeHoy > 0 ? String(stats.pedidosDeHoy) : "\u2014",
      tooltip: "Cantidad de pedidos con fecha comercial de hoy. Excluye cancelados.",
      monetary: false,
    },
    {
      key: "pendientes_envio_sag",
      label: "Pendientes de envio a SAG",
      value: stats.pendientesEnvioSag,
      formatted: stats.pendientesEnvioSag > 0 ? String(stats.pendientesEnvioSag) : "\u2014",
      tooltip: "Pedidos creados en Agentik listos o en proceso de envio a SAG. No incluye borradores ni historicos.",
      monetary: false,
    },
    {
      key: "sincronizados_agentik",
      label: "Sincronizados con SAG",
      value: stats.sincronizadosAgentik,
      formatted: stats.sincronizadosAgentik > 0 ? String(stats.sincronizadosAgentik) : "\u2014",
      tooltip: "Pedidos creados en Agentik y aceptados por SAG. No incluye pedidos historicos importados.",
      monetary: false,
    },
    {
      key: "con_conflicto",
      label: "Con conflicto",
      value: stats.conConflicto,
      formatted: stats.conConflicto > 0 ? String(stats.conConflicto) : "\u2014",
      tooltip: "Pedidos con conflicto de reserva, rechazo SAG, o error que requiere intervencion.",
      monetary: false,
    },
  ];
}

/**
 * Quick filter type for the orders table.
 * "Borradores" becomes "Pedidos por completar" and is a quick filter, not a KPI.
 */
export type QuickFilterKey =
  | "todos"
  | "hoy"
  | "por_completar"
  | "pendientes_sag"
  | "sincronizados"
  | "conflictos";

export const QUICK_FILTER_LABELS: Record<QuickFilterKey, string> = {
  todos:           "Todos",
  hoy:             "Hoy",
  por_completar:   "Por completar",
  pendientes_sag:  "Pendientes SAG",
  sincronizados:   "Confirmados",
  conflictos:      "Conflictos",
};

/**
 * Client-side filter predicate for quick filters.
 * Operates on the full dataset without server round-trips.
 *
 * @param allOrders  Complete unfiltered order list.
 * @param filter     Active quick filter.
 * @param tenantTimezoneOffset  Timezone offset in minutes.
 */
export function applyQuickFilter(
  allOrders: OrderKpiInput[],
  filter: QuickFilterKey,
  tenantTimezoneOffset: number = -300,
): OrderKpiInput[] {
  if (filter === "todos") return allOrders;

  // Compute today boundaries
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tenantMs = utcMs - tenantTimezoneOffset * 60_000;
  const tenantNow = new Date(tenantMs);
  const todayStart = new Date(Date.UTC(
    tenantNow.getUTCFullYear(), tenantNow.getUTCMonth(), tenantNow.getUTCDate(),
  ));
  todayStart.setMinutes(todayStart.getMinutes() + tenantTimezoneOffset);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);

  switch (filter) {
    case "hoy":
      return allOrders.filter(o =>
        o.status !== "cancelado" && isOrderToday(o.createdAt, todayStart, tomorrowStart),
      );
    case "por_completar":
      return allOrders.filter(o =>
        isAgentikNative(o.origin) && o.status === "borrador",
      );
    case "pendientes_sag":
      return allOrders.filter(o =>
        isAgentikNative(o.origin)
        && o.status !== "cancelado"
        && (o.status === "listo_para_enviar" || o.status === "pendiente_sag"
          || (o.status === "conflicto" && !o.sagError)),
      );
    case "sincronizados":
      return allOrders.filter(o => o.status === "sincronizado");
    case "conflictos":
      return allOrders.filter(o =>
        o.status === "conflicto"
        || (o.hasConflict && o.status !== "sincronizado" && o.status !== "cancelado")
        || (o.reservationExpired && o.status !== "sincronizado" && o.status !== "cancelado"),
      );
    default:
      return allOrders;
  }
}

/**
 * Maps a calibrated KPI key to the corresponding quick filter.
 */
export function kpiKeyToQuickFilter(key: CalibratedKpiKey): QuickFilterKey {
  switch (key) {
    case "valor_pedidos_hoy":     return "hoy";
    case "pedidos_de_hoy":        return "hoy";
    case "pendientes_envio_sag":  return "pendientes_sag";
    case "sincronizados_agentik": return "sincronizados";
    case "con_conflicto":         return "conflictos";
  }
}

// ── Legacy KPI exports (kept for test backward compatibility) ────────────────

export type OperationalKpiKey =
  | "borradores"
  | "listos_para_sag"
  | "en_simulacion"
  | "sincronizados"
  | "con_conflicto";

export interface OperationalKpi {
  key: OperationalKpiKey;
  label: string;
  count: number;
  tooltip: string;
}

export interface OperationalStats {
  borradores: number;
  listos_para_sag: number;
  en_simulacion: number;
  sincronizados: number;
  con_conflicto: number;
  total: number;
}

export function computeOperationalStats(
  orders: Array<{ status: OrderStatus; origin: OrderOrigin }>,
): OperationalStats {
  let borradores = 0;
  let listos = 0;
  let simulacion = 0;
  let sincronizados = 0;
  let conflictos = 0;

  for (const o of orders) {
    switch (o.status) {
      case "borrador":          borradores++; break;
      case "listo_para_enviar": listos++; break;
      case "pendiente_sag":     simulacion++; break;
      case "sincronizado":      sincronizados++; break;
      case "conflicto":         conflictos++; break;
    }
  }

  return {
    borradores,
    listos_para_sag: listos,
    en_simulacion: simulacion,
    sincronizados,
    con_conflicto: conflictos,
    total: orders.length,
  };
}

export function buildOperationalKpis(stats: OperationalStats): OperationalKpi[] {
  return [
    { key: "borradores",      label: "Borradores",      count: stats.borradores,      tooltip: "Pedidos en borrador pendientes de completar" },
    { key: "listos_para_sag", label: "Listos para SAG",  count: stats.listos_para_sag, tooltip: "Pedidos listos para enviar a SAG" },
    { key: "en_simulacion",   label: "En simulacion",    count: stats.en_simulacion,   tooltip: "Pedidos en modo simulacion SAG" },
    { key: "sincronizados",   label: "Sincronizados",    count: stats.sincronizados,   tooltip: "Pedidos confirmados en SAG" },
    { key: "con_conflicto",   label: "Con conflicto",    count: stats.con_conflicto,   tooltip: "Pedidos con conflicto que requieren revision" },
  ];
}

export function kpiKeyToStatusFilter(key: OperationalKpiKey): OrderStatus | null {
  switch (key) {
    case "borradores":       return "borrador";
    case "listos_para_sag":  return "listo_para_enviar";
    case "en_simulacion":    return "pendiente_sag";
    case "sincronizados":    return "sincronizado";
    case "con_conflicto":    return "conflicto";
    default:                 return null;
  }
}

// ── EMPTY_CONFIRMED display ──────────────────────────────────────────────────

/**
 * Returns the appropriate display text for orders with no lines.
 */
export function emptyOrderExplanation(
  lineCount: number,
  origin: string,
  status: string,
): string | null {
  if (lineCount > 0) return null;

  const isHistorical = origin === "SAG_HISTORICAL" || origin === "sag_customer_order";
  if (!isHistorical) return null;

  if (status === "cancelado") {
    return "Pedido cancelado sin detalle de lineas.";
  }

  return "Pedido historico confirmado sin detalle de lineas en SAG.";
}
