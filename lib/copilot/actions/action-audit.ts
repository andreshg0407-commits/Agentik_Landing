/**
 * lib/copilot/actions/action-audit.ts
 *
 * Agentik Copilot — Action Registry Audit
 * Sprint: AGENTIK-COPILOT-ACTION-SYSTEM-01
 *
 * Validates the integrity of the action registry.
 * Returns a structured audit report — no side effects.
 *
 * Rules enforced:
 *   - every action has label, description, risk, status
 *   - no high-risk action is missing requiresConfirmation
 *   - no action with mode "live" exists in the registry
 */

import type { CopilotActionDefinition, CopilotActionKind } from "./action-types";
import { getAllActionDefinitions }                           from "./action-registry";
import { isWorkBackedAction }                               from "./action-executor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionAuditViolation {
  actionId: string;
  rule:     string;
  message:  string;
}

export interface ActionAuditReport {
  passed:     boolean;
  checkedAt:  string;
  totalCount: number;
  violations: ActionAuditViolation[];
  summary:    string;
}

// ── Audit rules ───────────────────────────────────────────────────────────────

function checkRequired(def: CopilotActionDefinition): ActionAuditViolation[] {
  const violations: ActionAuditViolation[] = [];

  if (!def.label || def.label.trim() === "") {
    violations.push({ actionId: def.id, rule: "has_label", message: "Missing label." });
  }
  if (!def.description || def.description.trim() === "") {
    violations.push({ actionId: def.id, rule: "has_description", message: "Missing description." });
  }
  if (!def.risk) {
    violations.push({ actionId: def.id, rule: "has_risk", message: "Missing risk level." });
  }
  if (!def.status) {
    violations.push({ actionId: def.id, rule: "has_status", message: "Missing status." });
  }

  return violations;
}

function checkHighRiskConfirmation(def: CopilotActionDefinition): ActionAuditViolation[] {
  if (def.risk === "high" && !def.requiresConfirmation) {
    return [{
      actionId: def.id,
      rule:     "high_risk_requires_confirmation",
      message:  "High-risk action must have requiresConfirmation = true.",
    }];
  }
  return [];
}

function checkNoLiveMode(def: CopilotActionDefinition): ActionAuditViolation[] {
  if (def.availableModes.includes("live") && def.defaultMode === "live") {
    return [{
      actionId: def.id,
      rule:     "no_live_mode_active",
      message:  "No action should have defaultMode = 'live' in this sprint.",
    }];
  }
  return [];
}

function checkCreateTaskSupportsPreview(def: CopilotActionDefinition): ActionAuditViolation[] {
  if (def.kind !== "CREATE_TASK") return [];
  if (!def.availableModes.includes("preview")) {
    return [{
      actionId: def.id,
      rule:     "create_task_supports_preview",
      message:  "CREATE_TASK must include 'preview' in availableModes (persistence sprint).",
    }];
  }
  if (def.defaultMode === "live") {
    return [{
      actionId: def.id,
      rule:     "create_task_default_not_live",
      message:  "CREATE_TASK defaultMode must not be 'live'.",
    }];
  }
  return [];
}

/**
 * Rule: work-backed actions must have "stub" in availableModes.
 * OPEN_MODULE is exempt — it is navigation-only.
 */
function checkWorkBackedHasStubMode(def: CopilotActionDefinition): ActionAuditViolation[] {
  if (!isWorkBackedAction(def.kind)) return [];
  if (!def.availableModes.includes("stub")) {
    return [{
      actionId: def.id,
      rule:     "work_backed_has_stub_mode",
      message:  `Work-backed action ${def.kind} must include 'stub' in availableModes.`,
    }];
  }
  return [];
}

/**
 * Rule: OPEN_MODULE must NOT be work-backed (it is navigation-only).
 */
function checkOpenModuleNotWorkBacked(def: CopilotActionDefinition): ActionAuditViolation[] {
  if (def.kind !== "OPEN_MODULE") return [];
  if (isWorkBackedAction(def.kind as CopilotActionKind)) {
    return [{
      actionId: def.id,
      rule:     "open_module_not_work_backed",
      message:  "OPEN_MODULE must not be in the work-backed action set.",
    }];
  }
  return [];
}

/**
 * Rule: REQUEST_APPROVAL and RUN_WORKFLOW must either require confirmation
 * or be gated as coming_soon / disabled.
 */
function checkHighImpactActionsGated(def: CopilotActionDefinition): ActionAuditViolation[] {
  const HIGH_IMPACT: CopilotActionKind[] = ["REQUEST_APPROVAL", "RUN_WORKFLOW"];
  if (!HIGH_IMPACT.includes(def.kind)) return [];

  const isGated =
    def.requiresConfirmation ||
    def.status === "coming_soon" ||
    def.status === "disabled";

  if (!isGated) {
    return [{
      actionId: def.id,
      rule:     "high_impact_action_gated",
      message:  `${def.kind} must require confirmation or be coming_soon/disabled.`,
    }];
  }
  return [];
}

// ── Audit runner ──────────────────────────────────────────────────────────────

export function auditCopilotActions(): ActionAuditReport {
  const definitions = getAllActionDefinitions();
  const allViolations: ActionAuditViolation[] = [];

  for (const def of definitions) {
    allViolations.push(
      ...checkRequired(def),
      ...checkHighRiskConfirmation(def),
      ...checkNoLiveMode(def),
      ...checkCreateTaskSupportsPreview(def),
      ...checkWorkBackedHasStubMode(def),
      ...checkOpenModuleNotWorkBacked(def),
      ...checkHighImpactActionsGated(def),
    );
  }

  const passed = allViolations.length === 0;

  return {
    passed,
    checkedAt:  new Date().toISOString(),
    totalCount: definitions.length,
    violations: allViolations,
    summary:    passed
      ? `All ${definitions.length} actions passed audit.`
      : `${allViolations.length} violation(s) found across ${definitions.length} actions.`,
  };
}
