// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 15 — Learning Integration

import type { LearningPattern, LearningOutcome, LearningEvent } from "../../learning/learning-types";
import type { ExecutivePriority, ExecutiveDomain } from "../executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "../executive-brain-types";

export interface LearningExecSummary {
  readonly orgSlug: string;
  readonly confirmedPatternCount: number;
  readonly rejectedPatternCount: number;
  readonly positiveOutcomeRate: number; // 0–1
  readonly negativeOutcomeRate: number; // 0–1
  readonly effectivePlaybookIds: string[];
  readonly historicalRiskScore: number;
  readonly domainStrength: Record<string, number>;
}

export function buildLearningExecSummary(
  orgSlug: string,
  patterns: LearningPattern[],
  outcomes: LearningOutcome[],
  events: LearningEvent[]
): LearningExecSummary {
  const scopedPatterns = patterns.filter((p) => p.orgSlug === orgSlug);
  const scopedOutcomes = outcomes.filter((o) => o.orgSlug === orgSlug);

  const confirmed = scopedPatterns.filter((p) => p.status === "REINFORCED" || (p.status === "ACTIVE" && p.netScore > 0));
  const rejected = scopedPatterns.filter((p) => p.status === "WEAKENED" || p.status === "DEPRECATED");

  const positive = scopedOutcomes.filter((o) => o.result === "POSITIVE").length;
  const negative = scopedOutcomes.filter((o) => o.result === "NEGATIVE").length;
  const total = scopedOutcomes.length;

  const effectivePlaybookIds = Array.from(
    new Set(
      events
        .filter((e) => e.orgSlug === orgSlug && e.source === "PLAYBOOK" && e.type === "ACTION_SUCCEEDED")
        .map((e) => e.referenceId)
    )
  );

  const domainStrength: Record<string, number> = {};
  for (const pattern of scopedPatterns) {
    const current = domainStrength[pattern.domain] ?? 0;
    domainStrength[pattern.domain] = Math.max(current, pattern.confidenceScore);
  }

  return {
    orgSlug,
    confirmedPatternCount: confirmed.length,
    rejectedPatternCount: rejected.length,
    positiveOutcomeRate: total > 0 ? Math.round((positive / total) * 100) / 100 : 0,
    negativeOutcomeRate: total > 0 ? Math.round((negative / total) * 100) / 100 : 0,
    effectivePlaybookIds,
    historicalRiskScore: total > 0 ? Math.round((negative / total) * 100) / 100 : 0,
    domainStrength,
  };
}

export function getConfirmedPatternPriorities(
  orgSlug: string,
  patterns: LearningPattern[]
): ExecutivePriority[] {
  return patterns
    .filter((p) => p.orgSlug === orgSlug && p.status === "REINFORCED" && p.confidenceScore >= 0.7)
    .slice(0, 3)
    .map((p, i) => ({
      id: generateEbv2Id("pri"),
      orgSlug,
      rank: i + 1,
      title: `Reforzar patrón: ${p.name}`,
      description: p.description,
      domain: "CROSS_DOMAIN" as ExecutiveDomain,
      level: "MEDIUM" as ExecutivePriority["level"],
      confidence: confidenceFromScore(p.confidenceScore),
      confidenceScore: p.confidenceScore,
      impactScore: p.confidenceScore * 0.7,
      urgencyScore: 0.5,
      strategicAlignmentScore: 0.6,
      historicalRiskScore: 0,
      priorityScore: p.confidenceScore * 0.6,
      rationale: `Patrón de aprendizaje reforzado ${p.reinforcementCount} veces`,
      evidenceIds: p.evidenceEventIds,
      metadata: { source: "LEARNING_PATTERN", patternId: p.id },
      computedAt: new Date().toISOString(),
    }));
}

export function extractHistoricalOutcomeContext(
  orgSlug: string,
  outcomes: LearningOutcome[]
): { positiveCount: number; negativeCount: number; topDomain?: string } {
  const scoped = outcomes.filter((o) => o.orgSlug === orgSlug);
  const positive = scoped.filter((o) => o.result === "POSITIVE").length;
  const negative = scoped.filter((o) => o.result === "NEGATIVE").length;

  const domainCounts: Record<string, number> = {};
  for (const o of scoped) {
    domainCounts[o.domain] = (domainCounts[o.domain] ?? 0) + 1;
  }
  const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return { positiveCount: positive, negativeCount: negative, topDomain };
}
