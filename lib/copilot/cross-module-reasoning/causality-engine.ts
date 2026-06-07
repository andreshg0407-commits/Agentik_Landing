/**
 * lib/copilot/cross-module-reasoning/causality-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Causality Preparation
 *
 * Prepares causal candidate structures. Does NOT implement real causal inference.
 * Next sprint: AGENTIK-MEMORY-GRAPH-CAUSALITY-01
 */

import type {
  ReasoningSignal,
  CausalCandidate,
  CausalRelationship,
  CausalReasoningResult,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Causal domain ordering (typical cause → effect) ──────────────────────────

const CAUSAL_DOMAIN_ORDER: Record<string, number> = {
  MARKETING:   1,  // Marketing drives demand
  COMMERCIAL:  2,  // Commercial generates orders
  COLLECTIONS: 3,  // Orders generate receivables → collections
  FINANCE:     4,  // Collections affect finance
  EXECUTIVE:   5,  // Executive observes results
};

// ── Causal candidate identification ──────────────────────────────────────────

export function identifyCausalCandidates(
  orgSlug: string,
  signals: ReasoningSignal[],
): CausalCandidate[] {
  const scoped = signals.filter(s => s.orgSlug === orgSlug);
  const candidates: CausalCandidate[] = [];

  for (let i = 0; i < scoped.length; i++) {
    for (let j = 0; j < scoped.length; j++) {
      if (i === j) continue;

      const cause  = scoped[i];
      const effect = scoped[j];

      const causeOrder  = CAUSAL_DOMAIN_ORDER[cause.domain]  ?? 99;
      const effectOrder = CAUSAL_DOMAIN_ORDER[effect.domain] ?? 99;

      // Only propose cause → effect where cause precedes effect in typical order
      if (causeOrder < effectOrder && cause.direction === effect.direction) {
        const score = _candidateScore(cause, effect, causeOrder, effectOrder);
        if (score >= 0.3) {
          candidates.push({
            causeSignalId:  cause.id,
            effectSignalId: effect.id,
            candidateScore: score,
            reasoning:      _buildCandidateReasoning(cause, effect),
            orgSlug,
          });
        }
      }
    }
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.candidateScore - a.candidateScore);
}

function _candidateScore(
  cause: ReasoningSignal,
  effect: ReasoningSignal,
  causeOrder: number,
  effectOrder: number,
): number {
  let score = 0.3;

  // Stronger if both signals are high severity
  if (cause.severity === "HIGH" || cause.severity === "CRITICAL") score += 0.2;
  if (effect.severity === "HIGH" || effect.severity === "CRITICAL") score += 0.1;

  // Stronger if domain ordering is tight (adjacent steps in chain)
  if (effectOrder - causeOrder === 1) score += 0.2;

  // Add confidence contribution
  score += ((cause.confidence + effect.confidence) / 2) * 0.2;

  return Math.min(score, 1.0);
}

function _buildCandidateReasoning(
  cause: ReasoningSignal,
  effect: ReasoningSignal,
): string {
  return [
    `"${cause.label}" en ${cause.domain} puede ser causa de`,
    `"${effect.label}" en ${effect.domain}.`,
    `Ambas señales muestran dirección ${cause.direction ?? "no definida"}.`,
    `Nota: Esta es una hipótesis causal preparatoria — no inferencia confirmada.`,
  ].join(" ");
}

// ── Build causal relationship ─────────────────────────────────────────────────

export function buildCausalRelationship(
  orgSlug: string,
  candidate: CausalCandidate,
): CausalRelationship {
  return {
    id:         generateCmrId("crl"),
    orgSlug,
    causeId:    candidate.causeSignalId,
    effectId:   candidate.effectSignalId,
    strength:   candidate.candidateScore,
    mechanism:  "Correlation-based candidate — requires confirmation",
    confidence: candidate.candidateScore * 0.6,  // reduced confidence (not confirmed)
    status:     "CANDIDATE",
  };
}

// ── Causal reasoning result ───────────────────────────────────────────────────

export function buildCausalReasoningResult(
  orgSlug: string,
  signals: ReasoningSignal[],
): CausalReasoningResult {
  const candidates     = identifyCausalCandidates(orgSlug, signals);
  const topCandidates  = candidates.slice(0, 5);  // top 5 only
  const relationships  = topCandidates.map(c => buildCausalRelationship(orgSlug, c));

  return {
    orgSlug,
    candidates:    topCandidates,
    relationships,
    status:        "PREPARED",
    nextSprint:    "AGENTIK-MEMORY-GRAPH-CAUSALITY-01",
  };
}

export const CAUSALITY_ENGINE_ROADMAP = {
  currentStatus: "PREPARED",
  nextSprint:    "AGENTIK-MEMORY-GRAPH-CAUSALITY-01",
  description:   "Causal inference requires temporal data and graph traversal. Candidates prepared for next sprint.",
  capabilities:  [
    "Candidate identification (CURRENT)",
    "Correlation-based scoring (CURRENT)",
    "Temporal causal inference (PLANNED)",
    "Graph-path causal analysis (PLANNED)",
    "Bayesian network integration (PLANNED)",
  ],
} as const;
