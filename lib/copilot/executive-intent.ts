/**
 * lib/copilot/executive-intent.ts
 *
 * Agentik Copilot — Executive Intent Engine V1
 *
 * Phases 1 + 2 of Sprint AGENTIK-COPILOT-EXECUTIVE-INTENT-01
 *
 * Converts signals + context into persistent executive intentions.
 * An intent is not a reaction — it is a sustained priority line that
 * the agent holds across sessions until resolved or escalated.
 *
 * Covered intent types (V1):
 *   1. protect_liquidity      — cartera, cobros, consignaciones, tesorería baja
 *   2. unblock_close          — conciliación o remisiones bloquean cierre
 *   3. recover_commercial     — ventas, marketing o pipeline débil
 *   4. maintain_stability     — tenant estable, seguimiento rutinario
 *   5. review_integrations    — runtime STALE / DEGRADED / SYNCING
 *
 * V1: deterministic, no DB, pure function evaluation.
 * V2: persist to CopilotIntentLog, track resolution events.
 */

import type { CopilotContextSnapshot }  from "./context-engine";
import type { CrossModuleInsight }       from "./cross-module-intelligence";
import type { ContextualRecommendation } from "./contextual-recommendation-engine";

// ── Intent types ──────────────────────────────────────────────────────────────

export type IntentStatus   = "active" | "watching" | "blocked" | "resolved" | "escalated";
export type IntentSeverity = "critical" | "elevated" | "normal";
export type IntentType =
  | "protect_liquidity"
  | "unblock_close"
  | "recover_commercial"
  | "maintain_stability"
  | "review_integrations";

export interface ExecutiveIntent {
  id:                      string;
  type:                    IntentType;
  orgSlug:                 string;
  agentId:                 string;
  module:                  string;         // Primary module this intent operates in
  title:                   string;         // Short: what the agent is doing
  objective:               string;         // 1 sentence: what needs to happen
  reason:                  string;         // Why this intent was created
  severity:                IntentSeverity;
  status:                  IntentStatus;
  startedAt:               Date;
  lastSeenAt:              Date;
  relatedSignals:          string[];       // Signal ruleIds that activated this intent
  relatedRecommendations:  string[];       // Recommendation IDs backing this intent
  suggestedActionIds:      string[];       // Execution registry action IDs
  successCriteria:         string;         // What "done" looks like
  escalationRule:          string;         // When to escalate to URGENT / BLOCKED
}

// ── Persona microcopy per intent type ─────────────────────────────────────────

const AGENT_INTENT_VERB: Record<string, Partial<Record<IntentType, string>>> = {
  diego: {
    protect_liquidity:   "mantiene prioridad: proteger liquidez",
    unblock_close:       "sostiene vigilancia sobre el cierre financiero",
    recover_commercial:  "mantiene seguimiento comercial",
    maintain_stability:  "sostiene operación estable",
    review_integrations: "vigila el estado de integraciones",
  },
  luca: {
    protect_liquidity:   "mantiene foco en liquidez operacional",
    unblock_close:       "acompaña el bloqueo de cierre",
    recover_commercial:  "activa oportunidad de campaña",
    maintain_stability:  "protege ritmo comercial",
    review_integrations: "monitorea conectividad de datos",
  },
  sofi: {
    protect_liquidity:   "vigila liquidez del ecommerce",
    unblock_close:       "sostiene revisión de cierre",
    recover_commercial:  "vigila experiencia web y conversión",
    maintain_stability:  "mantiene estabilidad ecommerce",
    review_integrations: "vigila estado de conectores Shopify",
  },
  mila: {
    protect_liquidity:   "mantiene seguimiento financiero",
    unblock_close:       "sostiene revisión de cierre",
    recover_commercial:  "protege oportunidad de venta",
    maintain_stability:  "mantiene seguimiento comercial",
    review_integrations: "monitorea estado operativo",
  },
};

function agentVerb(agentId: string, type: IntentType): string {
  return (
    AGENT_INTENT_VERB[agentId]?.[type] ??
    AGENT_INTENT_VERB["diego"]?.[type] ??
    "mantiene foco operacional"
  );
}

// ── Intent rule type ──────────────────────────────────────────────────────────

interface IntentRule {
  id:       IntentType;
  evaluate: (
    ctx:             CopilotContextSnapshot,
    insights:        CrossModuleInsight[],
    recommendations: ContextualRecommendation[],
  ) => ExecutiveIntent | null;
}

// ── Intent rules ──────────────────────────────────────────────────────────────

const INTENT_RULES: IntentRule[] = [

  // ── 1. Review integrations — fires first when runtime is degraded ───────────
  {
    id: "review_integrations",
    evaluate: (ctx) => {
      if (ctx.runtimeState !== "STALE" && ctx.runtimeState !== "DEGRADED" && ctx.runtimeState !== "SYNCING") {
        return null;
      }

      const severity: IntentSeverity = ctx.runtimeState === "DEGRADED" ? "elevated" : "normal";
      const now = new Date();

      return {
        id:                      `intent-integrations-${ctx.orgSlug}`,
        type:                    "review_integrations",
        orgSlug:                 ctx.orgSlug,
        agentId:                 ctx.activeAgentId,
        module:                  "integrations",
        title:                   `${ctx.activeAgentName} ${agentVerb(ctx.activeAgentId, "review_integrations")}`,
        objective:               "Restaurar sincronización de datos y verificar conectores activos.",
        reason:                  ctx.runtimeState === "DEGRADED"
          ? "El motor de señales está en estado degradado — los datos pueden ser imprecisos."
          : ctx.runtimeState === "SYNCING"
          ? "Las fuentes de datos están sincronizando — el contexto es parcial."
          : "Los datos están desactualizados — el sistema necesita re-sincronización.",
        severity,
        status:                  "watching",
        startedAt:               now,
        lastSeenAt:              now,
        relatedSignals:          [],
        relatedRecommendations:  [],
        suggestedActionIds:      ["review_integration_status"],
        successCriteria:         "Runtime vuelve a estado HEALTHY y todas las fuentes sincronizan.",
        escalationRule:          "Escalar si runtime permanece DEGRADED por más de 2 sesiones.",
      };
    },
  },

  // ── 2. Protect liquidity — cartera, cobros, tesorería ───────────────────────
  {
    id: "protect_liquidity",
    evaluate: (ctx, insights) => {
      const allSignals = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])];
      const hasTreasury = allSignals.some(s => s.ruleId === "treasury.low_coverage");
      const hasRecon    = allSignals.some(s => s.ruleId === "reconciliation.pending_critical");
      const hasBudget   = allSignals.some(s => s.ruleId === "budget.velocity_exceeded");

      const liquidityInsight = insights.find(i =>
        i.id === "treasury-recon-pressure" ||
        i.id === "treasury-standalone"     ||
        i.id === "budget-drains-treasury"
      );

      if (!hasTreasury && !liquidityInsight) return null;

      const severity: IntentSeverity =
        (hasTreasury && hasRecon) || (hasTreasury && hasBudget) ? "critical" :
        hasTreasury ? "elevated" : "normal";

      const now = new Date();

      return {
        id:                      `intent-liquidity-${ctx.orgSlug}`,
        type:                    "protect_liquidity",
        orgSlug:                 ctx.orgSlug,
        agentId:                 ctx.activeAgentId,
        module:                  "finanzas/tesoreria",
        title:                   `${ctx.activeAgentName} ${agentVerb(ctx.activeAgentId, "protect_liquidity")}`,
        objective:               "Reducir presión por cartera vencida y consignaciones pendientes.",
        reason:                  hasTreasury
          ? "La cobertura de caja está por debajo del umbral operacional."
          : "Señales cruzadas indican riesgo de liquidez inminente.",
        severity,
        status:                  severity === "critical" ? "active" : "watching",
        startedAt:               now,
        lastSeenAt:              now,
        relatedSignals:          allSignals
          .filter(s => ["treasury.low_coverage", "reconciliation.pending_critical"].includes(s.ruleId))
          .map(s => s.ruleId),
        relatedRecommendations:  liquidityInsight ? [liquidityInsight.id] : [],
        suggestedActionIds:      ["navigate_to_collections", "navigate_to_treasury"],
        successCriteria:         "Cartera vencida priorizada y conciliaciones críticas revisadas.",
        escalationRule:          "Escalar si cobertura baja de 7 días o cobros pendientes superan 30 días.",
      };
    },
  },

  // ── 3. Unblock financial close ───────────────────────────────────────────────
  {
    id: "unblock_close",
    evaluate: (ctx, insights) => {
      const allSignals = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])];
      const hasClose = allSignals.some(s => s.ruleId === "financial_close.blocked");
      const hasRecon = allSignals.some(s => s.ruleId === "reconciliation.pending_critical");

      const closeInsight = insights.find(i => i.id === "recon-blocks-close");

      if (!hasClose && !closeInsight) return null;

      const severity: IntentSeverity = (hasClose && hasRecon) ? "critical" : "elevated";
      const now = new Date();

      return {
        id:                      `intent-close-${ctx.orgSlug}`,
        type:                    "unblock_close",
        orgSlug:                 ctx.orgSlug,
        agentId:                 ctx.activeAgentId,
        module:                  "finanzas/cierre",
        title:                   `${ctx.activeAgentName} ${agentVerb(ctx.activeAgentId, "unblock_close")}`,
        objective:               "Resolver excepciones de conciliación que bloquean el cierre del período.",
        reason:                  hasRecon
          ? "Hay excepciones críticas abiertas en conciliación que impiden el cierre."
          : "El cierre financiero está bloqueado — requiere acción directa.",
        severity,
        status:                  "blocked",
        startedAt:               now,
        lastSeenAt:              now,
        relatedSignals:          allSignals
          .filter(s => ["financial_close.blocked", "reconciliation.pending_critical"].includes(s.ruleId))
          .map(s => s.ruleId),
        relatedRecommendations:  closeInsight ? [closeInsight.id] : [],
        suggestedActionIds:      ["navigate_to_reconciliation", "navigate_to_close"],
        successCriteria:         "Excepciones críticas resueltas y cierre del período ejecutado.",
        escalationRule:          "Escalar si el cierre permanece bloqueado por más de 3 días.",
      };
    },
  },

  // ── 4. Recover commercial rhythm ─────────────────────────────────────────────
  {
    id: "recover_commercial",
    evaluate: (ctx, _insights) => {
      const inCommercial =
        ctx.activeModule.startsWith("sales")     ||
        ctx.activeModule.startsWith("pipeline")  ||
        ctx.activeModule.startsWith("comercial") ||
        ctx.activeModule.startsWith("agentik");

      if (!inCommercial) return null;
      // Only fire when operational priority is not critical (finance takes precedence)
      if (ctx.operationalPriority === "critical") return null;

      const now = new Date();

      return {
        id:                      `intent-commercial-${ctx.orgSlug}`,
        type:                    "recover_commercial",
        orgSlug:                 ctx.orgSlug,
        agentId:                 ctx.activeAgentId,
        module:                  ctx.activeModule,
        title:                   `${ctx.activeAgentName} ${agentVerb(ctx.activeAgentId, "recover_commercial")}`,
        objective:               "Mantener ritmo de ventas y activar oportunidades de campaña.",
        reason:                  "El módulo comercial está activo — es el momento de proteger la velocidad comercial.",
        severity:                "normal",
        status:                  "watching",
        startedAt:               now,
        lastSeenAt:              now,
        relatedSignals:          [],
        relatedRecommendations:  [],
        suggestedActionIds:      ["navigate_to_marketing_studio"],
        successCriteria:         "Pipeline activo y al menos una campaña en ejecución.",
        escalationRule:          "Escalar si pipeline no avanza por 5 días o ventas caen >20%.",
      };
    },
  },

  // ── 5. Maintain stability — fallback when no critical intent fires ───────────
  {
    id: "maintain_stability",
    evaluate: (ctx) => {
      // Only fires when operational state is truly idle
      if (ctx.operationalPriority !== "idle") return null;
      if (ctx.runtimeState === "DEGRADED" || ctx.runtimeState === "STALE") return null;

      const now = new Date();

      return {
        id:                      `intent-stability-${ctx.orgSlug}`,
        type:                    "maintain_stability",
        orgSlug:                 ctx.orgSlug,
        agentId:                 ctx.activeAgentId,
        module:                  ctx.activeModule,
        title:                   `${ctx.activeAgentName} ${agentVerb(ctx.activeAgentId, "maintain_stability")}`,
        objective:               "Verificar que los módulos operativos continúen dentro de parámetros normales.",
        reason:                  "No hay señales activas — el seguimiento rutinario mantiene la operación estable.",
        severity:                "normal",
        status:                  "watching",
        startedAt:               now,
        lastSeenAt:              now,
        relatedSignals:          [],
        relatedRecommendations:  [],
        suggestedActionIds:      [],
        successCriteria:         "Todos los módulos reportan estado saludable al final del día.",
        escalationRule:          "Escalar si aparece cualquier señal crítica.",
      };
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes executive intents from the current context pipeline output.
 * Rules fire in priority order — highest-impact intents listed first.
 * Returns only non-null intents.
 */
export function computeExecutiveIntents(
  context:         CopilotContextSnapshot,
  insights:        CrossModuleInsight[],
  recommendations: ContextualRecommendation[],
): ExecutiveIntent[] {
  const SEVERITY_ORDER: Record<IntentSeverity, number> = {
    critical: 0, elevated: 1, normal: 2,
  };

  return INTENT_RULES
    .map(rule => rule.evaluate(context, insights, recommendations))
    .filter((i): i is ExecutiveIntent => i !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
