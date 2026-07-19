/**
 * lib/copilot/cross-module-reasoning/recommendation-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Recommendation Engine — Generates suggested, preventive, and corrective actions.
 * Never executes. Only suggests. Deterministic. No AI.
 */

import type {
  ReasoningHypothesis,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningRecommendation,
  RecommendationType,
  RecommendationPriority,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Recommendation templates ──────────────────────────────────────────────────

interface RecommendationTemplate {
  type:        RecommendationType;
  priority:    RecommendationPriority;
  title:       string;
  description: string;
  rationale:   string;
  forCategory?: string;  // hypothesis category trigger
  forRiskDomain?: string;
  forOppType?:  string;
}

const RECOMMENDATION_TEMPLATES: RecommendationTemplate[] = [
  // Cash flow
  {
    type: "INVESTIGATION", priority: "URGENT",
    title: "Investigar causas de caída de caja",
    description: "Revisar los egresos de los últimos 30 días y cruzar con ingresos para identificar la fuente de la caída de liquidez.",
    rationale: "Sin identificar la causa, cualquier acción correctiva será especulativa y puede ser ineficaz.",
    forCategory: "CASH_FLOW",
  },
  {
    type: "ACTION", priority: "URGENT",
    title: "Activar gestión acelerada de cobranza",
    description: "Priorizar cobros pendientes de más de 30 días mediante contacto directo y acuerdos de pago.",
    rationale: "La recuperación de cartera vencida es la forma más rápida de mejorar el flujo de caja sin incurrir en nueva deuda.",
    forCategory: "CASH_FLOW",
  },
  // Collections
  {
    type: "ACTION", priority: "HIGH",
    title: "Revisar y segmentar cartera vencida",
    description: "Clasificar la cartera vencida por antigüedad, monto y probabilidad de recuperación para priorizar gestión.",
    rationale: "Una cartera vencida no segmentada no puede gestionarse eficientemente. La priorización maximiza la recuperación.",
    forCategory: "COLLECTIONS",
  },
  {
    type: "PREVENTION", priority: "MEDIUM",
    title: "Implementar alertas tempranas de vencimiento",
    description: "Configurar alertas automáticas cuando las cuentas se acerquen a su fecha de vencimiento.",
    rationale: "La prevención de vencimientos es más eficiente que la gestión de cartera ya vencida.",
    forCategory: "COLLECTIONS",
  },
  // Sales
  {
    type: "INVESTIGATION", priority: "HIGH",
    title: "Analizar causas de reducción de pedidos",
    description: "Revisar el histórico de pedidos por cliente y canal para identificar dónde se origina la caída.",
    rationale: "La caída de pedidos puede tener múltiples causas. Identificar la fuente permite acciones dirigidas.",
    forCategory: "SALES",
  },
  {
    type: "ACTION", priority: "HIGH",
    title: "Activar campaña de reactivación de clientes",
    description: "Contactar clientes inactivos de los últimos 60 días con oferta específica de reactivación.",
    rationale: "Recuperar un cliente existente cuesta menos que adquirir uno nuevo. La reactivación debe ser prioritaria.",
    forCategory: "SALES",
  },
  // Marketing
  {
    type: "CORRECTION", priority: "HIGH",
    title: "Revisar efectividad de campañas activas",
    description: "Evaluar el ROI de cada campaña activa y detener o ajustar las que no alcancen el umbral mínimo.",
    rationale: "Campañas con bajo rendimiento consumen presupuesto sin generar valor. La corrección mejora la eficiencia de marketing.",
    forCategory: "MARKETING",
  },
  {
    type: "ACTION", priority: "MEDIUM",
    title: "Redirigir inversión a canales de mayor rendimiento",
    description: "Identificar los canales con mejor desempeño actual y concentrar inversión en ellos.",
    rationale: "Concentrar recursos en los canales más efectivos maximiza el retorno de la inversión en marketing.",
    forCategory: "MARKETING",
  },
  // Operations
  {
    type: "MONITORING", priority: "HIGH",
    title: "Monitorear anomalía operativa activa",
    description: "Establecer monitoreo continuo del indicador con anomalía para detectar si se estabiliza o escala.",
    rationale: "Sin monitoreo activo, una anomalía puede escalar a un problema mayor sin detección temprana.",
    forCategory: "OPERATIONS",
  },
  {
    type: "INVESTIGATION", priority: "URGENT",
    title: "Investigar alerta operativa de alta severidad",
    description: "Asignar responsable inmediato para investigar la fuente de la alerta y determinar plan de acción.",
    rationale: "Las alertas críticas requieren atención inmediata para evitar escalamiento.",
    forCategory: "OPERATIONS",
  },
  // Strategic
  {
    type: "INVESTIGATION", priority: "URGENT",
    title: "Análisis de riesgo estratégico",
    description: "Realizar un análisis ejecutivo de las señales de riesgo estratégico detectadas y definir plan de mitigación.",
    rationale: "Los riesgos estratégicos no atendidos pueden comprometer la viabilidad del negocio a mediano plazo.",
    forCategory: "STRATEGIC",
  },
  // Risk-based
  {
    type: "PREVENTION", priority: "HIGH",
    title: "Implementar plan de contingencia de liquidez",
    description: "Preparar un plan de contingencia de liquidez que incluya líneas de crédito disponibles y ajuste de egresos.",
    rationale: "Tener un plan de contingencia reduce el impacto de episodios de baja liquidez.",
    forRiskDomain: "FINANCIAL",
  },
  {
    type: "MONITORING", priority: "MEDIUM",
    title: "Monitoreo continuo de KPIs comerciales",
    description: "Establecer seguimiento semanal de los principales KPIs comerciales para detectar tendencias tempranamente.",
    rationale: "La detección temprana de caídas comerciales permite acciones preventivas antes que los problemas escalen.",
    forRiskDomain: "COMMERCIAL",
  },
  // Opportunity-based
  {
    type: "ACTION", priority: "HIGH",
    title: "Ejecutar plan de recuperación comercial",
    description: "Activar las acciones identificadas de recuperación: reactivación de clientes, campañas focalizadas y seguimiento.",
    rationale: "Las ventanas de recuperación son temporales. Actuar rápido maximiza el impacto.",
    forOppType: "RECOVERY",
  },
  {
    type: "ACTION", priority: "MEDIUM",
    title: "Diseñar oferta de upsell para clientes activos",
    description: "Crear una oferta dirigida a los clientes con mayor frecuencia de compra para incrementar el ticket promedio.",
    rationale: "El upsell a clientes activos tiene mayor probabilidad de conversión que la captación de nuevos clientes.",
    forOppType: "UPSELL",
  },
];

// ── Generate recommendations from hypotheses ─────────────────────────────────

export function generateRecommendationsFromHypotheses(
  orgSlug: string,
  hypotheses: ReasoningHypothesis[],
): ReasoningRecommendation[] {
  const supported = hypotheses.filter(
    h => h.orgSlug === orgSlug && h.supported && !h.contradicted,
  );
  const recommendations: ReasoningRecommendation[] = [];
  const seen = new Set<string>();

  for (const h of supported) {
    const templates = RECOMMENDATION_TEMPLATES.filter(
      t => t.forCategory === h.category,
    );

    for (const t of templates) {
      if (seen.has(t.title)) continue;
      seen.add(t.title);

      recommendations.push({
        id:           generateCmrId("rec"),
        orgSlug,
        type:         t.type,
        priority:     _adjustPriority(t.priority, h.confidence.score),
        title:        t.title,
        description:  t.description,
        rationale:    t.rationale,
        hypothesisId: h.id,
        evidenceIds:  h.evidenceIds,
        metadata:     {
          sourceHypothesisId: h.id,
          hypothesisCategory: h.category,
          confidence:         h.confidence.score,
        },
        generatedAt:  new Date().toISOString(),
      });
    }
  }

  return recommendations;
}

// ── Generate recommendations from risks ──────────────────────────────────────

export function generateRecommendationsFromRisks(
  orgSlug: string,
  risks: ReasoningRisk[],
): ReasoningRecommendation[] {
  const scoped = risks.filter(r => r.orgSlug === orgSlug);
  const recommendations: ReasoningRecommendation[] = [];
  const seen = new Set<string>();

  for (const risk of scoped) {
    const templates = RECOMMENDATION_TEMPLATES.filter(
      t => t.forRiskDomain === risk.domain,
    );
    for (const t of templates) {
      if (seen.has(t.title)) continue;
      seen.add(t.title);

      recommendations.push({
        id:          generateCmrId("rec"),
        orgSlug,
        type:        t.type,
        priority:    risk.severity === "CRITICAL" ? "URGENT" : t.priority,
        title:       t.title,
        description: t.description,
        rationale:   t.rationale,
        evidenceIds: risk.evidenceIds,
        metadata:    { sourceRiskId: risk.id, riskDomain: risk.domain },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return recommendations;
}

// ── Generate recommendations from opportunities ───────────────────────────────

export function generateRecommendationsFromOpportunities(
  orgSlug: string,
  opportunities: ReasoningOpportunity[],
): ReasoningRecommendation[] {
  const scoped = opportunities.filter(o => o.orgSlug === orgSlug);
  const recommendations: ReasoningRecommendation[] = [];
  const seen = new Set<string>();

  for (const opp of scoped) {
    const templates = RECOMMENDATION_TEMPLATES.filter(
      t => t.forOppType === opp.type,
    );
    for (const t of templates) {
      if (seen.has(t.title)) continue;
      seen.add(t.title);

      recommendations.push({
        id:          generateCmrId("rec"),
        orgSlug,
        type:        t.type,
        priority:    opp.urgency === "HIGH" ? "HIGH" : "MEDIUM",
        title:       t.title,
        description: t.description,
        rationale:   t.rationale,
        evidenceIds: opp.evidenceIds,
        metadata:    { sourceOpportunityId: opp.id, opportunityType: opp.type },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return recommendations;
}

// ── Merge and rank all recommendations ───────────────────────────────────────

export function rankRecommendations(
  recommendations: ReasoningRecommendation[],
): ReasoningRecommendation[] {
  const PRIORITY_ORDER: Record<string, number> = {
    URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };
  const TYPE_ORDER: Record<string, number> = {
    INVESTIGATION: 3, ACTION: 3, CORRECTION: 2, PREVENTION: 2, MONITORING: 1,
  };
  return [...recommendations].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pb !== pa) return pb - pa;
    const ta = TYPE_ORDER[a.type] ?? 1;
    const tb = TYPE_ORDER[b.type] ?? 1;
    return tb - ta;
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _adjustPriority(
  base: RecommendationPriority,
  confidence: number,
): RecommendationPriority {
  if (confidence >= 0.85) return "URGENT";
  if (confidence >= 0.6)  return base;
  const downgrade: Record<RecommendationPriority, RecommendationPriority> = {
    URGENT: "HIGH", HIGH: "MEDIUM", MEDIUM: "LOW", LOW: "LOW",
  };
  return downgrade[base] ?? "LOW";
}
