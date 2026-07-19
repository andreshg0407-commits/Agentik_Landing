// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 5: Board Risk Engine

import type {
  BoardRisk,
  BoardDomain,
  BoardPriorityLevel,
  BoardConfidence,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  sortBoardRisksByComposite,
} from "./board-intelligence-types";
import { generateBoardRiskId } from "./board-intelligence-identity";

// ── Raw risk signal ─────────────────────────────────────────────────────────

export interface RawRiskSignal {
  readonly title:       string;
  readonly description: string;
  readonly domain:      BoardDomain;
  readonly likelihood:  number;  // 0–1
  readonly impact:      number;  // 0–1
  readonly mitigations?: string[];
  readonly evidenceIds?: string[];
  readonly isSystemic?:  boolean;
  readonly metadata?:    Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function scoreBoardRisk(likelihood: number, impact: number): number {
  try {
    const l = Math.max(0, Math.min(1, likelihood));
    const i = Math.max(0, Math.min(1, impact));
    // Composite risk: geometric mean weighted toward impact
    return Math.max(0, Math.min(1, Math.sqrt(l * i) * 0.6 + (l * i) * 0.4));
  } catch {
    return 0.3;
  }
}

function severityFromComposite(score: number): BoardPriorityLevel {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.55) return "HIGH";
  if (score >= 0.30) return "MEDIUM";
  return "LOW";
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardRisk(
  orgSlug:   string,
  sessionId: string,
  signal:    RawRiskSignal
): BoardRisk {
  try {
    const likelihood     = Math.max(0, Math.min(1, signal.likelihood));
    const impact         = Math.max(0, Math.min(1, signal.impact));
    const compositeRisk  = scoreBoardRisk(likelihood, impact);
    const severity: BoardPriorityLevel = severityFromComposite(compositeRisk);
    const confidence: BoardConfidence  = boardConfidenceFromScore(compositeRisk);

    return {
      id:             generateBoardRiskId(),
      orgSlug,
      sessionId,
      title:          signal.title,
      description:    signal.description,
      domain:         signal.domain,
      severity,
      confidence,
      confidenceScore: compositeRisk,
      likelihood,
      impact,
      compositeRisk,
      mitigations:    signal.mitigations  ?? [],
      evidenceIds:    signal.evidenceIds  ?? [],
      isSystemic:     signal.isSystemic   ?? false,
      metadata:       signal.metadata     ?? {},
    };
  } catch {
    return buildPlaceholderBoardRisk(orgSlug, sessionId, signal.domain ?? "CROSS_DOMAIN");
  }
}

export function buildPlaceholderBoardRisk(
  orgSlug:   string,
  sessionId: string,
  domain:    BoardDomain
): BoardRisk {
  return {
    id:             generateBoardRiskId(),
    orgSlug,
    sessionId,
    title:          "Riesgo no evaluado",
    description:    "Señal de riesgo sin datos suficientes para evaluación.",
    domain,
    severity:       "LOW",
    confidence:     "LOW",
    confidenceScore: 0.2,
    likelihood:     0.2,
    impact:         0.2,
    compositeRisk:  0.2,
    mitigations:    [],
    evidenceIds:    [],
    isSystemic:     false,
    metadata:       {},
  };
}

// ── Collection operations ───────────────────────────────────────────────────

export function identifyBoardRisks(
  orgSlug:   string,
  sessionId: string,
  signals:   RawRiskSignal[]
): BoardRisk[] {
  try {
    if (!signals || signals.length === 0) return [];
    return signals.map((s) => buildBoardRisk(orgSlug, sessionId, s));
  } catch {
    return [];
  }
}

export function rankBoardRisks(risks: BoardRisk[]): BoardRisk[] {
  try {
    return sortBoardRisksByComposite(risks);
  } catch {
    return risks ?? [];
  }
}

export function getSystemicRisks(risks: BoardRisk[]): BoardRisk[] {
  return risks.filter((r) => r.isSystemic);
}

export function getCriticalBoardRisks(risks: BoardRisk[]): BoardRisk[] {
  return risks.filter((r) => r.severity === "CRITICAL");
}

export function getBlockingBoardRisks(risks: BoardRisk[]): BoardRisk[] {
  return risks.filter((r) => r.compositeRisk >= 0.75);
}

export function deduplicateBoardRisks(risks: BoardRisk[]): BoardRisk[] {
  try {
    const seen = new Set<string>();
    return risks.filter((r) => {
      const key = r.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return risks ?? [];
  }
}
