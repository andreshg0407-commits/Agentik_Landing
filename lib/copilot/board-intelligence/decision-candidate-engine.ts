// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 10: Decision Candidate Engine

import type {
  BoardDecisionCandidate,
  BoardDomain,
  BoardOutcome,
  BoardConfidence,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  boardOutcomeFromScore,
} from "./board-intelligence-types";
import { generateBoardDecisionCandidateId } from "./board-intelligence-identity";
import type { BoardGovernanceAssessment } from "./board-intelligence-types";
import type { BoardRisk } from "./board-intelligence-types";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawDecisionSignal {
  readonly title:       string;
  readonly description: string;
  readonly domain:      BoardDomain;
  readonly impactScore: number;   // 0–1
  readonly riskScore:   number;   // 0–1
  readonly rationale:   string;
  readonly conditions?: string[];
  readonly risks?:      string[];
  readonly evidenceIds?: string[];
  readonly metadata?:   Record<string, unknown>;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildDecisionCandidate(
  orgSlug:    string,
  sessionId:  string,
  signal:     RawDecisionSignal,
  governance: BoardGovernanceAssessment
): BoardDecisionCandidate {
  try {
    const impactScore   = Math.max(0, Math.min(1, signal.impactScore));
    const riskScore     = Math.max(0, Math.min(1, signal.riskScore));
    const outcome: BoardOutcome = boardOutcomeFromScore(governance.governanceScore, riskScore);
    const confidenceScore       = (impactScore * 0.5 + (1 - riskScore) * 0.5);
    const confidence: BoardConfidence = boardConfidenceFromScore(confidenceScore);

    return {
      id:             generateBoardDecisionCandidateId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      outcome,
      confidence,
      confidenceScore,
      impactScore,
      riskScore,
      rationale:      signal.rationale,
      conditions:     signal.conditions ?? [],
      risks:          signal.risks      ?? [],
      evidenceIds:    signal.evidenceIds ?? [],
      suggestedOnly:  true,
      metadata:       signal.metadata   ?? {},
    };
  } catch {
    return buildPlaceholderDecisionCandidate(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderDecisionCandidate(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardDecisionCandidate {
  return {
    id:             generateBoardDecisionCandidateId(),
    orgSlug,
    sessionId,
    title:          "Decisión sin evaluar",
    description:    "Candidato de decisión sin datos suficientes.",
    domain,
    outcome:        "REVIEW_REQUIRED",
    confidence:     "LOW",
    confidenceScore: 0.2,
    impactScore:    0.2,
    riskScore:      0.5,
    rationale:      "Datos insuficientes.",
    conditions:     [],
    risks:          [],
    evidenceIds:    [],
    suggestedOnly:  true,
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function buildDecisionCandidates(
  orgSlug:    string,
  sessionId:  string,
  signals:    RawDecisionSignal[],
  governance: BoardGovernanceAssessment
): BoardDecisionCandidate[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildDecisionCandidate(orgSlug, sessionId, s, governance));
  } catch {
    return [];
  }
}

export function rankDecisionCandidates(candidates: BoardDecisionCandidate[]): BoardDecisionCandidate[] {
  try {
    const OUTCOME_RANK: Record<BoardOutcome, number> = {
      APPROVE:                   5,
      APPROVE_WITH_CONDITIONS:   4,
      REVIEW_REQUIRED:           3,
      ESCALATE:                  2,
      REJECT:                    1,
    };
    return [...candidates].sort((a, b) => {
      const outcomeDiff = OUTCOME_RANK[b.outcome] - OUTCOME_RANK[a.outcome];
      if (outcomeDiff !== 0) return outcomeDiff;
      return b.impactScore - a.impactScore;
    });
  } catch {
    return candidates ?? [];
  }
}

export function getBlockingCandidates(candidates: BoardDecisionCandidate[]): BoardDecisionCandidate[] {
  return candidates.filter((c) => c.outcome === "ESCALATE" || c.outcome === "REJECT");
}

export function getApprovableCandidates(candidates: BoardDecisionCandidate[]): BoardDecisionCandidate[] {
  return candidates.filter((c) => c.outcome === "APPROVE" || c.outcome === "APPROVE_WITH_CONDITIONS");
}

export function deriveOverallOutcomeFromCandidates(
  candidates: BoardDecisionCandidate[],
  risks:       BoardRisk[]
): BoardOutcome {
  try {
    if (candidates.length === 0) return "REVIEW_REQUIRED";
    const blockers = getBlockingCandidates(candidates);
    if (blockers.some((c) => c.outcome === "REJECT")) return "REJECT";
    if (blockers.some((c) => c.outcome === "ESCALATE")) return "ESCALATE";
    const criticalRisks = risks.filter((r) => r.compositeRisk >= 0.75);
    if (criticalRisks.length >= 2) return "REVIEW_REQUIRED";
    const approvals = getApprovableCandidates(candidates);
    if (approvals.length > candidates.length * 0.6) return "APPROVE_WITH_CONDITIONS";
    return "REVIEW_REQUIRED";
  } catch {
    return "REVIEW_REQUIRED";
  }
}
