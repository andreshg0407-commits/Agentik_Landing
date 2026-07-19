// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 11 — Strategic Narrative Engine
// Converts analysis into executive language — feels like a strategic advisor, not a dashboard

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern, StrategicOpportunityAssessment, StrategicRecommendation, StrategicFocusArea } from "./strategic-advisor-types";
import type { StrategicAdvice, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

export function buildAdvisoryNarratives(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[],
  recommendations: StrategicRecommendation[],
  focusAreas: StrategicFocusArea[]
): StrategicAdvice[] {
  const advice: StrategicAdvice[] = [];

  // 1. Overall situation assessment
  advice.push(_buildOverallSituation(ctx, concerns, opportunities));

  // 2. Top concern narrative
  const topConcern = concerns.find((c) => c.severity === "CRITICAL") ?? concerns[0];
  if (topConcern) advice.push(_buildConcernNarrative(ctx.orgSlug, topConcern));

  // 3. Top opportunity narrative
  const topOpp = opportunities.find((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL") ?? opportunities[0];
  if (topOpp) advice.push(_buildOpportunityNarrative(ctx.orgSlug, topOpp));

  // 4. Strategic recommendation synthesis
  const topRec = recommendations.find((r) => r.priority === "CRITICAL") ?? recommendations[0];
  if (topRec) advice.push(_buildRecommendationNarrative(ctx.orgSlug, topRec));

  // 5. Focus area narrative
  const topFocus = focusAreas[0];
  if (topFocus) advice.push(_buildFocusNarrative(ctx.orgSlug, topFocus));

  // 6. Learning-based insight (if rich data)
  if (ctx.confirmedPatterns.length >= 2) {
    advice.push(_buildLearningNarrative(ctx));
  }

  return advice.slice(0, 6);
}

export function buildNarrativeForAdvice(
  orgSlug: string,
  title: string,
  body: string,
  domain: StrategicDomain,
  evidenceIds: string[]
): StrategicAdvice {
  return {
    id:             generateSaId("advice"),
    orgSlug,
    title,
    body,
    summary:        body.slice(0, 120),
    domain,
    priority:       "MEDIUM",
    confidence:     "MEDIUM",
    confidenceScore: 0.6,
    traceable:      evidenceIds.length > 0,
    evidenceIds,
    metadata:       {},
    generatedAt:    new Date().toISOString(),
  };
}

// ── Private builders ──────────────────────────────────────────────────────────

function _buildOverallSituation(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[]
): StrategicAdvice {
  const criticalCount = concerns.filter((c) => c.severity === "CRITICAL").length;
  const highCount     = concerns.filter((c) => c.severity === "HIGH").length;
  const oppCount      = opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").length;
  const score         = ctx.overallContextScore;

  let body: string;
  if (criticalCount >= 2) {
    body = `La organización enfrenta ${criticalCount} riesgo(s) crítico(s) activo(s) que requieren atención ejecutiva inmediata. El contexto estratégico actual presenta presión concentrada en los dominios más afectados. Se recomienda priorizar la resolución de estos riesgos antes de expandir iniciativas de crecimiento.`;
  } else if (criticalCount === 1 && oppCount >= 1) {
    body = `Existe una tensión estratégica activa: un riesgo crítico coexiste con ${oppCount} oportunidad(es) de alto potencial. La decisión clave es determinar si la organización puede atender ambos simultáneamente sin comprometer la estabilidad financiera y operativa.`;
  } else if (criticalCount === 0 && oppCount >= 2) {
    body = `El panorama estratégico actual es favorable. No hay riesgos críticos activos y se han identificado ${oppCount} oportunidades de alto potencial. Este es un momento para fortalecer la posición estratégica y avanzar en iniciativas de crecimiento con decisión.`;
  } else {
    body = `La situación estratégica actual es moderada. Existen ${highCount} preocupaciones de nivel alto que merecen monitoreo activo y ${oppCount} oportunidades que podrían capitalizarse con el plan adecuado. El contexto no es de emergencia pero sí de atención sostenida.`;
  }

  const allEvidence = [...new Set([
    ...concerns.flatMap((c) => c.evidenceIds),
    ...opportunities.flatMap((o) => o.evidenceIds),
  ])].slice(0, 8);

  return {
    id:             generateSaId("advice"),
    orgSlug:        ctx.orgSlug,
    title:          "Evaluación general de la situación estratégica",
    body,
    summary:        body.slice(0, 120),
    domain:         "EXECUTIVE",
    priority:       criticalCount >= 2 ? "CRITICAL" : criticalCount === 1 ? "HIGH" : "MEDIUM",
    confidence:     confidenceSaFromScore(score),
    confidenceScore: score,
    traceable:      allEvidence.length > 0,
    evidenceIds:    allEvidence,
    metadata:       { criticalCount, highCount, oppCount },
    generatedAt:    new Date().toISOString(),
  };
}

function _buildConcernNarrative(orgSlug: string, concern: StrategicConcern): StrategicAdvice {
  const body = `El principal factor de preocupación estratégica actualmente es: "${concern.title}". ${concern.description} Esta situación aparece en el dominio ${concern.domain} con severidad ${concern.severity}. ${concern.rationale}. Es recomendable definir un plan de respuesta concreto con responsables y plazo.`;
  return {
    id:             generateSaId("advice"),
    orgSlug,
    title:          `Análisis del riesgo principal: ${concern.title}`,
    body,
    summary:        body.slice(0, 120),
    domain:         concern.domain,
    priority:       concern.severity,
    confidence:     concern.confidence,
    confidenceScore: concern.confidenceScore,
    traceable:      concern.evidenceIds.length > 0,
    evidenceIds:    concern.evidenceIds,
    metadata:       { concernId: concern.id },
    generatedAt:    new Date().toISOString(),
  };
}

function _buildOpportunityNarrative(orgSlug: string, opp: StrategicOpportunityAssessment): StrategicAdvice {
  const body = `Se ha identificado una oportunidad de magnitud ${opp.magnitude} en el dominio ${opp.domain}: "${opp.title}". ${opp.description} El potencial de captura es ${opp.captureScore.toFixed(2)} con horizonte ${opp.timeHorizon}. ${opp.isIgnored ? "Actualmente esta oportunidad no tiene un objetivo estratégico asignado — esto representa un punto ciego que merece atención." : "Existe alineación con los objetivos actuales."}`;
  return {
    id:             generateSaId("advice"),
    orgSlug,
    title:          `Oportunidad estratégica identificada: ${opp.title}`,
    body,
    summary:        body.slice(0, 120),
    domain:         opp.domain,
    priority:       opp.magnitude === "TRANSFORMATIONAL" ? "CRITICAL" : opp.magnitude === "LARGE" ? "HIGH" : "MEDIUM",
    confidence:     opp.confidence,
    confidenceScore: opp.confidenceScore,
    traceable:      opp.evidenceIds.length > 0,
    evidenceIds:    opp.evidenceIds,
    metadata:       { opportunityId: opp.id },
    generatedAt:    new Date().toISOString(),
  };
}

function _buildRecommendationNarrative(orgSlug: string, rec: StrategicRecommendation): StrategicAdvice {
  const body = `La recomendación estratégica más urgente es: "${rec.title}". ${rec.description} Justificación: ${rec.rationale}. Impacto esperado: ${rec.expectedImpact}. Riesgos asociados: ${rec.associatedRisks.join("; ") || "Ninguno identificado"}. Esta es una sugerencia para consideración ejecutiva — no una acción automática.`;
  return {
    id:             generateSaId("advice"),
    orgSlug,
    title:          `Recomendación estratégica principal: ${rec.title}`,
    body,
    summary:        body.slice(0, 120),
    domain:         rec.domain,
    priority:       rec.priority,
    confidence:     rec.confidence,
    confidenceScore: rec.confidenceScore,
    traceable:      rec.evidenceIds.length > 0,
    evidenceIds:    rec.evidenceIds,
    metadata:       { recommendationId: rec.id },
    generatedAt:    new Date().toISOString(),
  };
}

function _buildFocusNarrative(orgSlug: string, focus: StrategicFocusArea): StrategicAdvice {
  const body = `El área de mayor concentración estratégica actualmente es el dominio ${focus.domain}. ${focus.rationale} El score compuesto de urgencia e impacto es ${focus.compositeScore.toFixed(2)}, lo cual sugiere que este dominio merece atención preferente en la agenda ejecutiva.`;
  return {
    id:             generateSaId("advice"),
    orgSlug,
    title:          `Área de foco prioritario: ${focus.domain}`,
    body,
    summary:        body.slice(0, 120),
    domain:         focus.domain,
    priority:       focus.compositeScore >= 0.7 ? "HIGH" : "MEDIUM",
    confidence:     focus.confidence,
    confidenceScore: focus.compositeScore,
    traceable:      focus.evidenceIds.length > 0,
    evidenceIds:    focus.evidenceIds,
    metadata:       { focusAreaId: focus.id },
    generatedAt:    new Date().toISOString(),
  };
}

function _buildLearningNarrative(ctx: StrategicAdvisorContext): StrategicAdvice {
  const confirmed = ctx.confirmedPatterns.length;
  const rejected  = ctx.rejectedPatterns.length;
  const top       = ctx.confirmedPatterns[0];
  const body = `El historial de aprendizaje organizacional muestra ${confirmed} patrón(es) confirmado(s) y ${rejected} rechazado(s). El patrón más fuerte es "${top.name}" (${top.reinforcementCount} refuerzos). Esta base de conocimiento debe guiar las decisiones actuales: los patrones confirmados merecen replicación, los rechazados merecen vigilancia.`;
  return {
    id:             generateSaId("advice"),
    orgSlug:        ctx.orgSlug,
    title:          "Perspectiva de aprendizaje organizacional",
    body,
    summary:        body.slice(0, 120),
    domain:         "CROSS_DOMAIN",
    priority:       "MEDIUM",
    confidence:     confidenceSaFromScore(ctx.learningStrength),
    confidenceScore: ctx.learningStrength,
    traceable:      true,
    evidenceIds:    ctx.confirmedPatterns.flatMap((p) => p.evidenceEventIds).slice(0, 5),
    metadata:       { confirmedPatterns: confirmed, rejectedPatterns: rejected },
    generatedAt:    new Date().toISOString(),
  };
}
