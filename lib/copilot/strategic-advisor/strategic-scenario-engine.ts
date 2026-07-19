// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 7 — Strategic Scenario Engine
// Builds reasoned scenarios — NOT predictions, NOT forecasting

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern } from "./strategic-advisor-types";
import type { StrategicOpportunityAssessment } from "./strategic-advisor-types";
import type { StrategicRiskAssessment, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "./strategic-advisor-types";

export interface ScenarioHypothesis {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly title:       string;
  readonly premise:     string;             // What must be true for this scenario
  readonly implication: string;             // What would follow
  readonly domain:      StrategicDomain;
  readonly likelihood:  "LOW" | "MODERATE" | "HIGH";
  readonly evidenceIds: string[];
}

export function buildScenarios(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[]
): ScenarioHypothesis[] {
  const scenarios: ScenarioHypothesis[] = [];

  // Scenario: if current trend continues (for each HIGH concern)
  for (const c of concerns.filter((c) => c.severity === "HIGH" || c.severity === "CRITICAL").slice(0, 3)) {
    scenarios.push({
      id:          generateSaId("scen"),
      orgSlug:     ctx.orgSlug,
      title:       `Si continúa: ${c.title}`,
      premise:     `Si la preocupación "${c.title}" no se aborda en los próximos 30 días`,
      implication: `El riesgo en dominio ${c.domain} puede escalar, impactando objetivos activos y posiblemente generando efectos en cascada`,
      domain:      c.domain,
      likelihood:  c.severity === "CRITICAL" ? "HIGH" : "MODERATE",
      evidenceIds: c.evidenceIds,
    });
  }

  // Scenario: if opportunity is captured
  for (const o of opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").slice(0, 2)) {
    scenarios.push({
      id:          generateSaId("scen"),
      orgSlug:     ctx.orgSlug,
      title:       `Si se captura: ${o.title}`,
      premise:     `Si la organización activa un plan para capturar "${o.title}"`,
      implication: `Potencial de crecimiento de magnitud ${o.magnitude} en dominio ${o.domain} — captureability actual: ${o.captureScore.toFixed(2)}`,
      domain:      o.domain,
      likelihood:  o.captureScore >= 0.7 ? "HIGH" : "MODERATE",
      evidenceIds: o.evidenceIds,
    });
  }

  // Scenario: if learning patterns are applied
  if (ctx.confirmedPatterns.length >= 2) {
    const topPattern = ctx.confirmedPatterns[0];
    scenarios.push({
      id:          generateSaId("scen"),
      orgSlug:     ctx.orgSlug,
      title:       `Si se replica el patrón exitoso: ${topPattern.name}`,
      premise:     `Si el patrón confirmado "${topPattern.name}" se aplica sistemáticamente en los próximos ciclos`,
      implication: `El historial muestra que este patrón genera resultados positivos con ${topPattern.reinforcementCount} refuerzos — aplicación consciente puede acelerar resultados`,
      domain:      _mapDomain(topPattern.domain),
      likelihood:  topPattern.confidenceScore >= 0.7 ? "HIGH" : "MODERATE",
      evidenceIds: topPattern.evidenceEventIds,
    });
  }

  // Scenario: if ignored opportunities are not addressed
  const ignored = opportunities.filter((o) => o.isIgnored);
  if (ignored.length >= 2) {
    scenarios.push({
      id:          generateSaId("scen"),
      orgSlug:     ctx.orgSlug,
      title:       "Si se continúan ignorando oportunidades identificadas",
      premise:     `Si ${ignored.length} oportunidades activas sin objetivo asignado permanecen sin atención`,
      implication: "La distancia entre el potencial estratégico y la ejecución real puede crecer, reduciendo la ventana de captura",
      domain:      "CROSS_DOMAIN",
      likelihood:  "MODERATE",
      evidenceIds: ignored.flatMap((o) => o.evidenceIds),
    });
  }

  // Scenario: if no action on finance domain
  const financeConcerns = concerns.filter((c) => c.domain === "FINANCE" && c.severity !== "LOW");
  if (financeConcerns.length >= 2) {
    scenarios.push({
      id:          generateSaId("scen"),
      orgSlug:     ctx.orgSlug,
      title:       "Escenario de presión financiera acumulada",
      premise:     `Si ${financeConcerns.length} preocupaciones financieras activas no se resuelven simultáneamente`,
      implication: "La presión acumulada sobre el flujo de caja puede generar restricciones operativas y comprometer compromisos de crecimiento",
      domain:      "FINANCE",
      likelihood:  financeConcerns.some((c) => c.severity === "CRITICAL") ? "HIGH" : "MODERATE",
      evidenceIds: financeConcerns.flatMap((c) => c.evidenceIds),
    });
  }

  return scenarios;
}

function _mapDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
