// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 2 — Strategic Context Builder
// Assembles a unified strategic context from all intelligence layers

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern, LearningOutcome } from "../learning/learning-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";
import type { GraphNode, GraphEdge } from "../memory-graph/memory-graph-types";
import type { ExecutivePriority, ExecutiveRisk, ExecutiveFocusArea } from "../executive-brain-v2/executive-brain-types";
import type { StrategicDomain, StrategicAdviceConfidence, StrategicDecisionContext } from "./strategic-advisor-types";
import { confidenceSaFromScore } from "./strategic-advisor-types";

// ── Context shape ─────────────────────────────────────────────────────────────

export interface StrategicAdvisorContext {
  readonly orgSlug:                string;

  // From Strategic Memory
  readonly activeGoals:            StrategicMemoryEntry[];
  readonly activeRisks:            StrategicMemoryEntry[];
  readonly activeOpportunities:    StrategicMemoryEntry[];
  readonly recentDecisions:        StrategicMemoryEntry[];
  readonly recentLessons:          StrategicMemoryEntry[];
  readonly activeCommitments:      StrategicMemoryEntry[];
  readonly activePolicies:         StrategicMemoryEntry[];

  // From Learning
  readonly confirmedPatterns:      LearningPattern[];
  readonly rejectedPatterns:       LearningPattern[];
  readonly successfulOutcomes:     LearningOutcome[];
  readonly failedOutcomes:         LearningOutcome[];

  // From Cross-Module Reasoning
  readonly anomalySignals:         ReasoningSignal[];
  readonly thresholdBreachSignals: ReasoningSignal[];
  readonly metricDropSignals:      ReasoningSignal[];
  readonly metricRiseSignals:      ReasoningSignal[];

  // From Memory Graph
  readonly graphNodes:             GraphNode[];
  readonly graphEdges:             GraphEdge[];

  // From Executive Brain V2 (if available)
  readonly executivePriorities:    ExecutivePriority[];
  readonly executiveRisks:         ExecutiveRisk[];
  readonly executiveFocusAreas:    ExecutiveFocusArea[];

  // Derived scores
  readonly strategicScore:         number;   // 0–1
  readonly learningStrength:       number;   // 0–1
  readonly signalDensity:          number;   // 0–1
  readonly graphDensity:           number;   // 0–1
  readonly overallContextScore:    number;   // 0–1 composite

  readonly confidence:             StrategicAdviceConfidence;
  readonly dominantDomain:         StrategicDomain | null;
  readonly builtAt:                string;   // ISO
}

// ── Context builder input ─────────────────────────────────────────────────────

export interface ContextBuilderInput {
  readonly orgSlug:             string;
  readonly strategicEntries?:   StrategicMemoryEntry[];
  readonly learningPatterns?:   LearningPattern[];
  readonly learningOutcomes?:   LearningOutcome[];
  readonly reasoningSignals?:   ReasoningSignal[];
  readonly graphNodes?:         GraphNode[];
  readonly graphEdges?:         GraphEdge[];
  readonly executivePriorities?: ExecutivePriority[];
  readonly executiveRisks?:     ExecutiveRisk[];
  readonly executiveFocusAreas?: ExecutiveFocusArea[];
}

// ── buildContext ──────────────────────────────────────────────────────────────

export function buildContext(input: ContextBuilderInput): StrategicAdvisorContext {
  const { orgSlug } = input;

  const entries    = (input.strategicEntries ?? []).filter((e) => e.orgSlug === orgSlug);
  const patterns   = (input.learningPatterns ?? []).filter((p) => p.orgSlug === orgSlug);
  const outcomes   = (input.learningOutcomes ?? []).filter((o) => o.orgSlug === orgSlug);
  const signals    = (input.reasoningSignals ?? []).filter((s) => s.orgSlug === orgSlug);
  const nodes      = (input.graphNodes ?? []).filter((n) => n.orgSlug === orgSlug);
  const edges      = input.graphEdges ?? [];
  const exPriorities = (input.executivePriorities ?? []).filter((p) => p.orgSlug === orgSlug);
  const exRisks    = (input.executiveRisks ?? []).filter((r) => r.orgSlug === orgSlug);
  const exFocus    = (input.executiveFocusAreas ?? []).filter((f) => f.orgSlug === orgSlug);

  // Classify entries
  const activeGoals         = entries.filter((e) => e.type === "GOAL"       && e.status === "ACTIVE");
  const activeRisks         = entries.filter((e) => e.type === "RISK"       && e.status === "ACTIVE");
  const activeOpportunities = entries.filter((e) => e.type === "OPPORTUNITY" && e.status === "ACTIVE");
  const recentDecisions     = entries.filter((e) => e.type === "DECISION"   && e.status === "ACTIVE");
  const recentLessons       = entries.filter((e) => e.type === "LESSON");
  const activeCommitments   = entries.filter((e) => e.type === "COMMITMENT" && e.status === "ACTIVE");
  const activePolicies      = entries.filter((e) => e.type === "POLICY"     && e.status === "ACTIVE");

  // Classify patterns
  const confirmedPatterns   = patterns.filter((p) => p.status === "REINFORCED" || p.status === "ACTIVE");
  const rejectedPatterns    = patterns.filter((p) => p.status === "WEAKENED" || p.status === "DEPRECATED");

  // Classify outcomes
  const successfulOutcomes  = outcomes.filter((o) => o.result === "POSITIVE");
  const failedOutcomes      = outcomes.filter((o) => o.result === "NEGATIVE");

  // Classify signals
  const anomalySignals        = signals.filter((s) => s.type === "ANOMALY");
  const thresholdBreachSignals = signals.filter((s) => s.type === "THRESHOLD_BREACH");
  const metricDropSignals     = signals.filter((s) => s.type === "METRIC_DROP");
  const metricRiseSignals     = signals.filter((s) => s.type === "METRIC_RISE");

  // Derive scores
  const strategicScore   = _computeStrategicScore(activeGoals, activeRisks, recentLessons);
  const learningStrength = _computeLearningStrength(confirmedPatterns, rejectedPatterns, outcomes);
  const signalDensity    = Math.min(signals.length / 20, 1);
  const graphDensity     = Math.min(nodes.length / 50, 1);

  const overallContextScore = Math.round(
    (strategicScore * 0.40 + learningStrength * 0.25 + signalDensity * 0.20 + graphDensity * 0.15) * 100
  ) / 100;

  // Dominant domain from active risks/goals combined
  const dominantDomain = _findDominantDomain([...activeGoals, ...activeRisks, ...activeOpportunities]);

  return {
    orgSlug,
    activeGoals, activeRisks, activeOpportunities,
    recentDecisions, recentLessons, activeCommitments, activePolicies,
    confirmedPatterns, rejectedPatterns,
    successfulOutcomes, failedOutcomes,
    anomalySignals, thresholdBreachSignals, metricDropSignals, metricRiseSignals,
    graphNodes: nodes, graphEdges: edges,
    executivePriorities: exPriorities, executiveRisks: exRisks, executiveFocusAreas: exFocus,
    strategicScore, learningStrength, signalDensity, graphDensity, overallContextScore,
    confidence: confidenceSaFromScore(overallContextScore),
    dominantDomain,
    builtAt: new Date().toISOString(),
  };
}

export function validateContext(ctx: StrategicAdvisorContext): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (ctx.activeGoals.length === 0) warnings.push("No active strategic goals — alignment analysis limited");
  if (ctx.confirmedPatterns.length === 0) warnings.push("No confirmed learning patterns — recommendations rely on direct signals");
  if (ctx.anomalySignals.length === 0 && ctx.thresholdBreachSignals.length === 0) warnings.push("No risk signals — concern detection may be incomplete");
  return { valid: ctx.orgSlug.length > 0, warnings };
}

export function scoreContext(ctx: StrategicAdvisorContext): number {
  return ctx.overallContextScore;
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _computeStrategicScore(
  goals: StrategicMemoryEntry[],
  risks: StrategicMemoryEntry[],
  lessons: StrategicMemoryEntry[]
): number {
  const goalScore    = Math.min(goals.length / 5, 1) * 0.5;
  const riskPenalty  = Math.min(risks.filter((r) => r.priority === "CRITICAL").length * 0.15, 0.4);
  const lessonBoost  = Math.min(lessons.length / 10, 1) * 0.1;
  return Math.round(Math.max(0, Math.min(1, goalScore - riskPenalty + lessonBoost)) * 100) / 100;
}

function _computeLearningStrength(
  confirmed: LearningPattern[],
  rejected: LearningPattern[],
  outcomes: LearningOutcome[]
): number {
  const total = confirmed.length + rejected.length;
  if (total === 0) return 0;
  const positiveRate = outcomes.filter((o) => o.result === "POSITIVE").length / Math.max(outcomes.length, 1);
  const patternRate  = confirmed.length / total;
  return Math.round((positiveRate * 0.5 + patternRate * 0.5) * 100) / 100;
}

function _findDominantDomain(entries: StrategicMemoryEntry[]): StrategicDomain | null {
  if (entries.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const e of entries) {
    freq[e.domain] = (freq[e.domain] ?? 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return (top?.[0] ?? null) as StrategicDomain | null;
}
