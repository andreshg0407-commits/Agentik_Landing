// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 14 — Strategic Advisor Engine
// Main fail-closed pipeline: Context → Concerns → Opportunities → Questions
// → Recommendations → Scenarios → Alignment → Challenges → Focus → Narrative
// → Digest → Briefing

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern, LearningOutcome, LearningEvent } from "../learning/learning-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";
import type { GraphNode, GraphEdge } from "../memory-graph/memory-graph-types";
import type { ExecutivePriority, ExecutiveRisk, ExecutiveFocusArea } from "../executive-brain-v2/executive-brain-types";
import type { Playbook } from "../playbooks/playbook-types";

import type {
  StrategicAdvisorInput, StrategicAdvisorResult, StrategicAdvisorReport,
  StrategicDecisionContext,
} from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "./strategic-advisor-types";

import { buildContext } from "./strategic-context-builder";
import { identifyConcerns } from "./strategic-concern-engine";
import { identifyOpportunities } from "./strategic-opportunity-engine";
import { generateRecommendations } from "./strategic-recommendation-engine";
import { generateQuestions } from "./strategic-question-engine";
import { buildScenarios } from "./strategic-scenario-engine";
import { evaluateAlignment } from "./strategic-alignment-engine";
import { identifyChallenges } from "./strategic-challenge-engine";
import { computeFocusAreas } from "./strategic-focus-engine";
import { buildAdvisoryNarratives } from "./strategic-narrative-engine";
import { buildStrategicBriefing } from "./strategic-briefing-builder";
import { buildStrategicDigest } from "./strategic-digest-builder";
import { enforceAdvisorTenantBoundary } from "./integrations/advisor-compliance";

// ── Engine input ──────────────────────────────────────────────────────────────

export interface StrategicAdvisorEngineInput {
  readonly input:              StrategicAdvisorInput;
  readonly strategicEntries?:  StrategicMemoryEntry[];
  readonly learningPatterns?:  LearningPattern[];
  readonly learningOutcomes?:  LearningOutcome[];
  readonly learningEvents?:    LearningEvent[];
  readonly reasoningSignals?:  ReasoningSignal[];
  readonly graphNodes?:        GraphNode[];
  readonly graphEdges?:        GraphEdge[];
  readonly playbooks?:         Playbook[];
  readonly executivePriorities?: ExecutivePriority[];
  readonly executiveRisks?:    ExecutiveRisk[];
  readonly executiveFocusAreas?: ExecutiveFocusArea[];
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export function runStrategicAdvisor(engineInput: StrategicAdvisorEngineInput): StrategicAdvisorResult {
  const startMs = Date.now();
  const { input } = engineInput;
  const { orgSlug } = input;
  const runId = generateSaId("run");

  try {
    // Guardrail: tenant boundary
    enforceAdvisorTenantBoundary(orgSlug, orgSlug);

    // Phase 1: Context
    const ctx = buildContext({
      orgSlug,
      strategicEntries:    (engineInput.strategicEntries ?? []).filter((e) => e.orgSlug === orgSlug),
      learningPatterns:    (engineInput.learningPatterns ?? []).filter((p) => p.orgSlug === orgSlug),
      learningOutcomes:    (engineInput.learningOutcomes ?? []).filter((o) => o.orgSlug === orgSlug),
      reasoningSignals:    (engineInput.reasoningSignals ?? []).filter((s) => s.orgSlug === orgSlug),
      graphNodes:          (engineInput.graphNodes ?? []).filter((n) => n.orgSlug === orgSlug),
      graphEdges:          engineInput.graphEdges ?? [],
      executivePriorities: (engineInput.executivePriorities ?? []).filter((p) => p.orgSlug === orgSlug),
      executiveRisks:      (engineInput.executiveRisks ?? []).filter((r) => r.orgSlug === orgSlug),
      executiveFocusAreas: (engineInput.executiveFocusAreas ?? []).filter((f) => f.orgSlug === orgSlug),
    });

    // Phase 2: Concerns
    const concerns = identifyConcerns(ctx);

    // Phase 3: Opportunities
    const opportunities = identifyOpportunities(ctx);

    // Phase 4: Questions
    const questions = generateQuestions(ctx, concerns, opportunities);

    // Phase 5: Recommendations
    const recommendations = generateRecommendations(ctx, concerns, opportunities);

    // Phase 6: Scenarios
    const scenarios = buildScenarios(ctx, concerns, opportunities);

    // Phase 7: Alignment
    const alignmentResult = evaluateAlignment(ctx, recommendations);

    // Phase 8: Challenges
    const challenges = identifyChallenges(ctx, concerns, recommendations);

    // Phase 9: Focus Areas
    const focusAreas = computeFocusAreas(orgSlug, concerns, opportunities, recommendations);

    // Phase 10: Narratives
    const advice = buildAdvisoryNarratives(ctx, concerns, opportunities, recommendations, focusAreas);

    // Phase 11: Executive score
    const criticalCount  = concerns.filter((c) => c.severity === "CRITICAL").length;
    const riskPenalty    = Math.min(criticalCount * 0.15, 0.45);
    const oppBoost       = Math.min(opportunities.filter((o) => o.magnitude !== "SMALL").length * 0.05, 0.2);
    const advisorScore   = Math.round(
      Math.max(0, Math.min(1, ctx.overallContextScore - riskPenalty + oppBoost)) * 100
    ) / 100;

    // Phase 12: Decision context
    const decisionContext: StrategicDecisionContext = {
      orgSlug,
      activeGoalCount:   ctx.activeGoals.length,
      criticalRiskCount: concerns.filter((c) => c.severity === "CRITICAL").length,
      openConflictCount: concerns.filter((c) => c.isEmergent).length,
      opportunityCount:  opportunities.length,
      alignmentScore:    alignmentResult.alignmentScore,
      maturityLevel:     ctx.learningStrength >= 0.7 ? "MATURE" : ctx.learningStrength >= 0.4 ? "DEVELOPING" : ctx.learningStrength > 0 ? "EARLY" : "EARLY",
      hasLearningData:   ctx.confirmedPatterns.length > 0,
      hasGraphData:      ctx.graphNodes.length > 0,
      hasSignalData:     (ctx.anomalySignals.length + ctx.thresholdBreachSignals.length) > 0,
      advisorScore,
    };

    // Phase 13: Report
    const report: StrategicAdvisorReport = {
      id:             generateSaId("report"),
      orgSlug,
      advisorScore,
      concerns,
      opportunities,
      risks:          ctx.executiveRisks.map((r) => ({
        id: generateSaId("risk"), orgSlug, title: r.title, description: r.description,
        domain: r.domain as typeof concerns[0]["domain"], level: r.level as "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
        confidence: confidenceSaFromScore(r.confidenceScore),
        confidenceScore: r.confidenceScore, likelihood: r.likelihood, impact: r.impact,
        compositeRisk: r.compositeRisk, mitigations: r.mitigationSuggestions,
        rationale: r.rationale, evidenceIds: r.evidenceIds, metadata: { source: "EXECUTIVE_BRAIN", riskId: r.id },
      })),
      questions,
      recommendations,
      focusAreas,
      advice,
      decisionContext,
      alignmentScore: alignmentResult.alignmentScore,
      generatedAt:    new Date().toISOString(),
    };

    // Phase 14: Briefing
    const briefingType = input.briefingType ?? "CEO";
    const briefing = buildStrategicBriefing({
      orgSlug, type: briefingType, concerns, opportunities, recommendations, questions, advice, advisorScore,
    });

    // Phase 15: Digest
    const digestPeriod = input.digestPeriod ?? "DAILY";
    const digest = buildStrategicDigest({
      orgSlug, period: digestPeriod, concerns, opportunities, recommendations, advisorScore,
    });

    return {
      status: "OK",
      orgSlug,
      report,
      briefing,
      digest,
      runId,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      status:    "FAILED",
      orgSlug,
      report:    null,
      briefing:  null,
      digest:    null,
      runId,
      durationMs: Date.now() - startMs,
      error:     err instanceof Error ? err.message : String(err),
    };
  }
}
