// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 10b: Board Recommendation Engine

import type {
  BoardRecommendation,
  BoardDomain,
  BoardPriorityLevel,
  BoardConfidence,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  sortBoardRecommendationsByPriority,
} from "./board-intelligence-types";
import { generateBoardRecommendationId } from "./board-intelligence-identity";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawRecommendationSignal {
  readonly title:          string;
  readonly description:    string;
  readonly rationale:      string;
  readonly domain:         BoardDomain;
  readonly priority:       BoardPriorityLevel;
  readonly impactScore:    number;   // 0–1
  readonly riskScore:      number;   // 0–1
  readonly evidenceIds?:   string[];
  readonly associatedRisks?: string[];
  readonly metadata?:      Record<string, unknown>;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardRecommendation(
  orgSlug:   string,
  sessionId: string,
  signal:    RawRecommendationSignal
): BoardRecommendation {
  try {
    const impactScore    = Math.max(0, Math.min(1, signal.impactScore));
    const riskScore      = Math.max(0, Math.min(1, signal.riskScore));
    const confidenceScore = (impactScore * 0.60 + (1 - riskScore) * 0.40);
    const confidence: BoardConfidence = boardConfidenceFromScore(confidenceScore);

    return {
      id:             generateBoardRecommendationId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      rationale:      signal.rationale,
      domain:         signal.domain,
      priority:       signal.priority,
      confidence,
      confidenceScore,
      impactScore,
      riskScore,
      evidenceIds:    signal.evidenceIds     ?? [],
      suggestedOnly:  true,
      associatedRisks: signal.associatedRisks ?? [],
      metadata:       signal.metadata        ?? {},
    };
  } catch {
    return buildPlaceholderBoardRecommendation(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardRecommendation(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardRecommendation {
  return {
    id:             generateBoardRecommendationId(),
    orgSlug,
    sessionId,
    title:          "Recomendación sin evaluar",
    description:    "Recomendación sin datos suficientes.",
    rationale:      "Datos insuficientes.",
    domain,
    priority:       "LOW",
    confidence:     "LOW",
    confidenceScore: 0.2,
    impactScore:    0.2,
    riskScore:      0.5,
    evidenceIds:    [],
    suggestedOnly:  true,
    associatedRisks: [],
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function buildBoardRecommendations(
  orgSlug:   string,
  sessionId: string,
  signals:   RawRecommendationSignal[]
): BoardRecommendation[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildBoardRecommendation(orgSlug, sessionId, s));
  } catch {
    return [];
  }
}

export function rankBoardRecommendations(recs: BoardRecommendation[]): BoardRecommendation[] {
  try {
    return sortBoardRecommendationsByPriority(recs);
  } catch {
    return recs ?? [];
  }
}

export function getCriticalRecommendations(recs: BoardRecommendation[]): BoardRecommendation[] {
  return recs.filter((r) => r.priority === "CRITICAL");
}

export function getHighImpactRecommendations(recs: BoardRecommendation[], threshold = 0.7): BoardRecommendation[] {
  return recs.filter((r) => r.impactScore >= threshold);
}

export function deduplicateBoardRecommendations(recs: BoardRecommendation[]): BoardRecommendation[] {
  try {
    const seen = new Set<string>();
    return recs.filter((r) => {
      const key = r.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return recs ?? [];
  }
}
