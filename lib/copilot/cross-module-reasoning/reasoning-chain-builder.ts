/**
 * lib/copilot/cross-module-reasoning/reasoning-chain-builder.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Reasoning Chain Builder
 *
 * Builds: Signal → Evidence → Hypothesis → Conclusion → Recommendation
 * Fully auditable. All links traceable.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningConclusion,
  ReasoningRecommendation,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningPath,
  ReasoningChain,
  ReasoningConfidenceScore,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Build reasoning path for a single signal ──────────────────────────────────

export function buildReasoningPath(
  signal: ReasoningSignal,
  evidence: ReasoningEvidence[],
  hypothesis: ReasoningHypothesis,
  conclusion: ReasoningConclusion,
  confidence: ReasoningConfidenceScore,
): ReasoningPath {
  return {
    signalId:     signal.id,
    evidenceIds:  evidence.map(e => e.id),
    hypothesisId: hypothesis.id,
    conclusionId: conclusion.id,
    confidence,
  };
}

// ── Build full reasoning chain ────────────────────────────────────────────────

export interface ReasoningChainInput {
  orgSlug:         string;
  signals:         ReasoningSignal[];
  evidence:        ReasoningEvidence[];
  hypotheses:      ReasoningHypothesis[];
  conclusions:     ReasoningConclusion[];
  recommendations: ReasoningRecommendation[];
  risks:           ReasoningRisk[];
  opportunities:   ReasoningOpportunity[];
  confidence:      ReasoningConfidenceScore;
}

export function buildReasoningChain(input: ReasoningChainInput): ReasoningChain {
  const {
    orgSlug, signals, evidence, hypotheses, conclusions,
    recommendations, risks, opportunities, confidence,
  } = input;

  // Build paths: connect each supported hypothesis to its primary conclusion
  const paths: ReasoningPath[] = [];
  const primaryConclusion = conclusions[0];

  if (primaryConclusion) {
    for (const signal of signals) {
      const relevantHypotheses = hypotheses.filter(
        h => h.orgSlug === orgSlug &&
             h.supported &&
             !h.contradicted &&
             h.metadata?.["triggerSignalId"] === signal.id,
      );

      for (const hyp of relevantHypotheses) {
        const relevantEvidence = evidence.filter(
          e => e.orgSlug === orgSlug &&
               hyp.evidenceIds.includes(e.id),
        );

        paths.push(buildReasoningPath(
          signal,
          relevantEvidence,
          hyp,
          primaryConclusion,
          confidence,
        ));
      }
    }
  }

  return {
    id:              generateCmrId("chn"),
    orgSlug,
    paths,
    signals:         signals.filter(s => s.orgSlug === orgSlug),
    evidence:        evidence.filter(e => e.orgSlug === orgSlug),
    hypotheses:      hypotheses.filter(h => h.orgSlug === orgSlug),
    conclusions,
    recommendations: recommendations.filter(r => r.orgSlug === orgSlug),
    risks:           risks.filter(r => r.orgSlug === orgSlug),
    opportunities:   opportunities.filter(o => o.orgSlug === orgSlug),
    builtAt:         new Date().toISOString(),
  };
}

// ── Chain summary ─────────────────────────────────────────────────────────────

export interface ChainSummary {
  orgSlug:             string;
  pathCount:           number;
  signalCount:         number;
  evidenceCount:       number;
  hypothesisCount:     number;
  conclusionCount:     number;
  recommendationCount: number;
  riskCount:           number;
  opportunityCount:    number;
  isComplete:          boolean;  // chain has at least one path
}

export function summarizeChain(chain: ReasoningChain): ChainSummary {
  return {
    orgSlug:             chain.orgSlug,
    pathCount:           chain.paths.length,
    signalCount:         chain.signals.length,
    evidenceCount:       chain.evidence.length,
    hypothesisCount:     chain.hypotheses.length,
    conclusionCount:     chain.conclusions.length,
    recommendationCount: chain.recommendations.length,
    riskCount:           chain.risks.length,
    opportunityCount:    chain.opportunities.length,
    isComplete:          chain.paths.length > 0,
  };
}

// ── Chain validation ──────────────────────────────────────────────────────────

export interface ChainValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

export function validateChain(chain: ReasoningChain): ChainValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!chain.id)      errors.push("Chain missing id");
  if (!chain.orgSlug) errors.push("Chain missing orgSlug");
  if (!chain.builtAt) errors.push("Chain missing builtAt");

  if (chain.signals.length === 0) {
    warnings.push("Chain has no signals — reasoning may be incomplete");
  }
  if (chain.paths.length === 0) {
    warnings.push("Chain has no paths — signal-to-conclusion links are missing");
  }
  if (chain.hypotheses.length === 0) {
    warnings.push("Chain has no hypotheses");
  }

  // Validate tenant isolation
  const allOrgSlugs = [
    ...chain.signals.map(s => s.orgSlug),
    ...chain.evidence.map(e => e.orgSlug),
    ...chain.hypotheses.map(h => h.orgSlug),
  ];
  const foreignOrgs = allOrgSlugs.filter(o => o !== chain.orgSlug);
  if (foreignOrgs.length > 0) {
    errors.push(`Chain contains cross-tenant data: ${[...new Set(foreignOrgs)].join(", ")}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
