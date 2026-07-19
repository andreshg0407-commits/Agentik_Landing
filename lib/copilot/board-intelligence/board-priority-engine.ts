// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 8: Board Priority Engine

import type {
  BoardPriority,
  BoardDomain,
  BoardPriorityLevel,
  BoardConfidence,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  sortBoardPrioritiesByScore,
  BOARD_PRIORITY_RANK,
} from "./board-intelligence-types";
import { generateBoardPriorityId } from "./board-intelligence-identity";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawPrioritySignal {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       BoardDomain;
  readonly level:        BoardPriorityLevel;
  readonly impactScore:  number;   // 0–1
  readonly urgencyScore: number;   // 0–1
  readonly rationale:    string;
  readonly evidenceIds?: string[];
  readonly metadata?:    Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function scorePriority(
  impactScore:  number,
  urgencyScore: number,
  level:        BoardPriorityLevel
): number {
  try {
    const i = Math.max(0, Math.min(1, impactScore));
    const u = Math.max(0, Math.min(1, urgencyScore));
    const l = BOARD_PRIORITY_RANK[level] / 3;   // normalize 0–1
    // Weighted combination: impact 40%, urgency 35%, level 25%
    return Math.max(0, Math.min(1, i * 0.40 + u * 0.35 + l * 0.25));
  } catch {
    return 0.5;
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardPriority(
  orgSlug:   string,
  sessionId: string,
  rank:      number,
  signal:    RawPrioritySignal
): BoardPriority {
  try {
    const impactScore  = Math.max(0, Math.min(1, signal.impactScore));
    const urgencyScore = Math.max(0, Math.min(1, signal.urgencyScore));
    const priorityScore = scorePriority(impactScore, urgencyScore, signal.level);
    const confidence: BoardConfidence = boardConfidenceFromScore(priorityScore);

    return {
      id:             generateBoardPriorityId(),
      orgSlug,
      sessionId,
      rank,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      level:          signal.level,
      confidence,
      confidenceScore: priorityScore,
      impactScore,
      urgencyScore,
      priorityScore,
      rationale:      signal.rationale,
      evidenceIds:    signal.evidenceIds ?? [],
      metadata:       signal.metadata   ?? {},
    };
  } catch {
    return buildPlaceholderBoardPriority(orgSlug, sessionId, rank, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardPriority(
  orgSlug:   string,
  sessionId: string,
  rank:      number,
  domain:    BoardDomain
): BoardPriority {
  return {
    id:             generateBoardPriorityId(),
    orgSlug,
    sessionId,
    rank,
    title:          "Prioridad sin evaluar",
    description:    "Señal de prioridad sin datos suficientes.",
    domain,
    level:          "LOW",
    confidence:     "LOW",
    confidenceScore: 0.2,
    impactScore:    0.2,
    urgencyScore:   0.2,
    priorityScore:  0.2,
    rationale:      "Datos insuficientes.",
    evidenceIds:    [],
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function identifyBoardPriorities(
  orgSlug:   string,
  sessionId: string,
  signals:   RawPrioritySignal[]
): BoardPriority[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s, i) => buildBoardPriority(orgSlug, sessionId, i + 1, s));
  } catch {
    return [];
  }
}

export function rankBoardPriorities(priorities: BoardPriority[]): BoardPriority[] {
  try {
    const sorted = sortBoardPrioritiesByScore(priorities);
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
  } catch {
    return priorities ?? [];
  }
}

export function getCriticalPriorities(priorities: BoardPriority[]): BoardPriority[] {
  return priorities.filter((p) => p.level === "CRITICAL");
}

export function getTopNPriorities(priorities: BoardPriority[], n: number): BoardPriority[] {
  return rankBoardPriorities(priorities).slice(0, n);
}

export function deduplicateBoardPriorities(priorities: BoardPriority[]): BoardPriority[] {
  try {
    const seen = new Set<string>();
    return priorities.filter((p) => {
      const key = p.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return priorities ?? [];
  }
}
