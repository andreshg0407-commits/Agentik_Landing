/**
 * lib/comercial/demand/production-pressure.ts
 *
 * Production pressure signal engine.
 *
 * Combines:
 *   - PD pending orders (commercial demand not yet invoiced)
 *   - availableForCases (bodega - reservas)
 *   - coverageStatus (from maletas coverage engine)
 *   - productionInProcess (batch in flight)
 *   - historical sales velocity
 *
 * Output: ProductionPressureSignal[] — one per ref with pressure score + action.
 *
 * Pure functions — no Prisma, no side effects.
 * Server-only file.
 *
 * Sprint: AGENTIK-SAG-PD-DEMAND-LAYER-01
 */

import type {
  ProductionPressureSignal,
  DemandPressureSignal,
} from "./demand-types";
import type { CoverageSignal } from "../maletas/maletas-intelligence-types";
import type { CaseItem } from "../maletas/maletas-types";

// ─── Score weights ────────────────────────────────────────────────────────────

const W_STOCKOUT          = 40;  // availableForCases <= 0
const W_PENDING_CRITICAL  = 30;  // pending orders AND no stock
const W_RUPTURE_IMMINENT  = 25;  // ruptura_inminente status
const W_COVERAGE_LOW      = 15;  // cobertura_baja status
const W_PENDING_ANY       = 10;  // any pending orders exist
const W_NO_BATCH          = 10;  // no production batch in flight
const W_MULTI_VENDOR      = 10;  // more than 2 vendors affected

// ─── Action computation ───────────────────────────────────────────────────────

function computeRecommendedAction(
  availableForCases: number,
  pendingOrdersQty:  number,
  productionInProcess: boolean,
  coverageStatus:    string,
  availableToReplenish: number,
): ProductionPressureSignal["recommendedAction"] {
  // No pressure
  if (pendingOrdersQty <= 0 && availableForCases > 0 &&
      coverageStatus !== "sin_stock" && coverageStatus !== "ruptura_inminente") {
    return "sin_accion";
  }

  // Batch is in flight — wait
  if (productionInProcess) return "esperar_lote";

  // No stock + pending orders → produce
  if (availableForCases <= 0 && pendingOrdersQty > 0) return "producir";

  // Stock available elsewhere to replenish
  if (availableToReplenish > 0) return "reponer";

  // Pending orders but coverage seems ok — review
  if (pendingOrdersQty > 0 && (
    coverageStatus === "cobertura_estable" ||
    coverageStatus === "cobertura_alta"
  )) return "revisar_pedido";

  // No stock, no pending orders → still produce
  if (availableForCases <= 0) return "producir";

  return "sin_accion";
}

// ─── Pressure score ────────────────────────────────────────────────────────────

function computePressureScore(
  availableForCases:   number,
  pendingOrdersQty:    number,
  productionInProcess: boolean,
  coverageStatus:      string,
  vendorCount:         number,
): number {
  let score = 0;

  if (availableForCases <= 0) {
    score += W_STOCKOUT;
    if (pendingOrdersQty > 0) score += W_PENDING_CRITICAL;
    if (!productionInProcess) score += W_NO_BATCH;
  } else if (coverageStatus === "ruptura_inminente") {
    score += W_RUPTURE_IMMINENT;
    if (pendingOrdersQty > 0) score += W_PENDING_ANY;
  } else if (coverageStatus === "cobertura_baja") {
    score += W_COVERAGE_LOW;
    if (pendingOrdersQty > 0) score += W_PENDING_ANY;
  } else if (pendingOrdersQty > 0) {
    score += W_PENDING_ANY;
  }

  if (vendorCount > 2) score += W_MULTI_VENDOR;

  return Math.min(100, Math.max(0, score));
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build production pressure signals by combining coverage signals with
 * pending orders (SAG PD) and item-level data.
 *
 * @param coverageSignals  — from maletas coverage engine (includes pendingOrdersQty)
 * @param items            — case items (for productionInProcess + availableToReplenish)
 * @param pendingOrdersMap — SAG PD quantities per ref (key = UPPERCASE refCode)
 */
export function buildProductionPressureSignals(
  coverageSignals:  CoverageSignal[],
  items:            CaseItem[],
  pendingOrdersMap: Map<string, number>,
): ProductionPressureSignal[] {
  // Build item lookup: refCode → first item with that ref
  const itemByRef = new Map<string, CaseItem>();
  for (const item of items) {
    const key = item.reference.toUpperCase();
    if (!itemByRef.has(key)) itemByRef.set(key, item);
  }

  const signals: ProductionPressureSignal[] = [];

  for (const cs of coverageSignals) {
    const refUpper         = cs.refCode.toUpperCase();
    const pendingOrdersQty = pendingOrdersMap.get(refUpper) ?? 0;
    const item             = itemByRef.get(refUpper);

    // Only generate signals where there is pressure
    const hasPressure =
      pendingOrdersQty > 0 ||
      cs.status === "sin_stock" ||
      cs.status === "ruptura_inminente" ||
      cs.status === "cobertura_baja";

    if (!hasPressure) continue;

    const productionInProcess  = item?.productionInProcess ?? false;
    const availableToReplenish = item?.availableToReplenish ?? 0;
    const vendorCount          = cs.affectedSalesRepIds.length;

    const pressureScore = computePressureScore(
      cs.disponible,
      pendingOrdersQty,
      productionInProcess,
      cs.status,
      vendorCount,
    );

    const recommendedAction = computeRecommendedAction(
      cs.disponible,
      pendingOrdersQty,
      productionInProcess,
      cs.status,
      availableToReplenish,
    );

    signals.push({
      reference:           cs.refCode,
      productName:         cs.description,
      line:                cs.line,
      pendingOrdersQty,
      availableForCases:   cs.disponible,
      coverageStatus:      cs.status,
      coverageDays:        cs.coverageDays,
      productionInProcess,
      pressureScore,
      recommendedAction,
    });
  }

  // Sort by pressureScore desc
  return signals.sort((a, b) => b.pressureScore - a.pressureScore);
}

// ─── Demand pressure signals ──────────────────────────────────────────────────

/**
 * Build aggregated demand pressure signals per ref.
 * Used for copilot consumption and the maletas intelligence context.
 */
export function buildDemandPressureSignals(
  coverageSignals:  CoverageSignal[],
  pendingOrdersMap: Map<string, number>,
): DemandPressureSignal[] {
  return coverageSignals
    .filter((cs) => (pendingOrdersMap.get(cs.refCode.toUpperCase()) ?? 0) > 0)
    .map((cs) => {
      const pendingOrders = pendingOrdersMap.get(cs.refCode.toUpperCase()) ?? 0;
      const pressureScore = computePressureScore(
        cs.disponible,
        pendingOrders,
        false, // productionInProcess not available at this layer
        cs.status,
        cs.affectedSalesRepIds.length,
      );
      return {
        reference:           cs.refCode,
        productName:         cs.description,
        line:                cs.line,
        totalPendingOrders:  pendingOrders,
        availableForCases:   cs.disponible,
        coverageStatus:      cs.status,
        demandPressureScore: pressureScore,
        orderConversionPct:  null, // V2: from OrderInvoiceConversionSummary
      };
    })
    .sort((a, b) => b.demandPressureScore - a.demandPressureScore);
}

// ─── Line-level pressure ──────────────────────────────────────────────────────

/**
 * Detect lines (LT/CS) where multiple refs have PD pressure.
 * A line is "hot" when 3+ refs have pending orders AND low/no coverage.
 */
export function detectHotLines(
  pressureSignals: ProductionPressureSignal[],
  threshold = 3,
): Array<{ line: string; pressuredRefCount: number; totalPendingQty: number }> {
  const byLine = new Map<string, { count: number; qty: number }>();

  for (const sig of pressureSignals) {
    if (sig.pendingOrdersQty <= 0) continue;
    const isCritical =
      sig.coverageStatus === "sin_stock" ||
      sig.coverageStatus === "ruptura_inminente" ||
      sig.coverageStatus === "cobertura_baja";
    if (!isCritical) continue;

    const entry = byLine.get(sig.line) ?? { count: 0, qty: 0 };
    entry.count++;
    entry.qty += sig.pendingOrdersQty;
    byLine.set(sig.line, entry);
  }

  return [...byLine.entries()]
    .filter(([, v]) => v.count >= threshold)
    .map(([line, v]) => ({
      line,
      pressuredRefCount: v.count,
      totalPendingQty:   v.qty,
    }));
}

// ─── Vendor pressure ──────────────────────────────────────────────────────────

/**
 * Compute per-vendor demand pressure from pending orders.
 * A vendor is pressured when they carry refs with pending orders + low coverage.
 */
export function computeVendorPdPressure(
  pressureSignals: ProductionPressureSignal[],
  coverageSignals: CoverageSignal[],
): Map<string, number> {
  // Build ref → vendorIds lookup from coverage signals
  const vendorsByRef = new Map<string, string[]>();
  for (const cs of coverageSignals) {
    vendorsByRef.set(cs.refCode.toUpperCase(), cs.affectedSalesRepIds);
  }

  const vendorPressure = new Map<string, number>();

  for (const sig of pressureSignals) {
    if (sig.pendingOrdersQty <= 0) continue;
    const vendors = vendorsByRef.get(sig.reference.toUpperCase()) ?? [];
    for (const vendorId of vendors) {
      const current = vendorPressure.get(vendorId) ?? 0;
      vendorPressure.set(vendorId, current + sig.pressureScore);
    }
  }

  // Normalize to 0–100 per vendor
  const maxPressure = Math.max(...vendorPressure.values(), 1);
  for (const [vendorId, raw] of vendorPressure) {
    vendorPressure.set(vendorId, Math.min(100, Math.round((raw / maxPressure) * 100)));
  }

  return vendorPressure;
}
