// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 9b: Board Finding Engine

import type {
  BoardFinding,
  BoardDomain,
  BoardPriorityLevel,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore, BOARD_PRIORITY_RANK } from "./board-intelligence-types";
import { generateBoardFindingId } from "./board-intelligence-identity";

// ── Raw signal ──────────────────────────────────────────────────────────────

export interface RawFindingSignal {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       BoardDomain;
  readonly priority:     BoardPriorityLevel;
  readonly isBlocker:    boolean;
  readonly sourceModule: string;
  readonly evidenceIds?: string[];
  readonly metadata?:    Record<string, unknown>;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardFinding(
  orgSlug:   string,
  sessionId: string,
  signal:    RawFindingSignal
): BoardFinding {
  try {
    const rank            = BOARD_PRIORITY_RANK[signal.priority] ?? 1;
    const confidenceScore = 0.25 + (rank / 3) * 0.65;
    const confidence: BoardConfidence = boardConfidenceFromScore(confidenceScore);

    return {
      id:             generateBoardFindingId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      priority:       signal.priority,
      confidence,
      confidenceScore,
      isBlocker:      signal.isBlocker,
      evidenceIds:    signal.evidenceIds ?? [],
      sourceModule:   signal.sourceModule,
      metadata:       signal.metadata   ?? {},
    };
  } catch {
    return buildPlaceholderBoardFinding(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardFinding(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardFinding {
  return {
    id:             generateBoardFindingId(),
    orgSlug,
    sessionId,
    title:          "Hallazgo sin evaluar",
    description:    "Hallazgo sin datos suficientes para evaluación.",
    domain,
    priority:       "LOW",
    confidence:     "LOW",
    confidenceScore: 0.2,
    isBlocker:      false,
    evidenceIds:    [],
    sourceModule:   "board-intelligence",
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function identifyBoardFindings(
  orgSlug:   string,
  sessionId: string,
  signals:   RawFindingSignal[]
): BoardFinding[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildBoardFinding(orgSlug, sessionId, s));
  } catch {
    return [];
  }
}

export function rankBoardFindings(findings: BoardFinding[]): BoardFinding[] {
  try {
    return [...findings].sort((a, b) => {
      const diff = BOARD_PRIORITY_RANK[b.priority] - BOARD_PRIORITY_RANK[a.priority];
      if (diff !== 0) return diff;
      return (b.isBlocker ? 1 : 0) - (a.isBlocker ? 1 : 0);
    });
  } catch {
    return findings ?? [];
  }
}

export function getBlockerFindings(findings: BoardFinding[]): BoardFinding[] {
  return findings.filter((f) => f.isBlocker);
}

export function getCriticalFindings(findings: BoardFinding[]): BoardFinding[] {
  return findings.filter((f) => f.priority === "CRITICAL");
}

export function deduplicateBoardFindings(findings: BoardFinding[]): BoardFinding[] {
  try {
    const seen = new Set<string>();
    return findings.filter((f) => {
      const key = f.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return findings ?? [];
  }
}
