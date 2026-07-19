/**
 * lib/comercial/maletas/maletas-coverage.ts
 *
 * Coverage engine — answers the operational question:
 * "Does the commercial operation have enough coverage to sell without breaking production?"
 *
 * coverageDays = disponible / dailyVelocity
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  RefVelocity,
  CoverageSignal,
  CoverageStatus,
  CoverageEvolution,
  CoverageEvolutionTrend,
  CoverageSnapshot,
} from "./maletas-intelligence-types";
import type { CaseItem, CommercialCaseLine } from "./maletas-types";

// ─── Coverage thresholds (configurable) ───────────────────────────────────────

const COVERAGE_HIGH_DAYS = 30;   // > 30d → cobertura_alta
const COVERAGE_STABLE_DAYS = 15; // 15–30d → cobertura_estable
const COVERAGE_LOW_DAYS = 7;     // 7–14d → cobertura_baja
                                  // < 7d   → ruptura_inminente

// ─── Core coverage computation ────────────────────────────────────────────────

/**
 * Compute coverage status for a single reference.
 * All inputs must be pre-normalized (no nulls except velocity).
 */
export function computeCoverageStatus(
  disponible: number,
  dailyVelocity: number | null,
): { status: CoverageStatus; coverageDays: number | null } {
  if (disponible <= 0) {
    return { status: "sin_stock", coverageDays: 0 };
  }
  if (dailyVelocity === null) {
    return { status: "sin_datos_velocidad", coverageDays: null };
  }
  if (dailyVelocity === 0) {
    return { status: "sin_rotacion", coverageDays: null };
  }

  const coverageDays = disponible / dailyVelocity;

  let status: CoverageStatus;
  if (coverageDays > COVERAGE_HIGH_DAYS)   status = "cobertura_alta";
  else if (coverageDays > COVERAGE_STABLE_DAYS) status = "cobertura_estable";
  else if (coverageDays > COVERAGE_LOW_DAYS)    status = "cobertura_baja";
  else                                          status = "ruptura_inminente";

  return { status, coverageDays };
}

/**
 * Build CoverageSignal[] for all items.
 * Uses velocityMap for per-ref daily velocity (may be empty in V1).
 *
 * @param pendingOrdersMap — Optional SAG PD (pedidos) quantities per ref.
 *   When present, refs with pending orders AND low coverage get a pressure boost.
 *   Key: UPPERCASE refCode. Value: total pending order units from SAG PD source.
 */
export function buildCoverageSignals(
  items: CaseItem[],
  velocityMap: Map<string, RefVelocity>,
  pendingOrdersMap?: Map<string, number>,
): CoverageSignal[] {
  // Aggregate by ref (an item appears once per ref, assigned to N vendors)
  const byRef = new Map<string, {
    item: CaseItem;
    velocity: RefVelocity | null;
  }>();

  for (const item of items) {
    const key = item.reference.toUpperCase();
    if (!byRef.has(key)) {
      byRef.set(key, {
        item,
        velocity: velocityMap.get(key) ?? null,
      });
    }
  }

  const signals: CoverageSignal[] = [];

  for (const [, { item, velocity }] of byRef) {
    const dailyVelocity     = velocity?.dailyVelocity ?? null;
    // currentUnits = disponible = availableForCases (bodega inicial - reservas)
    const { status, coverageDays } = computeCoverageStatus(
      item.currentUnits,
      dailyVelocity,
    );

    const pendingOrdersQty  = pendingOrdersMap?.get(item.reference.toUpperCase()) ?? undefined;

    const operationalScore  = computeOperationalScore(
      status,
      coverageDays,
      item.assignedToSalesReps.length,
      velocity?.classification ?? "sin_rotacion_conocida",
      pendingOrdersQty,
    );

    signals.push({
      refCode:             item.reference,
      description:         item.description,
      line:                item.line,
      disponible:          item.currentUnits,
      dailyVelocity,
      coverageDays,
      status,
      affectedSalesRepIds: item.assignedToSalesReps,
      operationalScore,
      pendingOrdersQty,
    });
  }

  // Sort by operationalScore desc (most urgent first)
  return signals.sort((a, b) => b.operationalScore - a.operationalScore);
}

/**
 * Compute an operational urgency score (0–100) for a reference.
 * 100 = maximum urgency (rupture + hot ref + multi-vendor).
 * 0 = no urgency (high coverage + dead stock).
 *
 * @param pendingOrdersQty — SAG PD (pedidos) quantity for this ref.
 *   When > 0 and coverage is low/critical, score is boosted.
 *   PD represents real commercial demand that cannot be deferred.
 */
export function computeOperationalScore(
  status: CoverageStatus,
  coverageDays: number | null,
  vendorCount: number,
  classification: RefVelocity["classification"],
  pendingOrdersQty?: number,
): number {
  let score = 0;

  // Base score from coverage status
  switch (status) {
    case "sin_stock":           score += 60; break;
    case "ruptura_inminente":   score += 45; break;
    case "cobertura_baja":      score += 25; break;
    case "cobertura_estable":   score += 10; break;
    case "cobertura_alta":      score += 0;  break;
    case "sin_rotacion":        score += 0;  break; // no movement → not urgent
    case "sin_datos_velocidad": score += 5;  break; // unknown → small base
  }

  // Boost from velocity classification
  switch (classification) {
    case "caliente": score += 30; break;
    case "activa":   score += 15; break;
    case "lenta":    score += 5;  break;
    case "muerta":   score -= 20; break; // dead stock → reduce urgency
    case "sin_rotacion_conocida": score += 0; break;
  }

  // Boost from multi-vendor exposure
  if (vendorCount >= 4) score += 15;
  else if (vendorCount >= 3) score += 10;
  else if (vendorCount >= 2) score += 5;

  // Fine-tune from coverageDays when known
  if (coverageDays !== null && coverageDays > 0) {
    if (coverageDays <= 3) score += 10;
  }

  // ── PD (pedidos) pressure boost ──────────────────────────────────────────
  // Pending orders represent confirmed commercial demand.
  // When pending orders exist AND coverage is low or zero, urgency escalates.
  if (pendingOrdersQty && pendingOrdersQty > 0) {
    const isLowCoverage =
      status === "sin_stock" ||
      status === "ruptura_inminente" ||
      status === "cobertura_baja";

    if (status === "sin_stock") {
      score += 20; // PD on stockout = maximum commercial pressure
    } else if (isLowCoverage) {
      score += 10; // PD on low coverage = elevated urgency
    } else {
      score += 3;  // PD with stable coverage = mild awareness
    }
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Aggregated coverage analysis ─────────────────────────────────────────────

export type CoverageSummaryByStatus = Record<CoverageStatus, number>;

export function summarizeCoverageByStatus(
  signals: CoverageSignal[],
): CoverageSummaryByStatus {
  const summary: CoverageSummaryByStatus = {
    cobertura_alta: 0,
    cobertura_estable: 0,
    cobertura_baja: 0,
    ruptura_inminente: 0,
    sin_rotacion: 0,
    sin_datos_velocidad: 0,
    sin_stock: 0,
  };
  for (const s of signals) {
    summary[s.status]++;
  }
  return summary;
}

/** Average coverage days across refs with known velocity (>0) */
export function computeAvgCoverageDays(signals: CoverageSignal[]): number | null {
  const known = signals.filter((s) => s.coverageDays !== null && s.coverageDays > 0);
  if (known.length === 0) return null;
  const total = known.reduce((acc, s) => acc + (s.coverageDays ?? 0), 0);
  return total / known.length;
}

/**
 * Refs where stock is high AND velocity is dead/slow.
 * Used as input for dead stock detection.
 */
export function getOverstockedRefs(
  signals: CoverageSignal[],
  excessThresholdDays = 90,
): CoverageSignal[] {
  return signals.filter(
    (s) =>
      s.coverageDays !== null &&
      s.coverageDays > excessThresholdDays,
  );
}

// ─── Temporal evolution ────────────────────────────────────────────────────────

/**
 * Compute coverage evolution from ordered snapshots (oldest first).
 * Requires at least 2 snapshots to compute trend.
 */
export function buildCoverageEvolution(
  snapshots: CoverageSnapshot[],
  refCode: string,
  description: string,
  line: CommercialCaseLine,
): CoverageEvolution {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime(),
  );

  if (sorted.length < 2) {
    return {
      refCode,
      description,
      line,
      snapshots: sorted,
      trend: "sin_datos",
      degradationPct: null,
      alertMessage: null,
    };
  }

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  let trend: CoverageEvolutionTrend = "sin_datos";
  let degradationPct: number | null = null;
  let alertMessage: string | null = null;

  if (latest.coverageDays !== null && previous.coverageDays !== null) {
    if (previous.coverageDays === 0) {
      trend = latest.coverageDays > 0 ? "mejorando" : "estable";
    } else {
      const delta =
        (latest.coverageDays - previous.coverageDays) / previous.coverageDays;
      degradationPct = Math.round(-delta * 100); // positive = getting worse
      if (delta > 0.15) trend = "mejorando";
      else if (delta < -0.15) trend = "degradando";
      else trend = "estable";
    }

    if (trend === "degradando" && degradationPct !== null && degradationPct > 20) {
      const daysDiff = Math.round(
        (new Date(latest.snapshotAt).getTime() -
          new Date(sorted[0].snapshotAt).getTime()) /
          86_400_000,
      );
      alertMessage = `Degradándose ${degradationPct}% en ${daysDiff}d`;
    } else if (trend === "mejorando") {
      alertMessage = "Cobertura recuperándose";
    }
  }

  return {
    refCode,
    description,
    line,
    snapshots: sorted,
    trend,
    degradationPct,
    alertMessage,
  };
}
