/**
 * lib/copilot/intelligence/reasoning/insight-engine.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Insight Engine
 *
 * Transforms hypotheses + evidence into actionable, explainable insights.
 * Every insight MUST carry:
 *   - hypothesisIds (traceability to hypotheses)
 *   - evidenceIds   (traceability to evidence)
 *   - explanation   (human-readable reason)
 *
 * If an insight has no evidence, it is discarded (no hallucinations).
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningInsight,
  ReasoningHypothesis,
  ReasoningEvidence,
  InsightType,
  ReasoningCategory,
  ExecutiveImpactLevel,
} from "./reasoning-types";
import {
  scoreToConfidence,
  EXECUTIVE_IMPACT_RANK,
} from "./reasoning-types";

// ── ID generator ───────────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  return `ri_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

// ── Insight generation rules ───────────────────────────────────────────────────

interface InsightRule {
  patternKeys:    string[];          // hypothesis pattern keys that trigger this rule
  type:           InsightType;
  buildTitle:     (h: ReasoningHypothesis) => string;
  buildSummary:   (h: ReasoningHypothesis, evidence: ReasoningEvidence[]) => string;
  buildExplanation: (h: ReasoningHypothesis, evidence: ReasoningEvidence[]) => string;
  impactLevel:    (h: ReasoningHypothesis) => ExecutiveImpactLevel;
  actionable:     boolean;
}

const INSIGHT_RULES: InsightRule[] = [
  {
    patternKeys:    ["SYSTEMIC_BUSINESS_PRESSURE"],
    type:           "RISK",
    buildTitle:     _ => "Presión sistémica del negocio detectada",
    buildSummary:   (h, ev) => `${h.supportingEvidenceIds.length} dominios afectados simultáneamente. ${ev.length} piezas de evidencia disponibles.`,
    buildExplanation: (h, _) => `La hipótesis "${h.title}" fue generada porque múltiples dominios de negocio presentan señales de deterioro al mismo tiempo. Esto sugiere una causa raíz transversal, no problemas aislados.`,
    impactLevel:    h => h.confidenceScore >= 80 ? "CRITICAL" : "HIGH",
    actionable:     true,
  },
  {
    patternKeys:    ["COLLECTIONS_PRESSURE_ON_CASH"],
    type:           "CAUSAL",
    buildTitle:     _ => "Cartera pendiente presionando liquidez",
    buildSummary:   (h, _) => `Relación causal detectada entre cartera morosa y flujo de caja negativo.`,
    buildExplanation: (h, ev) => `Evidencia financiera (${ev.filter(e => e.category === "FINANCIAL").length} señal(es)) y de cobranza (${ev.filter(e => e.category === "COLLECTIONS").length} señal(es)) activas simultáneamente. La hipótesis "${h.title}" sugiere causalidad directa.`,
    impactLevel:    h => h.confidenceScore >= 75 ? "HIGH" : "MEDIUM",
    actionable:     true,
  },
  {
    patternKeys:    ["MARKETING_DRIVING_SALES_DOWN"],
    type:           "CAUSAL",
    buildTitle:     _ => "Marketing débil afectando ventas",
    buildSummary:   (h, _) => `Performance de marketing y ventas en descenso simultáneo sugiere correlación causal.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" fue activada por evidencia de descenso en marketing (${ev.filter(e => e.category === "MARKETING").length} señal(es)) y comercial (${ev.filter(e => e.category === "COMMERCIAL").length} señal(es)) al mismo tiempo.`,
    impactLevel:    _ => "HIGH",
    actionable:     true,
  },
  {
    patternKeys:    ["COMMERCIAL_PRESSURE_FROM_COLLECTIONS"],
    type:           "CORRELATION",
    buildTitle:     _ => "Cartera morosa correlacionada con caída de ventas",
    buildSummary:   (h, _) => `Clientes con deuda acumulada pueden estar reduciendo nuevas compras.`,
    buildExplanation: (h, ev) => `Evidencia de cobranza (${ev.filter(e => e.category === "COLLECTIONS").length} señal(es)) y comercial (${ev.filter(e => e.category === "COMMERCIAL").length} señal(es)) activas sugieren que la concentración de cartera está inhibiendo actividad comercial.`,
    impactLevel:    _ => "HIGH",
    actionable:     true,
  },
  {
    patternKeys:    ["FINANCIAL_CRISIS"],
    type:           "RISK",
    buildTitle:     _ => "Riesgo financiero detectado",
    buildSummary:   (h, ev) => `${ev.filter(e => e.category === "FINANCIAL").length} indicador(es) financiero(s) en deterioro.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" fue generada a partir de ${ev.filter(e => e.category === "FINANCIAL" && e.isSupporting).length} evidencia(s) de deterioro financiero. Se recomienda revisión inmediata del estado de tesorería.`,
    impactLevel:    h => h.confidenceScore >= 80 ? "CRITICAL" : "HIGH",
    actionable:     true,
  },
  {
    patternKeys:    ["COMMERCIAL_WEAK_PIPELINE"],
    type:           "TREND",
    buildTitle:     _ => "Pipeline comercial en descenso",
    buildSummary:   (h, ev) => `Actividad comercial en tendencia negativa sin señales compensatorias.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" se activó con ${ev.filter(e => e.category === "COMMERCIAL").length} señal(es) comercial(es) en descenso y sin evidencia positiva de otros dominios que explique la caída.`,
    impactLevel:    _ => "MEDIUM",
    actionable:     true,
  },
  {
    patternKeys:    ["MARKETING_UNDERPERFORMANCE"],
    type:           "TREND",
    buildTitle:     _ => "Bajo rendimiento de marketing",
    buildSummary:   (h, ev) => `Métricas de marketing bajo el nivel esperado.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" se activó con ${ev.filter(e => e.category === "MARKETING").length} señal(es) de marketing en descenso.`,
    impactLevel:    _ => "MEDIUM",
    actionable:     true,
  },
  {
    patternKeys:    ["COLLECTIONS_PORTFOLIO_RISK"],
    type:           "RISK",
    buildTitle:     _ => "Riesgo en cartera de cobranza",
    buildSummary:   (h, ev) => `Cartera con indicadores de deterioro que requieren atención.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" fue activada por ${ev.filter(e => e.category === "COLLECTIONS").length} señal(es) de cartera en crecimiento.`,
    impactLevel:    _ => "MEDIUM",
    actionable:     true,
  },
  {
    patternKeys:    ["EXECUTIVE_ATTENTION_REQUIRED"],
    type:           "RISK",
    buildTitle:     _ => "Señales ejecutivas pendientes de atención",
    buildSummary:   (h, ev) => `Executive Brain reporta asuntos de alta prioridad.`,
    buildExplanation: (h, ev) => `El Executive Brain ha detectado señales de alta prioridad. La hipótesis "${h.title}" refleja la urgencia de estos asuntos.`,
    impactLevel:    h => h.confidenceScore >= 80 ? "HIGH" : "MEDIUM",
    actionable:     true,
  },
  {
    patternKeys:    ["OPERATIONAL_BOTTLENECK"],
    type:           "ANOMALY",
    buildTitle:     _ => "Cuello de botella operacional detectado",
    buildSummary:   (h, ev) => `Señales operacionales indican bloqueos en procesos.`,
    buildExplanation: (h, ev) => `La hipótesis "${h.title}" fue generada por ${ev.filter(e => e.category === "OPERATIONS").length} señal(es) operacional(es) que indican posibles bloqueos de proceso.`,
    impactLevel:    _ => "MEDIUM",
    actionable:     true,
  },
];

// ── generateInsights ───────────────────────────────────────────────────────────

/**
 * generateInsights — transform hypotheses + evidence into insights.
 *
 * Only viable (SUPPORTED/WEAKENED) hypotheses generate insights.
 * Insights without evidence are discarded (no hallucinations).
 * Never throws.
 */
export function generateInsights(
  orgSlug:    string,
  hypotheses: ReasoningHypothesis[],
  evidence:   ReasoningEvidence[],
): ReasoningInsight[] {
  if (hypotheses.length === 0) return [];

  const insights: ReasoningInsight[] = [];
  const evidenceMap = new Map(evidence.map(e => [e.id, e]));

  for (const hypothesis of hypotheses) {
    if (hypothesis.status === "REFUTED" || hypothesis.status === "CANDIDATE") continue;

    const rule = INSIGHT_RULES.find(r => r.patternKeys.includes(hypothesis.patternKey));
    if (!rule) continue;

    // Gather all evidence for this hypothesis
    const hypEvidence = [
      ...hypothesis.supportingEvidenceIds.map(id => evidenceMap.get(id)).filter(Boolean),
      ...hypothesis.contradictingEvidenceIds.map(id => evidenceMap.get(id)).filter(Boolean),
    ] as ReasoningEvidence[];

    // No evidence = no insight (hallucination prevention)
    if (hypEvidence.length === 0 && hypothesis.supportingEvidenceIds.length === 0) continue;

    const allEvidenceIds = [
      ...hypothesis.supportingEvidenceIds,
      ...hypothesis.contradictingEvidenceIds,
    ];

    const insight: ReasoningInsight = {
      id:              _id(),
      orgSlug,
      type:            rule.type,
      category:        hypothesis.category,
      title:           rule.buildTitle(hypothesis),
      summary:         rule.buildSummary(hypothesis, hypEvidence),
      explanation:     rule.buildExplanation(hypothesis, hypEvidence),
      hypothesisIds:   [hypothesis.id],
      evidenceIds:     allEvidenceIds,
      confidence:      hypothesis.confidence,
      confidenceScore: hypothesis.confidenceScore,
      executiveImpact: rule.impactLevel(hypothesis),
      actionable:      rule.actionable,
      generatedAt:     new Date().toISOString(),
      domains:         hypothesis.domains,
    };

    insights.push(insight);
  }

  return insights;
}

// ── rankInsights ───────────────────────────────────────────────────────────────

/**
 * rankInsights — sort insights by executive impact and confidence.
 * CRITICAL/HIGH impact first, then by confidence score.
 */
export function rankInsights(insights: ReasoningInsight[]): ReasoningInsight[] {
  return [...insights].sort((a, b) => {
    const impactDiff =
      EXECUTIVE_IMPACT_RANK[b.executiveImpact] - EXECUTIVE_IMPACT_RANK[a.executiveImpact];
    if (impactDiff !== 0) return impactDiff;
    return b.confidenceScore - a.confidenceScore;
  });
}

// ── filterInsights ─────────────────────────────────────────────────────────────

/** Filter insights to only actionable ones. */
export function filterActionableInsights(insights: ReasoningInsight[]): ReasoningInsight[] {
  return insights.filter(i => i.actionable);
}

/** Filter insights by minimum confidence score. */
export function filterInsightsByConfidence(
  insights:  ReasoningInsight[],
  minScore:  number,
): ReasoningInsight[] {
  return insights.filter(i => i.confidenceScore >= minScore);
}

/** Filter insights by executive impact level. */
export function filterInsightsByImpact(
  insights:    ReasoningInsight[],
  minImpact:   ExecutiveImpactLevel,
): ReasoningInsight[] {
  return insights.filter(
    i => EXECUTIVE_IMPACT_RANK[i.executiveImpact] >= EXECUTIVE_IMPACT_RANK[minImpact],
  );
}

/** Get all CRITICAL or HIGH impact insights. */
export function getCriticalInsights(insights: ReasoningInsight[]): ReasoningInsight[] {
  return filterInsightsByImpact(insights, "HIGH");
}

/** Get insights for a specific domain. */
export function getInsightsForDomain(
  insights: ReasoningInsight[],
  domain:   ReasoningCategory,
): ReasoningInsight[] {
  return insights.filter(i => i.domains.includes(domain));
}

/** Get multi-domain insights. */
export function getMultiDomainInsights(insights: ReasoningInsight[]): ReasoningInsight[] {
  return insights.filter(i => i.domains.length >= 2);
}
