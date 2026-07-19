// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 10 — Executive Narrative Engine V2
// Builds traceable, explainable executive narratives

import type {
  ExecutiveNarrative,
  ExecutivePriority,
  ExecutiveRisk,
  ExecutiveOpportunity,
  ExecutiveConflict,
  ExecutiveFocusArea,
  ExecutiveDomain,
  ExecutivePriorityLevel,
} from "./executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "./executive-brain-types";

// ── Narrative Engine API ──────────────────────────────────────────────────────

export interface NarrativeEngineInput {
  readonly orgSlug: string;
  readonly priorities: ExecutivePriority[];
  readonly risks: ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly conflicts: ExecutiveConflict[];
  readonly focusAreas: ExecutiveFocusArea[];
}

export function buildExecutiveNarratives(input: NarrativeEngineInput): ExecutiveNarrative[] {
  const narratives: ExecutiveNarrative[] = [];
  const { orgSlug } = input;

  // One narrative per critical/high risk
  for (const risk of input.risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH").slice(0, 3)) {
    narratives.push(_buildRiskNarrative(orgSlug, risk, input.priorities));
  }

  // One narrative per top focus area
  for (const area of input.focusAreas.filter((a) => a.rank <= 3)) {
    if (narratives.some((n) => n.domain === area.domain)) continue;
    narratives.push(_buildFocusNarrative(orgSlug, area, input.risks, input.opportunities));
  }

  // Opportunity narrative
  const topOpp = input.opportunities.find((o) => o.captureScore >= 0.6);
  if (topOpp) {
    narratives.push(_buildOpportunityNarrative(orgSlug, topOpp, input.priorities));
  }

  // Conflict narrative
  const topConflict = input.conflicts.find((c) => c.severity === "HIGH" || c.severity === "CRITICAL");
  if (topConflict) {
    narratives.push(_buildConflictNarrative(orgSlug, topConflict));
  }

  return narratives.slice(0, 6);
}

export function buildNarrativeForPriority(
  orgSlug: string,
  priority: ExecutivePriority,
  risks: ExecutiveRisk[]
): ExecutiveNarrative {
  const relatedRisks = risks.filter((r) => r.domain === priority.domain).slice(0, 2);
  const riskContext = relatedRisks.length > 0
    ? ` Esta situación está relacionada con ${relatedRisks.map((r) => `'${r.title}'`).join(" y ")}.`
    : "";
  const body = `${priority.description}${riskContext} ${priority.rationale}`;

  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title: priority.title,
    body,
    summary: `${priority.title}: ${priority.description.slice(0, 100)}${priority.description.length > 100 ? "..." : ""}`,
    domain: priority.domain,
    priority: priority.level,
    confidence: priority.confidence,
    traceable: true,
    evidenceIds: priority.evidenceIds,
    metadata: { source: "PRIORITY_NARRATIVE", priorityId: priority.id },
    generatedAt: new Date().toISOString(),
  };
}

// ── Private narrative builders ────────────────────────────────────────────────

function _buildRiskNarrative(
  orgSlug: string,
  risk: ExecutiveRisk,
  priorities: ExecutivePriority[]
): ExecutiveNarrative {
  const relatedPriority = priorities.find((p) => p.domain === risk.domain && p.level !== "LOW");
  const stratContext = relatedPriority
    ? ` Esto contradice el objetivo estratégico '${relatedPriority.title}'.`
    : "";

  const mitigation = risk.mitigationSuggestions.length > 0
    ? ` Acciones sugeridas: ${risk.mitigationSuggestions[0]}.`
    : "";

  const body = `El principal riesgo en ${_domainLabel(risk.domain)} es '${risk.title}'. ${risk.description}${stratContext}${mitigation} Nivel de riesgo: ${_riskLevelLabel(risk.level)}. Probabilidad estimada: ${Math.round(risk.likelihood * 100)}%. Impacto potencial: ${Math.round(risk.impact * 100)}%.`;

  const summary = `Riesgo ${_riskLevelLabel(risk.level).toLowerCase()} en ${_domainLabel(risk.domain)}: ${risk.title}.`;

  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title: `Riesgo en ${_domainLabel(risk.domain)}: ${risk.title}`,
    body,
    summary,
    domain: risk.domain,
    priority: _riskToPriority(risk.level),
    confidence: risk.confidence,
    traceable: risk.evidenceIds.length > 0,
    evidenceIds: risk.evidenceIds,
    metadata: { source: "RISK_NARRATIVE", riskId: risk.id, riskLevel: risk.level },
    generatedAt: new Date().toISOString(),
  };
}

function _buildFocusNarrative(
  orgSlug: string,
  area: ExecutiveFocusArea,
  risks: ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[]
): ExecutiveNarrative {
  const domainRisks = risks.filter((r) => r.domain === area.domain).slice(0, 2);
  const domainOpps = opportunities.filter((o) => o.domain === area.domain).slice(0, 1);

  const riskContext = domainRisks.length > 0
    ? ` Riesgos identificados: ${domainRisks.map((r) => `'${r.title}'`).join(", ")}.`
    : "";
  const oppContext = domainOpps.length > 0
    ? ` Oportunidad detectada: '${domainOpps[0].title}'.`
    : "";

  const body = `${area.rationale}${riskContext}${oppContext} Urgencia: ${Math.round(area.urgencyScore * 100)}%. Impacto: ${Math.round(area.impactScore * 100)}%.`;

  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title: `Área de enfoque #${area.rank}: ${area.title}`,
    body,
    summary: area.rationale.slice(0, 120),
    domain: area.domain,
    priority: area.priority,
    confidence: area.confidence,
    traceable: area.evidenceIds.length > 0,
    evidenceIds: area.evidenceIds,
    metadata: { source: "FOCUS_NARRATIVE", focusAreaId: area.id, rank: area.rank },
    generatedAt: new Date().toISOString(),
  };
}

function _buildOpportunityNarrative(
  orgSlug: string,
  opp: ExecutiveOpportunity,
  priorities: ExecutivePriority[]
): ExecutiveNarrative {
  const aligned = priorities.find((p) => p.domain === opp.domain);
  const alignmentContext = aligned
    ? ` Esta oportunidad está alineada con la prioridad '${aligned.title}'.`
    : "";

  const body = `${opp.description} Magnitud estimada: ${_magnitudeLabel(opp.magnitude)}.${alignmentContext} ${opp.rationale} Puntuación de captura: ${Math.round(opp.captureScore * 100)}%.`;

  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title: `Oportunidad: ${opp.title}`,
    body,
    summary: `Oportunidad ${_magnitudeLabel(opp.magnitude).toLowerCase()} en ${_domainLabel(opp.domain)}: ${opp.title}`,
    domain: opp.domain,
    priority: opp.captureScore >= 0.7 ? "HIGH" : "MEDIUM",
    confidence: opp.confidence,
    traceable: opp.evidenceIds.length > 0,
    evidenceIds: opp.evidenceIds,
    metadata: { source: "OPPORTUNITY_NARRATIVE", opportunityId: opp.id, magnitude: opp.magnitude },
    generatedAt: new Date().toISOString(),
  };
}

function _buildConflictNarrative(
  orgSlug: string,
  conflict: ExecutiveConflict
): ExecutiveNarrative {
  const body = `${conflict.description} '${conflict.elementATitle}' y '${conflict.elementBTitle}' presentan tensión estratégica en el dominio ${_domainLabel(conflict.domain)}. Se recomienda revisión ejecutiva explícita para resolver la priorización.`;

  return {
    id: generateEbv2Id("narr"),
    orgSlug,
    title: `Conflicto estratégico: ${conflict.title}`,
    body,
    summary: `Tensión entre '${conflict.elementATitle}' y '${conflict.elementBTitle}' en ${_domainLabel(conflict.domain)}.`,
    domain: conflict.domain,
    priority: conflict.severity,
    confidence: conflict.confidence,
    traceable: false,
    evidenceIds: [],
    metadata: { source: "CONFLICT_NARRATIVE", conflictId: conflict.id, conflictType: conflict.type },
    generatedAt: new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _domainLabel(domain: ExecutiveDomain): string {
  const labels: Record<ExecutiveDomain, string> = {
    FINANCE: "Finanzas", COMMERCIAL: "Comercial", MARKETING: "Marketing",
    OPERATIONS: "Operaciones", EXECUTIVE: "Ejecutivo", COMPLIANCE: "Cumplimiento",
    TECHNOLOGY: "Tecnología", PEOPLE: "Personas", CROSS_DOMAIN: "Multi-dominio",
  };
  return labels[domain] ?? domain;
}

function _riskLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    NEGLIGIBLE: "Negligible", LOW: "Bajo", MODERATE: "Moderado", HIGH: "Alto", CRITICAL: "Crítico",
  };
  return labels[level] ?? level;
}

function _magnitudeLabel(magnitude: string): string {
  const labels: Record<string, string> = {
    SMALL: "Pequeña", MEDIUM: "Media", LARGE: "Grande", TRANSFORMATIONAL: "Transformacional",
  };
  return labels[magnitude] ?? magnitude;
}

function _riskToPriority(level: string): ExecutivePriorityLevel {
  if (level === "CRITICAL") return "CRITICAL";
  if (level === "HIGH") return "HIGH";
  if (level === "MODERATE") return "MEDIUM";
  return "LOW";
}
