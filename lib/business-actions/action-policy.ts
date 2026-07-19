/**
 * action-policy.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Policy — defines what actions can execute and under what conditions.
 *
 * RULE: If no explicit policy exists, every action stays in dry_run or pending_approval.
 * Never execute by default.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionType, ExecutionMode, ActionRiskLevel } from "./action-types";
import { nextActionId } from "./action-types";

// -- Action Policy ------------------------------------------------------------

/** Policy governing action execution. */
export interface ActionPolicy {
  /** Unique policy ID. */
  policyId: string;
  /** Organization this policy belongs to. */
  organizationId: string;
  /** Policy name. */
  name: string;
  /** Whether this policy is active. */
  enabled: boolean;
  /** Action types this policy allows. Null = all. */
  allowedActionTypes: ActionType[] | null;
  /** Action types this policy blocks. */
  blockedActionTypes: ActionType[];
  /** Action types that always require approval. */
  requiresApprovalFor: ActionType[];
  /** If true, all actions under this policy run as dry_run. */
  dryRunOnly: boolean;
  /** Maximum risk level allowed without escalation. */
  maxRiskLevel: ActionRiskLevel;
  /** Execution modes allowed by this policy. */
  allowedExecutionModes: ExecutionMode[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action policy. */
export function buildActionPolicy(opts: {
  organizationId: string;
  name: string;
  enabled?: boolean;
  allowedActionTypes?: ActionType[] | null;
  blockedActionTypes?: ActionType[];
  requiresApprovalFor?: ActionType[];
  dryRunOnly?: boolean;
  maxRiskLevel?: ActionRiskLevel;
  allowedExecutionModes?: ExecutionMode[];
  metadata?: Record<string, unknown>;
}): ActionPolicy {
  return {
    policyId: nextActionId("apol"),
    organizationId: opts.organizationId,
    name: opts.name,
    enabled: opts.enabled ?? true,
    allowedActionTypes: opts.allowedActionTypes ?? null,
    blockedActionTypes: opts.blockedActionTypes ?? [],
    requiresApprovalFor: opts.requiresApprovalFor ?? [],
    dryRunOnly: opts.dryRunOnly ?? true,
    maxRiskLevel: opts.maxRiskLevel ?? "low",
    allowedExecutionModes: opts.allowedExecutionModes ?? ["dry_run"],
    metadata: opts.metadata ?? {},
  };
}

/** Default policy: dry_run only, no real execution. */
export function defaultSafePolicy(organizationId: string): ActionPolicy {
  return buildActionPolicy({
    organizationId,
    name: "default_safe",
    dryRunOnly: true,
    maxRiskLevel: "low",
    allowedExecutionModes: ["dry_run"],
  });
}

// -- Policy Check -------------------------------------------------------------

/** Result of checking an action against a policy. */
export interface PolicyCheckResult {
  allowed: boolean;
  reason: string;
  forceDryRun: boolean;
  requiresApproval: boolean;
}

/** Check if an action type is allowed by a policy. */
export function checkPolicy(
  policy: ActionPolicy,
  actionType: ActionType,
  mode: ExecutionMode,
): PolicyCheckResult {
  // Blocked types
  if (policy.blockedActionTypes.includes(actionType)) {
    return { allowed: false, reason: `Tipo "${actionType}" bloqueado por policy "${policy.name}"`, forceDryRun: true, requiresApproval: false };
  }

  // Allowed types check
  if (policy.allowedActionTypes && !policy.allowedActionTypes.includes(actionType)) {
    return { allowed: false, reason: `Tipo "${actionType}" no esta en la lista de permitidos de policy "${policy.name}"`, forceDryRun: true, requiresApproval: false };
  }

  // Execution mode check
  if (!policy.allowedExecutionModes.includes(mode)) {
    return { allowed: false, reason: `Modo "${mode}" no permitido por policy "${policy.name}"`, forceDryRun: true, requiresApproval: false };
  }

  // Dry run only
  const forceDryRun = policy.dryRunOnly;

  // Requires approval
  const requiresApproval = policy.requiresApprovalFor.includes(actionType);

  return {
    allowed: true,
    reason: `Permitido por policy "${policy.name}"${forceDryRun ? " (solo dry_run)" : ""}`,
    forceDryRun,
    requiresApproval,
  };
}
