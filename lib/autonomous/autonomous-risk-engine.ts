/**
 * lib/autonomous/autonomous-risk-engine.ts
 *
 * Agentik — Autonomous Operations — Risk Engine
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Determines the risk level of an autonomous operation.
 *
 * Risk rules (based on intended action type):
 *   CREATE_APPROVAL → HIGH    (approval creation has financial/operational impact)
 *   START_WORKFLOW  → MEDIUM  (workflow execution has multi-step side effects)
 *   CREATE_TASK     → LOW     (task creation is read-like; low operational impact)
 *   CREATE_ALERT    → LOW     (alert creation is informational only)
 *
 * Risk is derived from:
 *   1. Explicit action hint in goal.metadata.autonomousAction (most precise)
 *   2. Agent capabilities (structural — which actions is this agent authorized for)
 *   3. Goal priority (escalation signal — critical goals always mean HIGH/CRITICAL)
 *
 * Kept decoupled for future AI-driven risk inference.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentDefinition } from "../agents/runtime/agent-types";
import type { AutonomousOperation, AutonomousRiskLevel, AutonomousDecision } from "./autonomous-types";
import { resolvePolicy } from "./autonomous-policy-engine";

// ── Action-to-risk map ────────────────────────────────────────────────────────

/**
 * Maps the intended autonomous action type to a base risk level.
 * Any action not listed here defaults to MEDIUM.
 */
const ACTION_RISK_MAP: Record<string, AutonomousRiskLevel> = {
  // High-impact: creates binding commitments
  CREATE_APPROVAL:    "HIGH",
  CREATE_APPROVAL_DRAFT: "HIGH",

  // Medium-impact: multi-step side effects
  START_WORKFLOW:     "MEDIUM",
  START_WORKFLOW_DRAFT: "MEDIUM",
  EXECUTE_ACTION:     "MEDIUM",

  // Low-impact: informational artifacts
  CREATE_TASK:        "LOW",
  CREATE_TASK_DRAFT:  "LOW",
  CREATE_ALERT:       "LOW",

  // Read-only: no side effects
  READ_FINANCE:       "LOW",
  READ_MARKETING:     "LOW",
  READ_COMMERCIAL:    "LOW",
  READ_COLLECTIONS:   "LOW",
};

// ── Priority escalation ───────────────────────────────────────────────────────

/**
 * A goal with "critical" priority always results in at least HIGH risk,
 * regardless of the action type. Never auto-execute critical urgency operations.
 */
function applyPriorityEscalation(
  base:     AutonomousRiskLevel,
  priority: string,
): AutonomousRiskLevel {
  if (priority === "critical") return "CRITICAL";
  if (priority === "high" && base === "LOW") return "MEDIUM";
  return base;
}

// ── Capability-based risk inference ──────────────────────────────────────────

/**
 * If no explicit action hint is provided, derive the HIGHEST risk from the
 * agent's authorized capabilities. Assumes the agent will use all its capabilities.
 */
function inferRiskFromCapabilities(agent: AgentDefinition): AutonomousRiskLevel {
  const caps = new Set(agent.capabilities);

  if (caps.has("CREATE_APPROVAL"))  return "HIGH";
  if (caps.has("START_WORKFLOW"))   return "MEDIUM";
  if (caps.has("CREATE_TASK"))      return "LOW";
  if (caps.has("CREATE_ALERT"))     return "LOW";

  return "MEDIUM"; // conservative default
}

// ── Risk evaluation ───────────────────────────────────────────────────────────

export interface RiskEvaluation {
  riskLevel:   AutonomousRiskLevel;
  derivedFrom: "action_hint" | "capabilities" | "priority_escalation";
  reason:      string;
}

/**
 * Evaluate the risk level for an autonomous operation.
 *
 * @param operation  The operation to evaluate.
 * @param agent      The resolved AgentDefinition that will execute the goal.
 * @returns RiskEvaluation with riskLevel, source, and human-readable reason.
 */
export function evaluateRisk(
  operation: AutonomousOperation,
  agent:     AgentDefinition,
): RiskEvaluation {
  const goal           = operation.goal;
  const actionHint     = goal.metadata?.autonomousAction as string | undefined;
  const priority       = goal.priority;

  // 1. Explicit action hint — most precise
  if (actionHint && actionHint in ACTION_RISK_MAP) {
    const base    = ACTION_RISK_MAP[actionHint]!;
    const escaped = applyPriorityEscalation(base, priority);
    return {
      riskLevel:   escaped,
      derivedFrom: escaped !== base ? "priority_escalation" : "action_hint",
      reason:      `Action "${actionHint}" maps to ${base} risk${escaped !== base ? `, escalated to ${escaped} by ${priority} priority` : ""}.`,
    };
  }

  // 2. Capability-based inference
  const capRisk   = inferRiskFromCapabilities(agent);
  const escaped   = applyPriorityEscalation(capRisk, priority);
  return {
    riskLevel:   escaped,
    derivedFrom: escaped !== capRisk ? "priority_escalation" : "capabilities",
    reason:      `Risk inferred from agent capabilities: ${capRisk}${escaped !== capRisk ? `, escalated to ${escaped} by ${priority} priority` : ""}.`,
  };
}

// ── Decision builder ──────────────────────────────────────────────────────────

/**
 * Evaluate risk and immediately resolve into an AutonomousDecision.
 * Combines risk engine + policy engine into one call.
 */
export function makeAutonomousDecision(
  operation: AutonomousOperation,
  agent:     AgentDefinition,
): AutonomousDecision {
  const risk       = evaluateRisk(operation, agent);
  const resolution = resolvePolicy(risk.riskLevel);

  return {
    allowed:          resolution.policy !== "MANUAL_ONLY",
    requiresApproval: resolution.policy === "APPROVAL_REQUIRED",
    reason:           `${risk.reason} → Policy: ${resolution.policy} (${resolution.reason})`,
    riskLevel:        risk.riskLevel,
    policy:           resolution.policy,
  };
}
