// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 47: Strategic Drift Engine

import type {
  DirectionAlignment,
  DirectionDeviation,
  DirectionDomain,
} from "./enterprise-direction-types";

export type DriftSeverity = "NONE" | "MILD" | "MODERATE" | "SEVERE" | "CRITICAL";
export type DriftTrend    = "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN";

export interface StrategicDriftResult {
  readonly orgSlug:         string;
  readonly driftScore:      number;        // 0–1 (higher = more drift)
  readonly severity:        DriftSeverity;
  readonly trend:           DriftTrend;
  readonly dominantDomain:  DirectionDomain | null;
  readonly driftFactors:    string[];
  readonly suggestedOnly:   true;
}

export interface DriftForecastResult {
  readonly orgSlug:         string;
  readonly currentDrift:    number;
  readonly projectedDrift:  number; // 0–1 if no correction
  readonly windowDays:      number;
  readonly isEscalating:    boolean;
  readonly limitations:     string[];
  readonly suggestedOnly:   true;
}

export function scoreStrategicDrift(
  alignment: DirectionAlignment | null,
  deviations: DirectionDeviation[]
): number {
  try {
    const alignmentGap    = alignment ? 1 - alignment.alignmentScore : 0.5;
    const deviationImpact = deviations.length > 0
      ? deviations.reduce((s, d) => s + d.deviationScore, 0) / deviations.length
      : 0;
    const systemicFactor  = deviations.filter((d) => d.isSystemic).length * 0.05;
    return Math.min(1, alignmentGap * 0.50 + deviationImpact * 0.40 + systemicFactor);
  } catch {
    return 0;
  }
}

function deriveDriftSeverity(score: number): DriftSeverity {
  if (score < 0.10) return "NONE";
  if (score < 0.30) return "MILD";
  if (score < 0.50) return "MODERATE";
  if (score < 0.70) return "SEVERE";
  return "CRITICAL";
}

function deriveDriftFactors(
  alignment: DirectionAlignment | null,
  deviations: DirectionDeviation[]
): string[] {
  try {
    const factors: string[] = [];
    if (!alignment) factors.push("Sin evaluación de alineamiento disponible");
    else if (alignment.alignmentScore < 0.50) factors.push(`Alineamiento bajo: ${(alignment.alignmentScore * 100).toFixed(0)}%`);
    const systemicDeviations = deviations.filter((d) => d.isSystemic);
    if (systemicDeviations.length > 0) factors.push(`${systemicDeviations.length} desviación(es) sistémica(s)`);
    const criticalDeviations = deviations.filter((d) => d.severity === "CRITICAL");
    if (criticalDeviations.length > 0) factors.push(`${criticalDeviations.length} desviación(es) crítica(s)`);
    if (alignment?.gaps && alignment.gaps.length > 0) factors.push(...alignment.gaps.slice(0, 2));
    return factors;
  } catch {
    return [];
  }
}

function findDominantDriftDomain(
  deviations: DirectionDeviation[]
): DirectionDomain | null {
  try {
    if (deviations.length === 0) return null;
    const counts: Partial<Record<DirectionDomain, number>> = {};
    for (const d of deviations) {
      counts[d.domain] = (counts[d.domain] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    return (sorted[0]?.[0] ?? null) as DirectionDomain | null;
  } catch {
    return null;
  }
}

export function detectStrategicDrift(
  orgSlug: string,
  alignment: DirectionAlignment | null,
  deviations: DirectionDeviation[],
  previousDriftScore?: number
): StrategicDriftResult {
  try {
    const driftScore     = scoreStrategicDrift(alignment, deviations);
    const severity       = deriveDriftSeverity(driftScore);
    const driftFactors   = deriveDriftFactors(alignment, deviations);
    const dominantDomain = findDominantDriftDomain(deviations);

    let trend: DriftTrend = "UNKNOWN";
    if (previousDriftScore !== undefined) {
      if (driftScore < previousDriftScore - 0.05)  trend = "IMPROVING";
      else if (driftScore > previousDriftScore + 0.05) trend = "WORSENING";
      else                                           trend = "STABLE";
    }

    return {
      orgSlug,
      driftScore,
      severity,
      trend,
      dominantDomain,
      driftFactors,
      suggestedOnly: true,
    };
  } catch {
    return {
      orgSlug,
      driftScore:     0,
      severity:       "NONE",
      trend:          "UNKNOWN",
      dominantDomain: null,
      driftFactors:   [],
      suggestedOnly:  true,
    };
  }
}

export function forecastStrategicDrift(
  orgSlug: string,
  currentDrift: number,
  deviations: DirectionDeviation[],
  windowDays: number = 90
): DriftForecastResult {
  try {
    const systemicCount   = deviations.filter((d) => d.isSystemic).length;
    const escalationRate  = 0.03 + (systemicCount * 0.02); // per 30 days
    const periodsOf30     = windowDays / 30;
    const projectedDrift  = Math.min(1, currentDrift + (escalationRate * periodsOf30));
    const isEscalating    = projectedDrift > currentDrift + 0.10;

    return {
      orgSlug,
      currentDrift,
      projectedDrift,
      windowDays,
      isEscalating,
      limitations: [
        "suggestedOnly: true — proyección basada en tendencias observadas",
        "La trayectoria real puede diferir significativamente",
        "Requiere validación ejecutiva antes de tomar decisiones",
      ],
      suggestedOnly: true,
    };
  } catch {
    return {
      orgSlug,
      currentDrift,
      projectedDrift:  currentDrift,
      windowDays,
      isEscalating:    false,
      limitations:     ["suggestedOnly: true"],
      suggestedOnly:   true,
    };
  }
}
