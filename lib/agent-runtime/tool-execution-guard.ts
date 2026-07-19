/**
 * lib/agent-runtime/tool-execution-guard.ts
 *
 * Agentik Runtime Tool Execution Kernel — Execution Guard
 *
 * Validates all preconditions before a tool is allowed to execute.
 * Never throws — always returns a structured guard result.
 *
 * Checks:
 * 1. Action exists and is in approved status
 * 2. Action.requiresApproval already satisfied
 * 3. Tool ID provided
 * 4. Handler registered for tool
 * 5. Agent authorized (in policy.allowedAgents or policy is open)
 * 6. Module authorized (in policy.allowedModules or policy is open)
 * 7. Permission level sufficient
 * 8. No duplicate execution (idempotencyKey)
 * 9. No blocking delegation dependencies
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import type { ActionEnvelope }         from "./action-envelope";
import type { ToolExecutionRequest }   from "./tool-execution-types";
import type { AgentDelegation }        from "@/lib/agent-orchestration/delegation-types";
import {
  resolveToolHandler,
  checkIdempotencyKey,
}                                      from "./tool-handler-registry";
import { terIdKey }                    from "./tool-execution-types";

// ── Guard result ──────────────────────────────────────────────────────────────

export interface ExecutionGuardResult {
  allowed:                boolean;
  reasons:                string[];
  blockingDependencies:   string[];   // delegationIds blocking execution
  missingPermissions:     string[];
  policy:                 {
    requiresApproval:  boolean;
    requiredPermission: string;
    allowedAgents:     string[];
    allowedModules:    string[];
  } | null;
}

function deny(reasons: string[], extra: Partial<Omit<ExecutionGuardResult, "allowed" | "reasons">> = {}): ExecutionGuardResult {
  return {
    allowed:              false,
    reasons,
    blockingDependencies: extra.blockingDependencies ?? [],
    missingPermissions:   extra.missingPermissions   ?? [],
    policy:               extra.policy               ?? null,
  };
}

function allow(policy: ExecutionGuardResult["policy"]): ExecutionGuardResult {
  return {
    allowed:              true,
    reasons:              ["All preconditions satisfied."],
    blockingDependencies: [],
    missingPermissions:   [],
    policy,
  };
}

// ── Main guard ────────────────────────────────────────────────────────────────

export function validateToolExecution(
  request:     ToolExecutionRequest,
  envelope:    ActionEnvelope | null,
  delegations: AgentDelegation[],
): ExecutionGuardResult {

  // ── 1. Action must exist ─────────────────────────────────────────────────
  if (!envelope) {
    return deny([`Action "${request.actionId}" not found.`]);
  }

  // ── 2. Action must be approved ───────────────────────────────────────────
  if (envelope.agentStatus !== "approved") {
    return deny([
      `Action status is "${envelope.agentStatus}" — only "approved" actions can execute tools.`,
    ]);
  }

  // ── 3. requiresApproval must be satisfied ────────────────────────────────
  if (envelope.requiresApproval && !envelope.approvedBy) {
    return deny([`Action requires human approval but approvedBy is not set.`]);
  }

  // ── 4. Tool ID must be provided ──────────────────────────────────────────
  if (!request.toolId) {
    return deny([`toolId is required.`]);
  }

  // ── 5. Handler must exist ────────────────────────────────────────────────
  const handler = resolveToolHandler(request.toolId);
  if (!handler) {
    return deny([`No handler registered for tool "${request.toolId}".`]);
  }

  const { policy } = handler;

  // ── 6. Agent authorized ──────────────────────────────────────────────────
  if (policy.allowedAgents.length > 0 && !policy.allowedAgents.includes(request.agentId)) {
    return deny(
      [`Agent "${request.agentId}" is not authorized to execute tool "${request.toolId}".`],
      { missingPermissions: ["agent_not_allowed"], policy: { ...policy } },
    );
  }

  // ── 7. Module authorized ─────────────────────────────────────────────────
  if (policy.allowedModules.length > 0 && !policy.allowedModules.includes(request.moduleKey)) {
    return deny(
      [`Module "${request.moduleKey}" is not authorized for tool "${request.toolId}".`],
      { missingPermissions: ["module_not_allowed"], policy: { ...policy } },
    );
  }

  // ── 8. Permission level ───────────────────────────────────────────────────
  if (policy.requiredPermission === "admin" && !["SUPER_ADMIN", "AGENTIK_ADMIN"].includes(request.permissionContext.userRole ?? "")) {
    return deny(
      [`Tool "${request.toolId}" requires admin permission.`],
      { missingPermissions: ["insufficient_permission"], policy: { ...policy } },
    );
  }

  // ── 9. Idempotency check ─────────────────────────────────────────────────
  if (policy.idempotencyKey) {
    const key = terIdKey(request.actionId, request.toolId);
    if (checkIdempotencyKey(key)) {
      return deny(
        [`Tool "${request.toolId}" already executed for action "${request.actionId}" (idempotency key: ${key}).`],
        { policy: { ...policy } },
      );
    }
  }

  // ── 10. Blocking delegation dependencies ─────────────────────────────────
  const blocking = delegations.filter(d =>
    d.parentActionId === request.actionId &&
    !["completed", "rejected", "canceled", "expired"].includes(d.status),
  );
  if (blocking.length > 0) {
    return deny(
      [`Action "${request.actionId}" has ${blocking.length} pending delegation${blocking.length > 1 ? "s" : ""} that must resolve before execution.`],
      { blockingDependencies: blocking.map(d => d.id), policy: { ...policy } },
    );
  }

  return allow({
    requiresApproval:   policy.requiresApproval,
    requiredPermission: policy.requiredPermission,
    allowedAgents:      policy.allowedAgents,
    allowedModules:     policy.allowedModules,
  });
}
