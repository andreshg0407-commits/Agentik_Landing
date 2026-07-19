// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 11 — Executive Digest Builder
// Generates Daily, Weekly, Monthly, Quarterly digests

import type {
  ExecutiveDigest,
  ExecutiveDigestPeriod,
  ExecutivePriority,
  ExecutiveConcern,
  ExecutiveOpportunity,
  ExecutiveNarrative,
  ExecutiveFocusArea,
} from "./executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "./executive-brain-types";

// ── Digest Builder API ────────────────────────────────────────────────────────

export interface DigestBuilderInput {
  readonly orgSlug: string;
  readonly period: ExecutiveDigestPeriod;
  readonly priorities: ExecutivePriority[];
  readonly concerns: ExecutiveConcern[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly narratives: ExecutiveNarrative[];
  readonly focusAreas: ExecutiveFocusArea[];
  readonly executiveScore: number;
}

export function buildExecutiveDigest(input: DigestBuilderInput): ExecutiveDigest {
  const { orgSlug, period, executiveScore } = input;
  const limits = _getLimitsForPeriod(period);

  const topPriorities = input.priorities
    .filter((p) => p.orgSlug === orgSlug)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limits.priorities);

  const topRisks = input.concerns
    .filter((c) => c.orgSlug === orgSlug && (c.severity === "CRITICAL" || c.severity === "HIGH"))
    .slice(0, limits.risks);

  const topOpportunities = input.opportunities
    .filter((o) => o.orgSlug === orgSlug && o.captureScore >= 0.4)
    .slice(0, limits.opportunities);

  const keyNarratives = input.narratives
    .filter((n) => n.orgSlug === orgSlug)
    .slice(0, limits.narratives);

  const focusAreas = input.focusAreas
    .filter((f) => f.orgSlug === orgSlug)
    .slice(0, limits.focus);

  const headline = _buildHeadline(period, topPriorities, topRisks, executiveScore);
  const title = _buildTitle(period, orgSlug);
  const confidence = confidenceFromScore(executiveScore);

  return {
    id: generateEbv2Id("digest"),
    orgSlug,
    period,
    title,
    headline,
    topPriorities,
    topRisks,
    topOpportunities,
    keyNarratives,
    focusAreas,
    executiveScore,
    confidence,
    metadata: {
      period,
      priorityCount: topPriorities.length,
      riskCount: topRisks.length,
      opportunityCount: topOpportunities.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildDailyDigest(
  orgSlug: string,
  priorities: ExecutivePriority[],
  concerns: ExecutiveConcern[],
  opportunities: ExecutiveOpportunity[],
  narratives: ExecutiveNarrative[],
  focusAreas: ExecutiveFocusArea[],
  executiveScore: number
): ExecutiveDigest {
  return buildExecutiveDigest({ orgSlug, period: "DAILY", priorities, concerns, opportunities, narratives, focusAreas, executiveScore });
}

export function buildWeeklyDigest(
  orgSlug: string,
  priorities: ExecutivePriority[],
  concerns: ExecutiveConcern[],
  opportunities: ExecutiveOpportunity[],
  narratives: ExecutiveNarrative[],
  focusAreas: ExecutiveFocusArea[],
  executiveScore: number
): ExecutiveDigest {
  return buildExecutiveDigest({ orgSlug, period: "WEEKLY", priorities, concerns, opportunities, narratives, focusAreas, executiveScore });
}

export function buildMonthlyDigest(
  orgSlug: string,
  priorities: ExecutivePriority[],
  concerns: ExecutiveConcern[],
  opportunities: ExecutiveOpportunity[],
  narratives: ExecutiveNarrative[],
  focusAreas: ExecutiveFocusArea[],
  executiveScore: number
): ExecutiveDigest {
  return buildExecutiveDigest({ orgSlug, period: "MONTHLY", priorities, concerns, opportunities, narratives, focusAreas, executiveScore });
}

export function buildQuarterlyDigest(
  orgSlug: string,
  priorities: ExecutivePriority[],
  concerns: ExecutiveConcern[],
  opportunities: ExecutiveOpportunity[],
  narratives: ExecutiveNarrative[],
  focusAreas: ExecutiveFocusArea[],
  executiveScore: number
): ExecutiveDigest {
  return buildExecutiveDigest({ orgSlug, period: "QUARTERLY", priorities, concerns, opportunities, narratives, focusAreas, executiveScore });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getLimitsForPeriod(period: ExecutiveDigestPeriod): {
  priorities: number;
  risks: number;
  opportunities: number;
  narratives: number;
  focus: number;
} {
  switch (period) {
    case "DAILY":     return { priorities: 3, risks: 2, opportunities: 1, narratives: 2, focus: 3 };
    case "WEEKLY":    return { priorities: 5, risks: 3, opportunities: 2, narratives: 3, focus: 5 };
    case "MONTHLY":   return { priorities: 7, risks: 5, opportunities: 3, narratives: 4, focus: 7 };
    case "QUARTERLY": return { priorities: 10, risks: 7, opportunities: 5, narratives: 5, focus: 10 };
  }
}

function _buildTitle(period: ExecutiveDigestPeriod, orgSlug: string): string {
  const periodLabel: Record<ExecutiveDigestPeriod, string> = {
    DAILY: "Resumen ejecutivo diario",
    WEEKLY: "Resumen ejecutivo semanal",
    MONTHLY: "Resumen ejecutivo mensual",
    QUARTERLY: "Resumen ejecutivo trimestral",
  };
  return `${periodLabel[period]} — ${orgSlug}`;
}

function _buildHeadline(
  period: ExecutiveDigestPeriod,
  priorities: ExecutivePriority[],
  risks: ExecutiveConcern[],
  score: number
): string {
  const criticalRisks = risks.filter((r) => r.severity === "CRITICAL");
  if (criticalRisks.length > 0) {
    return `Atención requerida: ${criticalRisks[0].title} — score ejecutivo ${Math.round(score * 100)}%.`;
  }
  if (priorities.length > 0) {
    return `Prioridad #1: ${priorities[0].title} — score ejecutivo ${Math.round(score * 100)}%.`;
  }
  return `Sin alertas críticas — score ejecutivo ${Math.round(score * 100)}%.`;
}
