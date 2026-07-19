// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 11: Board Resolution Engine

import type {
  BoardResolution,
  BoardRecommendation,
  BoardDecisionCandidate,
  BoardOutcome,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";
import { generateBoardResolutionId } from "./board-intelligence-identity";
import type { BoardRisk } from "./board-intelligence-types";
import type { BoardGovernanceAssessment } from "./board-intelligence-types";
import { deriveOverallOutcomeFromCandidates } from "./decision-candidate-engine";

// ── Builder ─────────────────────────────────────────────────────────────────

export interface ResolutionInput {
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly title:       string;
  readonly summary:     string;
  readonly recommendations:    BoardRecommendation[];
  readonly decisionCandidates: BoardDecisionCandidate[];
  readonly risks:              BoardRisk[];
  readonly governance:         BoardGovernanceAssessment;
  readonly evidenceIds?:       string[];
  readonly limitations?:       string[];
  readonly metadata?:          Record<string, unknown>;
}

export function buildResolution(input: ResolutionInput): BoardResolution {
  try {
    const outcome: BoardOutcome = deriveOverallOutcomeFromCandidates(
      input.decisionCandidates,
      input.risks
    );

    const conditions = buildConditionsFromOutcome(outcome, input.governance, input.risks);
    const allEvidenceIds = [
      ...(input.evidenceIds ?? []),
      ...input.recommendations.flatMap((r) => r.evidenceIds),
      ...input.decisionCandidates.flatMap((c) => c.evidenceIds),
    ];
    const uniqueEvidenceIds = [...new Set(allEvidenceIds)];

    const rawScore = computeResolutionScore(input.governance, input.decisionCandidates);
    const confidence: BoardConfidence = boardConfidenceFromScore(rawScore);

    const limitations = buildResolutionLimitations(input.limitations ?? [], outcome);

    return {
      id:                  generateBoardResolutionId(),
      orgSlug:             input.orgSlug,
      sessionId:           input.sessionId,
      title:               input.title,
      summary:             input.summary,
      outcome,
      conditions,
      recommendations:     input.recommendations,
      decisionCandidates:  input.decisionCandidates,
      confidenceScore:     rawScore,
      confidence,
      suggestedOnly:       true,
      limitations,
      evidenceIds:         uniqueEvidenceIds,
      metadata:            input.metadata ?? {},
      resolvedAt:          new Date().toISOString(),
    };
  } catch {
    return buildEmptyResolution(input.orgSlug, input.sessionId, input.title);
  }
}

export function buildEmptyResolution(
  orgSlug:   string,
  sessionId: string,
  title:     string
): BoardResolution {
  return {
    id:                  generateBoardResolutionId(),
    orgSlug,
    sessionId,
    title,
    summary:             "Resolución sin datos suficientes para evaluación completa.",
    outcome:             "REVIEW_REQUIRED",
    conditions:          [],
    recommendations:     [],
    decisionCandidates:  [],
    confidenceScore:     0.2,
    confidence:          "LOW",
    suggestedOnly:       true,
    limitations:         ["Datos insuficientes para resolución completa"],
    evidenceIds:         [],
    metadata:            {},
    resolvedAt:          new Date().toISOString(),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ResolutionValidation {
  readonly isValid:   boolean;
  readonly errors:    string[];
  readonly warnings:  string[];
}

export function validateResolution(resolution: BoardResolution): ResolutionValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  try {
    if (!resolution.id || !resolution.id.startsWith("board_resolution_")) {
      errors.push("ID de resolución inválido");
    }
    if (!resolution.orgSlug) errors.push("orgSlug requerido");
    if (!resolution.sessionId) errors.push("sessionId requerido");
    if (!resolution.title) errors.push("Título requerido");
    if (!resolution.summary) errors.push("Resumen requerido");
    if (resolution.suggestedOnly !== true) {
      errors.push("suggestedOnly debe ser true");
    }
    if (resolution.decisionCandidates.length === 0) {
      warnings.push("Sin candidatos de decisión — resolución basada en evaluación de riesgo únicamente");
    }
    if (resolution.recommendations.length === 0) {
      warnings.push("Sin recomendaciones incluidas en la resolución");
    }
    if (resolution.confidenceScore < 0.3) {
      warnings.push("Nivel de confianza bajo — se recomienda revisión adicional");
    }
  } catch {
    errors.push("Error interno al validar resolución");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeResolutionScore(
  governance:  BoardGovernanceAssessment,
  candidates:  BoardDecisionCandidate[]
): number {
  try {
    const govScore = governance.governanceScore;
    const avgCandidateScore = candidates.length > 0
      ? candidates.reduce((s, c) => s + c.confidenceScore, 0) / candidates.length
      : 0.5;
    return Math.max(0, Math.min(1, govScore * 0.60 + avgCandidateScore * 0.40));
  } catch {
    return 0.4;
  }
}

function buildConditionsFromOutcome(
  outcome:    BoardOutcome,
  governance: BoardGovernanceAssessment,
  risks:      BoardRisk[]
): string[] {
  const conditions: string[] = [];

  if (outcome === "APPROVE_WITH_CONDITIONS") {
    if (governance.complianceScore < 0.6) {
      conditions.push("Completar revisión de cumplimiento regulatorio");
    }
    if (governance.controlScore < 0.5) {
      conditions.push("Reforzar controles internos antes de proceder");
    }
    const highRisks = risks.filter((r) => r.compositeRisk >= 0.65);
    if (highRisks.length > 0) {
      conditions.push(`Mitigar ${highRisks.length} riesgo(s) de alto impacto identificados`);
    }
  }

  if (outcome === "REVIEW_REQUIRED") {
    conditions.push("Revisión ejecutiva requerida antes de proceder");
  }

  if (outcome === "ESCALATE") {
    conditions.push("Escalación al nivel ejecutivo superior requerida");
    conditions.push("No proceder sin aprobación explícita de dirección");
  }

  return conditions;
}

function buildResolutionLimitations(base: string[], outcome: BoardOutcome): string[] {
  const limits = [...base];
  limits.push("Esta resolución es solo una sugerencia — requiere validación humana");
  if (outcome === "APPROVE" || outcome === "APPROVE_WITH_CONDITIONS") {
    limits.push("La aprobación automática no reemplaza el juicio ejecutivo");
  }
  return [...new Set(limits)];
}
