// AGENTIK-STRATEGIC-PLANNING-01
// Phase 12 — Planning Narrative Engine
// Generates executive language for strategic plans.
// NEVER executes. NEVER modifies data.

import type {
  StrategicObjective, StrategicInitiative, StrategicRisk,
  StrategicOpportunity, StrategicDomain,
} from "./strategic-planning-types";

// ── Input shape ───────────────────────────────────────────────────────────────

export interface PlanningNarrativeInput {
  readonly orgSlug:      string;
  readonly domain:       StrategicDomain;
  readonly title:        string;
  readonly objectives:   StrategicObjective[];
  readonly initiatives:  StrategicInitiative[];
  readonly risks:        StrategicRisk[];
  readonly opportunities: StrategicOpportunity[];
  readonly planScore:    number;
}

export interface PlanningNarrativeOutput {
  readonly executive:    string;
  readonly rationale:    string;
  readonly riskSummary:  string;
  readonly oppSummary:   string;
  readonly limitations:  string[];
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildPlanningNarrative(input: PlanningNarrativeInput): PlanningNarrativeOutput {
  const executive   = _buildExecutive(input);
  const rationale   = _buildRationale(input);
  const riskSummary = _buildRiskSummary(input.risks);
  const oppSummary  = _buildOppSummary(input.opportunities);
  const limitations = _buildLimitations();

  return { executive, rationale, riskSummary, oppSummary, limitations };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildExecutive(input: PlanningNarrativeInput): string {
  const topObj  = input.objectives[0];
  const iniCount = input.initiatives.length;
  const critRisks = input.risks.filter((r) => r.level === "CRITICAL").length;

  const parts: string[] = [
    `${input.title} es un plan estratégico para el dominio ${input.domain} con ${iniCount} iniciativa(s) estructurada(s).`,
  ];

  if (topObj) {
    parts.push(`El objetivo principal es: "${topObj.title}" con impacto estimado de ${(topObj.impactScore * 100).toFixed(0)}%.`);
  }

  if (critRisks > 0) {
    parts.push(`Se identifican ${critRisks} riesgo(s) críticos que requieren atención prioritaria.`);
  }

  parts.push(`Score del plan: ${(input.planScore * 100).toFixed(0)}/100.`);
  parts.push("Este plan es una propuesta estructurada y no constituye una instrucción de ejecución.");

  return parts.join(" ");
}

function _buildRationale(input: PlanningNarrativeInput): string {
  const topObj   = input.objectives[0];
  const topOpp   = input.opportunities[0];
  const score    = input.planScore;

  if (!topObj) return `Plan estratégico para ${input.domain} con score ${score.toFixed(2)}.`;

  let rationale = `Este plan se prioriza porque contribuye directamente al objetivo estratégico "${topObj.title}"`;

  if (topOpp) {
    rationale += ` y presenta una oportunidad de magnitud ${topOpp.magnitude} que puede capitalizarse`;
  }

  const riskCount = input.risks.filter((r) => r.level !== "LOW").length;
  if (riskCount > 0) {
    rationale += `. Presenta ${riskCount} riesgo(s) identificados con mitigaciones propuestas`;
  }

  rationale += ". No se requiere ejecución automática — toda acción requiere validación.";
  return rationale;
}

function _buildRiskSummary(risks: StrategicRisk[]): string {
  if (risks.length === 0) return "Sin riesgos críticos identificados en el plan.";
  const critical = risks.filter((r) => r.level === "CRITICAL");
  const high     = risks.filter((r) => r.level === "HIGH");
  const parts: string[] = [];
  if (critical.length > 0) parts.push(`${critical.length} riesgo(s) críticos`);
  if (high.length > 0)     parts.push(`${high.length} riesgo(s) altos`);
  return `Riesgos identificados: ${parts.join(", ")}. ${risks.filter((r) => r.mitigations.length > 0).length} con mitigaciones propuestas.`;
}

function _buildOppSummary(opps: StrategicOpportunity[]): string {
  if (opps.length === 0) return "Sin oportunidades destacadas identificadas.";
  const top = opps[0];
  return `${opps.length} oportunidad(es) identificadas. Principal: "${top.title}" (magnitud ${top.magnitude}, captureScore ${top.captureScore.toFixed(2)}).`;
}

function _buildLimitations(): string[] {
  return [
    "Plan propuesto — requiere validación humana antes de cualquier acción",
    "Las iniciativas son sugerencias estructuradas, no asignaciones de trabajo",
    "Los datos de contexto determinan la calidad del plan — datos incompletos reducen la confianza",
  ];
}
