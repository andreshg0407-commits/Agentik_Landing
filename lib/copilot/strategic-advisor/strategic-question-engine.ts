// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 6 — Strategic Question Engine
// Generates questions a senior executive should consider given the current state

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern } from "./strategic-advisor-types";
import type { StrategicOpportunityAssessment } from "./strategic-advisor-types";
import type { StrategicQuestion, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

// ── Main exports ──────────────────────────────────────────────────────────────

export function generateQuestions(
  ctx: StrategicAdvisorContext,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[]
): StrategicQuestion[] {
  const questions: StrategicQuestion[] = [];

  // Risk-derived questions
  for (const c of concerns.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH").slice(0, 4)) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    _riskQuestion(c),
      rationale:   `Preocupación activa en dominio ${c.domain} con severidad ${c.severity}`,
      domain:      c.domain,
      priority:    c.severity,
      confidence:  c.confidence,
      category:    "RISK",
      evidenceIds: c.evidenceIds,
      metadata:    { source: "CONCERN_ENGINE", concernId: c.id },
    });
  }

  // Opportunity-derived questions
  for (const o of opportunities.filter((o) => o.isIgnored).slice(0, 3)) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    `¿Estamos dejando pasar la oportunidad de "${o.title}" sin un plan concreto de captura?`,
      rationale:   `Oportunidad activa sin objetivo estratégico asignado — posible punto ciego`,
      domain:      o.domain,
      priority:    "HIGH",
      confidence:  o.confidence,
      category:    "OPPORTUNITY",
      evidenceIds: o.evidenceIds,
      metadata:    { source: "OPPORTUNITY_ENGINE", opportunityId: o.id },
    });
  }

  // Alignment questions
  if (ctx.activeGoals.length > 0 && concerns.length > 0) {
    const criticalDomains = new Set(concerns.filter((c) => c.severity === "CRITICAL").map((c) => c.domain));
    for (const domain of criticalDomains) {
      const goalsInDomain = ctx.activeGoals.filter((g) => g.domain === domain);
      if (goalsInDomain.length > 0) {
        questions.push({
          id:          generateSaId("q"),
          orgSlug:     ctx.orgSlug,
          question:    `¿Los recursos actuales en ${domain} son suficientes para alcanzar los objetivos mientras se gestionan los riesgos críticos?`,
          rationale:   `Objetivos y riesgos críticos coexisten en el mismo dominio — posible tensión de recursos`,
          domain:      domain as StrategicDomain,
          priority:    "CRITICAL",
          confidence:  "MEDIUM",
          category:    "ALIGNMENT",
          evidenceIds: goalsInDomain.map((g) => g.id),
          metadata:    { source: "ALIGNMENT_ANALYSIS" },
        });
      }
    }
  }

  // Learning-based questions
  if (ctx.rejectedPatterns.length > ctx.confirmedPatterns.length) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    "¿Por qué estamos repitiendo patrones que el historial muestra como ineficaces?",
      rationale:   `Los patrones rechazados (${ctx.rejectedPatterns.length}) superan los confirmados (${ctx.confirmedPatterns.length})`,
      domain:      "CROSS_DOMAIN",
      priority:    "HIGH",
      confidence:  "MEDIUM",
      category:    "CHALLENGE",
      evidenceIds: ctx.rejectedPatterns.map((p) => p.id),
      metadata:    { source: "LEARNING_ANALYSIS" },
    });
  }

  // Concentration risk question (when most concerns are in one domain)
  const domainFreq: Record<string, number> = {};
  for (const c of concerns) domainFreq[c.domain] = (domainFreq[c.domain] ?? 0) + 1;
  const topDomainEntry = Object.entries(domainFreq).sort((a, b) => b[1] - a[1])[0];
  if (topDomainEntry && topDomainEntry[1] >= 3) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    `¿Existe concentración de riesgo excesiva en el dominio ${topDomainEntry[0]}?`,
      rationale:   `${topDomainEntry[1]} de ${concerns.length} preocupaciones activas están en el mismo dominio`,
      domain:      topDomainEntry[0] as StrategicDomain,
      priority:    "HIGH",
      confidence:  "HIGH",
      category:    "RISK",
      evidenceIds: [],
      metadata:    { source: "CONCENTRATION_ANALYSIS" },
    });
  }

  // Liquidity question (finance domain concerns)
  if (concerns.some((c) => c.domain === "FINANCE" && (c.severity === "CRITICAL" || c.severity === "HIGH"))) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    "¿Estamos sacrificando liquidez operativa por objetivos de crecimiento?",
      rationale:   "Riesgos financieros críticos activos — requiere evaluación de trade-off liquidez vs crecimiento",
      domain:      "FINANCE",
      priority:    "CRITICAL",
      confidence:  "MEDIUM",
      category:    "DECISION",
      evidenceIds: concerns.filter((c) => c.domain === "FINANCE").map((c) => c.id),
      metadata:    { source: "FINANCE_ANALYSIS" },
    });
  }

  // Decision questions from recent decisions
  for (const decision of ctx.recentDecisions.slice(0, 2)) {
    questions.push({
      id:          generateSaId("q"),
      orgSlug:     ctx.orgSlug,
      question:    `¿La decisión "${decision.title}" aún está alineada con los objetivos actuales?`,
      rationale:   `Revisión de decisión estratégica reciente ante cambios en el contexto`,
      domain:      decision.domain as StrategicDomain,
      priority:    "MEDIUM",
      confidence:  "MEDIUM",
      category:    "DECISION",
      evidenceIds: [decision.id],
      metadata:    { source: "DECISION_REVIEW", decisionId: decision.id },
    });
  }

  return prioritizeQuestions(questions);
}

export function prioritizeQuestions(questions: StrategicQuestion[]): StrategicQuestion[] {
  return [...questions].sort((a, b) =>
    STRATEGIC_PRIORITY_RANK[b.priority] - STRATEGIC_PRIORITY_RANK[a.priority]
  );
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _riskQuestion(concern: StrategicConcern): string {
  const domain = concern.domain;
  if (domain === "FINANCE")     return `¿Contamos con un plan concreto para resolver "${concern.title}" antes de que impacte la liquidez?`;
  if (domain === "COMMERCIAL")  return `¿Qué acciones inmediatas podemos tomar para mitigar "${concern.title}" sin comprometer el pipeline?`;
  if (domain === "COMPLIANCE")  return `¿Existe exposición legal o regulatoria derivada de "${concern.title}" que requiera atención inmediata?`;
  if (domain === "OPERATIONS")  return `¿La interrupción operativa en "${concern.title}" ya está afectando los compromisos con clientes?`;
  return `¿Cuál es el plan de acción concreto para resolver "${concern.title}"?`;
}
