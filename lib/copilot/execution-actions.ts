/**
 * lib/copilot/execution-actions.ts
 *
 * Agentik Copilot — Execution Action Contracts V3
 *
 * Phase 1 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * Defines the formal contract for each controlled execution action.
 * Only safe, supervised, governed, and reversible actions in V3.
 *
 * V3: action lifecycle real — no external side effects yet.
 * V4: actions will write to Prisma, trigger n8n workflows, send notifications.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExecutionActionType =
  | "refresh_runtime"         // Refresh SAG runtime state / signal engine
  | "request_review"          // Request human review for a module or operation
  | "prepare_report"          // Prepare a financial or operational report draft
  | "validate_sync"           // Validate connector sync state
  | "trigger_followup"        // Trigger commercial or operational follow-up
  | "prepare_campaign"        // Prepare a marketing campaign draft
  | "request_reconciliation"  // Request reconciliation review
  | "generate_summary";       // Generate an executive or operational summary

export type ExecutionActionMode = "draft" | "supervised";

export type ExecutionActionRisk = "low" | "medium" | "high";

export interface ExecutionActionContract {
  id:                string;
  type:              ExecutionActionType;
  title:             string;
  description:       string;           // What this action does operationally
  sourceAgentId:     string;           // Agent that owns/initiates this action
  targetModule:      string;           // Module where execution happens
  executionMode:     ExecutionActionMode;
  requiresApproval:  boolean;
  rollbackSupported: boolean;
  estimatedRisk:     ExecutionActionRisk;
  executionHandler:  string;           // Key into handler dispatch map (V3 handlers)
  auditCategory:     string;           // Audit category for compliance trail
}

// ── Action catalog (V3 — controlled ops only) ─────────────────────────────────

const ACTION_CATALOG: ExecutionActionContract[] = [

  {
    id:                "act-refresh-runtime",
    type:              "refresh_runtime",
    title:             "Actualizar estado del runtime",
    description:       "Solicita una evaluación de señales y actualización del estado SAG",
    sourceAgentId:     "sofi",
    targetModule:      "integrations",
    executionMode:     "supervised",
    requiresApproval:  false,
    rollbackSupported: true,
    estimatedRisk:     "low",
    executionHandler:  "refresh_runtime",
    auditCategory:     "runtime_ops",
  },

  {
    id:                "act-request-review",
    type:              "request_review",
    title:             "Solicitar revisión operativa",
    description:       "Envía una solicitud de revisión humana para el módulo activo",
    sourceAgentId:     "diego",
    targetModule:      "executive",
    executionMode:     "supervised",
    requiresApproval:  true,
    rollbackSupported: true,
    estimatedRisk:     "low",
    executionHandler:  "request_review",
    auditCategory:     "review_ops",
  },

  {
    id:                "act-prepare-report",
    type:              "prepare_report",
    title:             "Preparar informe ejecutivo",
    description:       "Genera un borrador de informe financiero u operativo para revisión",
    sourceAgentId:     "diego",
    targetModule:      "finanzas",
    executionMode:     "draft",
    requiresApproval:  false,
    rollbackSupported: true,
    estimatedRisk:     "low",
    executionHandler:  "generate_summary",
    auditCategory:     "reporting_ops",
  },

  {
    id:                "act-validate-sync",
    type:              "validate_sync",
    title:             "Validar sincronización SAG",
    description:       "Verifica la salud y disponibilidad de los conectores activos",
    sourceAgentId:     "sofi",
    targetModule:      "integrations",
    executionMode:     "supervised",
    requiresApproval:  false,
    rollbackSupported: true,
    estimatedRisk:     "low",
    executionHandler:  "validate_sync",
    auditCategory:     "sync_ops",
  },

  {
    id:                "act-trigger-followup",
    type:              "trigger_followup",
    title:             "Activar seguimiento comercial",
    description:       "Activa seguimiento de Mila para cartera o pipeline con baja actividad",
    sourceAgentId:     "mila",
    targetModule:      "collections",
    executionMode:     "supervised",
    requiresApproval:  true,
    rollbackSupported: false,
    estimatedRisk:     "medium",
    executionHandler:  "trigger_followup",
    auditCategory:     "commercial_ops",
  },

  {
    id:                "act-prepare-campaign",
    type:              "prepare_campaign",
    title:             "Preparar campaña de marketing",
    description:       "Genera el borrador de una campaña multicanal para revisión de Luca",
    sourceAgentId:     "luca",
    targetModule:      "agentik/marketing-studio",
    executionMode:     "draft",
    requiresApproval:  true,
    rollbackSupported: true,
    estimatedRisk:     "medium",
    executionHandler:  "generate_summary",
    auditCategory:     "marketing_ops",
  },

  {
    id:                "act-request-reconciliation",
    type:              "request_reconciliation",
    title:             "Solicitar conciliación",
    description:       "Solicita una sesión de conciliación para excepciones detectadas",
    sourceAgentId:     "diego",
    targetModule:      "finanzas/conciliacion",
    executionMode:     "supervised",
    requiresApproval:  true,
    rollbackSupported: false,
    estimatedRisk:     "medium",
    executionHandler:  "request_review",
    auditCategory:     "reconciliation_ops",
  },

  {
    id:                "act-generate-summary",
    type:              "generate_summary",
    title:             "Generar resumen ejecutivo",
    description:       "Produce un resumen consolidado de la sesión operativa actual",
    sourceAgentId:     "diego",
    targetModule:      "executive",
    executionMode:     "draft",
    requiresApproval:  false,
    rollbackSupported: true,
    estimatedRisk:     "low",
    executionHandler:  "generate_summary",
    auditCategory:     "reporting_ops",
  },
];

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Builds a concrete execution action from the catalog, optionally overriding fields.
 */
export function buildExecutionAction(
  type:       ExecutionActionType,
  overrides?: Partial<Pick<ExecutionActionContract, "sourceAgentId" | "targetModule">>,
): ExecutionActionContract | null {
  const base = ACTION_CATALOG.find(a => a.type === type);
  if (!base) return null;
  return {
    ...base,
    ...overrides,
    id: `${base.id}-${crypto.randomUUID().slice(0, 8)}`,
  };
}

/**
 * Returns all actions for a given agent, filtered by supported execution modes.
 */
export function getActionsForAgent(
  agentId:      string,
  allowedModes: ExecutionActionMode[] = ["draft", "supervised"],
): ExecutionActionContract[] {
  return ACTION_CATALOG.filter(
    a => a.sourceAgentId === agentId && allowedModes.includes(a.executionMode)
  );
}

/**
 * Returns the primary action for the current operational context.
 * Prioritizes supervised actions, then drafts; lower risk first.
 */
export function getPrimaryExecutionAction(
  agentId:  string,
  module:   string,
  riskCap:  ExecutionActionRisk = "medium",
): ExecutionActionContract | null {
  const RISK_SCORE: Record<ExecutionActionRisk, number> = { low: 1, medium: 2, high: 3 };
  const maxRisk = RISK_SCORE[riskCap];

  const candidates = ACTION_CATALOG.filter(
    a =>
      a.sourceAgentId === agentId &&
      (a.targetModule === module || module.startsWith(a.targetModule)) &&
      RISK_SCORE[a.estimatedRisk] <= maxRisk
  );

  if (candidates.length === 0) {
    // Fall back to any action for this agent
    return ACTION_CATALOG.find(
      a => a.sourceAgentId === agentId && RISK_SCORE[a.estimatedRisk] <= maxRisk
    ) ?? null;
  }

  // Sort: supervised > draft, low risk > medium
  return candidates.sort((a, b) => {
    const modeScore = (x: ExecutionActionContract) =>
      x.executionMode === "supervised" ? 2 : 1;
    return (
      modeScore(b) - modeScore(a) ||
      RISK_SCORE[a.estimatedRisk] - RISK_SCORE[b.estimatedRisk]
    );
  })[0] ?? null;
}

/**
 * Returns a 1-line summary of the action for UI display.
 */
export function summarizeExecutionAction(action: ExecutionActionContract): string {
  const modeLabel = action.executionMode === "supervised" ? "supervisada" : "borrador";
  return `${action.title} — modo ${modeLabel} · riesgo ${action.estimatedRisk}`;
}

/**
 * Validates that an action contract is safe to execute under current conditions.
 * Returns { valid, reason }.
 */
export function validateExecutionAction(
  action:      ExecutionActionContract,
  runtimeState: string,
  riskCap:     ExecutionActionRisk = "high",
): { valid: boolean; reason: string } {
  const RISK_SCORE: Record<ExecutionActionRisk, number> = { low: 1, medium: 2, high: 3 };

  if (RISK_SCORE[action.estimatedRisk] > RISK_SCORE[riskCap]) {
    return { valid: false, reason: `Riesgo ${action.estimatedRisk} excede el límite permitido (${riskCap})` };
  }

  if (runtimeState === "DEGRADED" && action.executionMode !== "supervised") {
    return { valid: false, reason: "Runtime degradado — solo modo supervisado permitido" };
  }

  if (action.estimatedRisk === "high" && !action.requiresApproval) {
    return { valid: false, reason: "Acciones de riesgo alto requieren aprobación humana" };
  }

  return { valid: true, reason: `Acción válida para ejecución ${action.executionMode}` };
}
