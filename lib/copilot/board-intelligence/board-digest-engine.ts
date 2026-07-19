// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 13: Board Digest Engine

import type {
  BoardDigest,
  BoardDigestPeriod,
  BoardPriority,
  BoardRisk,
  BoardOpportunity,
  BoardRecommendation,
  BoardConfidence,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";
import { generateBoardDigestId } from "./board-intelligence-identity";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface DigestInput {
  readonly orgSlug:        string;
  readonly period:         BoardDigestPeriod;
  readonly title:          string;
  readonly headline:       string;
  readonly topPriorities:      BoardPriority[];
  readonly topRisks:           BoardRisk[];
  readonly topOpportunities:   BoardOpportunity[];
  readonly topRecommendations: BoardRecommendation[];
  readonly governance:         BoardGovernanceAssessment;
  readonly strategic:          BoardStrategicAssessment;
  readonly metadata?:          Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function computeBoardScore(
  governance: BoardGovernanceAssessment,
  strategic:  BoardStrategicAssessment,
  risks:      BoardRisk[]
): number {
  try {
    const govScore    = governance.governanceScore;
    const stratScore  = strategic.strategicScore;
    const avgRisk     = risks.length > 0
      ? risks.reduce((s, r) => s + r.compositeRisk, 0) / risks.length
      : 0.3;
    const riskPenalty = Math.min(0.20, avgRisk * 0.30);
    const base = govScore * 0.45 + stratScore * 0.45 - riskPenalty;
    return Math.max(0, Math.min(1, base + 0.10));
  } catch {
    return 0.5;
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardDigest(input: DigestInput): BoardDigest {
  try {
    const governanceScore = input.governance.governanceScore;
    const strategicScore  = input.strategic.strategicScore;
    const boardScore      = computeBoardScore(input.governance, input.strategic, input.topRisks);
    const confidence: BoardConfidence = boardConfidenceFromScore(boardScore);

    return {
      id:                  generateBoardDigestId(),
      orgSlug:             input.orgSlug,
      period:              input.period,
      title:               input.title,
      headline:            input.headline,
      topPriorities:       input.topPriorities.slice(0, 5),
      topRisks:            input.topRisks.slice(0, 5),
      topOpportunities:    input.topOpportunities.slice(0, 5),
      topRecommendations:  input.topRecommendations.slice(0, 5),
      governanceScore,
      strategicScore,
      boardScore,
      confidence,
      metadata:            input.metadata ?? {},
      generatedAt:         new Date().toISOString(),
    };
  } catch {
    return buildEmptyBoardDigest(input.orgSlug, input.period);
  }
}

export function buildEmptyBoardDigest(orgSlug: string, period: BoardDigestPeriod): BoardDigest {
  return {
    id:                  generateBoardDigestId(),
    orgSlug,
    period,
    title:               "Digest de Junta sin datos",
    headline:            "Sin datos suficientes para generar digest.",
    topPriorities:       [],
    topRisks:            [],
    topOpportunities:    [],
    topRecommendations:  [],
    governanceScore:     0.5,
    strategicScore:      0.5,
    boardScore:          0.5,
    confidence:          "LOW",
    metadata:            {},
    generatedAt:         new Date().toISOString(),
  };
}

// ── Period-specific helpers ─────────────────────────────────────────────────

export function buildDigestTitle(orgSlug: string, period: BoardDigestPeriod, topic: string): string {
  const periodLabels: Record<BoardDigestPeriod, string> = {
    DAILY:     "Diario",
    WEEKLY:    "Semanal",
    MONTHLY:   "Mensual",
    QUARTERLY: "Trimestral",
    ANNUAL:    "Anual",
  };
  return `Digest ${periodLabels[period]} — ${topic}`;
}

export function buildDigestHeadline(
  governance: BoardGovernanceAssessment,
  strategic:  BoardStrategicAssessment,
  topRisks:   BoardRisk[]
): string {
  try {
    const govLabel = governance.status === "STRONG" || governance.status === "ADEQUATE"
      ? "gobierno estable" : "gobierno con atención requerida";
    const criticalRisks = topRisks.filter((r) => r.severity === "CRITICAL").length;
    const stratPct = Math.round(strategic.strategicScore * 100);

    let headline = `Organización con ${govLabel}, alineación estratégica ${stratPct}%`;
    if (criticalRisks > 0) {
      headline += `, ${criticalRisks} riesgo(s) crítico(s) activos`;
    }
    return headline + ".";
  } catch {
    return "Análisis de junta generado.";
  }
}
