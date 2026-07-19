// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 9: Alignment Engine

import type {
  DirectionAlignment,
  DirectionStatus,
  DirectionConfidence,
  DirectionObjective,
  DirectionInitiative,
  StrategicPillar,
  NorthStar,
} from "./enterprise-direction-types";
import { generateDirectionAlignmentId } from "./enterprise-direction-identity";

export interface AlignmentInput {
  readonly orgSlug:      string;
  readonly northStar:    NorthStar | null;
  readonly objectives:   DirectionObjective[];
  readonly initiatives:  DirectionInitiative[];
  readonly pillars:      StrategicPillar[];
  readonly evidenceIds?: string[];
}

export function calculateAlignmentScore(input: AlignmentInput): number {
  try {
    const northStarScore = input.northStar?.score ?? 0;

    const objectiveScore = input.objectives.length > 0
      ? input.objectives.reduce((s, o) => s + o.score, 0) / input.objectives.length
      : 0;

    const initiativeScore = input.initiatives.length > 0
      ? input.initiatives.reduce((s, i) => s + i.alignmentScore, 0) / input.initiatives.length
      : 0;

    const pillarScore = input.pillars.length > 0
      ? input.pillars.reduce((s, p) => s + p.score * p.weight, 0) /
        Math.max(0.01, input.pillars.reduce((s, p) => s + p.weight, 0))
      : 0;

    return Math.min(1, northStarScore * 0.30 + objectiveScore * 0.25 + initiativeScore * 0.25 + pillarScore * 0.20);
  } catch {
    return 0;
  }
}

function deriveAlignmentStatus(score: number): DirectionStatus {
  if (score >= 0.70) return "ALIGNED";
  if (score >= 0.50) return "PARTIALLY_ALIGNED";
  if (score >= 0.30) return "MISALIGNED";
  return "UNDER_REVIEW";
}

function deriveConfidence(score: number, evidenceCount: number): DirectionConfidence {
  const evBonus = Math.min(0.10, evidenceCount * 0.02);
  const total = score + evBonus;
  if (total >= 0.80) return "VERY_HIGH";
  if (total >= 0.60) return "HIGH";
  if (total >= 0.40) return "MEDIUM";
  return "LOW";
}

function findAlignmentGaps(input: AlignmentInput): string[] {
  try {
    const gaps: string[] = [];
    if (!input.northStar) gaps.push("North Star no definido");
    if (input.objectives.length === 0) gaps.push("Sin objetivos estratégicos");
    const misaligned = input.initiatives.filter((i) => i.alignmentScore < 0.40);
    if (misaligned.length > 0) gaps.push(`${misaligned.length} iniciativa(s) desalineadas`);
    const weakPillars = input.pillars.filter((p) => p.score < 0.40);
    if (weakPillars.length > 0) gaps.push(`${weakPillars.length} pilar(es) estratégico(s) débil(es)`);
    return gaps;
  } catch {
    return [];
  }
}

function findAlignmentStrengths(input: AlignmentInput): string[] {
  try {
    const strengths: string[] = [];
    if (input.northStar && input.northStar.score >= 0.7) strengths.push("North Star sólido");
    const aligned = input.initiatives.filter((i) => i.alignmentScore >= 0.70);
    if (aligned.length > 0) strengths.push(`${aligned.length} iniciativa(s) bien alineadas`);
    const critObj = input.objectives.filter((o) => o.priority === "CRITICAL" && o.score >= 0.6);
    if (critObj.length > 0) strengths.push(`${critObj.length} objetivo(s) crítico(s) en progreso`);
    return strengths;
  } catch {
    return [];
  }
}

export function evaluateAlignment(input: AlignmentInput): DirectionAlignment {
  try {
    const alignmentScore = calculateAlignmentScore(input);
    const status         = deriveAlignmentStatus(alignmentScore);
    const evidenceIds    = input.evidenceIds ?? [];
    const confidence     = deriveConfidence(alignmentScore, evidenceIds.length);

    const pillarScores: Record<string, number> = {};
    for (const p of input.pillars) {
      pillarScores[p.name] = p.score;
    }

    return {
      id:             generateDirectionAlignmentId(),
      orgSlug:        input.orgSlug,
      status,
      alignmentScore,
      northStarScore: input.northStar?.score ?? 0,
      pillarScores,
      gaps:           findAlignmentGaps(input),
      strengths:      findAlignmentStrengths(input),
      confidence,
      evidenceIds,
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyAlignment(input.orgSlug);
  }
}

export function rankAlignment(alignments: DirectionAlignment[]): DirectionAlignment[] {
  try {
    return [...alignments].sort((a, b) => b.alignmentScore - a.alignmentScore);
  } catch {
    return alignments;
  }
}

function buildEmptyAlignment(orgSlug: string): DirectionAlignment {
  return {
    id:             generateDirectionAlignmentId(),
    orgSlug,
    status:         "UNDER_REVIEW",
    alignmentScore: 0,
    northStarScore: 0,
    pillarScores:   {},
    gaps:           ["Alineación no calculable"],
    strengths:      [],
    confidence:     "LOW",
    evidenceIds:    [],
    createdAt:      new Date().toISOString(),
  };
}
