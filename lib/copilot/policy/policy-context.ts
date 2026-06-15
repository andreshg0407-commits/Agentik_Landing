/**
 * lib/copilot/policy/policy-context.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — PolicyContext construction helpers.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Bridges the runtime layer (ExecutionContext + RuntimeStepSpec) to the
 * policy layer (PolicyContext).
 *
 * The Runtime calls buildPolicyContext() before each step evaluation.
 * This is the ONLY coupling point between runtime types and policy types.
 *
 * Dependency direction (must never be violated):
 *   policy-types ← policy-context ← action-runtime
 *   runtime-types ← policy-context ← action-runtime
 */
import "server-only";

import type { ExecutionContext, RuntimeStepSpec } from "@/lib/copilot/runtime/runtime-types";
import type { PolicyContext, ExecutionMode }      from "./policy-types";

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build a PolicyContext from runtime execution primitives.
 *
 * @param spec          - The step specification (actionId, requiresApproval, etc.)
 * @param ctx           - The current execution context (tenantId, userId, etc.)
 * @param executionMode - How the execution was triggered
 * @param environment   - Optional: deployment environment override
 */
export function buildPolicyContext(
  spec:          RuntimeStepSpec,
  ctx:           ExecutionContext,
  executionMode: ExecutionMode = "copilot",
  environment?:  "development" | "staging" | "production",
): PolicyContext {
  return {
    // Identity
    executionId:         ctx.executionId,
    correlationId:       ctx.correlationId,
    tenantId:            ctx.tenantId,
    userId:              ctx.userId,

    // Action
    actionId:            spec.actionId,
    domain:              spec.domain,
    requiresApproval:    spec.requiresApproval,
    automationEligible:  spec.automationEligible,

    // Trigger
    requestedAt:         ctx.requestedAt,
    executionMode,
    environment:         environment ?? resolveEnvironment(),

    // Extensible
    metadata:            ctx.metadata ?? {},

    // Idempotency
    idempotencyKey:      ctx.idempotencyKey,
  };
}

// ── Environment resolution ─────────────────────────────────────────────────────

/**
 * Resolve the current deployment environment from process.env.
 * Falls back to "development" if NODE_ENV is not set or unrecognized.
 */
function resolveEnvironment(): "development" | "staging" | "production" {
  const env = process.env.NODE_ENV;
  if (env === "production") return "production";
  if (env === "test")       return "development"; // tests run in dev context
  return "development";
}
