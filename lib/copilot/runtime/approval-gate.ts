/**
 * lib/copilot/runtime/approval-gate.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Human-in-the-loop approval gate.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Fail-closed: when in doubt, block and require approval.
 *   - Three strategies: auto_block (never auto-approve), auto_approve (skip gate),
 *     token_based (future — bearer token or callback signal grants approval).
 *   - The gate never executes actions; it only decides whether to allow execution.
 *   - Fully synchronous in Phase 1; async token resolution reserved for Phase 2.
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← approval-gate ← action-runtime
 */
import "server-only";

import type { ExecutionContext, RuntimeStepSpec, ApprovalStatus } from "./runtime-types";

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
