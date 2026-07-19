/**
 * lib/copilot/actions.ts
 *
 * Agentik Copilot — Operational Actions Registry V1
 *
 * Centralized registry of contextual actions Copilot can suggest based on
 * active signals, module context, and operational state.
 *
 * Design principles:
 * - No action logic inside UI components — everything lives here
 * - Fully serializable output (no functions, no Date objects)
 * - V1 execution: "instant" (navigate only)
 * - Architecture is ready for "modal" | "flow" in future sprints
 *
 * Sprint: AGENTIK-COPILOT-OPERATIONS-01
 */

import type { CopilotSignal, CopilotSignalId, SignalSeverity } from "./types";

// ── Action types ──────────────────────────────────────────────────────────────

export type CopilotActionType =
  | "navigate"   // Navigate to a specific module or workspace
  | "create"     // Create a new record or entity
  | "simulate"   // Run a simulation or projection
  | "review"     // Open a review workspace
  | "approve"    // Approve a pending operation
  | "analyze";   // Deep analysis view

export type CopilotExecutionMode =
  | "instant"    // Immediate — navigate to URL (V1)
  | "modal"      // Opens a contextual in-rail modal (future)
  | "flow"       // Multi-step guided flow (future)
  | "external";  // External system (future)

export type CopilotActionPriority = "critical" | "elevated" | "normal";
export type CopilotActionColor    = "blue" | "amber" | "red" | "green";

// ── Internal action definition (NOT exported to client) ───────────────────────

interface ActionDef {
  id:            string;
  label:         string;
  type:          CopilotActionType;
  mode:          CopilotExecutionMode;
  priority:      CopilotActionPriority;
  color:         CopilotActionColor;
  pathSuffix:    string;           // e.g. "/finanzas/planeacion" — prepend /${orgSlug}
  forSeverity?:  SignalSeverity[]; // If defined, only surface for these severities
}

// ── Resolved action (fully serializable — safe to pass as RSC props) ─────────

export interface ResolvedCopilotAction {
  id:       string;
  label:    string;
  type:     CopilotActionType;
  mode:     CopilotExecutionMode;
  priority: CopilotActionPriority;
  color:    CopilotActionColor;
  href:     string;  // Full resolved URL (orgSlug substituted)
}

// ── Signal action registry ────────────────────────────────────────────────────

const SIGNAL_ACTIONS: Record<CopilotSignalId, ActionDef[]> = {

  "budget.velocity_exceeded": [
    {
      id:         "budget-recalibrar",
      label:      "Recalibrar presupuesto",
      type:       "review",
      mode:       "instant",
      priority:   "elevated",
      color:      "blue",
      pathSuffix: "/finanzas/planeacion",
    },
    {
      id:         "budget-proyectar",
      label:      "Proyectar cierre",
      type:       "simulate",
      mode:       "instant",
      priority:   "normal",
      color:      "blue",
      pathSuffix: "/finanzas/planeacion",
    },
    {
      id:         "budget-reasignar",
      label:      "Reasignar fondos",
      type:       "create",
      mode:       "instant",
      priority:   "critical",
      color:      "amber",
      pathSuffix: "/finanzas/planeacion",
      forSeverity: ["critica", "elevada"],
    },
  ],

  "treasury.low_coverage": [
    {
      id:         "treasury-cobranza",
      label:      "Abrir cobranza",
      type:       "navigate",
      mode:       "instant",
      priority:   "critical",
      color:      "red",
      pathSuffix: "/finanzas/cobros-hoy",
      forSeverity: ["critica"],
    },
    {
      id:         "treasury-cxc",
      label:      "Ver cuentas por cobrar",
      type:       "review",
      mode:       "instant",
      priority:   "elevated",
      color:      "amber",
      pathSuffix: "/finanzas/tesoreria",
    },
    {
      id:         "treasury-consignaciones",
      label:      "Revisar consignaciones",
      type:       "review",
      mode:       "instant",
      priority:   "normal",
      color:      "blue",
      pathSuffix: "/finanzas/consignaciones",
    },
  ],

  "financial_close.blocked": [
    {
      id:         "close-conciliacion",
      label:      "Abrir conciliación",
      type:       "navigate",
      mode:       "instant",
      priority:   "critical",
      color:      "red",
      pathSuffix: "/finanzas/conciliacion",
    },
    {
      id:         "close-diferencias",
      label:      "Comparar diferencias",
      type:       "review",
      mode:       "instant",
      priority:   "elevated",
      color:      "amber",
      pathSuffix: "/finanzas/conciliacion",
    },
    {
      id:         "close-extractos",
      label:      "Revisar extractos",
      type:       "review",
      mode:       "instant",
      priority:   "normal",
      color:      "blue",
      pathSuffix: "/finanzas/documentos",
    },
  ],

  "reconciliation.pending_critical": [
    {
      id:         "recon-excepciones",
      label:      "Resolver excepciones",
      type:       "review",
      mode:       "instant",
      priority:   "critical",
      color:      "red",
      pathSuffix: "/finanzas/conciliacion",
      forSeverity: ["critica", "elevada"],
    },
    {
      id:         "recon-cobros",
      label:      "Validar cobros",
      type:       "review",
      mode:       "instant",
      priority:   "elevated",
      color:      "amber",
      pathSuffix: "/finanzas/cobros-identificados",
    },
    {
      id:         "recon-diferencias",
      label:      "Ver diferencias",
      type:       "analyze",
      mode:       "instant",
      priority:   "normal",
      color:      "blue",
      pathSuffix: "/finanzas/conciliacion",
    },
  ],
};

// ── Context engine ────────────────────────────────────────────────────────────

/**
 * Returns the best contextual actions for an active signal.
 *
 * Logic:
 * 1. Look up the signal's ruleId in SIGNAL_ACTIONS
 * 2. Filter by severity constraint (forSeverity)
 * 3. Limit to 3 max
 * 4. Resolve full href with orgSlug
 */
export function getActionsForSignal(
  signal:    CopilotSignal,
  _pathname: string,
  orgSlug:   string,
): ResolvedCopilotAction[] {
  const defs = SIGNAL_ACTIONS[signal.ruleId] ?? [];

  return defs
    .filter(a => !a.forSeverity || a.forSeverity.includes(signal.severity))
    .slice(0, 3)
    .map(a => ({
      id:       a.id,
      label:    a.label,
      type:     a.type,
      mode:     a.mode,
      priority: a.priority,
      color:    a.color,
      href:     `/${orgSlug}${a.pathSuffix}`,
    }));
}
