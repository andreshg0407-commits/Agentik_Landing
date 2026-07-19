// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 10: Deviation Engine

import type {
  DirectionDeviation,
  DirectionDeviationType,
  DirectionDomain,
  DirectionPriorityLevel,
} from "./enterprise-direction-types";
import { generateDirectionDeviationId } from "./enterprise-direction-identity";

export interface RawDeviationInput {
  readonly title:           string;
  readonly description:     string;
  readonly type:            DirectionDeviationType;
  readonly domain:          DirectionDomain;
  readonly severity:        DirectionPriorityLevel;
  readonly magnitude:       number; // 0–1 how far off-course
  readonly isSystemic:      boolean;
  readonly evidenceIds?:    string[];
  readonly recommendations?: string[];
}

export function scoreDeviation(
  severity: DirectionPriorityLevel,
  magnitude: number,
  isSystemic: boolean
): number {
  try {
    const severityBase: Record<DirectionPriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.50,
      LOW:      0.25,
    };
    const base      = severityBase[severity] ?? 0.50;
    const mag       = Math.max(0, Math.min(1, magnitude));
    const systemic  = isSystemic ? 0.10 : 0;
    return Math.min(1, base * 0.50 + mag * 0.40 + systemic);
  } catch {
    return 0;
  }
}

export function buildDeviation(
  orgSlug: string,
  input: RawDeviationInput
): DirectionDeviation {
  try {
    const deviationScore = scoreDeviation(
      input.severity,
      input.magnitude,
      input.isSystemic
    );
    return {
      id:              generateDirectionDeviationId(),
      orgSlug,
      title:           input.title,
      description:     input.description,
      type:            input.type,
      domain:          input.domain,
      severity:        input.severity,
      deviationScore,
      isSystemic:      input.isSystemic,
      evidenceIds:     input.evidenceIds ?? [],
      recommendations: input.recommendations ?? [],
      createdAt:       new Date().toISOString(),
    };
  } catch {
    return buildEmptyDeviation(orgSlug);
  }
}

export function detectDeviations(
  orgSlug: string,
  inputs: RawDeviationInput[]
): DirectionDeviation[] {
  try {
    return inputs.map((i) => buildDeviation(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankDeviations(deviations: DirectionDeviation[]): DirectionDeviation[] {
  try {
    return [...deviations].sort((a, b) => b.deviationScore - a.deviationScore);
  } catch {
    return deviations;
  }
}

export function getSystemicDeviations(deviations: DirectionDeviation[]): DirectionDeviation[] {
  try {
    return deviations.filter((d) => d.isSystemic);
  } catch {
    return [];
  }
}

export function getCriticalDeviations(deviations: DirectionDeviation[]): DirectionDeviation[] {
  try {
    return deviations.filter((d) => d.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function getDeviationsByType(
  deviations: DirectionDeviation[],
  type: DirectionDeviationType
): DirectionDeviation[] {
  try {
    return deviations.filter((d) => d.type === type);
  } catch {
    return [];
  }
}

export function calculateDeviationPenalty(deviations: DirectionDeviation[]): number {
  try {
    if (deviations.length === 0) return 0;
    const totalScore = deviations.reduce((s, d) => s + d.deviationScore, 0);
    return Math.min(0.40, (totalScore / deviations.length) * 0.40);
  } catch {
    return 0;
  }
}

function buildEmptyDeviation(orgSlug: string): DirectionDeviation {
  return {
    id:              generateDirectionDeviationId(),
    orgSlug,
    title:           "Desviación no disponible",
    description:     "",
    type:            "STRATEGIC_DRIFT",
    domain:          "CROSS_DOMAIN",
    severity:        "LOW",
    deviationScore:  0,
    isSystemic:      false,
    evidenceIds:     [],
    recommendations: [],
    createdAt:       new Date().toISOString(),
  };
}
