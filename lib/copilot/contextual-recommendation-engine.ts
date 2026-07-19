/**
 * lib/copilot/contextual-recommendation-engine.ts
 *
 * Agentik Copilot — Contextual Recommendation Engine V1
 *
 * Generates executive-level recommendations based on:
 *   - Current context snapshot (module, agent, signals, priority)
 *   - Cross-module insights
 *   - Agent persona priorities
 *
 * Recommendations are richer than next-steps:
 *   - They explain WHY (whyNow)
 *   - They surface CONFIDENCE
 *   - They connect MODULES
 *   - They suggest SPECIFIC ACTION IDs from the execution registry
 *
 * V1: fully deterministic, no LLM.
 * V2: feed into agent reasoning layer as structured prompts.
 *
 * Sprint: AGENTIK-COPILOT-CONTEXT-ORCHESTRATION-01
 */

import type { CopilotContextSnapshot } from "./context-engine";
import type { CrossModuleInsight }     from "./cross-module-intelligence";

// ── Recommendation type ────────────────────────────────────────────────────────

export type RecommendationSeverity = "critical" | "elevated" | "normal";

export interface ContextualRecommendation {
  recommendationId:  string;
  title:             string;
  description:       string;         // 1–2 sentence explanation
  severity:          RecommendationSeverity;
  agentId:           string;
  relatedModules:    string[];
  suggestedActionIds: string[];      // References CopilotExecutableAction.id
  whyNow:            string;         // Immediate reason for surfacing this now
  confidence:        number;         // 0–100
}

// ── Recommendation rule type ───────────────────────────────────────────────────

interface RecommendationRule {
  id:       string;
  evaluate: (
    ctx:      CopilotContextSnapshot,
    insights: CrossModuleInsight[],
  ) => ContextualRecommendation | null;
}

// ── Rule registry ──────────────────────────────────────────────────────────────

const RECOMMENDATION_RULES: RecommendationRule[] = [

  // ── REC-01: Critical close blockage ───────────────────────────────────────
  {
    id: "rec-critical-close",
    evaluate: (ctx, insights) => {
      const closeSig = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])]
        .find(s => s.ruleId === "financial_close.blocked");
      if (!closeSig) return null;

      const hasReconInsight = insights.some(i => i.id === "recon-blocks-close");

      return {
        recommendationId:   "rec-critical-close",
        title:              "Desbloquear cierre financiero del período",
        description:        hasReconInsight
          ? "Hay excepciones de conciliación que bloquean el cierre. Resolverlas desbloqueará el período y habilitará el reporte ejecutivo."
          : "El cierre financiero está bloqueado. Revisar las condiciones de bloqueo es la acción prioritaria.",
        severity:           "critical",
        agentId:            "diego",
        relatedModules:     ["finanzas/conciliacion", "finanzas/cierre", "executive"],
        suggestedActionIds: ["close-conciliacion", "recon-excepciones", "close-diferencias"],
        whyNow:             "El cierre bloqueado impide consolidar el período y publicar el reporte ejecutivo",
        confidence:         92,
      };
    },
  },

  // ── REC-02: Treasury critical ─────────────────────────────────────────────
  {
    id: "rec-treasury-critical",
    evaluate: (ctx) => {
      const treasurySig = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])]
        .find(s => s.ruleId === "treasury.low_coverage");
      if (!treasurySig) return null;
      if (treasurySig.severity !== "critica") return null;

      return {
        recommendationId:   "rec-treasury-critical",
        title:              "Liquidez en zona crítica — acción inmediata",
        description:        "La cobertura de caja está por debajo del umbral mínimo operacional. Priorizar cobros del día es la acción más efectiva de corto plazo.",
        severity:           "critical",
        agentId:            "diego",
        relatedModules:     ["finanzas/tesoreria", "finanzas/cierre"],
        suggestedActionIds: ["treasury-cobranza", "treasury-cxc", "treasury-consignaciones"],
        whyNow:             "La cobertura crítica requiere cobros el día de hoy para estabilizar la posición",
        confidence:         95,
      };
    },
  },

  // ── REC-03: Treasury at risk (elevated) ───────────────────────────────────
  {
    id: "rec-treasury-elevated",
    evaluate: (ctx) => {
      const treasurySig = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])]
        .find(s => s.ruleId === "treasury.low_coverage");
      if (!treasurySig) return null;
      if (treasurySig.severity === "critica") return null; // handled by REC-02

      return {
        recommendationId:   "rec-treasury-elevated",
        title:              "Revisar cobertura de caja antes del cierre",
        description:        "La tesorería está en zona de riesgo. Revisar cobros proyectados y consignaciones puede estabilizar la posición antes del cierre.",
        severity:           "elevated",
        agentId:            "diego",
        relatedModules:     ["finanzas/tesoreria", "finanzas/planeacion"],
        suggestedActionIds: ["treasury-cxc", "treasury-consignaciones", "budget-proyectar"],
        whyNow:             "La cobertura por debajo de 30 días exige revisión antes del próximo ciclo de pagos",
        confidence:         82,
      };
    },
  },

  // ── REC-04: Budget over-execution ─────────────────────────────────────────
  {
    id: "rec-budget-overrun",
    evaluate: (ctx, insights) => {
      const budgetSig = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])]
        .find(s => s.ruleId === "budget.velocity_exceeded");
      if (!budgetSig) return null;

      const convergent = insights.some(i => i.id === "budget-drains-treasury");

      return {
        recommendationId:   "rec-budget-overrun",
        title:              convergent
          ? "Reducir ritmo de inversión para proteger liquidez"
          : "Recalibrar presupuesto — velocidad supera el plan",
        description:        convergent
          ? "La ejecución presupuestal acelerada está drenando la liquidez disponible. Una recalibración protegerá la cobertura de caja."
          : "El ritmo de ejecución presupuestal supera el plan. Recalibrar evitará desviaciones mayores al cierre.",
        severity:           convergent ? "critical" : "elevated",
        agentId:            "diego",
        relatedModules:     ["finanzas/planeacion", "finanzas/tesoreria"],
        suggestedActionIds: convergent
          ? ["budget-reasignar", "budget-recalibrar", "budget-proyectar"]
          : ["budget-recalibrar", "budget-proyectar"],
        whyNow:             convergent
          ? "La presión convergente entre gasto y liquidez requiere corrección inmediata"
          : "Cada período adicional con esta velocidad aumenta la desviación acumulada",
        confidence:         convergent ? 88 : 76,
      };
    },
  },

  // ── REC-05: Reconciliation mass ───────────────────────────────────────────
  {
    id: "rec-recon-mass",
    evaluate: (ctx) => {
      const reconSig = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])]
        .find(s => s.ruleId === "reconciliation.pending_critical");
      if (!reconSig) return null;

      return {
        recommendationId:   "rec-recon-mass",
        title:              "Priorizar resolución de excepciones en conciliación",
        description:        "Hay excepciones críticas abiertas en conciliación. Resolverlas mejora la precisión del saldo de tesorería y desbloquea el cierre.",
        severity:           reconSig.severity === "critica" ? "critical" : "elevated",
        agentId:            "diego",
        relatedModules:     ["finanzas/conciliacion", "finanzas/tesoreria", "finanzas/cierre"],
        suggestedActionIds: ["recon-excepciones", "recon-cobros", "recon-diferencias"],
        whyNow:             "Cada excepción abierta representa un cobro que no está aplicado correctamente en el saldo",
        confidence:         85,
      };
    },
  },

  // ── REC-06: Executive view with no signals ────────────────────────────────
  {
    id: "rec-executive-healthy",
    evaluate: (ctx) => {
      if (ctx.operationalPriority !== "idle") return null;
      if (!ctx.activeModule.startsWith("executive")) return null;

      return {
        recommendationId:   "rec-executive-healthy",
        title:              "Sistema en estado estable — revisión de tendencias",
        description:        "No hay señales activas. Es el momento ideal para revisar tendencias, comparar períodos y proyectar el siguiente ciclo.",
        severity:           "normal",
        agentId:            "diego",
        relatedModules:     ["executive", "finanzas/planeacion", "finanzas/tesoreria"],
        suggestedActionIds: [],
        whyNow:             "Sin señales activas, el foco debe estar en anticipar riesgos futuros",
        confidence:         70,
      };
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes contextual recommendations from a context snapshot + insights.
 * Returns recommendations sorted by severity: critical → elevated → normal.
 */
export function computeContextualRecommendations(
  context:  CopilotContextSnapshot,
  insights: CrossModuleInsight[],
): ContextualRecommendation[] {
  const PRIORITY: Record<RecommendationSeverity, number> = { critical: 0, elevated: 1, normal: 2 };

  return RECOMMENDATION_RULES
    .map(rule => rule.evaluate(context, insights))
    .filter((r): r is ContextualRecommendation => r !== null)
    .sort((a, b) => {
      const sev = PRIORITY[a.severity] - PRIORITY[b.severity];
      if (sev !== 0) return sev;
      return b.confidence - a.confidence;
    });
}

/**
 * Returns the single most actionable recommendation for the current context.
 * Prefers recommendations matching the active module.
 */
export function getPrimaryRecommendation(
  context:         CopilotContextSnapshot,
  recommendations: ContextualRecommendation[],
): ContextualRecommendation | null {
  if (recommendations.length === 0) return null;

  // Prefer recommendations relevant to the active module or agent
  const moduleMatch = recommendations.find(r =>
    r.relatedModules.some(m =>
      context.activeModule.startsWith(m) || m.startsWith(context.activeModule)
    ) && r.agentId === context.activeAgentId
  );

  return moduleMatch ?? recommendations[0] ?? null;
}
