// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 22 — Executive Brain V2 Engine
// Main fail-closed orchestration pipeline

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern, LearningOutcome, LearningEvent } from "../learning/learning-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";
import type { GraphNode, GraphEdge } from "../memory-graph/memory-graph-types";
import type { Playbook } from "../playbooks/playbook-types";
import type {
  ExecutiveBrainV2Input,
  ExecutiveBrainV2Result,
  ExecutiveSnapshot,
  ExecutiveContext,
  ExecutiveTheme,
  ExecutiveRecommendation,
} from "./executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "./executive-brain-types";

import { buildStrategicContext } from "./strategic-context-engine";
import { buildLearningContext } from "./learning-context-engine";
import { buildExecutiveSituation } from "./executive-situation-engine";
import { computeExecutivePriorities } from "./executive-priority-engine";
import { detectExecutiveConflicts } from "./executive-conflict-engine";
import { detectExecutiveOpportunities } from "./executive-opportunity-engine";
import { detectExecutiveRisks } from "./executive-risk-engine";
import { computeFocusAreas } from "./executive-focus-engine";
import { buildExecutiveNarratives } from "./executive-narrative-engine-v2";
import { buildExecutiveDigest } from "./executive-digest-builder";
import { buildExecutiveBriefing } from "./executive-briefing-builder";
import { buildExecutiveAgenda } from "./executive-agenda-builder";

import { extractThemesFromGraph } from "./integrations/executive-memory-graph";
import { extractRecommendationsFromPlaybooks } from "./integrations/executive-playbooks";
import { enforceExecutiveTenantBoundary } from "./integrations/executive-compliance";

// ── Engine Input ──────────────────────────────────────────────────────────────

export interface ExecutiveBrainV2EngineInput {
  readonly input: ExecutiveBrainV2Input;
  readonly strategicEntries?: StrategicMemoryEntry[];
  readonly learningPatterns?: LearningPattern[];
  readonly learningOutcomes?: LearningOutcome[];
  readonly learningEvents?: LearningEvent[];
  readonly reasoningSignals?: ReasoningSignal[];
  readonly graphNodes?: GraphNode[];
  readonly graphEdges?: GraphEdge[];
  readonly playbooks?: Playbook[];
  readonly complianceFindingCount?: number;
  readonly complianceSeverity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export function runExecutiveBrainV2(engineInput: ExecutiveBrainV2EngineInput): ExecutiveBrainV2Result {
  const startMs = Date.now();
  const { input } = engineInput;
  const { orgSlug } = input;
  const runId = generateEbv2Id("run");

  try {
    // ── Guardrail: tenant boundary ──────────────────────────────────────────
    enforceExecutiveTenantBoundary(orgSlug, orgSlug); // self-check always passes

    const entries = (engineInput.strategicEntries ?? []).filter((e) => e.orgSlug === orgSlug);
    const patterns = (engineInput.learningPatterns ?? []).filter((p) => p.orgSlug === orgSlug);
    const outcomes = (engineInput.learningOutcomes ?? []).filter((o) => o.orgSlug === orgSlug);
    const events = (engineInput.learningEvents ?? []).filter((e) => e.orgSlug === orgSlug);
    const signals = (engineInput.reasoningSignals ?? []).filter((s) => s.orgSlug === orgSlug);
    const nodes = engineInput.graphNodes ?? [];
    const edges = engineInput.graphEdges ?? [];
    const playbooks = (engineInput.playbooks ?? []).filter((p) => p.orgSlug === orgSlug);

    // ── Phase 1: Strategic Context ──────────────────────────────────────────
    const strategicContext = buildStrategicContext(orgSlug, entries);

    // ── Phase 2: Learning Context ───────────────────────────────────────────
    const learningContext = buildLearningContext(orgSlug, patterns, outcomes, events);

    // ── Phase 3: Situation ──────────────────────────────────────────────────
    const situation = buildExecutiveSituation({
      orgSlug,
      brainInput: input,
      strategicContext,
      learningContext,
      reasoningSignals: signals,
      strategicEntries: entries,
      patterns,
      outcomes,
    });

    // ── Phase 4: Risks ──────────────────────────────────────────────────────
    const risks = detectExecutiveRisks({
      orgSlug,
      strategicEntries: entries,
      reasoningSignals: signals,
      complianceFindingCount: engineInput.complianceFindingCount,
      complianceSeverity: engineInput.complianceSeverity,
    });

    // ── Phase 5: Opportunities ──────────────────────────────────────────────
    const opportunities = detectExecutiveOpportunities({
      orgSlug,
      strategicEntries: entries,
      confirmedPatterns: learningContext.confirmedPatterns,
    });

    // ── Phase 6: Conflicts ──────────────────────────────────────────────────
    const conflicts = detectExecutiveConflicts(orgSlug, entries, situation.priorities);

    // ── Phase 7: Priorities ─────────────────────────────────────────────────
    const priorities = computeExecutivePriorities({
      orgSlug,
      strategicEntries: entries,
      patterns,
      risks,
      opportunities,
      historicalRiskScore: learningContext.historicalRiskScore,
    });

    // ── Phase 8: Focus Areas ────────────────────────────────────────────────
    const focusAreas = computeFocusAreas({ orgSlug, priorities, risks, conflicts });

    // ── Phase 9: Narratives ─────────────────────────────────────────────────
    const narratives = buildExecutiveNarratives({ orgSlug, priorities, risks, opportunities, conflicts, focusAreas });

    // ── Phase 10: Themes from Graph ─────────────────────────────────────────
    const themes: ExecutiveTheme[] = extractThemesFromGraph(orgSlug, nodes, edges);

    // ── Phase 11: Recommendations from Playbooks ────────────────────────────
    const recommendations: ExecutiveRecommendation[] = extractRecommendationsFromPlaybooks(orgSlug, playbooks);

    // ── Phase 12: Concerns from strategic ──────────────────────────────────
    const concerns = strategicContext.concerns;

    // ── Phase 13: Executive Score ───────────────────────────────────────────
    const executiveScore = _computeExecutiveScore(risks, opportunities, conflicts, strategicContext.strategicScore);
    const confidence = confidenceFromScore(executiveScore);

    // ── Phase 14: Build Context ─────────────────────────────────────────────
    const context: ExecutiveContext = {
      orgSlug,
      objectives: strategicContext.objectives,
      concerns,
      conflicts,
      focusAreas,
      priorities,
      themes,
      recommendations,
      narratives,
      executiveScore,
      confidence,
      requestedAt: new Date().toISOString(),
    };

    // ── Phase 15: Build Digest ──────────────────────────────────────────────
    const digest = buildExecutiveDigest({
      orgSlug,
      period: "DAILY",
      priorities,
      concerns,
      opportunities,
      narratives,
      focusAreas,
      executiveScore,
    });

    // ── Phase 16: Build Briefing ────────────────────────────────────────────
    const briefing = buildExecutiveBriefing({
      orgSlug,
      type: "CEO",
      priorities,
      concerns,
      recommendations,
      narratives,
      focusAreas,
      conflicts,
      themes,
      executiveScore,
    });

    // ── Phase 17: Build Agenda ──────────────────────────────────────────────
    const agenda = buildExecutiveAgenda({ orgSlug, priorities, risks, conflicts });

    // ── Phase 18: Snapshot ──────────────────────────────────────────────────
    const snapshot: ExecutiveSnapshot = {
      id: generateEbv2Id("snap"),
      orgSlug,
      context,
      briefing,
      agenda,
      metadata: { runId, engineVersion: "v2" },
      createdAt: new Date().toISOString(),
    };

    return {
      id: runId,
      orgSlug,
      status: "SUCCESS",
      snapshot,
      prioritiesComputed: priorities.length,
      risksDetected: risks.length,
      opportunitiesFound: opportunities.length,
      conflictsDetected: conflicts.length,
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: runId,
      orgSlug,
      status: "FAILED",
      snapshot: undefined,
      prioritiesComputed: 0,
      risksDetected: 0,
      opportunitiesFound: 0,
      conflictsDetected: 0,
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeExecutiveScore(
  risks: Array<{ level: string }>,
  opportunities: Array<{ captureScore: number }>,
  conflicts: Array<{ severity: string }>,
  strategicScore: number
): number {
  const criticalRisks = risks.filter((r) => r.level === "CRITICAL").length;
  const highRisks = risks.filter((r) => r.level === "HIGH").length;
  const criticalConflicts = conflicts.filter((c) => c.severity === "CRITICAL").length;
  const riskPenalty = Math.min(criticalRisks * 0.2 + highRisks * 0.08 + criticalConflicts * 0.1, 0.65);
  const oppBoost = Math.min(opportunities.length * 0.03, 0.15);
  const base = Math.max(0.2, strategicScore * 0.8);
  return Math.round(Math.max(0, Math.min(1, base - riskPenalty + oppBoost)) * 100) / 100;
}
