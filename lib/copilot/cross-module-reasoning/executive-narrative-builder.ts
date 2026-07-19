/**
 * lib/copilot/cross-module-reasoning/executive-narrative-builder.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Executive Narrative Builder
 *
 * Generates explainable executive narratives from reasoning results.
 * All narratives are traceable to evidence. Never invented.
 * Deterministic. No AI.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningRecommendation,
  ReasoningConclusion,
  ReasoningConfidenceScore,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Narrative sections ────────────────────────────────────────────────────────

function _narrativeHeader(
  orgSlug: string,
  confidence: ReasoningConfidenceScore,
  signalCount: number,
): string {
  if (signalCount === 0) {
    return "No se detectaron señales suficientes para generar un análisis transversal en este momento.";
  }

  const confDesc: Record<string, string> = {
    VERY_HIGH: "con alta certeza",
    HIGH:      "con certeza moderada-alta",
    MEDIUM:    "con certeza moderada",
    LOW:       "con certeza limitada",
  };

  return [
    `Se analizaron ${signalCount} señal(es) de múltiples dominios del negocio`,
    `y se identificaron patrones relevantes ${confDesc[confidence.level] ?? "con certeza desconocida"}.`,
    `Nivel de confianza: ${confidence.level} (score: ${(confidence.score * 100).toFixed(0)}%).`,
  ].join(" ");
}

function _narrativeSignalSummary(signals: ReasoningSignal[]): string {
  if (signals.length === 0) return "";

  const domains = [...new Set(signals.map(s => s.domain))];
  const highSeverity = signals.filter(s => s.severity === "HIGH" || s.severity === "CRITICAL");

  const parts: string[] = [];
  parts.push(`Señales detectadas en ${domains.length} dominio(s): ${domains.join(", ")}.`);

  if (highSeverity.length > 0) {
    parts.push(
      `${highSeverity.length} señal(es) de alta severidad requieren atención prioritaria:`,
      highSeverity.map(s => `"${s.label}" (${s.domain})`).join(", ") + ".",
    );
  }

  return parts.join(" ");
}

function _narrativeHypotheses(hypotheses: ReasoningHypothesis[]): string {
  const supported = hypotheses.filter(h => h.supported && !h.contradicted);
  if (supported.length === 0) {
    return "No se identificaron hipótesis con evidencia suficiente para sostenerlas.";
  }

  const top = supported.slice(0, 3);  // max 3 hypotheses in narrative
  const lines: string[] = ["Las hipótesis con mayor soporte de evidencia son:"];
  for (const h of top) {
    lines.push(
      `• ${h.title} — ${h.explanation} (confianza: ${(h.confidence.score * 100).toFixed(0)}%)`,
    );
  }

  if (supported.length > 3) {
    lines.push(`Además, ${supported.length - 3} hipótesis adicional(es) fueron identificadas.`);
  }

  return lines.join("\n");
}

function _narrativeEvidence(evidence: ReasoningEvidence[]): string {
  if (evidence.length === 0) {
    return "No se recolectó evidencia adicional más allá de las señales primarias.";
  }

  const domains = [...new Set(evidence.map(e => e.domain))];
  const avgStrength = evidence.reduce((s, e) => s + e.strength, 0) / evidence.length;

  return [
    `${evidence.length} elemento(s) de evidencia recolectados de ${domains.length} dominio(s).`,
    `Fortaleza promedio de evidencia: ${(avgStrength * 100).toFixed(0)}%.`,
  ].join(" ");
}

function _narrativeRisks(risks: ReasoningRisk[]): string {
  if (risks.length === 0) return "";

  const critical = risks.filter(r => r.severity === "CRITICAL");
  const high     = risks.filter(r => r.severity === "HIGH");
  const parts: string[] = [];

  if (critical.length > 0) {
    parts.push(
      `ATENCIÓN: ${critical.length} riesgo(s) CRÍTICO(s) detectado(s):`,
      critical.map(r => `"${r.title}" (${r.domain})`).join("; ") + ".",
    );
  }
  if (high.length > 0) {
    parts.push(
      `${high.length} riesgo(s) de alta severidad:`,
      high.map(r => `"${r.title}"`).join(", ") + ".",
    );
  }

  const remaining = risks.length - critical.length - high.length;
  if (remaining > 0) {
    parts.push(`${remaining} riesgo(s) adicional(es) de menor severidad identificados.`);
  }

  return parts.join(" ");
}

function _narrativeOpportunities(opportunities: ReasoningOpportunity[]): string {
  if (opportunities.length === 0) return "";

  const highUrgency = opportunities.filter(o => o.urgency === "HIGH");
  const parts: string[] = [];

  if (highUrgency.length > 0) {
    parts.push(
      `${highUrgency.length} oportunidad(es) de alta urgencia detectadas:`,
      highUrgency.map(o => `"${o.title}" (${o.type})`).join("; ") + ".",
    );
  }

  const remaining = opportunities.length - highUrgency.length;
  if (remaining > 0) {
    parts.push(`${remaining} oportunidad(es) adicional(es) identificadas.`);
  }

  return parts.join(" ");
}

function _narrativeRecommendations(recommendations: ReasoningRecommendation[]): string {
  if (recommendations.length === 0) {
    return "No se generaron recomendaciones en este ciclo de razonamiento.";
  }

  const urgent = recommendations.filter(r => r.priority === "URGENT");
  const high   = recommendations.filter(r => r.priority === "HIGH");
  const parts: string[] = ["Acciones recomendadas:"];

  if (urgent.length > 0) {
    parts.push(`URGENTE: ${urgent.map(r => `"${r.title}"`).join(", ")}.`);
  }
  if (high.length > 0) {
    parts.push(`ALTA PRIORIDAD: ${high.map(r => `"${r.title}"`).join(", ")}.`);
  }

  const other = recommendations.length - urgent.length - high.length;
  if (other > 0) {
    parts.push(`${other} recomendación(es) adicional(es) de prioridad media o baja.`);
  }

  return parts.join(" ");
}

function _narrativeConclusion(
  confidence: ReasoningConfidenceScore,
  hypotheses: ReasoningHypothesis[],
): string {
  const supported = hypotheses.filter(h => h.supported && !h.contradicted);

  if (confidence.score < 0.3 || supported.length === 0) {
    return [
      "No encontramos evidencia suficiente para afirmar una causa definitiva.",
      "Se recomienda investigación adicional antes de tomar acciones correctivas.",
    ].join(" ");
  }

  if (confidence.score >= 0.85) {
    return [
      "El análisis transversal indica con alta certeza que los fenómenos detectados están relacionados.",
      "Las hipótesis identificadas tienen soporte sólido en múltiples fuentes de evidencia.",
      "Se recomienda actuar sobre las recomendaciones urgentes de forma inmediata.",
    ].join(" ");
  }

  return [
    "Existe evidencia moderada que relaciona las señales detectadas.",
    `La hipótesis principal es: "${supported[0]?.title ?? "sin hipótesis principal"}".`,
    "Sin embargo, la certeza es parcial y se recomienda validar con datos adicionales antes de acciones definitivas.",
  ].join(" ");
}

// ── Build full narrative ───────────────────────────────────────────────────────

export interface ExecutiveNarrative {
  id:       string;
  orgSlug:  string;
  text:     string;
  sections: {
    header:          string;
    signalSummary:   string;
    evidenceSummary: string;
    hypotheses:      string;
    risks:           string;
    opportunities:   string;
    recommendations: string;
    conclusion:      string;
  };
  confidence: ReasoningConfidenceScore;
  builtAt:    string;
}

export function buildExecutiveNarrative(params: {
  orgSlug:         string;
  signals:         ReasoningSignal[];
  evidence:        ReasoningEvidence[];
  hypotheses:      ReasoningHypothesis[];
  risks:           ReasoningRisk[];
  opportunities:   ReasoningOpportunity[];
  recommendations: ReasoningRecommendation[];
  confidence:      ReasoningConfidenceScore;
}): ExecutiveNarrative {
  const {
    orgSlug, signals, evidence, hypotheses, risks, opportunities, recommendations, confidence,
  } = params;

  const scoped = {
    signals:         signals.filter(s => s.orgSlug === orgSlug),
    evidence:        evidence.filter(e => e.orgSlug === orgSlug),
    hypotheses:      hypotheses.filter(h => h.orgSlug === orgSlug),
    risks:           risks.filter(r => r.orgSlug === orgSlug),
    opportunities:   opportunities.filter(o => o.orgSlug === orgSlug),
    recommendations: recommendations.filter(r => r.orgSlug === orgSlug),
  };

  const sections = {
    header:          _narrativeHeader(orgSlug, confidence, scoped.signals.length),
    signalSummary:   _narrativeSignalSummary(scoped.signals),
    evidenceSummary: _narrativeEvidence(scoped.evidence),
    hypotheses:      _narrativeHypotheses(scoped.hypotheses),
    risks:           _narrativeRisks(scoped.risks),
    opportunities:   _narrativeOpportunities(scoped.opportunities),
    recommendations: _narrativeRecommendations(scoped.recommendations),
    conclusion:      _narrativeConclusion(confidence, scoped.hypotheses),
  };

  const text = [
    sections.header,
    sections.signalSummary,
    sections.evidenceSummary,
    sections.hypotheses,
    sections.risks,
    sections.opportunities,
    sections.recommendations,
    sections.conclusion,
  ].filter(Boolean).join("\n\n");

  return {
    id:       generateCmrId("nar"),
    orgSlug,
    text,
    sections,
    confidence,
    builtAt:  new Date().toISOString(),
  };
}

// ── Build empty narrative ──────────────────────────────────────────────────────

export function buildEmptyNarrative(
  orgSlug: string,
  confidence: ReasoningConfidenceScore,
): ExecutiveNarrative {
  return buildExecutiveNarrative({
    orgSlug,
    signals:         [],
    evidence:        [],
    hypotheses:      [],
    risks:           [],
    opportunities:   [],
    recommendations: [],
    confidence,
  });
}

// ── Build conclusion from reasoning outputs ───────────────────────────────────

export function buildConclusion(params: {
  orgSlug:           string;
  hypotheses:        ReasoningHypothesis[];
  evidence:          ReasoningEvidence[];
  risks:             ReasoningRisk[];
  opportunities:     ReasoningOpportunity[];
  recommendations:   ReasoningRecommendation[];
  confidence:        ReasoningConfidenceScore;
}): ReasoningConclusion {
  const { orgSlug, hypotheses, evidence, risks, opportunities, recommendations, confidence } = params;
  const supported = hypotheses.filter(h => h.orgSlug === orgSlug && h.supported && !h.contradicted);

  const summary = supported.length > 0
    ? `Análisis detectó ${supported.length} hipótesis sustentadas por evidencia en múltiples dominios.`
    : "Análisis completado. Evidencia insuficiente para hipótesis definitivas.";

  const explanation = _narrativeConclusion(confidence, hypotheses);

  return {
    id:                generateCmrId("con"),
    orgSlug,
    summary,
    explanation,
    confidence,
    hypothesisIds:     supported.map(h => h.id),
    evidenceIds:       evidence.filter(e => e.orgSlug === orgSlug).map(e => e.id),
    riskIds:           risks.filter(r => r.orgSlug === orgSlug).map(r => r.id),
    opportunityIds:    opportunities.filter(o => o.orgSlug === orgSlug).map(o => o.id),
    recommendationIds: recommendations.filter(r => r.orgSlug === orgSlug).map(r => r.id),
    generatedAt:       new Date().toISOString(),
  };
}
