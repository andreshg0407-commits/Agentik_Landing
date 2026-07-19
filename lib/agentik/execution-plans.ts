/**
 * lib/agentik/execution-plans.ts
 *
 * Agentik Copilot — multi-step execution plan registry.
 *
 * Plans are ordered sequences of action-registry keys (moduleId.actionType)
 * that orchestrate cross-module workflows through specialist agents.
 *
 * Step contract:
 *   registryKey  — matches a key in REGISTRY (action-registry.ts)
 *   label        — displayed in the UI chain progress tracker
 *   specialist   — routing label shown next to the step result
 *   failSoft     — true: failure falls back to ActionTask, chain continues
 *                  false: failure stops the chain at that point
 *
 * Registered plans (Sprint 4 — hardened):
 *   "sales.execute" → collections_risk_response
 *     All 3 steps backed by real validated executors (sales.delegate,
 *     alerts.escalate, reports.execute). Safe to run.
 *
 * Removed plans:
 *   "executive.execute" → out_of_stock_response (Sprint 3)
 *     All steps were stubs (Shopify / Luca / WhatsApp). Removed in Sprint 4
 *     hardening pass — speculative chains must not be presented as real execution.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainPlanStep {
  registryKey: string;   // "moduleId.actionType" — must exist in REGISTRY
  label:       string;   // UI display label for this step
  specialist:  string;   // Agent routing label shown in progress tracker
  failSoft:    boolean;  // true = degrade to ActionTask on failure and continue
}

export interface ChainPlan {
  planKey:     string;
  planLabel:   string;
  description: string;
  steps:       ChainPlanStep[];
}

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLAN_REGISTRY: Record<string, ChainPlan> = {

  /**
   * Triggered by: sales.execute
   * Cross-module response to collections risk:
   *   1. Identify highest-balance overdue customer → cobranza task
   *   2. Escalate most critical open alert → gerencia
   *   3. Share latest report with stakeholders
   */
  "sales.execute": {
    planKey:     "collections_risk_response",
    planLabel:   "Respuesta de Riesgo de Cartera",
    description: "Flujo multi-agente: cobranza prioritaria → escalación → informe ejecutivo",
    steps: [
      {
        registryKey: "sales.delegate",
        label:       "Cobranza prioritaria",
        specialist:  "Mila",
        failSoft:    true,
      },
      {
        registryKey: "alerts.escalate",
        label:       "Escalación a gerencia",
        specialist:  "Alertas",
        failSoft:    true,
      },
      {
        registryKey: "reports.execute",
        label:       "Informe ejecutivo",
        specialist:  "Reportes",
        failSoft:    true,
      },
    ],
  },

};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns the ChainPlan registered for the given registry key, or null
 * if the key maps to a single executor (or no executor at all).
 */
export function resolveChainPlan(registryKey: string): ChainPlan | null {
  return PLAN_REGISTRY[registryKey] ?? null;
}
