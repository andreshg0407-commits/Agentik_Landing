// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 7: Board Concern Engine

import type {
  BoardConcern,
  BoardDomain,
  BoardPriorityLevel,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore, BOARD_PRIORITY_RANK } from "./board-intelligence-types";
import { generateBoardConcernId } from "./board-intelligence-identity";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawConcernSignal {
  readonly title:       string;
  readonly description: string;
  readonly domain:      BoardDomain;
  readonly severity:    BoardPriorityLevel;
  readonly isEmergent?: boolean;
  readonly isSystemic?: boolean;
  readonly rationale:   string;
  readonly evidenceIds?: string[];
  readonly metadata?:   Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function concernConfidenceScore(severity: BoardPriorityLevel): number {
  switch (severity) {
    case "CRITICAL": return 0.85;
    case "HIGH":     return 0.70;
    case "MEDIUM":   return 0.55;
    case "LOW":      return 0.35;
    default:         return 0.40;
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardConcern(
  orgSlug:   string,
  sessionId: string,
  signal:    RawConcernSignal
): BoardConcern {
  try {
    const confidenceScore = concernConfidenceScore(signal.severity);
    const confidence: BoardConfidence = boardConfidenceFromScore(confidenceScore);

    return {
      id:             generateBoardConcernId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      severity:       signal.severity,
      confidence,
      confidenceScore,
      isEmergent:     signal.isEmergent  ?? false,
      isSystemic:     signal.isSystemic  ?? false,
      rationale:      signal.rationale,
      evidenceIds:    signal.evidenceIds ?? [],
      metadata:       signal.metadata    ?? {},
    };
  } catch {
    return buildPlaceholderBoardConcern(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardConcern(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardConcern {
  return {
    id:             generateBoardConcernId(),
    orgSlug,
    sessionId,
    title:          "Preocupación sin evaluar",
    description:    "Señal de preocupación sin datos suficientes.",
    domain,
    severity:       "LOW",
    confidence:     "LOW",
    confidenceScore: 0.2,
    isEmergent:     false,
    isSystemic:     false,
    rationale:      "Datos insuficientes.",
    evidenceIds:    [],
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function identifyBoardConcerns(
  orgSlug:   string,
  sessionId: string,
  signals:   RawConcernSignal[]
): BoardConcern[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildBoardConcern(orgSlug, sessionId, s));
  } catch {
    return [];
  }
}

export function rankBoardConcerns(concerns: BoardConcern[]): BoardConcern[] {
  try {
    return [...concerns].sort((a, b) => {
      const severityDiff = BOARD_PRIORITY_RANK[b.severity] - BOARD_PRIORITY_RANK[a.severity];
      if (severityDiff !== 0) return severityDiff;
      // Systemics and emergents float up
      const aBoost = (a.isSystemic ? 2 : 0) + (a.isEmergent ? 1 : 0);
      const bBoost = (b.isSystemic ? 2 : 0) + (b.isEmergent ? 1 : 0);
      return bBoost - aBoost;
    });
  } catch {
    return concerns ?? [];
  }
}

export function groupBoardConcerns(concerns: BoardConcern[]): Record<BoardDomain, BoardConcern[]> {
  try {
    const groups: Partial<Record<BoardDomain, BoardConcern[]>> = {};
    for (const c of concerns) {
      if (!groups[c.domain]) groups[c.domain] = [];
      groups[c.domain]!.push(c);
    }
    return groups as Record<BoardDomain, BoardConcern[]>;
  } catch {
    return {} as Record<BoardDomain, BoardConcern[]>;
  }
}

export function getEmergentConcerns(concerns: BoardConcern[]): BoardConcern[] {
  return concerns.filter((c) => c.isEmergent);
}

export function getSystemicConcerns(concerns: BoardConcern[]): BoardConcern[] {
  return concerns.filter((c) => c.isSystemic);
}

export function getCriticalConcerns(concerns: BoardConcern[]): BoardConcern[] {
  return concerns.filter((c) => c.severity === "CRITICAL");
}

export function deduplicateBoardConcerns(concerns: BoardConcern[]): BoardConcern[] {
  try {
    const seen = new Set<string>();
    return concerns.filter((c) => {
      const key = c.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return concerns ?? [];
  }
}
