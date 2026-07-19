/**
 * lib/copilot/execution-registry.ts
 *
 * Agentik Copilot — Execution Registry V1
 *
 * Defines every action Copilot can execute, including:
 *  - which agent can execute it,
 *  - which module owns it,
 *  - risk level and confirmation requirements,
 *  - which V1 handler processes it.
 *
 * This is the source of truth for WHAT can be done.
 * The policy engine decides WHETHER it can be done right now.
 * The handler decides HOW it is executed.
 *
 * Sprint: AGENTIK-COPILOT-EXECUTION-LAYER-01
 */

// ── Core execution types ───────────────────────────────────────────────────────

export type ExecutionRisk =
  | "low"       // Read-only or navigational — no data impact
  | "medium"    // Creates drafts or prepares operations — reversible
  | "high"      // Triggers operations requiring explicit confirmation
  | "critical"; // Affects financial data, close, or budget — requires approval

export type ExecutionStatus =
  | "ready"                  // Can execute immediately
  | "requires_confirmation"  // Must show inline confirm before executing
  | "requires_approval"      // Must be approved by admin-level user
  | "blocked"                // Cannot execute now (reason provided)
  | "unsupported";           // Handler not yet implemented — show as future capability

export type ExecutionMode =
  | "navigate"          // Navigate to a module path (no side effects)
  | "prepare"           // Prepare / open contextual workspace
  | "create"            // Create a new draft entity
  | "simulate"          // Run a what-if projection (read-only)
  | "request_approval"  // Submit to human approval queue
  | "trigger_workflow"; // Trigger an external automation (future)

export type ExecutionHandlerKey =
  | "navigate_to_module"
  | "create_task_draft"
  | "create_budget_draft"
  | "create_projection_draft"
  | "open_reconciliation_context"
  | "prepare_follow_up"
  | "request_human_approval";

// ── Executable action contract ─────────────────────────────────────────────────

export interface CopilotExecutableAction {
  id:                   string;
  label:                string;
  description:          string;
  module:               string;         // Module path (e.g. "finanzas/planeacion")
  agentId:              string;         // Which agent owns this action
  mode:                 ExecutionMode;
  risk:                 ExecutionRisk;
  requiredRole?:        string[];       // Roles that can execute without approval
  requiresConfirmation: boolean;        // Show inline confirm before executing
  requiresApproval:     boolean;        // Needs admin approval
  reversible:           boolean;        // Can the action be undone?
  handlerKey:           ExecutionHandlerKey;
  targetPathSuffix?:    string;         // For navigate/prepare handlers
}

// ── Registry ───────────────────────────────────────────────────────────────────
//
// Action IDs mirror lib/copilot/actions.ts (same id = same chip in the rail).

const REGISTRY: CopilotExecutableAction[] = [

  // ── Budget: velocity_exceeded ─────────────────────────────────────────────
  {
    id:                   "budget-recalibrar",
    label:                "Recalibrar presupuesto",
    description:          "Abre el espacio de trabajo de planeación para revisar velocidad de ejecución",
    module:               "finanzas/planeacion",
    agentId:              "diego",
    mode:                 "prepare",
    risk:                 "medium",
    requiredRole:         ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN", "MANAGER"],
    requiresConfirmation: true,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "create_budget_draft",
    targetPathSuffix:     "/finanzas/planeacion",
  },
  {
    id:                   "budget-proyectar",
    label:                "Proyectar cierre",
    description:          "Genera una proyección de cierre basada en el ritmo actual de ejecución",
    module:               "finanzas/planeacion",
    agentId:              "diego",
    mode:                 "simulate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "create_projection_draft",
    targetPathSuffix:     "/finanzas/planeacion",
  },
  {
    id:                   "budget-reasignar",
    label:                "Reasignar fondos",
    description:          "Prepara una solicitud de reasignación presupuestal para aprobación",
    module:               "finanzas/planeacion",
    agentId:              "diego",
    mode:                 "request_approval",
    risk:                 "high",
    requiredRole:         ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN"],
    requiresConfirmation: true,
    requiresApproval:     true,
    reversible:           false,
    handlerKey:           "request_human_approval",
    targetPathSuffix:     "/finanzas/planeacion",
  },

  // ── Treasury: low_coverage ─────────────────────────────────────────────────
  {
    id:                   "treasury-cobranza",
    label:                "Abrir cobranza",
    description:          "Navega al módulo de cobros del día para gestión urgente",
    module:               "finanzas/tesoreria",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/cobros-hoy",
  },
  {
    id:                   "treasury-cxc",
    label:                "Ver cuentas por cobrar",
    description:          "Revisa el estado de cuentas por cobrar en tesorería",
    module:               "finanzas/tesoreria",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/tesoreria",
  },
  {
    id:                   "treasury-consignaciones",
    label:                "Revisar consignaciones",
    description:          "Revisa consignaciones bancarias pendientes de aplicar",
    module:               "finanzas/tesoreria",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/consignaciones",
  },

  // ── Financial close: blocked ───────────────────────────────────────────────
  {
    id:                   "close-conciliacion",
    label:                "Abrir conciliación",
    description:          "Navega al módulo de conciliación para resolver excepciones que bloquean el cierre",
    module:               "finanzas/cierre",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/conciliacion",
  },
  {
    id:                   "close-diferencias",
    label:                "Comparar diferencias",
    description:          "Abre el contexto de conciliación para comparar diferencias entre extracto y libro",
    module:               "finanzas/cierre",
    agentId:              "diego",
    mode:                 "prepare",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "open_reconciliation_context",
    targetPathSuffix:     "/finanzas/conciliacion",
  },
  {
    id:                   "close-extractos",
    label:                "Revisar extractos",
    description:          "Navega al centro documental para revisar extractos del período",
    module:               "finanzas/cierre",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/documentos",
  },

  // ── Reconciliation: pending_critical ──────────────────────────────────────
  {
    id:                   "recon-excepciones",
    label:                "Resolver excepciones",
    description:          "Prepara tarea de resolución de excepciones críticas en conciliación",
    module:               "finanzas/conciliacion",
    agentId:              "diego",
    mode:                 "create",
    risk:                 "medium",
    requiredRole:         ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN", "MANAGER", "OPERATOR"],
    requiresConfirmation: true,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "create_task_draft",
    targetPathSuffix:     "/finanzas/conciliacion",
  },
  {
    id:                   "recon-cobros",
    label:                "Validar cobros",
    description:          "Navega a cobros identificados para validación",
    module:               "finanzas/conciliacion",
    agentId:              "diego",
    mode:                 "navigate",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "navigate_to_module",
    targetPathSuffix:     "/finanzas/cobros-identificados",
  },
  {
    id:                   "recon-diferencias",
    label:                "Ver diferencias",
    description:          "Abre el contexto de análisis de diferencias en conciliación",
    module:               "finanzas/conciliacion",
    agentId:              "diego",
    mode:                 "prepare",
    risk:                 "low",
    requiresConfirmation: false,
    requiresApproval:     false,
    reversible:           true,
    handlerKey:           "open_reconciliation_context",
    targetPathSuffix:     "/finanzas/conciliacion",
  },
];

// ── Registry index ─────────────────────────────────────────────────────────────

const REGISTRY_INDEX = new Map<string, CopilotExecutableAction>(
  REGISTRY.map(a => [a.id, a]),
);

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the full executable action definition for a given action ID.
 * Returns null if the action is not registered (treat as "unsupported").
 */
export function getExecutableAction(actionId: string): CopilotExecutableAction | null {
  return REGISTRY_INDEX.get(actionId) ?? null;
}

/**
 * Returns all registered actions for a given module.
 */
export function getActionsForModule(module: string): CopilotExecutableAction[] {
  return REGISTRY.filter(a => a.module === module || module.startsWith(a.module));
}

/**
 * Returns all actions an agent owns.
 */
export function getAgentActions(agentId: string): CopilotExecutableAction[] {
  return REGISTRY.filter(a => a.agentId === agentId);
}
