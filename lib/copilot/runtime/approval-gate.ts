/**
 * lib/copilot/runtime/approval-gate.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Human-in-the-loop approval gate.
 * AGENTIK-POLICY-ENGINE-01  — Refactored: primary path consumes PolicyEvaluationResult.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * After AGENTIK-POLICY-ENGINE-01:
 *   The primary entry point is `gateFromPolicyDecision(policyResult)`.
 *   The gate is now a thin adapter: it maps PolicyDecision → ApprovalGateDecision.
 *   No authorization logic lives here — that belongs exclusively to PolicyEngine.
 *
 *   Legacy `checkApprovalGate(spec, ctx, config)` is preserved for backward compat.
 *   It will be removed once all callers migrate to the policy-based path.
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← approval-gate ← action-runtime
 *   policy-types  ← approval-gate ← action-runtime
 */
import "server-only";

import type { ExecutionContext, RuntimeStepSpec, ApprovalStatus } from "./runtime-types";
import type { PolicyEvaluationResult } from "@/lib/copilot/policy/policy-types";

// ── Gate strategy ──────────────────────────────────────────────────────────────

/**
 * Approval gate strategy — controls how approval decisions are made.
 *
 *   auto_block     — always block steps that requiresApproval=true.
 *                    Human must approve via external mechanism before re-run.
 *   auto_approve   — bypass gate entirely (ONLY for development / test pipelines).
 *   token_based    — future: bearer token or signed callback grants approval.
 *
 * Production runtime MUST use auto_block.
 * auto_approve is explicitly flagged in ApprovalGateDecision.gateApplied.
 */
export type ApprovalGateStrategy = "auto_block" | "auto_approve" | "token_based";

// ── Gate configuration ─────────────────────────────────────────────────────────

/**
 * Configuration for the approval gate layer.
 *
 * Future fields (reserved):
 *   - approvalCallbackUrl?:  string   — webhook to POST approval decisions to
 *   - approvalTimeoutMs?:    number   — how long to wait for async approval
 *   - approvedTokens?:       string[] — pre-granted tokens for bypass
 */
export interface ApprovalGateConfig {
  /** Strategy to apply for all approval decisions */
  strategy: ApprovalGateStrategy;
  /**
   * Whether to apply the gate even to `automationEligible` steps.
   * Default: false — automation-eligible steps bypass the gate by definition.
   */
  gateAutomationEligible?: boolean;
}

export const DEFAULT_APPROVAL_GATE_CONFIG: ApprovalGateConfig = {
  strategy:               "auto_block",
  gateAutomationEligible: false,
} as const;

// ── Gate decision ──────────────────────────────────────────────────────────────

/**
 * Structured decision from `checkApprovalGate()`.
 */
export interface ApprovalGateDecision {
  /** Final approval status for this step */
  status:       ApprovalStatus;
  /**
   * Whether the gate logic was actually applied.
   * false = step was auto-approved without gate check
   *         (requiresApproval=false OR automationEligible=true with gateAutomationEligible=false)
   */
  gateApplied:  boolean;
  /** Human-readable reason for the decision */
  reason:       string;
  /**
   * Whether the runtime should block execution of this step.
   * Equivalent to: status === "pending"
   */
  shouldBlock:  boolean;
}

// ── Gate implementation ────────────────────────────────────────────────────────

/**
 * Evaluate whether a step requires human approval before execution.
 *
 * Decision tree:
 *   1. requiresApproval === false  → not_required (skip gate)
 *   2. automationEligible === true AND gateAutomationEligible === false
 *                                  → granted (automation bypass)
 *   3. strategy === "auto_approve" → granted (dev/test bypass — logged)
 *   4. strategy === "auto_block"   → pending (gate blocks execution)
 *   5. strategy === "token_based"  → pending (Phase 2 — not yet implemented)
 *
 * @param spec    - The step specification being evaluated
 * @param ctx     - The current execution context (included for future audit hooks)
 * @param config  - Gate configuration (defaults to DEFAULT_APPROVAL_GATE_CONFIG)
 */
export function checkApprovalGate(
  spec:    RuntimeStepSpec,
  ctx:     ExecutionContext,
  config:  ApprovalGateConfig = DEFAULT_APPROVAL_GATE_CONFIG,
): ApprovalGateDecision {
  void ctx; // reserved for future audit integration

  // ── 1. No approval required ──────────────────────────────────────────────
  if (!spec.requiresApproval) {
    return {
      status:      "not_required",
      gateApplied: false,
      reason:      "Step does not require approval.",
      shouldBlock:  false,
    };
  }

  // ── 2. Automation eligible bypass ────────────────────────────────────────
  if (spec.automationEligible && !config.gateAutomationEligible) {
    return {
      status:      "granted",
      gateApplied: false,
      reason:      "Step is automation-eligible — approval bypassed for autonomous pipeline.",
      shouldBlock:  false,
    };
  }

  // ── 3. Strategy-based decision ───────────────────────────────────────────
  switch (config.strategy) {
    case "auto_approve": {
      // Explicit bypass for development / test environments.
      // This path is intentionally logged loud — never silently bypass in prod.
      console.warn(
        `[ApprovalGate] auto_approve bypass applied for step "${spec.stepId}" ` +
        `(action: ${spec.actionId}). This MUST NOT run in production.`,
      );
      return {
        status:      "granted",
        gateApplied: true,
        reason:      "DEVELOPMENT BYPASS: auto_approve strategy granted approval without human review.",
        shouldBlock:  false,
      };
    }

    case "token_based": {
      // Phase 2 — bearer token resolution not yet implemented.
      // Fail-closed: block until token validation is built.
      return {
        status:      "pending",
        gateApplied: true,
        reason:
          "Token-based approval strategy is reserved for Phase 2. " +
          "Step is blocked until the approval token validation layer is implemented.",
        shouldBlock: true,
      };
    }

    case "auto_block":
    default: {
      return {
        status:      "pending",
        gateApplied: true,
        reason:
          `Step "${spec.displayName}" requires human approval before execution. ` +
          `Action: ${spec.actionId}. ` +
          `Provide an approval signal to resume this step.`,
        shouldBlock: true,
      };
    }
  }
}

/**
 * Convenience helper — returns true if the step should be blocked.
 * Equivalent to `checkApprovalGate(...).shouldBlock`.
 *
 * @deprecated Use `gateFromPolicyDecision(policyResult).shouldBlock` instead.
 */
export function isApprovalRequired(
  spec:   RuntimeStepSpec,
  config: ApprovalGateConfig = DEFAULT_APPROVAL_GATE_CONFIG,
): boolean {
  // Fast path for the common case
  if (!spec.requiresApproval) return false;
  if (spec.automationEligible && !config.gateAutomationEligible) return false;
  return config.strategy !== "auto_approve";
}

// ── Policy-based gate (AGENTIK-POLICY-ENGINE-01) ──────────────────────────────

/**
 * Convert a PolicyEvaluationResult into an ApprovalGateDecision.
 *
 * This is the PRIMARY gate function after AGENTIK-POLICY-ENGINE-01.
 * The gate contains ZERO authorization logic — it only translates.
 *
 * Mapping:
 *   allow            → status="granted",   shouldBlock=false
 *   require_approval → status="pending",   shouldBlock=true
 *   deny             → status="denied",    shouldBlock=true
 */
export function gateFromPolicyDecision(
  policyResult: PolicyEvaluationResult,
): ApprovalGateDecision {
  const topReason = policyResult.reasons[0]?.explanation ?? "";

  switch (policyResult.decision) {
    case "allow":
      return {
        status:      "granted",
        gateApplied: true,
        reason:      topReason || `Policy engine allowed action "${policyResult.actionId}".`,
        shouldBlock: false,
      };

    case "require_approval":
      return {
        status:      "pending",
        gateApplied: true,
        reason:
          topReason ||
          `Action "${policyResult.actionId}" requires human approval. ` +
          `Rules triggered: [${policyResult.triggeredRuleIds.join(", ")}].`,
        shouldBlock: true,
      };

    case "deny":
      return {
        status:      "denied",
        gateApplied: true,
        reason:
          topReason ||
          `Action "${policyResult.actionId}" was denied by policy. ` +
          `Rules triggered: [${policyResult.triggeredRuleIds.join(", ")}].`,
        shouldBlock: true,
      };
  }
}
