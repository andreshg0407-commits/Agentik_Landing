// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 6: Board Opportunity Engine

import type {
  BoardOpportunity,
  BoardDomain,
  BoardConfidence,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  sortBoardOpportunitiesByCapture,
} from "./board-intelligence-types";
import { generateBoardOpportunityId } from "./board-intelligence-identity";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawOpportunitySignal {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       BoardDomain;
  readonly magnitude:    "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";
  readonly timeHorizon:  "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
  readonly captureScore: number;   // 0–1 ease/readiness to capture
  readonly rationale:    string;
  readonly evidenceIds?: string[];
  readonly metadata?:    Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

const MAGNITUDE_SCORE: Record<string, number> = {
  SMALL: 0.25, MEDIUM: 0.50, LARGE: 0.75, TRANSFORMATIONAL: 1.0,
};

const HORIZON_URGENCY: Record<string, number> = {
  IMMEDIATE: 1.0, SHORT_TERM: 0.75, MEDIUM_TERM: 0.50, LONG_TERM: 0.25,
};

export function scoreBoardOpportunity(
  magnitude:    string,
  timeHorizon:  string,
  captureScore: number
): number {
  try {
    const m = MAGNITUDE_SCORE[magnitude]  ?? 0.5;
    const h = HORIZON_URGENCY[timeHorizon] ?? 0.5;
    const c = Math.max(0, Math.min(1, captureScore));
    // Weighted: magnitude 40%, capture readiness 40%, horizon urgency 20%
    return Math.max(0, Math.min(1, m * 0.40 + c * 0.40 + h * 0.20));
  } catch {
    return 0.4;
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardOpportunity(
  orgSlug:   string,
  sessionId: string,
  signal:    RawOpportunitySignal
): BoardOpportunity {
  try {
    const captureScore   = Math.max(0, Math.min(1, signal.captureScore));
    const derivedScore   = scoreBoardOpportunity(signal.magnitude, signal.timeHorizon, captureScore);
    const confidence: BoardConfidence = boardConfidenceFromScore(captureScore);

    return {
      id:             generateBoardOpportunityId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      magnitude:      signal.magnitude,
      confidence,
      confidenceScore: derivedScore,
      captureScore,
      timeHorizon:    signal.timeHorizon,
      rationale:      signal.rationale,
      evidenceIds:    signal.evidenceIds ?? [],
      metadata:       signal.metadata   ?? {},
    };
  } catch {
    return buildPlaceholderBoardOpportunity(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardOpportunity(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardOpportunity {
  return {
    id:             generateBoardOpportunityId(),
    orgSlug,
    sessionId,
    title:          "Oportunidad sin evaluar",
    description:    "Señal de oportunidad sin datos suficientes.",
    domain,
    magnitude:      "SMALL",
    confidence:     "LOW",
    confidenceScore: 0.2,
    captureScore:   0.2,
    timeHorizon:    "LONG_TERM",
    rationale:      "Datos insuficientes para evaluación.",
    evidenceIds:    [],
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function identifyBoardOpportunities(
  orgSlug:   string,
  sessionId: string,
  signals:   RawOpportunitySignal[]
): BoardOpportunity[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildBoardOpportunity(orgSlug, sessionId, s));
  } catch {
    return [];
  }
}

export function rankBoardOpportunities(opps: BoardOpportunity[]): BoardOpportunity[] {
  try {
    return sortBoardOpportunitiesByCapture(opps);
  } catch {
    return opps ?? [];
  }
}

export function getTransformationalOpportunities(opps: BoardOpportunity[]): BoardOpportunity[] {
  return opps.filter((o) => o.magnitude === "TRANSFORMATIONAL");
}

export function getImmediateOpportunities(opps: BoardOpportunity[]): BoardOpportunity[] {
  return opps.filter((o) => o.timeHorizon === "IMMEDIATE" || o.timeHorizon === "SHORT_TERM");
}

export function deduplicateBoardOpportunities(opps: BoardOpportunity[]): BoardOpportunity[] {
  try {
    const seen = new Set<string>();
    return opps.filter((o) => {
      const key = o.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return opps ?? [];
  }
}
