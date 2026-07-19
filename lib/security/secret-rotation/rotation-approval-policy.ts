/**
 * lib/security/secret-rotation/rotation-approval-policy.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Approval Policy — Approval Gate Rules
 *
 * Defines approval requirements per risk level:
 *   - LOW:      auto-permitted (no approval needed)
 *   - MEDIUM:   single approval required
 *   - HIGH:     single approval required
 *   - CRITICAL: double approval required (two distinct approvers)
 *
 * Emergency rotations bypass approval gates.
 *
 * No server-only. No Prisma. Pure domain logic.
 */

import type { RotationRiskLevel, RotationStrategy } from "./rotation-types";
import type { RotationRegistryEntry } from "./rotation-registry";

// ── Approval Requirement ──────────────────────────────────────────────────────

export type ApprovalRequirement =
  | "NONE"          // auto-permitted
  | "SINGLE"        // one approver required
  | "DOUBLE"        // two distinct approvers required
  | "EMERGENCY";    // emergency bypass (logged but not blocked)

// ── Approval Decision ─────────────────────────────────────────────────────────

export interface ApprovalDecision {
  /** What approval is required. */
  requirement:      ApprovalRequirement;
  /** Whether the rotation can proceed without waiting. */
  canProceedNow:    boolean;
  /** Whether approval is currently satisfied. */
  isApproved:       boolean;
  /** Number of approvals currently collected. */
  approvalsCollected: number;
  /** Number of approvals needed. */
  approvalsNeeded:  number;
  /** Approver user IDs collected so far. */
  approvers:        string[];
  /** Reason for the requirement. */
  reason:           string;
}

// ── Policy Rules ──────────────────────────────────────────────────────────────

/**
 * getApprovalRequirement — determine what approval is needed for a rotation.
 */
export function getApprovalRequirement(params: {
  riskLevel:  RotationRiskLevel;
  strategy:   RotationStrategy;
  entry:      RotationRegistryEntry;
}): ApprovalRequirement {
  const { riskLevel, strategy, entry } = params;

  // Emergency always bypasses approval
  if (strategy === "EMERGENCY") return "EMERGENCY";

  // Use entry's own policy if it requires double approval
  if (entry.requiresDoubleApproval) return "DOUBLE";

  // Risk-level based fallback
  switch (riskLevel) {
    case "LOW":      return "NONE";
    case "MEDIUM":   return entry.requiresApproval ? "SINGLE" : "NONE";
    case "HIGH":     return "SINGLE";
    case "CRITICAL": return "DOUBLE";
    default:         return "SINGLE"; // fail-closed
  }
}

/**
 * evaluateApproval — check whether approval requirements are currently satisfied.
 */
export function evaluateApproval(params: {
  requirement:    ApprovalRequirement;
  strategy:       RotationStrategy;
  approvers:      string[];
  requestedBy:    string;
}): ApprovalDecision {
  const { requirement, strategy, approvers, requestedBy } = params;

  // Filter out the requester from approvers (cannot self-approve)
  const validApprovers = approvers.filter(a => a !== requestedBy);

  // Emergency bypass
  if (requirement === "EMERGENCY" || strategy === "EMERGENCY") {
    return {
      requirement:        "EMERGENCY",
      canProceedNow:      true,
      isApproved:         true,
      approvalsCollected: 0,
      approvalsNeeded:    0,
      approvers:          validApprovers,
      reason:             "emergency_bypass_approved",
    };
  }

  // No approval needed
  if (requirement === "NONE") {
    return {
      requirement:        "NONE",
      canProceedNow:      true,
      isApproved:         true,
      approvalsCollected: 0,
      approvalsNeeded:    0,
      approvers:          [],
      reason:             "auto_approved_low_risk",
    };
  }

  // Single approval
  if (requirement === "SINGLE") {
    const isApproved = validApprovers.length >= 1;
    return {
      requirement:        "SINGLE",
      canProceedNow:      isApproved,
      isApproved,
      approvalsCollected: validApprovers.length,
      approvalsNeeded:    1,
      approvers:          validApprovers,
      reason:             isApproved ? "single_approval_satisfied" : "awaiting_single_approval",
    };
  }

  // Double approval
  if (requirement === "DOUBLE") {
    // Ensure distinct approvers
    const uniqueApprovers = [...new Set(validApprovers)];
    const isApproved = uniqueApprovers.length >= 2;
    return {
      requirement:        "DOUBLE",
      canProceedNow:      isApproved,
      isApproved,
      approvalsCollected: uniqueApprovers.length,
      approvalsNeeded:    2,
      approvers:          uniqueApprovers,
      reason:             isApproved ? "double_approval_satisfied" : "awaiting_double_approval",
    };
  }

  // Unknown requirement — fail closed
  return {
    requirement:        "SINGLE",
    canProceedNow:      false,
    isApproved:         false,
    approvalsCollected: 0,
    approvalsNeeded:    1,
    approvers:          [],
    reason:             "unknown_requirement_fail_closed",
  };
}

/**
 * canSelfApprove — check if self-approval is allowed.
 * Never allowed by policy.
 */
export function canSelfApprove(): false {
  return false;
}

/**
 * getApprovalSummary — human-readable summary of approval requirement.
 */
export function getApprovalSummary(requirement: ApprovalRequirement): string {
  switch (requirement) {
    case "NONE":      return "No approval required. Rotation can proceed immediately.";
    case "SINGLE":    return "One approver required. The requester cannot self-approve.";
    case "DOUBLE":    return "Two distinct approvers required. Neither can be the requester.";
    case "EMERGENCY": return "Emergency bypass. Rotation proceeds immediately. Logged for audit.";
    default:          return "Unknown approval requirement.";
  }
}

/**
 * getRiskApprovalMatrix — the complete approval matrix by risk level.
 */
export function getRiskApprovalMatrix(): Array<{
  riskLevel:   RotationRiskLevel;
  requirement: ApprovalRequirement;
  description: string;
}> {
  return [
    { riskLevel: "LOW",      requirement: "NONE",   description: "Auto-permitted. No approval needed." },
    { riskLevel: "MEDIUM",   requirement: "SINGLE", description: "One approver required." },
    { riskLevel: "HIGH",     requirement: "SINGLE", description: "One approver required." },
    { riskLevel: "CRITICAL", requirement: "DOUBLE", description: "Two distinct approvers required." },
  ];
}
