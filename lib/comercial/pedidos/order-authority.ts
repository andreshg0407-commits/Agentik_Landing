/**
 * lib/comercial/pedidos/order-authority.ts
 *
 * Order origin classification, data authority rules, and go-live cutoff.
 *
 * Key principles:
 *   - Explicit source has priority over date-based classification.
 *   - AGENTIK_NATIVE data must never be degraded by SAG sync.
 *   - SAG sync may only reconcile specific fields on AGENTIK_NATIVE orders.
 *   - Every order has a clear authority per field group.
 *
 * Sprint: AGENTIK-ORDERS-SAG-HISTORICAL-READ-COMPLETENESS-01
 */

import type {
  OrderOrigin,
  OrderFieldAuthority,
  DataAuthority,
  LineDataStatus,
  ReconciliationStatus,
  SellerDisplayStatus,
} from "./order-types";

// ── Go-live cutoff ───────────────────────────────────────────────────────────

/**
 * Configurable go-live date for the Agentik orders module.
 *
 * Orders created BEFORE this date and originating from SAG → SAG_HISTORICAL.
 * Orders created AFTER this date from Agentik wizard → AGENTIK_NATIVE.
 *
 * IMPORTANT: The explicit source field ALWAYS has priority over date.
 * A SAG order created after go-live is still SAG_HISTORICAL.
 * An Agentik order created before go-live (edge case) is still AGENTIK_NATIVE.
 *
 * Set to null until the actual go-live day is configured.
 *
 * Procedure for go-live day:
 *   1. Set AGENTIK_ORDERS_GO_LIVE_AT to the go-live date (start of business day, UTC).
 *   2. Deploy. All new wizard orders will be classified AGENTIK_NATIVE.
 *   3. Historical SAG orders remain SAG_HISTORICAL regardless of date.
 *   4. No backfill should run on AGENTIK_NATIVE orders.
 *   5. SAG sync continues for historical orders only.
 */
export const AGENTIK_ORDERS_GO_LIVE_AT: Date | null = null;

// ── Origin classification ────────────────────────────────────────────────────

/**
 * Classify an order's canonical origin from its source indicators.
 *
 * Priority:
 *   1. Explicit origin field (if already set to a canonical value)
 *   2. Source system detection (AgentExecution vs CRMQuote vs CustomerOrderRecord)
 *   3. Go-live date (only as tiebreaker when source is ambiguous)
 */
export function classifyOrderOrigin(indicators: {
  /** Current origin field value */
  currentOrigin: OrderOrigin;
  /** Source system that created the record */
  sourceSystem: "agent_execution" | "crm_quote" | "customer_order_record";
  /** Order creation date */
  orderDate?: Date | null;
}): OrderOrigin {
  const { currentOrigin, sourceSystem } = indicators;

  // Already canonical — keep as-is
  if (currentOrigin === "SAG_HISTORICAL") return "SAG_HISTORICAL";
  if (currentOrigin === "AGENTIK_NATIVE") return "AGENTIK_NATIVE";
  if (currentOrigin === "CRM_LEGACY") return "CRM_LEGACY";

  // Classify by source system (explicit source > date)
  switch (sourceSystem) {
    case "agent_execution":
      return "AGENTIK_NATIVE";
    case "crm_quote":
      return "CRM_LEGACY";
    case "customer_order_record":
      return "SAG_HISTORICAL";
  }
}

// ── Field authority ──────────────────────────────────────────────────────────

/**
 * Returns the authoritative system for each field group.
 */
export function getFieldAuthority(origin: OrderOrigin): OrderFieldAuthority {
  switch (origin) {
    case "AGENTIK_NATIVE":
    case "agentik":
      return {
        header:   "AGENTIK",
        lines:    "AGENTIK",
        seller:   "AGENTIK",
        customer: "AGENTIK",
        status:   "AGENTIK", // until SAG accepts/rejects
        invoice:  "SAG",     // SAG issues the invoice
        dispatch: "SAG",     // SAG tracks dispatch
      };

    case "CRM_LEGACY":
    case "importado":
    case "migrado":
      return {
        header:   "CRM",
        lines:    "CRM",
        seller:   "CRM",
        customer: "CRM",
        status:   "SAG",
        invoice:  "SAG",
        dispatch: "SAG",
      };

    case "SAG_HISTORICAL":
    case "sag":
    case "sag_customer_order":
    default:
      return {
        header:   "SAG",
        lines:    "SAG",
        seller:   "SAG",
        customer: "SAG",
        status:   "SAG",
        invoice:  "SAG",
        dispatch: "SAG",
      };
  }
}

// ── Merge protection rules ───────────────────────────────────────────────────

/**
 * Check if a SAG sync update should be allowed for a specific field.
 *
 * Rules:
 *   - Never degrade Agentik data (replace non-empty with empty/null).
 *   - Never replace Agentik lines with an empty SAG line set.
 *   - Never remove Agentik seller because SAG doesn't return one.
 *   - Log differences as inconsistencies (but do not block).
 */
export function shouldAllowSagOverwrite(params: {
  origin: OrderOrigin;
  field: keyof OrderFieldAuthority;
  currentValue: unknown;
  sagValue: unknown;
}): { allowed: boolean; reason: string } {
  const { origin, field, currentValue, sagValue } = params;
  const authority = getFieldAuthority(origin);

  // SAG is authoritative for this field — allow
  if (authority[field] === "SAG") {
    return { allowed: true, reason: "sag_authoritative" };
  }

  // Agentik/CRM is authoritative — only allow if not degrading
  const currentEmpty = currentValue == null || currentValue === "" || currentValue === 0;
  const sagEmpty = sagValue == null || sagValue === "" || sagValue === 0;

  // Allow SAG to fill empty fields even on Agentik orders (enrichment, not degradation)
  if (currentEmpty && !sagEmpty) {
    return { allowed: true, reason: "sag_enrichment" };
  }

  // Block SAG from clearing Agentik data
  if (!currentEmpty && sagEmpty) {
    return { allowed: false, reason: "would_degrade_agentik_data" };
  }

  // Both have values — log as inconsistency but don't overwrite
  if (!currentEmpty && !sagEmpty && currentValue !== sagValue) {
    return { allowed: false, reason: "inconsistency_detected" };
  }

  return { allowed: true, reason: "no_change" };
}

// ── Line data status ─────────────────────────────────────────────────────────

/**
 * Classify the line data quality status for a given order.
 */
export function classifyLineDataStatus(params: {
  linesCount: number;
  headerAmount: number;
  orderStatus: string;
  sagLinesExist: boolean;
}): LineDataStatus {
  const { linesCount, headerAmount, orderStatus, sagLinesExist } = params;

  if (orderStatus === "CANCELADO" || orderStatus === "cancelado") {
    return "CANCELLED";
  }

  if (linesCount > 0) {
    return "COMPLETE";
  }

  // No lines locally
  if (!sagLinesExist && headerAmount === 0) {
    return "EMPTY_CONFIRMED";
  }

  if (!sagLinesExist && headerAmount > 0) {
    // Header has amount but SAG has no lines — unusual
    return "EMPTY_CONFIRMED";
  }

  if (sagLinesExist && linesCount === 0) {
    return "LINES_NOT_AVAILABLE";
  }

  return "SYNC_ERROR";
}

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Compare header total (SAG) vs computed line total.
 */
export function computeReconciliationStatus(params: {
  totalHeaderSag: number;
  totalLinesComputed: number;
  linesCount: number;
}): ReconciliationStatus {
  const { totalHeaderSag, totalLinesComputed, linesCount } = params;

  if (linesCount === 0) return "NOT_APPLICABLE";
  if (totalHeaderSag === 0 && totalLinesComputed === 0) return "MATCHED";

  // Allow 1% tolerance for rounding
  const diff = Math.abs(totalHeaderSag - totalLinesComputed);
  const base = Math.max(totalHeaderSag, totalLinesComputed, 1);
  if (diff / base < 0.01) return "MATCHED";

  return "DIFFERENCE";
}

// ── Seller display ──────────────────────────────────────────────────────────

/**
 * Resolve the seller display status for UI rendering.
 */
export function resolveSellerDisplayStatus(
  sellerSource: string | null | undefined,
  sellerConfidence: string | null | undefined,
): SellerDisplayStatus {
  if (!sellerSource || sellerSource === "none") return "UNAVAILABLE";
  if (sellerSource === "sag_movimientos" && sellerConfidence === "high") return "SAG_CONFIRMED";
  if (sellerSource === "crm_quote_history") return "CRM_INFERRED";
  return "UNAVAILABLE";
}

/**
 * Human-readable seller label for UI.
 */
export function sellerDisplayLabel(status: SellerDisplayStatus): string {
  switch (status) {
    case "SAG_CONFIRMED":  return "Vendedor SAG confirmado";
    case "CRM_INFERRED":   return "Vendedor inferido desde CRM";
    case "UNAVAILABLE":    return "No informado por SAG";
  }
}

/**
 * Human-readable line data label for UI.
 */
export function lineDataDisplayLabel(status: LineDataStatus): string {
  switch (status) {
    case "COMPLETE":            return "Detalle completo";
    case "EMPTY_CONFIRMED":     return "Pedido histórico sin detalle disponible";
    case "LINES_NOT_AVAILABLE": return "Líneas pendientes de sincronización";
    case "CANCELLED":           return "Pedido cancelado";
    case "SOURCE_MISMATCH":     return "Tipo de documento no corresponde";
    case "SYNC_ERROR":          return "Error de sincronización";
  }
}

/**
 * Human-readable reconciliation label for UI.
 */
export function reconciliationDisplayLabel(status: ReconciliationStatus): string {
  switch (status) {
    case "MATCHED":         return "Total conciliado";
    case "DIFFERENCE":      return "Total con diferencia";
    case "NOT_APPLICABLE":  return "Sin líneas para comparar";
    case "PENDING":         return "Pendiente de cálculo";
  }
}
