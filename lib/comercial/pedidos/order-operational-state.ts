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

// ── Operational KPI filter keys ──────────────────────────────────────────────

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

/**
 * Computes operational KPIs from a list of OrderCards.
 * Pure function — no DB.
 */
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
    {
      key: "borradores",
      label: "Borradores",
      count: stats.borradores,
      tooltip: "Pedidos en borrador pendientes de completar",
    },
    {
      key: "listos_para_sag",
      label: "Listos para SAG",
      count: stats.listos_para_sag,
      tooltip: "Pedidos listos para enviar a SAG",
    },
    {
      key: "en_simulacion",
      label: "En simulacion",
      count: stats.en_simulacion,
      tooltip: "Pedidos en modo simulacion SAG",
    },
    {
      key: "sincronizados",
      label: "Sincronizados",
      count: stats.sincronizados,
      tooltip: "Pedidos confirmados en SAG",
    },
    {
      key: "con_conflicto",
      label: "Con conflicto",
      count: stats.con_conflicto,
      tooltip: "Pedidos con conflicto que requieren revision",
    },
  ];
}

/**
 * Maps a KPI filter key to order status for API filtering.
 */
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
