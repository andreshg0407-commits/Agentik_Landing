// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 12 — Strategic Briefing Builder

import type { StrategicConcern, StrategicOpportunityAssessment, StrategicRecommendation, StrategicQuestion, StrategicAdvice, StrategicAdvisorBriefing, StrategicBriefingType, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "./strategic-advisor-types";

interface BriefingInput {
  readonly orgSlug:         string;
  readonly type:            StrategicBriefingType;
  readonly concerns:        StrategicConcern[];
  readonly opportunities:   StrategicOpportunityAssessment[];
  readonly recommendations: StrategicRecommendation[];
  readonly questions:       StrategicQuestion[];
  readonly advice:          StrategicAdvice[];
  readonly advisorScore:    number;
}

const BRIEFING_DOMAINS: Record<StrategicBriefingType, StrategicDomain[] | null> = {
  CEO:        null,             // All domains
  BOARD:      null,             // All domains
  GROWTH:     ["COMMERCIAL", "MARKETING", "OPERATIONS"],
  FINANCE:    ["FINANCE", "COMPLIANCE"],
  OPERATIONS: ["OPERATIONS", "TECHNOLOGY", "PEOPLE"],
  CUSTOM:     null,
};

export function buildStrategicBriefing(input: BriefingInput): StrategicAdvisorBriefing {
  const domains = BRIEFING_DOMAINS[input.type];
  const filter  = <T extends { domain: StrategicDomain }>(arr: T[]) =>
    domains ? arr.filter((x) => domains.includes(x.domain)) : arr;

  const topConcerns         = filter(input.concerns).slice(0, 5);
  const topOpportunities    = filter(input.opportunities).slice(0, 4);
  const topRecommendations  = filter(input.recommendations).slice(0, 5);
  const keyQuestions        = filter(input.questions).slice(0, 4);
  const filteredAdvice      = domains ? input.advice.filter((a) => domains.includes(a.domain) || a.domain === "EXECUTIVE") : input.advice;

  const headline = _buildHeadline(input.type, topConcerns, topOpportunities, input.advisorScore);
  const summary  = _buildSummary(input.type, topConcerns, topOpportunities, topRecommendations);

  return {
    id:                  generateSaId("briefing"),
    orgSlug:             input.orgSlug,
    type:                input.type,
    title:               `Briefing Estratégico — ${_typeLabel(input.type)}`,
    summary,
    headline,
    topConcerns,
    topOpportunities,
    topRecommendations,
    keyQuestions,
    advisorScore:        input.advisorScore,
    confidence:          confidenceSaFromScore(input.advisorScore),
    domains:             domains ?? (["FINANCE", "COMMERCIAL", "EXECUTIVE", "OPERATIONS", "COMPLIANCE", "MARKETING", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN"] as StrategicDomain[]),
    metadata:            { type: input.type, concernCount: topConcerns.length, recommendationCount: topRecommendations.length },
    generatedAt:         new Date().toISOString(),
  };
}

export function buildCEOBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "CEO" });
}

export function buildBoardBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "BOARD" });
}

export function buildGrowthBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "GROWTH" });
}

export function buildFinanceBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "FINANCE" });
}

export function buildOperationsBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "OPERATIONS" });
}

export function buildCustomBriefing(input: Omit<BriefingInput, "type">): StrategicAdvisorBriefing {
  return buildStrategicBriefing({ ...input, type: "CUSTOM" });
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _buildHeadline(
  type: StrategicBriefingType,
  concerns: StrategicConcern[],
  opps: StrategicOpportunityAssessment[],
  score: number
): string {
  if (concerns.some((c) => c.severity === "CRITICAL"))
    return `Atención ejecutiva requerida — riesgo crítico activo en briefing ${_typeLabel(type)}.`;
  if (opps.some((o) => o.magnitude === "TRANSFORMATIONAL"))
    return `Oportunidad transformacional detectada — acción estratégica recomendada.`;
  if (score >= 0.7) return `Situación estratégica favorable — ${_typeLabel(type)} con señales positivas.`;
  if (score >= 0.5) return `Situación estratégica moderada — monitoreo recomendado en áreas clave.`;
  return `Situación estratégica bajo presión — revisión ejecutiva recomendada.`;
}

function _buildSummary(
  type: StrategicBriefingType,
  concerns: StrategicConcern[],
  opps: StrategicOpportunityAssessment[],
  recs: StrategicRecommendation[]
): string {
  return `Briefing ${_typeLabel(type)}: ${concerns.length} preocupación(es) identificada(s), ${opps.length} oportunidad(es) detectada(s), ${recs.length} recomendación(es) generada(s). Prioridades de mayor urgencia en ${[...new Set(concerns.slice(0, 2).map((c) => c.domain))].join(", ") || "múltiples dominios"}.`;
}

function _typeLabel(type: StrategicBriefingType): string {
  const labels: Record<StrategicBriefingType, string> = {
    CEO: "CEO", BOARD: "Consejo Directivo", GROWTH: "Crecimiento",
    FINANCE: "Finanzas", OPERATIONS: "Operaciones", CUSTOM: "Personalizado",
  };
  return labels[type];
}
