/**
 * lib/copilot/decision-engine.ts
 *
 * Agentik Copilot — Decision Engine V1
 *
 * Rule-based inference engine that cross-references operational context and
 * prioritized signals to generate actionable CopilotDecision objects.
 *
 * Decisions are CROSS-SIGNAL inferences — they fire when multiple conditions
 * converge in a way that warrants a specific recommendation.
 *
 * Design:
 *   - Fully deterministic, no AI, no LLM
 *   - Each rule is an explicit IF→THEN with named reason
 *   - Decisions are prioritized by their own severity
 *   - V2: feed into agent reasoning layer
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

import type { OperationalContext } from "./context-engine";
import type { PrioritizedSignal }  from "./priority-engine";

// ── Decision types ────────────────────────────────────────────────────────────

export type CopilotDecisionType =
  | "alert"           // Immediate attention required
  | "recommendation"  // Suggested course of action
  | "task"            // Concrete actionable task to create
  | "projection"      // Financial projection based on trends
  | "reroute"         // Redirect resources or priorities
  | "approval";       // Something requires explicit approval

export interface CopilotDecision {
  id:              string;
  type:            CopilotDecisionType;
  title:           string;
  reason:          string;   // Why Copilot is making this decision
  confidence:      number;   // 0–100 — how certain Copilot is about this
  affectedModules: string[];
  suggestedAction?: string;
  priority:        "critical" | "elevated" | "normal";
}

// ── Rule registry ─────────────────────────────────────────────────────────────

interface DecisionRule {
  id:       string;
  evaluate: (ctx: OperationalContext, signals: PrioritizedSignal[]) => CopilotDecision | null;
}

const RULES: DecisionRule[] = [

  // ── RULE 1: Treasury critical state ────────────────────────────────────────
  {
    id: "treasury-critical",
    evaluate: (ctx) => {
      if (ctx.finance.runwayDays >= 15) return null;
      return {
        id:              "dec-treasury-critical",
        type:            "alert",
        title:           "Cobertura de caja crítica — acción en 24h",
        reason:          `La tesorería tiene cobertura de ${ctx.finance.runwayDays} días, por debajo del umbral mínimo operacional de 15 días.`,
        confidence:      95,
        affectedModules: ["tesoreria", "cierre", "planeacion"],
        suggestedAction: "Priorizar cobros del día e identificar compromisos diferibles",
        priority:        "critical",
      };
    },
  },

  // ── RULE 2: Treasury + Budget convergence risk ─────────────────────────────
  {
    id: "treasury-budget-convergence",
    evaluate: (ctx) => {
      if (ctx.finance.runwayDays >= 20) return null;
      if (ctx.finance.budgetVelocityRatio < 1.15) return null;
      return {
        id:              "dec-treasury-budget-risk",
        type:            "recommendation",
        title:           "Reducir ritmo de inversión temporalmente",
        reason:          `El presupuesto se ejecuta a ${Math.round(ctx.finance.budgetVelocityRatio * 100)}% del ritmo planificado mientras la cobertura de caja está en ${ctx.finance.runwayDays} días. La convergencia de ambas condiciones representa riesgo financiero moderado.`,
        confidence:      88,
        affectedModules: ["planeacion", "tesoreria"],
        suggestedAction: "Revisar compromisos variables del período y ajustar ritmo",
        priority:        "elevated",
      };
    },
  },

  // ── RULE 3: Close blocked with high aging ──────────────────────────────────
  {
    id: "close-blocked-aging",
    evaluate: (ctx) => {
      if (!ctx.finance.blockedClose) return null;
      if (ctx.finance.closeBlockedDays < 7) return null;
      const isCritical = ctx.finance.closeBlockedDays >= 14;
      return {
        id:              "dec-close-blocked-aging",
        type:            "task",
        title:           isCritical
          ? "Desbloquear cierre financiero — situación crítica"
          : "Desbloquear cierre financiero — acción requerida",
        reason:          `El cierre financiero está bloqueado hace ${ctx.finance.closeBlockedDays} días por excepciones de conciliación sin resolver.`,
        confidence:      92,
        affectedModules: ["cierre", "conciliacion", "executive"],
        suggestedAction: "Resolver excepciones críticas en Conciliación antes del cierre",
        priority:        isCritical ? "critical" : "elevated",
      };
    },
  },

  // ── RULE 4: Critical reconciliation mass ───────────────────────────────────
  {
    id: "recon-mass-critical",
    evaluate: (ctx) => {
      if (ctx.finance.pendingConciliations < 5) return null;
      return {
        id:              "dec-recon-mass",
        type:            "alert",
        title:           "Conciliación requiere atención inmediata",
        reason:          `Hay ${ctx.finance.pendingConciliations} excepciones críticas abiertas en Conciliación. Acumulación mayor a 5 excepciones indica riesgo sistemático.`,
        confidence:      90,
        affectedModules: ["conciliacion", "cierre", "tesoreria"],
        suggestedAction: "Abrir Conciliación y priorizar excepciones por antigüedad",
        priority:        ctx.finance.pendingConciliations >= 10 ? "critical" : "elevated",
      };
    },
  },

  // ── RULE 5: Budget under-execution risk ────────────────────────────────────
  {
    id: "budget-under-execution",
    evaluate: (ctx) => {
      if (ctx.finance.budgetVelocityRatio >= 0.65) return null;
      return {
        id:              "dec-budget-under",
        type:            "projection",
        title:           "Riesgo de subejección presupuestal al cierre",
        reason:          `El ritmo de ejecución del presupuesto está al ${Math.round(ctx.finance.budgetVelocityRatio * 100)}% del plan. Si persiste, habrá una subejección significativa al cierre del período.`,
        confidence:      82,
        affectedModules: ["planeacion", "cierre"],
        suggestedAction: "Revisar compromisos pendientes y acelerar ejecución planificada",
        priority:        "normal",
      };
    },
  },

  // ── RULE 6: Multi-module degradation ───────────────────────────────────────
  {
    id: "multi-module-degradation",
    evaluate: (ctx) => {
      const totalRisks = ctx.tenant.activeCriticalSignals + ctx.tenant.activeWarnings;
      if (totalRisks < 3) return null;
      return {
        id:              "dec-multi-module",
        type:            "recommendation",
        title:           "Múltiples módulos en estado de riesgo",
        reason:          `Se detectaron ${ctx.tenant.activeCriticalSignals} señales críticas y ${ctx.tenant.activeWarnings} avisos activos simultáneos. La combinación indica presión sistémica en el ciclo operacional.`,
        confidence:      80,
        affectedModules: ctx.tenant.activeModules,
        suggestedAction: "Iniciar revisión desde Torre de Control para priorizar acciones",
        priority:        "elevated",
      };
    },
  },

];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluates all decision rules against the current operational context.
 * Returns decisions sorted by priority: critical → elevated → normal.
 */
export function computeDecisions(
  context:   OperationalContext,
  signals:   PrioritizedSignal[],
): CopilotDecision[] {
  const PRIORITY_ORDER = { critical: 0, elevated: 1, normal: 2 };

  return RULES
    .map(rule => rule.evaluate(context, signals))
    .filter((d): d is CopilotDecision => d !== null)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
