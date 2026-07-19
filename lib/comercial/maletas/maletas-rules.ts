/**
 * lib/comercial/maletas/maletas-rules.ts
 *
 * Pure business rule functions for the Maletas engine.
 * No side effects, no DB calls, no imports beyond types.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

import type {
  CaseItemStatus,
  CaseAlertSeverity,
  CaseAlertType,
  ReplenishmentAction,
} from "./maletas-types";

// ─── Rule 1 — Item status ──────────────────────────────────────────────────────

/**
 * Compute the operational status of a case item.
 *
 * Rules (in precedence order):
 * 1. disponible < 0 → sobre_comprometido (pedidos exceed inventario)
 * 2. disponible <= 0 AND productionInProcess → en_proceso
 * 3. disponible <= 0 → sin_stock
 * 4. disponible < minimumRequired → bajo_minimo
 * 5. else → ok
 */
export function computeItemStatus(
  disponible: number,
  minimumRequired: number,
  productionInProcess: boolean,
): CaseItemStatus {
  if (disponible < 0) return "sobre_comprometido";
  if (disponible === 0 && productionInProcess) return "en_proceso";
  if (disponible <= 0) return "sin_stock";
  if (disponible < minimumRequired) return "bajo_minimo";
  return "ok";
}

// ─── Rule 2 — Recommended action ──────────────────────────────────────────────

/**
 * Compute the recommended replenishment action for an item.
 *
 * Rules:
 * - sobre_comprometido → REVISAR (manual resolution required)
 * - ok → OK
 * - bajo_minimo | sin_stock AND availableToReplenish > 0 → REPONER_MALETA
 * - bajo_minimo | sin_stock AND productionInProcess → ESPERAR_LOTE
 * - bajo_minimo | sin_stock AND no available AND no batch → PRODUCIR
 * - en_proceso → ESPERAR_LOTE (but keep alert if missing is large)
 */
export function computeRecommendedAction(
  status: CaseItemStatus,
  availableToReplenish: number,
  productionInProcess: boolean,
): ReplenishmentAction {
  if (status === "sobre_comprometido") return "REVISAR";
  if (status === "ok") return "OK";
  if (status === "en_proceso") return "ESPERAR_LOTE";

  // bajo_minimo or sin_stock
  if (availableToReplenish > 0) return "REPONER_MALETA";
  if (productionInProcess) return "ESPERAR_LOTE";
  return "PRODUCIR";
}

// ─── Rule 3 — Alert severity ───────────────────────────────────────────────────

/**
 * Compute the severity of an alert based on status and missing units.
 *
 * Rules:
 * - sobre_comprometido → urgente (always)
 * - sin_stock AND no batch AND missingUnits >= 1 → urgente
 * - bajo_minimo AND missingUnits >= 2 → alta
 * - bajo_minimo AND missingUnits == 1 → normal
 * - en_proceso (only if we still emit an alert) → normal
 */
export function computeAlertSeverity(
  status: CaseItemStatus,
  missingUnits: number,
): CaseAlertSeverity {
  if (status === "sobre_comprometido") return "urgente";
  if (status === "sin_stock") return "urgente";
  if (status === "bajo_minimo" && missingUnits >= 2) return "alta";
  return "normal";
}

// ─── Rule 4 — Alert type ───────────────────────────────────────────────────────

export function computeAlertType(status: CaseItemStatus): CaseAlertType | null {
  switch (status) {
    case "sobre_comprometido": return "SOBRE_COMPROMETIDO";
    case "sin_stock":          return "SIN_STOCK";
    case "bajo_minimo":        return "BAJO_MINIMO";
    case "en_proceso":         return "EN_PROCESO";
    default:                   return null; // ok — no alert
  }
}

// ─── Rule 5 — Alert reason (human-readable) ───────────────────────────────────

export function buildAlertReason(
  status: CaseItemStatus,
  currentUnits: number,
  minimumRequired: number,
  batchLabel: string | null,
): string {
  switch (status) {
    case "sobre_comprometido":
      return `Disponible negativo (${currentUnits}). Pedidos superan inventario. Revisar SAG.`;
    case "sin_stock":
      return `Sin stock disponible (${currentUnits}). Mínimo requerido: ${minimumRequired}.`;
    case "bajo_minimo":
      return `Stock insuficiente: ${currentUnits} unidades. Mínimo requerido: ${minimumRequired}.`;
    case "en_proceso":
      return `Sin stock. Lote en proceso${batchLabel ? `: ${batchLabel}` : ""}. Reposición pendiente.`;
    default:
      return "";
  }
}

// ─── Rule 6 — Multi-vendor priority boost ─────────────────────────────────────

/**
 * Priority boost when multiple vendors need the same reference.
 * Returns a multiplier (>1 = higher priority).
 *
 * Rule: if N vendors are affected, priority weight increases by 0.5 per additional vendor.
 */
export function computeMultiVendorBoost(affectedVendorCount: number): number {
  return 1 + (Math.max(1, affectedVendorCount) - 1) * 0.5;
}

// ─── Rule 7 — Production suggestion quantity ──────────────────────────────────

/**
 * Suggested production quantity = totalMissing × safety multiplier.
 * Safety multiplier = 1.5 (round up to nearest integer).
 * Minimum suggestion: 1.
 */
export function computeSuggestedProductionQty(totalMissing: number): number {
  return Math.max(1, Math.ceil(totalMissing * 1.5));
}

// ─── Rule 8 — Production recommendation priority ──────────────────────────────

/**
 * Compute a production recommendation priority score.
 * Lower number = higher priority (0 is most urgent).
 *
 * Factors:
 * - Number of affected vendors (more vendors → higher priority)
 * - Total missing units (more missing → higher priority)
 * - Available to replenish (if >0, deprioritize — can reponer instead)
 */
export function computeProductionPriority(
  affectedVendorCount: number,
  totalMissing: number,
  availableToReplenish: number,
): number {
  const vendorScore = affectedVendorCount * 10;
  const missingScore = totalMissing * 2;
  const replenishPenalty = availableToReplenish > 0 ? 50 : 0; // if stock exists, deprioritize production
  return Math.max(0, 100 - vendorScore - missingScore + replenishPenalty);
}

// ─── Rule 9 — Should emit alert for en_proceso status ─────────────────────────

/**
 * Even when production is in process, emit an alert if the current missing
 * units are high relative to the minimum.
 */
export function shouldAlertOnEnProceso(
  missingUnits: number,
  minimumRequired: number,
): boolean {
  return missingUnits >= minimumRequired; // missing 100% or more of minimum
}
