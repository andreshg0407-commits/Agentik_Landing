/**
 * lib/comercial/tiendas/store-network-alerts.ts
 *
 * AGENTIK-STORES-SAG-OFFICIAL-BALANCE-MIGRATION-01 — NOVENO
 *
 * Deterministic alert classification for store network products.
 * No AI. No inference. No heuristics. Pure rules.
 *
 * Pure domain — no Prisma, no React, no server-only.
 */

import type {
  StoreProductAlertState,
  StoreNodeSourceStatus,
} from "./store-network-types";
import type { InventoryBalanceSourceLabel } from "../../inventory/inventory-control-types";

// ── Low stock threshold ─────────────────────────────────────────────────────

/**
 * Default low-stock threshold for store products.
 * Future: configurable per store/line via policy rules.
 */
const LOW_STOCK_THRESHOLD = 5;

// ── Alert Resolution ────────────────────────────────────────────────────────

/**
 * Resolve the alert state for a single product at a single node.
 *
 * Priority order (first match wins):
 * 1. OFFICIAL_NOT_FOUND — SAG query OK but ref absent from view
 * 2. STALE_SOURCE       — source data is stale or degraded
 * 3. NEGATIVE_STOCK     — disponible < 0 (over-committed)
 * 4. ONLY_RESERVED      — existencia > 0 but disponible <= 0
 * 5. OUT_OF_STOCK       — existencia = 0 and disponible <= 0
 * 6. LOW_STOCK          — disponible > 0 but <= threshold
 * 7. HEALTHY            — none of the above
 *
 * OVERSTOCK is intentionally not resolved here — requires
 * configured max thresholds per store/line (future sprint).
 */
export function resolveProductAlertState(input: {
  officialOnHand: number;
  officialReserved: number;
  officialAvailable: number;
  balanceSource: InventoryBalanceSourceLabel;
  sourceStatus: StoreNodeSourceStatus;
}): StoreProductAlertState {
  const { officialOnHand, officialAvailable, balanceSource, sourceStatus } = input;

  // Source-level alerts (highest priority)
  if (balanceSource === "SAG_OFFICIAL_NOT_FOUND") return "OFFICIAL_NOT_FOUND";
  if (balanceSource === "UNAVAILABLE") return "OFFICIAL_NOT_FOUND";
  if (sourceStatus === "STALE" || sourceStatus === "DEGRADED") return "STALE_SOURCE";

  // Inventory-level alerts
  if (officialAvailable < 0) return "NEGATIVE_STOCK";
  if (officialOnHand > 0 && officialAvailable <= 0) return "ONLY_RESERVED";
  if (officialOnHand <= 0 && officialAvailable <= 0) return "OUT_OF_STOCK";
  if (officialAvailable > 0 && officialAvailable <= LOW_STOCK_THRESHOLD) return "LOW_STOCK";

  return "HEALTHY";
}

// ── Node-Level Alert Summary ────────────────────────────────────────────────

export interface StoreNodeAlertSummary {
  outOfStock: number;
  lowStock: number;
  onlyReserved: number;
  negativeStock: number;
  staleSource: number;
  officialNotFound: number;
  healthy: number;
  total: number;
}

/**
 * Summarize alert states across all products at a node.
 */
export function summarizeAlerts(
  alertStates: StoreProductAlertState[],
): StoreNodeAlertSummary {
  const summary: StoreNodeAlertSummary = {
    outOfStock: 0,
    lowStock: 0,
    onlyReserved: 0,
    negativeStock: 0,
    staleSource: 0,
    officialNotFound: 0,
    healthy: 0,
    total: alertStates.length,
  };

  for (const state of alertStates) {
    switch (state) {
      case "OUT_OF_STOCK": summary.outOfStock++; break;
      case "LOW_STOCK": summary.lowStock++; break;
      case "ONLY_RESERVED": summary.onlyReserved++; break;
      case "NEGATIVE_STOCK": summary.negativeStock++; break;
      case "STALE_SOURCE": summary.staleSource++; break;
      case "OFFICIAL_NOT_FOUND": summary.officialNotFound++; break;
      case "OVERSTOCK": break; // Future
      case "HEALTHY": summary.healthy++; break;
    }
  }

  return summary;
}
