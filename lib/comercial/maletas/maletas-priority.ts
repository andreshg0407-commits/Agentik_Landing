/**
 * lib/comercial/maletas/maletas-priority.ts
 *
 * Priority scoring for case items and production recommendations.
 * Integrates: SAG sales boosts, multi-vendor exposure, coverage urgency,
 * strategic line weighting, and dead stock penalties.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01 (updated in INTELLIGENCE-01)
 */

import type { CaseAlert, CaseAlertSeverity } from "./maletas-types";
import type { CoverageStatus, RefClassification } from "./maletas-intelligence-types";

// ─── Severity weights ─────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<CaseAlertSeverity, number> = {
  urgente: 100,
  alta: 60,
  normal: 20,
};

// ─── Alert sorting ────────────────────────────────────────────────────────────

/**
 * Sort alerts by priority (highest first).
 * Tie-breaking: severity → missing units (desc) → salesRep name (asc)
 */
export function sortAlerts(alerts: CaseAlert[]): CaseAlert[] {
  return [...alerts].sort((a, b) => {
    const wa = SEVERITY_WEIGHT[a.severity];
    const wb = SEVERITY_WEIGHT[b.severity];
    if (wb !== wa) return wb - wa;
    const missingA = a.minimumRequired - a.currentUnits;
    const missingB = b.minimumRequired - b.currentUnits;
    if (missingB !== missingA) return missingB - missingA;
    return a.salesRepName.localeCompare(b.salesRepName);
  });
}

// ─── SAG sales priority boost ─────────────────────────────────────────────────

export interface SagSalesHint {
  salesRepId: string;
  totalSales30d: number; // sum of SAG invoice totals in last 30 days
}

/**
 * Compute a vendor priority multiplier based on SAG sales volume.
 * Returns 1.0–2.0.
 */
export function computeVendorSalesPriorityMultiplier(
  salesRepId: string,
  salesHints: SagSalesHint[],
): number {
  if (salesHints.length === 0) return 1.0;
  const hint = salesHints.find((h) => h.salesRepId === salesRepId);
  if (!hint) return 1.0;
  const sorted = [...salesHints].sort((a, b) => b.totalSales30d - a.totalSales30d);
  const rank = sorted.findIndex((h) => h.salesRepId === salesRepId);
  const percentile = rank / sorted.length;
  if (percentile <= 0.25) return 2.0;
  if (percentile <= 0.5)  return 1.5;
  if (percentile <= 0.75) return 1.25;
  return 1.0;
}

// ─── Dynamic operational score (0–100) ───────────────────────────────────────

/**
 * Compute a fully dynamic operational score for an item (0–100).
 * Higher = more urgent action required.
 *
 * Factors (all additive, clamped to 0–100):
 * 1. Coverage status (base score)
 * 2. Velocity classification (sales boost or dead-stock penalty)
 * 3. Multi-vendor exposure boost
 * 4. SAG sales rank boost (vendor dimension)
 * 5. Strategic line weight boost
 * 6. Low-rotation penalty
 */
export function computeDynamicOperationalScore(opts: {
  coverageStatus: CoverageStatus;
  coverageDays: number | null;
  classification: RefClassification;
  vendorCount: number;
  salesRankMultiplier: number;      // from computeVendorSalesPriorityMultiplier
  strategicLineBoost: number;       // 0–20, caller-provided per line config
  currentUnits: number;
  minimumRequired: number;
}): number {
  const {
    coverageStatus,
    coverageDays,
    classification,
    vendorCount,
    salesRankMultiplier,
    strategicLineBoost,
    currentUnits,
    minimumRequired,
  } = opts;

  let score = 0;

  // 1 — Coverage base (0–60)
  const coverageBase: Record<CoverageStatus, number> = {
    sin_stock:          60,
    ruptura_inminente:  45,
    cobertura_baja:     25,
    cobertura_estable:  10,
    cobertura_alta:     0,
    sin_rotacion:       0,
    sin_datos_velocidad: 5,
  };
  score += coverageBase[coverageStatus];

  // Fine-tune if coverageDays known
  if (coverageDays !== null && coverageDays > 0 && coverageDays <= 3) {
    score += 10;
  }

  // 2 — Velocity classification boost/penalty (-20 to +30)
  const classificationDelta: Record<RefClassification, number> = {
    caliente:               30,
    activa:                 15,
    lenta:                  5,
    muerta:                 -20,
    sin_rotacion_conocida:  0,
  };
  score += classificationDelta[classification];

  // 3 — Multi-vendor exposure boost (0–15)
  if (vendorCount >= 4)      score += 15;
  else if (vendorCount >= 3) score += 10;
  else if (vendorCount >= 2) score += 5;

  // 4 — Sales rank multiplier boost (0–10)
  // salesRankMultiplier: 1.0 → +0, 1.25 → +3, 1.5 → +6, 2.0 → +10
  score += Math.round((salesRankMultiplier - 1.0) * 20);

  // 5 — Strategic line boost (0–20, configurable)
  score += Math.min(20, Math.max(0, strategicLineBoost));

  // 6 — Stock shortage amplifier
  if (currentUnits < minimumRequired) {
    const gapRatio = (minimumRequired - currentUnits) / minimumRequired;
    score += Math.round(gapRatio * 10);
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Case severity summary ─────────────────────────────────────────────────────

export type CaseSeveritySummary = {
  urgente: number;
  alta: number;
  normal: number;
  total: number;
};

export function summarizeCaseAlerts(
  alerts: CaseAlert[],
  salesRepId: string,
  line: "LT" | "CS",
): CaseSeveritySummary {
  const relevant = alerts.filter(
    (a) => a.salesRepId === salesRepId && a.line === line,
  );
  return {
    urgente: relevant.filter((a) => a.severity === "urgente").length,
    alta:    relevant.filter((a) => a.severity === "alta").length,
    normal:  relevant.filter((a) => a.severity === "normal").length,
    total:   relevant.length,
  };
}

// ─── Aggregate operational pressure ───────────────────────────────────────────

/**
 * Aggregate pressure across all items for a quick 0–100 org-level score.
 */
export function computeAggregatePressure(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Amplify: one very critical item raises org-level pressure disproportionately
  const maxScore = Math.max(...scores);
  return Math.round(avg * 0.6 + maxScore * 0.4);
}
