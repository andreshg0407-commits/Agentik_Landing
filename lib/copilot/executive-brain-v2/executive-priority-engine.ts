// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 5 — Executive Priority Engine
// Computes executive priorities from impact, urgency, risk, strategic alignment, and learning

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern } from "../learning/learning-types";
import type {
  ExecutivePriority,
  ExecutiveDomain,
  ExecutivePriorityLevel,
  ExecutiveRisk,
  ExecutiveOpportunity,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  EXECUTIVE_PRIORITY_RANK,
} from "./executive-brain-types";

// ── Priority computation ───────────────────────────────────────────────────────

export interface PriorityEngineInput {
  readonly orgSlug: string;
  readonly strategicEntries: StrategicMemoryEntry[];
  readonly patterns: LearningPattern[];
  readonly risks: ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly historicalRiskScore: number;
}

export function computeExecutivePriorities(input: PriorityEngineInput): ExecutivePriority[] {
  const { orgSlug } = input;
  const candidates = _buildCandidates(input);
  return candidates
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export function getTopPriorities(
  priorities: ExecutivePriority[],
  n: number,
  orgSlug: string
): ExecutivePriority[] {
  return priorities
    .filter((p) => p.orgSlug === orgSlug)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n);
}

export function getTop3(priorities: ExecutivePriority[], orgSlug: string): ExecutivePriority[] {
  return getTopPriorities(priorities, 3, orgSlug);
}

export function getTop5(priorities: ExecutivePriority[], orgSlug: string): ExecutivePriority[] {
  return getTopPriorities(priorities, 5, orgSlug);
}

export function getTop10(priorities: ExecutivePriority[], orgSlug: string): ExecutivePriority[] {
  return getTopPriorities(priorities, 10, orgSlug);
}

export function getPriorityByDomain(
  priorities: ExecutivePriority[],
  orgSlug: string,
  domain: ExecutiveDomain
): ExecutivePriority[] {
  return priorities
    .filter((p) => p.orgSlug === orgSlug && p.domain === domain)
    .sort((a, b) => a.rank - b.rank);
}

export function computePriorityScore(
  impactScore: number,
  urgencyScore: number,
  strategicAlignmentScore: number,
  historicalRiskScore: number
): number {
  const weighted =
    impactScore * 0.35 +
    urgencyScore * 0.30 +
    strategicAlignmentScore * 0.25 +
    historicalRiskScore * 0.10;
  return Math.round(weighted * 100) / 100;
}

export function derivePriorityLevel(score: number): ExecutivePriorityLevel {
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.35) return "MEDIUM";
  return "LOW";
}

// ── Private candidate building ────────────────────────────────────────────────

function _buildCandidates(input: PriorityEngineInput): ExecutivePriority[] {
  const priorities: ExecutivePriority[] = [];
  const { orgSlug, strategicEntries, patterns, risks, opportunities, historicalRiskScore } = input;
  const now = new Date().toISOString();

  // From strategic memory goals/priorities
  for (const entry of strategicEntries.filter(
    (e) =>
      e.orgSlug === orgSlug &&
      e.status === "ACTIVE" &&
      (e.type === "GOAL" || e.type === "PRIORITY" || e.type === "OBJECTIVE") &&
      e.strategicScore >= 0.4
  )) {
    const impactScore = entry.strategicScore;
    const urgencyScore = entry.priority === "CRITICAL" ? 0.95 : entry.priority === "HIGH" ? 0.75 : 0.5;
    const strategicAlignmentScore = 0.85;
    const priorityScore = computePriorityScore(
      impactScore, urgencyScore, strategicAlignmentScore, historicalRiskScore
    );

    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: 0,
      title: entry.title,
      description: entry.description,
      domain: entry.domain as ExecutiveDomain,
      level: derivePriorityLevel(priorityScore),
      confidence: confidenceFromScore(entry.confidenceScore),
      confidenceScore: entry.confidenceScore,
      impactScore,
      urgencyScore,
      strategicAlignmentScore,
      historicalRiskScore,
      priorityScore,
      rationale: entry.rationale,
      evidenceIds: entry.evidenceIds,
      metadata: { source: "STRATEGIC_MEMORY", entryId: entry.id, entryType: entry.type },
      computedAt: now,
    });
  }

  // From risks
  for (const risk of risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH")) {
    const impactScore = risk.impact;
    const urgencyScore = risk.likelihood;
    const strategicAlignmentScore = 0.75;
    const priorityScore = computePriorityScore(
      impactScore, urgencyScore, strategicAlignmentScore, historicalRiskScore
    );

    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: 0,
      title: `Gestionar riesgo: ${risk.title}`,
      description: risk.description,
      domain: risk.domain,
      level: derivePriorityLevel(priorityScore),
      confidence: risk.confidence,
      confidenceScore: risk.confidenceScore,
      impactScore,
      urgencyScore,
      strategicAlignmentScore,
      historicalRiskScore,
      priorityScore,
      rationale: risk.rationale,
      evidenceIds: risk.evidenceIds,
      metadata: { source: "RISK", riskId: risk.id, riskLevel: risk.level },
      computedAt: now,
    });
  }

  // From opportunities
  for (const opp of opportunities.filter((o) => o.captureScore >= 0.5)) {
    const impactScore = opp.captureScore;
    const urgencyScore = 0.55;
    const strategicAlignmentScore = 0.7;
    const priorityScore = computePriorityScore(
      impactScore, urgencyScore, strategicAlignmentScore, 0
    );

    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: 0,
      title: `Capitalizar: ${opp.title}`,
      description: opp.description,
      domain: opp.domain,
      level: derivePriorityLevel(priorityScore),
      confidence: opp.confidence,
      confidenceScore: opp.confidenceScore,
      impactScore,
      urgencyScore,
      strategicAlignmentScore,
      historicalRiskScore: 0,
      priorityScore,
      rationale: opp.rationale,
      evidenceIds: opp.evidenceIds,
      metadata: { source: "OPPORTUNITY", opportunityId: opp.id, magnitude: opp.magnitude },
      computedAt: now,
    });
  }

  // From confirmed learning patterns
  for (const pattern of patterns.filter(
    (p) => p.orgSlug === orgSlug && p.status === "REINFORCED" && p.confidenceScore >= 0.65
  ).slice(0, 3)) {
    const impactScore = pattern.confidenceScore * 0.7;
    const urgencyScore = 0.5;
    const strategicAlignmentScore = 0.6;
    const priorityScore = computePriorityScore(
      impactScore, urgencyScore, strategicAlignmentScore, historicalRiskScore
    );

    priorities.push({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: 0,
      title: `Reforzar patrón: ${pattern.name}`,
      description: pattern.description,
      domain: "CROSS_DOMAIN",
      level: derivePriorityLevel(priorityScore),
      confidence: confidenceFromScore(pattern.confidenceScore),
      confidenceScore: pattern.confidenceScore,
      impactScore,
      urgencyScore,
      strategicAlignmentScore,
      historicalRiskScore,
      priorityScore,
      rationale: `Patrón de aprendizaje confirmado con ${pattern.reinforcementCount} refuerzos`,
      evidenceIds: pattern.evidenceEventIds,
      metadata: { source: "LEARNING_PATTERN", patternId: pattern.id },
      computedAt: now,
    });
  }

  // De-duplicate by title
  const seen = new Set<string>();
  return priorities.filter((p) => {
    if (seen.has(p.title)) return false;
    seen.add(p.title);
    return true;
  });
}
