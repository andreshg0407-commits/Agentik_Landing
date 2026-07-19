// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 4: Strategic Assessment Engine

import type {
  BoardStrategicAssessment,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface StrategicAssessmentInput {
  readonly orgSlug:              string;
  readonly sessionId:            string;
  readonly alignmentScore?:      number;   // 0–1
  readonly executionReadiness?:  number;   // 0–1
  readonly shortTermCoverage?:   boolean;
  readonly mediumTermCoverage?:  boolean;
  readonly longTermCoverage?:    boolean;
  readonly gaps?:                string[];
  readonly strengths?:           string[];
  readonly limitations?:         string[];
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function scoreStrategicAlignment(input: StrategicAssessmentInput): number {
  try {
    const base = input.alignmentScore ?? 0.6;
    const horizonBoost =
      (input.shortTermCoverage  ? 0.05 : 0) +
      (input.mediumTermCoverage ? 0.05 : 0) +
      (input.longTermCoverage   ? 0.05 : 0);
    return Math.max(0, Math.min(1, base + horizonBoost));
  } catch {
    return 0.5;
  }
}

export function scoreStrategicExecutionReadiness(input: StrategicAssessmentInput): number {
  try {
    return Math.max(0, Math.min(1, input.executionReadiness ?? 0.6));
  } catch {
    return 0.5;
  }
}

function resolveHorizonCoverage(
  short:  boolean,
  medium: boolean,
  long:   boolean
): "SHORT" | "MEDIUM" | "LONG" | "MULTI_HORIZON" {
  const count = [short, medium, long].filter(Boolean).length;
  if (count >= 2) return "MULTI_HORIZON";
  if (long)   return "LONG";
  if (medium) return "MEDIUM";
  return "SHORT";
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildStrategicAssessment(
  input: StrategicAssessmentInput
): BoardStrategicAssessment {
  try {
    const alignmentScore      = scoreStrategicAlignment(input);
    const executionReadiness  = scoreStrategicExecutionReadiness(input);
    const strategicScore      = (alignmentScore * 0.55 + executionReadiness * 0.45);

    const short  = input.shortTermCoverage  ?? true;
    const medium = input.mediumTermCoverage ?? false;
    const long   = input.longTermCoverage   ?? false;
    const horizonCoverage = resolveHorizonCoverage(short, medium, long);

    const gaps        = input.gaps        ?? [];
    const strengths   = input.strengths   ?? [];
    const limitations = input.limitations ?? ["Strategic assessment based on available signals only"];
    const confidence: BoardConfidence = boardConfidenceFromScore(strategicScore);

    return {
      orgSlug:            input.orgSlug,
      sessionId:          input.sessionId,
      alignmentScore,
      executionReadiness,
      strategicScore,
      horizonCoverage,
      gaps,
      strengths,
      limitations,
      confidence,
      assessedAt:         new Date().toISOString(),
    };
  } catch {
    return buildEmptyStrategicAssessment(input.orgSlug, input.sessionId);
  }
}

export function buildEmptyStrategicAssessment(
  orgSlug:   string,
  sessionId: string
): BoardStrategicAssessment {
  return {
    orgSlug,
    sessionId,
    alignmentScore:     0.5,
    executionReadiness: 0.5,
    strategicScore:     0.5,
    horizonCoverage:    "SHORT",
    gaps:               [],
    strengths:          [],
    limitations:        ["Insufficient data for strategic assessment"],
    confidence:         "LOW",
    assessedAt:         new Date().toISOString(),
  };
}

export function mergeStrategicAssessments(
  base:     BoardStrategicAssessment,
  override: Partial<StrategicAssessmentInput>
): BoardStrategicAssessment {
  try {
    return buildStrategicAssessment({
      orgSlug:             base.orgSlug,
      sessionId:           base.sessionId,
      alignmentScore:      override.alignmentScore     ?? base.alignmentScore,
      executionReadiness:  override.executionReadiness ?? base.executionReadiness,
      gaps:                [...base.gaps,      ...(override.gaps      ?? [])],
      strengths:           [...base.strengths, ...(override.strengths ?? [])],
      limitations:         [...base.limitations, ...(override.limitations ?? [])],
    });
  } catch {
    return base;
  }
}
