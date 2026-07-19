// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 14: Board Briefing Engine

import type {
  BoardBriefing,
  BoardBriefingType,
  BoardPriority,
  BoardRisk,
  BoardOpportunity,
  BoardRecommendation,
  BoardFinding,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";
import { generateBoardBriefingId } from "./board-intelligence-identity";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface BriefingInput {
  readonly orgSlug:        string;
  readonly type:           BoardBriefingType;
  readonly topic:          string;
  readonly topPriorities:      BoardPriority[];
  readonly topRisks:           BoardRisk[];
  readonly topOpportunities:   BoardOpportunity[];
  readonly topRecommendations: BoardRecommendation[];
  readonly topFindings:        BoardFinding[];
  readonly governance:         BoardGovernanceAssessment;
  readonly strategic:          BoardStrategicAssessment;
  readonly metadata?:          Record<string, unknown>;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function computeBriefingBoardScore(
  governance: BoardGovernanceAssessment,
  strategic:  BoardStrategicAssessment
): number {
  try {
    return Math.max(0, Math.min(1, governance.governanceScore * 0.5 + strategic.strategicScore * 0.5));
  } catch {
    return 0.5;
  }
}

// ── Briefing type configuration ─────────────────────────────────────────────

interface BriefingConfig {
  titlePrefix: string;
  maxPriorities: number;
  maxRisks:      number;
  maxOpps:       number;
  maxRecs:       number;
  maxFindings:   number;
  emphasis:      "governance" | "strategic" | "risk" | "opportunity" | "balanced";
}

const BRIEFING_CONFIGS: Record<BoardBriefingType, BriefingConfig> = {
  BOARD:      { titlePrefix: "Informe de Junta",        maxPriorities: 5, maxRisks: 5, maxOpps: 5, maxRecs: 5, maxFindings: 5, emphasis: "balanced" },
  CEO:        { titlePrefix: "Briefing Ejecutivo CEO",  maxPriorities: 3, maxRisks: 3, maxOpps: 5, maxRecs: 3, maxFindings: 3, emphasis: "strategic" },
  EXECUTIVE:  { titlePrefix: "Informe Ejecutivo",       maxPriorities: 5, maxRisks: 5, maxOpps: 3, maxRecs: 5, maxFindings: 5, emphasis: "balanced" },
  INVESTOR:   { titlePrefix: "Briefing de Inversores",  maxPriorities: 3, maxRisks: 3, maxOpps: 5, maxRecs: 3, maxFindings: 3, emphasis: "opportunity" },
  GOVERNANCE: { titlePrefix: "Informe de Gobierno",     maxPriorities: 3, maxRisks: 5, maxOpps: 2, maxRecs: 5, maxFindings: 5, emphasis: "governance" },
  RISK:       { titlePrefix: "Informe de Riesgos",      maxPriorities: 3, maxRisks: 7, maxOpps: 2, maxRecs: 5, maxFindings: 5, emphasis: "risk" },
};

// ── Narrative generation ─────────────────────────────────────────────────────

function buildBriefingSummary(input: BriefingInput, cfg: BriefingConfig): string {
  try {
    const govPct  = Math.round(input.governance.governanceScore * 100);
    const stratPct = Math.round(input.strategic.strategicScore * 100);
    const critRisks = input.topRisks.filter((r) => r.severity === "CRITICAL").length;
    const critPrios = input.topPriorities.filter((p) => p.level === "CRITICAL").length;

    let summary = `${cfg.titlePrefix}: ${input.topic}. `;
    summary += `Gobierno ${govPct}%, estrategia ${stratPct}%. `;

    if (cfg.emphasis === "risk" || cfg.emphasis === "governance") {
      if (critRisks > 0) summary += `${critRisks} riesgo(s) crítico(s) activos. `;
    }
    if (cfg.emphasis === "opportunity") {
      const transformational = input.topOpportunities.filter((o) => o.magnitude === "TRANSFORMATIONAL").length;
      if (transformational > 0) summary += `${transformational} oportunidad(es) transformacional(es) identificadas. `;
    }
    if (critPrios > 0) summary += `${critPrios} prioridad(es) crítica(s) pendientes.`;

    return summary.trim();
  } catch {
    return `${input.topic} — análisis estratégico disponible.`;
  }
}

function buildBriefingTitle(type: BoardBriefingType, topic: string): string {
  const cfg = BRIEFING_CONFIGS[type];
  return `${cfg.titlePrefix}: ${topic}`;
}

function buildBriefingHeadline(input: BriefingInput): string {
  const govStatus = input.governance.status;
  const govLabel = govStatus === "STRONG" ? "gobierno sólido" :
    govStatus === "ADEQUATE" ? "gobierno adecuado" :
    govStatus === "WEAK" ? "gobierno débil" : "gobierno crítico";
  const critRisks = input.topRisks.filter((r) => r.severity === "CRITICAL").length;
  let h = `Organización con ${govLabel}`;
  if (critRisks > 0) h += `, ${critRisks} riesgo(s) crítico(s)`;
  return h + ".";
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardBriefing(input: BriefingInput): BoardBriefing {
  try {
    const cfg         = BRIEFING_CONFIGS[input.type];
    const boardScore  = computeBriefingBoardScore(input.governance, input.strategic);
    const confidence: BoardConfidence = boardConfidenceFromScore(boardScore);

    return {
      id:                  generateBoardBriefingId(),
      orgSlug:             input.orgSlug,
      type:                input.type,
      title:               buildBriefingTitle(input.type, input.topic),
      headline:            buildBriefingHeadline(input),
      summary:             buildBriefingSummary(input, cfg),
      topPriorities:       input.topPriorities.slice(0, cfg.maxPriorities),
      topRisks:            input.topRisks.slice(0, cfg.maxRisks),
      topOpportunities:    input.topOpportunities.slice(0, cfg.maxOpps),
      topRecommendations:  input.topRecommendations.slice(0, cfg.maxRecs),
      topFindings:         input.topFindings.slice(0, cfg.maxFindings),
      governance:          input.governance,
      strategic:           input.strategic,
      boardScore,
      confidence,
      metadata:            input.metadata ?? {},
      generatedAt:         new Date().toISOString(),
    };
  } catch {
    return buildEmptyBoardBriefing(input.orgSlug, input.type, input.topic);
  }
}

export function buildEmptyBoardBriefing(
  orgSlug: string,
  type:    BoardBriefingType,
  topic:   string
): BoardBriefing {
  const cfg = BRIEFING_CONFIGS[type];
  return {
    id:                  generateBoardBriefingId(),
    orgSlug,
    type,
    title:               buildBriefingTitle(type, topic),
    headline:            "Sin datos suficientes.",
    summary:             "Sin datos suficientes para generar briefing.",
    topPriorities:       [],
    topRisks:            [],
    topOpportunities:    [],
    topRecommendations:  [],
    topFindings:         [],
    governance: {
      orgSlug, sessionId: "", status: "ADEQUATE", governanceScore: 0.5,
      riskScore: 0.4, controlScore: 0.5, alignmentScore: 0.5, complianceScore: 0.5,
      concerns: [], strengths: [], limitations: [], confidence: "LOW",
      assessedAt: new Date().toISOString(),
    },
    strategic: {
      orgSlug, sessionId: "", alignmentScore: 0.5, executionReadiness: 0.5,
      strategicScore: 0.5, horizonCoverage: "SHORT",
      gaps: [], strengths: [], limitations: [], confidence: "LOW",
      assessedAt: new Date().toISOString(),
    },
    boardScore:   0.5,
    confidence:   "LOW",
    metadata:     {},
    generatedAt:  new Date().toISOString(),
  };
}
