// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 3 — Learning Context Engine
// Consumes Learning Framework to extract confirmed patterns and historical outcomes

import type {
  LearningPattern,
  LearningOutcome,
  LearningEvent,
  LearningDomain,
} from "../learning/learning-types";

// ── Learning Executive Context ────────────────────────────────────────────────

export interface LearningExecutiveContext {
  readonly orgSlug: string;
  readonly confirmedPatterns: LearningPattern[];
  readonly rejectedPatterns: LearningPattern[];
  readonly effectivePlaybookIds: string[];
  readonly recentOutcomes: LearningOutcome[];
  readonly historicalRiskScore: number; // 0–1 derived from negative outcomes
  readonly learningMaturity: "EARLY" | "DEVELOPING" | "MATURE" | "ADVANCED";
  readonly buildAt: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildLearningContext(
  orgSlug: string,
  patterns: LearningPattern[],
  outcomes: LearningOutcome[],
  events: LearningEvent[]
): LearningExecutiveContext {
  const scoped = patterns.filter((p) => p.orgSlug === orgSlug);
  const confirmed = getConfirmedPatterns(orgSlug, scoped);
  const rejected = getRejectedPatterns(orgSlug, scoped);
  const recentOutcomes = getHistoricalOutcomes(orgSlug, outcomes);
  const playbookIds = getEffectivePlaybooks(orgSlug, events);
  const historicalRiskScore = _computeHistoricalRisk(recentOutcomes);
  const maturity = _deriveMaturity(confirmed.length + rejected.length, events.length);

  return {
    orgSlug,
    confirmedPatterns: confirmed,
    rejectedPatterns: rejected,
    effectivePlaybookIds: playbookIds,
    recentOutcomes,
    historicalRiskScore,
    learningMaturity: maturity,
    buildAt: new Date().toISOString(),
  };
}

export function getConfirmedPatterns(
  orgSlug: string,
  patterns: LearningPattern[]
): LearningPattern[] {
  return patterns
    .filter(
      (p) =>
        p.orgSlug === orgSlug &&
        (p.status === "REINFORCED" || p.status === "ACTIVE") &&
        p.netScore > 0 &&
        p.confidenceScore >= 0.5
    )
    .sort((a, b) => b.netScore - a.netScore);
}

export function getRejectedPatterns(
  orgSlug: string,
  patterns: LearningPattern[]
): LearningPattern[] {
  return patterns
    .filter(
      (p) =>
        p.orgSlug === orgSlug &&
        (p.status === "WEAKENED" || p.status === "DEPRECATED") &&
        p.netScore < 0
    )
    .sort((a, b) => a.netScore - b.netScore);
}

export function getEffectivePlaybooks(
  orgSlug: string,
  events: LearningEvent[]
): string[] {
  const playbookSuccessIds = new Set<string>();
  for (const ev of events) {
    if (
      ev.orgSlug === orgSlug &&
      ev.source === "PLAYBOOK" &&
      (ev.type === "RECOMMENDATION_ACCEPTED" || ev.type === "ACTION_SUCCEEDED")
    ) {
      playbookSuccessIds.add(ev.referenceId);
    }
  }
  return Array.from(playbookSuccessIds);
}

export function getHistoricalOutcomes(
  orgSlug: string,
  outcomes: LearningOutcome[],
  limit = 20
): LearningOutcome[] {
  return outcomes
    .filter((o) => o.orgSlug === orgSlug)
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
    .slice(0, limit);
}

export function getDomainLearningStrength(
  orgSlug: string,
  domain: LearningDomain,
  patterns: LearningPattern[]
): number {
  const domainPatterns = patterns.filter(
    (p) => p.orgSlug === orgSlug && p.domain === domain && p.status !== "DEPRECATED"
  );
  if (domainPatterns.length === 0) return 0;
  const sum = domainPatterns.reduce((acc, p) => acc + p.confidenceScore, 0);
  return Math.round((sum / domainPatterns.length) * 100) / 100;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeHistoricalRisk(outcomes: LearningOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const negative = outcomes.filter((o) => o.result === "NEGATIVE");
  return Math.round((negative.length / outcomes.length) * 100) / 100;
}

function _deriveMaturity(
  patternCount: number,
  eventCount: number
): "EARLY" | "DEVELOPING" | "MATURE" | "ADVANCED" {
  if (patternCount >= 20 && eventCount >= 100) return "ADVANCED";
  if (patternCount >= 10 && eventCount >= 30) return "MATURE";
  if (patternCount >= 3 || eventCount >= 10) return "DEVELOPING";
  return "EARLY";
}
