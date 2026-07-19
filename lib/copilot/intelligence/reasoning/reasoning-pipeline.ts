/**
 * lib/copilot/intelligence/reasoning/reasoning-pipeline.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Full Pipeline
 *
 * Orchestrates the complete reasoning flow:
 *
 *   1. Context (CrossDomainContext)
 *   2. Evidence (from all domains and integrations)
 *   3. Contradiction Detection
 *   4. Hypothesis Generation
 *   5. Insight Generation
 *   6. Confidence Calculation
 *   7. Executive Impact Classification
 *   8. Conclusion Assembly
 *
 * Fail-closed: any phase failure is recorded but does not halt the pipeline.
 * The pipeline always returns a ReasoningConclusion, even if it is empty.
 *
 * No Prisma. No server-only. Pure domain logic.
 */

import type {
  ReasoningConclusion,
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningInsight,
  ContradictionRecord,
  ReasoningError,
} from "./reasoning-types";
import { emptyConclusion } from "./reasoning-types";
import type { CrossDomainContext } from "./cross-domain-context";
import { buildEvidenceFromContext } from "./evidence-builder";
import { generateHypotheses, rankHypotheses } from "./hypothesis-engine";
import { generateInsights, rankInsights } from "./insight-engine";
import { calculateOverallConfidence } from "./confidence-engine";
import { detectAllContradictions } from "./contradiction-detector";
import { classifyConclusionImpact } from "./executive-impact";

// ── Pipeline options ───────────────────────────────────────────────────────────

export interface ReasoningPipelineOptions {
  /** Maximum insights to return (default: 10) */
  maxInsights?: number;
  /** Minimum confidence score threshold — lower insights are dropped (default: 30) */
  minConfidenceScore?: number;
  /** If true, include hypotheses with REFUTED status in output (default: false) */
  includeRefutedHypotheses?: boolean;
  /** If true, skip contradiction detection for performance (default: false) */
  skipContradictionDetection?: boolean;
}

// ── Pipeline result ────────────────────────────────────────────────────────────

export interface ReasoningPipelineResult {
  conclusion: ReasoningConclusion;
  errors:     ReasoningError[];
  /** Milliseconds spent in each pipeline phase. */
  phaseTimings: Record<string, number>;
}

// ── ID generator ───────────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  return `rp_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

// ── runReasoningPipeline ───────────────────────────────────────────────────────

/**
 * runReasoningPipeline — execute the full reasoning pipeline.
 *
 * Always returns a result, never throws.
 * Errors are collected and returned alongside the conclusion.
 */
export function runReasoningPipeline(
  context:  CrossDomainContext,
  opts?:    ReasoningPipelineOptions,
): ReasoningPipelineResult {
  const startedAt = Date.now();
  const errors:   ReasoningError[] = [];
  const timings:  Record<string, number> = {};
  const queryId   = context.queryId;
  const orgSlug   = context.orgSlug;

  const maxInsights         = opts?.maxInsights         ?? 10;
  const minConfidenceScore  = opts?.minConfidenceScore  ?? 30;
  const skipContradictions  = opts?.skipContradictionDetection ?? false;
  const includeRefuted      = opts?.includeRefutedHypotheses   ?? false;

  // ── Phase 1: Build evidence ─────────────────────────────────────────────────
  let evidence: ReasoningEvidence[] = [];
  const t1 = Date.now();
  try {
    evidence = buildEvidenceFromContext(context);
  } catch (err) {
    errors.push({
      code:        "EVIDENCE_BUILD_FAILED",
      message:     err instanceof Error ? err.message : String(err),
      phase:       "evidence",
      recoverable: true,
    });
  }
  timings["evidence"] = Date.now() - t1;

  if (evidence.length === 0) {
    return {
      conclusion:   emptyConclusion(orgSlug, queryId),
      errors,
      phaseTimings: timings,
    };
  }

  // ── Phase 2: Contradiction detection ────────────────────────────────────────
  let contradictions: ContradictionRecord[] = [];
  const t2 = Date.now();
  if (!skipContradictions) {
    try {
      contradictions = detectAllContradictions(evidence, []);
    } catch (err) {
      errors.push({
        code:        "CONTRADICTION_DETECTION_FAILED",
        message:     err instanceof Error ? err.message : String(err),
        phase:       "contradictions",
        recoverable: true,
      });
    }
  }
  timings["contradictions"] = Date.now() - t2;

  // ── Phase 3: Hypothesis generation ──────────────────────────────────────────
  let hypotheses: ReasoningHypothesis[] = [];
  const t3 = Date.now();
  try {
    const allHypotheses = generateHypotheses(orgSlug, evidence);
    hypotheses = includeRefuted
      ? allHypotheses
      : allHypotheses.filter(h => h.status !== "REFUTED");
    hypotheses = rankHypotheses(hypotheses);
  } catch (err) {
    errors.push({
      code:        "HYPOTHESIS_GENERATION_FAILED",
      message:     err instanceof Error ? err.message : String(err),
      phase:       "hypotheses",
      recoverable: true,
    });
  }
  timings["hypotheses"] = Date.now() - t3;

  // ── Phase 4: Insight generation ─────────────────────────────────────────────
  let insights: ReasoningInsight[] = [];
  const t4 = Date.now();
  try {
    const allInsights = generateInsights(orgSlug, hypotheses, evidence);
    // Apply confidence filter
    insights = allInsights.filter(i => i.confidenceScore >= minConfidenceScore);
    // Rank and cap
    insights = rankInsights(insights).slice(0, maxInsights);
  } catch (err) {
    errors.push({
      code:        "INSIGHT_GENERATION_FAILED",
      message:     err instanceof Error ? err.message : String(err),
      phase:       "insights",
      recoverable: true,
    });
  }
  timings["insights"] = Date.now() - t4;

  // ── Phase 5: Re-detect hypothesis contradictions ─────────────────────────────
  const t5 = Date.now();
  if (!skipContradictions && hypotheses.length > 0) {
    try {
      const hypContradictions = detectAllContradictions(evidence, hypotheses);
      // Merge, deduplicating by evidenceAId+evidenceBId pair
      const existingPairs = new Set(
        contradictions.map(c => `${c.evidenceAId}:${c.evidenceBId}`),
      );
      for (const c of hypContradictions) {
        const key = `${c.evidenceAId}:${c.evidenceBId}`;
        if (!existingPairs.has(key)) {
          contradictions.push(c);
          existingPairs.add(key);
        }
      }
    } catch {
      // non-fatal
    }
  }
  timings["contradictions_hyp"] = Date.now() - t5;

  // ── Phase 6: Confidence calculation ─────────────────────────────────────────
  const t6 = Date.now();
  const { score: overallScore, level: overallLevel } = calculateOverallConfidence({
    evidence,
    hypotheses,
    insights,
    contradictions,
  });
  timings["confidence"] = Date.now() - t6;

  // ── Phase 7: Executive impact ────────────────────────────────────────────────
  const t7 = Date.now();
  const executiveImpact = classifyConclusionImpact(insights, hypotheses, contradictions);
  timings["executive_impact"] = Date.now() - t7;

  // ── Phase 8: Assemble conclusion ─────────────────────────────────────────────
  const allDomains = Array.from(
    new Set([
      ...evidence.map(e => e.category),
      ...hypotheses.flatMap(h => h.domains),
      ...insights.flatMap(i => i.domains),
    ]),
  );

  const conclusion: ReasoningConclusion = {
    id:                     _id(),
    orgSlug,
    queryId,
    title:                  _buildTitle(insights, hypotheses),
    summary:                _buildSummary(insights, hypotheses, contradictions),
    insights,
    hypotheses,
    evidence,
    overallConfidence:      overallLevel,
    overallConfidenceScore: overallScore,
    executiveImpact,
    domains:                allDomains,
    contradictions,
    generatedAt:            new Date().toISOString(),
    durationMs:             Date.now() - startedAt,
  };

  timings["total"] = Date.now() - startedAt;

  return { conclusion, errors, phaseTimings: timings };
}

// ── Internal builders ──────────────────────────────────────────────────────────

function _buildTitle(
  insights:   ReasoningInsight[],
  hypotheses: ReasoningHypothesis[],
): string {
  if (insights.length === 0 && hypotheses.length === 0) {
    return "Sin análisis disponible";
  }
  const topInsight = insights[0];
  if (topInsight) return topInsight.title;
  const topHyp = hypotheses[0];
  if (topHyp) return topHyp.title;
  return "Análisis multi-dominio";
}

function _buildSummary(
  insights:       ReasoningInsight[],
  hypotheses:     ReasoningHypothesis[],
  contradictions: ContradictionRecord[],
): string {
  const parts: string[] = [];

  if (insights.length > 0) {
    parts.push(`${insights.length} insight(s) generado(s)`);
  }
  if (hypotheses.length > 0) {
    parts.push(`${hypotheses.length} hipótesis evaluada(s)`);
  }
  if (contradictions.length > 0) {
    parts.push(`${contradictions.length} contradicción(es) detectada(s)`);
  }

  return parts.length > 0
    ? parts.join(". ") + "."
    : "Análisis completado sin hallazgos significativos.";
}
