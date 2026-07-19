// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 5 — Strategic Recommendation Engine
// Generates justifiable, evidence-backed recommendations
// NEVER executes. NEVER modifies data.

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern } from "./strategic-advisor-types";
import type { StrategicOpportunityAssessment } from "./strategic-advisor-types";
import type { StrategicRecommendation, StrategicDomain, StrategicAdvicePriority } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, prioritySaFromScore, STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

// ── Main exports ──────────────────────────────────────────────────────────────

export function generateRecommendations(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[]
): StrategicRecommendation[] {
  const recs: StrategicRecommendation[] = [];

  // 1. Address critical/high concerns
  for (const concern of concerns.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH").slice(0, 4)) {
    const rec = _buildConcernRecommendation(ctx.orgSlug, concern);
    recs.push(rec);
  }

  // 2. Capture large/transformational opportunities
  for (const opp of opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").slice(0, 3)) {
    const rec = _buildOpportunityRecommendation(ctx.orgSlug, opp);
    recs.push(rec);
  }

  // 3. Apply confirmed patterns
  for (const pattern of ctx.confirmedPatterns.filter((p) => p.reinforcementCount >= 3).slice(0, 2)) {
    recs.push({
      id:             generateSaId("rec"),
      orgSlug:        ctx.orgSlug,
      title:          `Replicar patrón exitoso: ${pattern.name}`,
      description:    `El patrón "${pattern.name}" ha sido confirmado ${pattern.reinforcementCount} veces. Se recomienda replicarlo conscientemente en contextos similares.`,
      rationale:      `Evidencia de aprendizaje: ${pattern.reinforcementCount} refuerzos positivos con score ${pattern.netScore}.`,
      domain:         _mapDomain(pattern.domain),
      priority:       "MEDIUM",
      confidence:     confidenceSaFromScore(pattern.confidenceScore),
      confidenceScore: pattern.confidenceScore,
      expectedImpact:  `Incremento en efectividad del ${Math.round(pattern.netScore * 10)}% estimado en el dominio ${pattern.domain}.`,
      associatedRisks: ["Variación de contexto puede reducir la efectividad del patrón"],
      evidenceIds:    pattern.evidenceEventIds,
      playbookIds:    [],
      suggestedOnly:  true,
      metadata:       { source: "LEARNING_FRAMEWORK", patternId: pattern.id },
    });
  }

  // 4. Address ignored opportunities (highest risk of strategic blindspot)
  for (const opp of opportunities.filter((o) => o.isIgnored).slice(0, 2)) {
    recs.push({
      id:             generateSaId("rec"),
      orgSlug:        ctx.orgSlug,
      title:          `Evaluar oportunidad no atendida: ${opp.title}`,
      description:    `La oportunidad "${opp.title}" no tiene un objetivo estratégico correspondiente. Esto puede indicar un punto ciego estratégico.`,
      rationale:      `Oportunidad activa en dominio ${opp.domain} sin objetivo estratégico asignado. Captureability: ${opp.captureScore.toFixed(2)}.`,
      domain:         opp.domain,
      priority:       "HIGH",
      confidence:     opp.confidence,
      confidenceScore: opp.confidenceScore,
      expectedImpact:  "Cierre de punto ciego estratégico y potencial captura de valor no explorado.",
      associatedRisks: ["Requiere validación de si la oportunidad ya fue desestimada previamente"],
      evidenceIds:    opp.evidenceIds,
      playbookIds:    [],
      suggestedOnly:  true,
      metadata:       { source: "IGNORED_OPPORTUNITY", opportunityId: opp.id },
    });
  }

  // 5. From executive brain critical priorities
  for (const ep of ctx.executivePriorities.filter((p) => p.level === "CRITICAL").slice(0, 2)) {
    if (recs.some((r) => r.title.includes(ep.title.substring(0, 20)))) continue;
    recs.push({
      id:             generateSaId("rec"),
      orgSlug:        ctx.orgSlug,
      title:          ep.title,
      description:    ep.description,
      rationale:      ep.rationale,
      domain:         ep.domain as StrategicDomain,
      priority:       "CRITICAL",
      confidence:     confidenceSaFromScore(ep.confidenceScore),
      confidenceScore: ep.confidenceScore,
      expectedImpact:  "Resolución de prioridad estratégica crítica activa.",
      associatedRisks: [],
      evidenceIds:    ep.evidenceIds,
      playbookIds:    [],
      suggestedOnly:  true,
      metadata:       { source: "EXECUTIVE_BRAIN", priorityId: ep.id },
    });
  }

  // De-duplicate by title prefix
  const seen = new Set<string>();
  return recs.filter((r) => {
    const key = r.title.substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => STRATEGIC_PRIORITY_RANK[b.priority] - STRATEGIC_PRIORITY_RANK[a.priority]);
}

// ── Private builders ──────────────────────────────────────────────────────────

function _buildConcernRecommendation(orgSlug: string, concern: StrategicConcern): StrategicRecommendation {
  const priority: StrategicAdvicePriority = concern.severity;
  return {
    id:             generateSaId("rec"),
    orgSlug,
    title:          `Atender preocupación: ${concern.title}`,
    description:    `Se recomienda tomar acción sobre el siguiente problema identificado en el dominio ${concern.domain}: ${concern.description}`,
    rationale:      concern.rationale,
    domain:         concern.domain,
    priority,
    confidence:     concern.confidence,
    confidenceScore: concern.confidenceScore,
    expectedImpact:  `Reducción del riesgo en dominio ${concern.domain} — severidad actual: ${priority}.`,
    associatedRisks: ["Inacción puede escalar el problema"],
    evidenceIds:    concern.evidenceIds,
    playbookIds:    [],
    suggestedOnly:  true,
    metadata:       { source: "CONCERN_ENGINE", concernId: concern.id },
  };
}

function _buildOpportunityRecommendation(orgSlug: string, opp: StrategicOpportunityAssessment): StrategicRecommendation {
  return {
    id:             generateSaId("rec"),
    orgSlug,
    title:          `Capturar oportunidad: ${opp.title}`,
    description:    `Se recomienda evaluar activamente la siguiente oportunidad en el dominio ${opp.domain}: ${opp.description}`,
    rationale:      opp.rationale,
    domain:         opp.domain,
    priority:       opp.magnitude === "TRANSFORMATIONAL" ? "CRITICAL" : opp.magnitude === "LARGE" ? "HIGH" : "MEDIUM",
    confidence:     opp.confidence,
    confidenceScore: opp.confidenceScore,
    expectedImpact:  `Captura de oportunidad de magnitud ${opp.magnitude} — captureability: ${opp.captureScore.toFixed(2)}.`,
    associatedRisks: ["Ventana de oportunidad puede cerrarse sin acción oportuna"],
    evidenceIds:    opp.evidenceIds,
    playbookIds:    [],
    suggestedOnly:  true,
    metadata:       { source: "OPPORTUNITY_ENGINE", opportunityId: opp.id },
  };
}

function _mapDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
