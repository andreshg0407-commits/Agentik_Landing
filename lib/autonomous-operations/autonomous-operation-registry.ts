/**
 * lib/autonomous-operations/autonomous-operation-registry.ts
 *
 * Agentik — Autonomous Operations Policy Registry
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Policy lookup and resolution helpers.
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AutonomousOperationMode,
  AutonomousOperationRiskLevel,
} from "./autonomous-operation-types";
import type { AutonomousOperationPolicy } from "./autonomous-operation-policy";
import { AUTONOMOUS_OPERATION_POLICIES }  from "./autonomous-operation-policy";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPoliciesByDomain(domain: string): AutonomousOperationPolicy[] {
  return AUTONOMOUS_OPERATION_POLICIES.filter(
    p => p.isActive && (p.domain === domain || p.domain === "*"),
  ).sort((a, b) => b.priority - a.priority);
}

export function getPolicyForAction(
  actionType: string,
  riskLevel:  AutonomousOperationRiskLevel,
  mode:       AutonomousOperationMode,
): AutonomousOperationPolicy | undefined {
  // Sort by priority descending — first match wins
  const candidates = AUTONOMOUS_OPERATION_POLICIES
    .filter(p => p.isActive)
    .sort((a, b) => b.priority - a.priority);

  for (const policy of candidates) {
    const actionMatch    = policy.actionType === "*" || policy.actionType === actionType;
    const riskMatch      = policy.riskLevel  === "*" || policy.riskLevel  === riskLevel;
    const modeMatch      = policy.mode       === "*" || policy.mode       === mode;
    if (actionMatch && riskMatch && modeMatch) return policy;
  }

  return undefined;
}

/**
 * Resolve the best policy for a given operation triple.
 * Falls back to the BLOCK policy if nothing matches.
 */
export function resolveOperationPolicy(
  actionType: string,
  riskLevel:  AutonomousOperationRiskLevel,
  mode:       AutonomousOperationMode,
): AutonomousOperationPolicy {
  const found = getPolicyForAction(actionType, riskLevel, mode);
  if (found) return found;

  // Should never happen — fallback policy always matches
  return {
    id:               "P_EMERGENCY_FALLBACK",
    name:             "Emergency fallback block",
    description:      "No policy matched — block for safety.",
    domain:           "*",
    actionType:       "*",
    riskLevel:        "*",
    mode:             "*",
    decision:         "BLOCK",
    requiresApproval: false,
    canAutoExecute:   false,
    priority:         -1,
    isActive:         true,
  };
}

/**
 * Returns true if this combination is considered critical and should
 * never be auto-executed regardless of policy.
 */
export function isCriticalOperation(
  actionType: string,
  riskLevel:  AutonomousOperationRiskLevel,
): boolean {
  if (riskLevel === "CRITICAL") return true;
  if (actionType === "START_WORKFLOW_DRAFT") return true;
  return false;
}

export { AUTONOMOUS_OPERATION_POLICIES };
