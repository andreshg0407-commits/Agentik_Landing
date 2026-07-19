// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 42: Board-Council Synthesis Engine
// Bridges Executive Council deliberations into Board Intelligence layer.

import type {
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
  BoardAlignment,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";
import { buildGovernanceAssessment } from "./governance-assessment-engine";
import { buildStrategicAssessment } from "./strategic-assessment-engine";
import { evaluateAlignment } from "./board-alignment-engine";
import type { CouncilBoardContext } from "./integrations/board-executive-council";

// ── Board View ──────────────────────────────────────────────────────────────

export interface BoardView {
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly executiveSummary: string;
  readonly keySignals:      string[];
  readonly blockers:        string[];
  readonly confidence:      BoardConfidence;
  readonly boardScore:      number;
  readonly generatedAt:     string;
}

export function buildBoardView(
  orgSlug:    string,
  sessionId:  string,
  governance: BoardGovernanceAssessment,
  strategic:  BoardStrategicAssessment,
  council:    CouncilBoardContext
): BoardView {
  try {
    const boardScore = (governance.governanceScore * 0.45 + strategic.strategicScore * 0.45 + council.councilBoost * 0.10);
    const confidence = boardConfidenceFromScore(boardScore);

    const keySignals: string[] = [];
    if (governance.strengths.length > 0) keySignals.push(...governance.strengths.slice(0, 2));
    if (strategic.strengths.length > 0)  keySignals.push(...strategic.strengths.slice(0, 2));

    const blockers: string[] = [];
    if (council.hasActiveEscalation) blockers.push("Escalación activa en Executive Council");
    if (governance.concerns.length > 0) blockers.push(...governance.concerns.slice(0, 2));

    const govPct   = Math.round(governance.governanceScore * 100);
    const stratPct = Math.round(strategic.strategicScore * 100);
    const executiveSummary = `Gobierno ${govPct}%, estrategia ${stratPct}%.` +
      (council.consensusCount > 0 ? ` ${council.consensusCount} sesión(es) de consejo con consenso.` : "") +
      (blockers.length > 0 ? ` ${blockers.length} bloqueador(es) activos.` : " Sin bloqueadores.");

    return {
      orgSlug,
      sessionId,
      executiveSummary,
      keySignals,
      blockers,
      confidence,
      boardScore,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildEmptyBoardView(orgSlug, sessionId);
  }
}

export function buildEmptyBoardView(orgSlug: string, sessionId: string): BoardView {
  return {
    orgSlug,
    sessionId,
    executiveSummary: "Sin datos suficientes para vista de junta.",
    keySignals:       [],
    blockers:         [],
    confidence:       "LOW",
    boardScore:       0,
    generatedAt:      new Date().toISOString(),
  };
}

// ── Board Consensus ─────────────────────────────────────────────────────────

export interface BoardConsensus {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly hasConsensus:     boolean;
  readonly consensusScore:   number;
  readonly agreementAreas:   string[];
  readonly disagreementAreas: string[];
  readonly recommendation:   string;
  readonly confidence:       BoardConfidence;
}

export function buildBoardConsensus(
  orgSlug:    string,
  sessionId:  string,
  council:    CouncilBoardContext,
  governance: BoardGovernanceAssessment
): BoardConsensus {
  try {
    const hasConsensus    = council.consensusCount > 0 && !council.hasActiveEscalation;
    const consensusScore  = Math.max(0, Math.min(1,
      governance.governanceScore * 0.5 + council.councilBoost + (hasConsensus ? 0.2 : -0.1)
    ));
    const confidence = boardConfidenceFromScore(consensusScore);

    const agreementAreas:   string[] = [];
    const disagreementAreas: string[] = [];

    if (governance.governanceScore >= 0.6)  agreementAreas.push("Solidez del gobierno corporativo");
    if (governance.alignmentScore >= 0.6)   agreementAreas.push("Alineación estratégica general");
    if (council.hasActiveEscalation)        disagreementAreas.push("Escalación activa requiere resolución");
    if (governance.concerns.length > 0)     disagreementAreas.push(...governance.concerns.slice(0, 1));

    const recommendation = hasConsensus
      ? "El consejo ha alcanzado consenso — proceder con resolución propuesta sujeto a condiciones"
      : "No hay consenso suficiente — se recomienda sesión de resolución de conflictos antes de proceder";

    return {
      orgSlug,
      sessionId,
      hasConsensus,
      consensusScore,
      agreementAreas,
      disagreementAreas,
      recommendation,
      confidence,
    };
  } catch {
    return {
      orgSlug,
      sessionId,
      hasConsensus:     false,
      consensusScore:   0,
      agreementAreas:   [],
      disagreementAreas: [],
      recommendation:   "Error al evaluar consenso — revisión manual requerida",
      confidence:       "LOW",
    };
  }
}

// ── Board Assessment ────────────────────────────────────────────────────────

export interface BoardAssessment {
  readonly orgSlug:      string;
  readonly sessionId:    string;
  readonly governance:   BoardGovernanceAssessment;
  readonly strategic:    BoardStrategicAssessment;
  readonly alignment:    BoardAlignment;
  readonly view:         BoardView;
  readonly consensus:    BoardConsensus;
  readonly overallScore: number;
  readonly confidence:   BoardConfidence;
}

export function buildBoardAssessment(
  orgSlug:   string,
  sessionId: string,
  council:   CouncilBoardContext,
  govInput?: Partial<{ riskScore: number; complianceScore: number; controlScore: number; alignmentScore: number }>,
  stratInput?: Partial<{ alignmentScore: number; executionReadiness: number }>
): BoardAssessment {
  try {
    const councilGovernanceSignal = council.sessions.length > 0
      ? council.sessions.reduce((s, c) => s + c.sessionScore, 0) / council.sessions.length
      : 0.6;

    const governance = buildGovernanceAssessment({
      orgSlug,
      sessionId,
      riskScore:       govInput?.riskScore       ?? 0.4,
      complianceScore: govInput?.complianceScore  ?? councilGovernanceSignal,
      controlScore:    govInput?.controlScore     ?? 0.6,
      alignmentScore:  govInput?.alignmentScore   ?? councilGovernanceSignal,
    });

    const strategic = buildStrategicAssessment({
      orgSlug,
      sessionId,
      alignmentScore:     stratInput?.alignmentScore     ?? councilGovernanceSignal,
      executionReadiness: stratInput?.executionReadiness ?? 0.6,
    });

    const alignment = evaluateAlignment({
      orgSlug,
      sessionId,
      strategicScore:  strategic.strategicScore,
      governanceScore: governance.governanceScore,
      executionScore:  strategic.executionReadiness,
      risksAligned:    !council.hasActiveEscalation,
    });

    const view      = buildBoardView(orgSlug, sessionId, governance, strategic, council);
    const consensus = buildBoardConsensus(orgSlug, sessionId, council, governance);

    const overallScore = (governance.governanceScore * 0.35 + strategic.strategicScore * 0.35 + alignment.alignmentScore * 0.20 + consensus.consensusScore * 0.10);
    const confidence   = boardConfidenceFromScore(overallScore);

    return {
      orgSlug,
      sessionId,
      governance,
      strategic,
      alignment,
      view,
      consensus,
      overallScore,
      confidence,
    };
  } catch {
    const emptyGov = buildGovernanceAssessment({ orgSlug, sessionId });
    const emptyStat = buildStrategicAssessment({ orgSlug, sessionId });
    const emptyAlign = evaluateAlignment({ orgSlug, sessionId });
    return {
      orgSlug,
      sessionId,
      governance:   emptyGov,
      strategic:    emptyStat,
      alignment:    emptyAlign,
      view:         buildEmptyBoardView(orgSlug, sessionId),
      consensus: {
        orgSlug, sessionId, hasConsensus: false, consensusScore: 0,
        agreementAreas: [], disagreementAreas: [],
        recommendation: "Error al construir evaluación de junta", confidence: "LOW",
      },
      overallScore: 0,
      confidence:   "LOW",
    };
  }
}
