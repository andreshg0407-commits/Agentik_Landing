/**
 * lib/decisions/decision-registry.ts
 *
 * Agentik — Decision Rule Registry
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * All active decision rules for the initial domains.
 * Rules are pure — condition() has no side effects.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type { DecisionRule }    from "./decision-rules";
import type { DecisionContext } from "./decision-context";
import type { DecisionSignal }  from "./decision-signals";

// ── Helper guards ─────────────────────────────────────────────────────────────

function isSeverity(signal: DecisionSignal, ...levels: string[]): boolean {
  return levels.includes(signal.severity);
}

function isType(signal: DecisionSignal, ...types: string[]): boolean {
  return types.includes(signal.type);
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export const DECISION_RULES: DecisionRule[] = [

  // ── FINANCE ──────────────────────────────────────────────────────────────

  {
    id:                "R_FINANCE_01",
    domain:            "FINANCE",
    name:              "Conciliation exception — high severity",
    description:       "When a HIGH or CRITICAL conciliation exception is detected, request approval to resolve.",
    signalTypes:       ["conciliation_exception_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "conciliation_exception_detected") &&
      isSeverity(signal, "HIGH", "CRITICAL"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          100,
    isActive:          true,
    metadata: {
      navigationTarget:  "/finanzas/conciliacion",
      suggestedWorkflow: "FINANCE_RECONCILIATION_CHAIN",
    },
  },

  {
    id:                "R_FINANCE_02",
    domain:            "FINANCE",
    name:              "Conciliation exception — low severity",
    description:       "When a LOW or MEDIUM conciliation exception is detected, create a task for review.",
    signalTypes:       ["conciliation_exception_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "conciliation_exception_detected") &&
      isSeverity(signal, "LOW", "MEDIUM", "INFO"),
    recommendedAction: "CREATE_TASK",
    severity:          "MEDIUM",
    confidence:        "HIGH",
    requiresApproval:  false,
    canAutoExecute:    false,
    priority:          90,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/conciliacion",
    },
  },

  {
    id:                "R_FINANCE_03",
    domain:            "FINANCE",
    name:              "Cashflow risk — critical or high",
    description:       "When a cashflow risk is detected with HIGH or CRITICAL severity, request approval for action.",
    signalTypes:       ["cashflow_risk_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "cashflow_risk_detected") &&
      isSeverity(signal, "HIGH", "CRITICAL"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          95,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/tesoreria",
    },
  },

  {
    id:                "R_FINANCE_04",
    domain:            "FINANCE",
    name:              "Cashflow risk — medium or low",
    description:       "When a cashflow risk is detected at MEDIUM or lower severity, create a monitoring task.",
    signalTypes:       ["cashflow_risk_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "cashflow_risk_detected") &&
      isSeverity(signal, "LOW", "MEDIUM", "INFO"),
    recommendedAction: "CREATE_TASK",
    severity:          "MEDIUM",
    confidence:        "MEDIUM",
    requiresApproval:  false,
    canAutoExecute:    false,
    priority:          80,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/tesoreria",
    },
  },

  {
    id:                "R_FINANCE_05",
    domain:            "FINANCE",
    name:              "Bank reconciliation gap",
    description:       "When a gap in bank reconciliation is detected, request approval to investigate.",
    signalTypes:       ["bank_reconciliation_gap"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "bank_reconciliation_gap"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          85,
    isActive:          true,
    metadata: {
      navigationTarget:  "/finanzas/conciliacion",
      suggestedWorkflow: "FINANCE_RECONCILIATION_CHAIN",
    },
  },

  // ── COLLECTIONS ───────────────────────────────────────────────────────────

  {
    id:                "R_COLLECTIONS_01",
    domain:            "COLLECTIONS",
    name:              "Overdue customer — standard follow-up",
    description:       "Create a follow-up task when an overdue customer is detected.",
    signalTypes:       ["overdue_customer_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "overdue_customer_detected"),
    recommendedAction: "CREATE_TASK",
    severity:          "MEDIUM",
    confidence:        "HIGH",
    requiresApproval:  false,
    canAutoExecute:    false,
    priority:          80,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/torre-control/cobros-hoy",
    },
  },

  {
    id:                "R_COLLECTIONS_02",
    domain:            "COLLECTIONS",
    name:              "Overdue customer — high amount and long overdue",
    description:       "When overdue amount is high and days overdue exceed 60, request approval for payment plan.",
    signalTypes:       ["overdue_customer_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) => {
      if (!isType(signal, "overdue_customer_detected")) return false;
      const amount = signal.metrics?.monetaryAmount ?? 0;
      const days   = signal.metrics?.daysOverdue    ?? 0;
      return amount >= 50_000 && days >= 60;
    },
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          95,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/torre-control/cobros-hoy",
    },
  },

  {
    id:                "R_COLLECTIONS_03",
    domain:            "COLLECTIONS",
    name:              "Collection risk — escalation alert",
    description:       "Show an alert when a general collection risk is detected.",
    signalTypes:       ["collection_risk_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "collection_risk_detected"),
    recommendedAction: "SHOW_ALERT",
    severity:          "MEDIUM",
    confidence:        "MEDIUM",
    requiresApproval:  false,
    canAutoExecute:    true,
    priority:          70,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/torre-control/cobros-hoy",
    },
  },

  // ── COMMERCIAL ────────────────────────────────────────────────────────────

  {
    id:                "R_COMMERCIAL_01",
    domain:            "COMMERCIAL",
    name:              "Margin drop — high severity",
    description:       "Request approval when a significant commercial margin drop is detected.",
    signalTypes:       ["commercial_margin_drop_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "commercial_margin_drop_detected") &&
      isSeverity(signal, "HIGH", "CRITICAL"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          90,
    isActive:          true,
    metadata: {
      navigationTarget: "/comercial/inteligencia",
    },
  },

  {
    id:                "R_COMMERCIAL_02",
    domain:            "COMMERCIAL",
    name:              "Margin drop — medium or low severity",
    description:       "Create a monitoring task when a minor commercial margin drop is detected.",
    signalTypes:       ["commercial_margin_drop_detected"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "commercial_margin_drop_detected") &&
      isSeverity(signal, "LOW", "MEDIUM", "INFO"),
    recommendedAction: "CREATE_TASK",
    severity:          "MEDIUM",
    confidence:        "MEDIUM",
    requiresApproval:  false,
    canAutoExecute:    false,
    priority:          75,
    isActive:          true,
    metadata: {
      navigationTarget: "/comercial/inteligencia",
    },
  },

  // ── MARKETING ─────────────────────────────────────────────────────────────

  {
    id:                "R_MARKETING_01",
    domain:            "MARKETING",
    name:              "Campaign ready for approval",
    description:       "Request approval when a campaign has been prepared and is ready for publication.",
    signalTypes:       ["campaign_ready_for_approval"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "campaign_ready_for_approval"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "MEDIUM",
    confidence:        "VERY_HIGH",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          85,
    isActive:          true,
    metadata: {
      navigationTarget: "/agentik/marketing-studio/redes",
    },
  },

  // ── OPERATIONS ────────────────────────────────────────────────────────────

  {
    id:                "R_OPERATIONS_01",
    domain:            "OPERATIONS",
    name:              "Inventory transfer required — start workflow",
    description:       "Start an inventory transfer workflow when a transfer is required.",
    signalTypes:       ["inventory_transfer_required"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "inventory_transfer_required") &&
      isSeverity(signal, "HIGH", "CRITICAL"),
    recommendedAction: "START_WORKFLOW",
    severity:          "HIGH",
    confidence:        "HIGH",
    requiresApproval:  false,
    canAutoExecute:    false,
    priority:          90,
    isActive:          true,
    metadata: {
      navigationTarget: "/operaciones/inventario",
    },
  },

  {
    id:                "R_OPERATIONS_02",
    domain:            "OPERATIONS",
    name:              "Inventory transfer required — approval needed",
    description:       "Request approval for inventory transfer when severity is medium.",
    signalTypes:       ["inventory_transfer_required"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "inventory_transfer_required") &&
      isSeverity(signal, "LOW", "MEDIUM", "INFO"),
    recommendedAction: "REQUEST_APPROVAL",
    severity:          "MEDIUM",
    confidence:        "MEDIUM",
    requiresApproval:  true,
    canAutoExecute:    false,
    priority:          75,
    isActive:          true,
    metadata: {
      navigationTarget: "/operaciones/inventario",
    },
  },

  // ── SYSTEM ────────────────────────────────────────────────────────────────

  {
    id:                "R_SYSTEM_01",
    domain:            "SYSTEM",
    name:              "Tax deadline approaching",
    description:       "Show alert when a tax deadline is approaching.",
    signalTypes:       ["tax_deadline_approaching"],
    condition:         (_ctx: DecisionContext, signal: DecisionSignal) =>
      isType(signal, "tax_deadline_approaching"),
    recommendedAction: "SHOW_ALERT",
    severity:          "HIGH",
    confidence:        "VERY_HIGH",
    requiresApproval:  false,
    canAutoExecute:    true,
    priority:          95,
    isActive:          true,
    metadata: {
      navigationTarget: "/finanzas/cierre",
    },
  },

];

// ── Registry API ──────────────────────────────────────────────────────────────

/** All active rules ordered by priority descending. */
export function getActiveRules(): DecisionRule[] {
  return DECISION_RULES
    .filter(r => r.isActive)
    .sort((a, b) => b.priority - a.priority);
}

/** Rules matching a specific signal type. */
export function getRulesForSignalType(signalType: string): DecisionRule[] {
  return getActiveRules().filter(r =>
    r.signalTypes.length === 0 || r.signalTypes.includes(signalType),
  );
}

/** Rules for a specific domain. */
export function getRulesForDomain(domain: string): DecisionRule[] {
  return getActiveRules().filter(r => r.domain === domain);
}
