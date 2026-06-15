/**
 * lib/copilot/runtime/execution-runtime.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Public facade for the execution runtime engine.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THE ACTION RUNTIME?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Action Runtime is Agentik's universal execution engine.
 * It bridges the Intent Resolver (what to do) and domain adapters (how to do it).
 *
 * It is NOT Shopify-specific. It is NOT Finance-specific.
 * It is a domain-agnostic, multi-tenant, auditable execution pipeline.
 *
 * Architecture:
 *
 *   Intent Resolver              (lib/copilot/intent-resolver/)
 *     │
 *     ▼ IntentExecutionPlan
 *   Action Runtime               ← THIS MODULE
 *     │
 *     ├── ActionDispatcher       routes actionIds to handlers
 *     ├── ApprovalGate           enforces human-in-the-loop
 *     ├── RuntimeLogger          structured event stream
 *     ├── RollbackDescriptor     Phase 1: descriptive rollback plan
 *     │
 *     └──► Domain Adapters       [OUTSIDE this module]
 *           ├── Shopify Provider (future: lib/marketing-studio/commerce/shopify-runtime/)
 *           ├── Finance Provider (future)
 *           └── Others           (future)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import {
 *     ActionDispatcher,
 *     executeExecutionPlan,
 *     planFromIntentPlan,
 *   } from "@/lib/copilot/runtime/execution-runtime";
 *
 *   // 1. Build dispatcher and register domain providers
 *   const dispatcher = new ActionDispatcher();
 *   dispatcher.registerProvider(shopifyRuntimeProvider);
 *
 *   // 2. Translate an IntentExecutionPlan → RuntimeExecutionPlan
 *   const plan = planFromIntentPlan(intentPlan);
 *
 *   // 3. Execute
 *   const ctx: ExecutionContext = {
 *     executionId:   crypto.randomUUID(),
 *     correlationId: intentResult.resolvedIntent.candidateId,
 *     tenantId:      "castillitos",
 *     userId:        session.user.id,
 *     requestedAt:   new Date(),
 *   };
 *   const report = await executeExecutionPlan(plan, ctx, dispatcher);
 *
 *   if (report.overallStatus === "completed") { ... }
 *   if (report.overallStatus === "awaiting_approval") { ... }
 *   console.log(report.rollback.summary);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

// ── Type exports ───────────────────────────────────────────────────────────────

export type {
  ExecutionContext,
  RuntimeStepSpec,
  RuntimeExecutionPlan,
  ExecutionStatus,
  ApprovalStatus,
  RuntimeStepResult,
  RuntimeExecution,
  ExecutionReport,
  ExecutionAudit,
  ExecutionPolicy,
} from "./runtime-types";

export { DEFAULT_EXECUTION_POLICY } from "./runtime-types";

export type {
  ActionHandlerResult,
  ActionHandler,
  ActionDefinition,
  ActionRegistryProvider,
  DispatchOutcome,
} from "./action-dispatcher";

export { ActionDispatcher } from "./action-dispatcher";

export type {
  ApprovalGateStrategy,
  ApprovalGateConfig,
  ApprovalGateDecision,
} from "./approval-gate";

export {
  checkApprovalGate,
  isApprovalRequired,
  DEFAULT_APPROVAL_GATE_CONFIG,
} from "./approval-gate";

export type {
  RuntimeEventType,
  RuntimeEvent,
  RuntimeLogger,
} from "./runtime-logger";

export { createRuntimeLogger } from "./runtime-logger";

export type {
  ReversibilityClass,
  CompensationEntry,
  RollbackDescriptor,
} from "./rollback-descriptor";

export { buildRollbackDescriptor } from "./rollback-descriptor";

export type { ExecuteOptions, ExtendedExecutionReport } from "./action-runtime";
export { executeExecutionPlan }                         from "./action-runtime";

// ── Policy Engine re-exports (AGENTIK-POLICY-ENGINE-01) ───────────────────────

export type {
  ExecutionMode,
  PolicyEffect,
  PolicyDecision,
  PolicyContext,
  PolicyReason,
  PolicyViolation,
  PolicyEvaluationResult,
  TenantPolicyConfig,
} from "@/lib/copilot/policy/policy-types";

export { DEFAULT_TENANT_POLICY_CONFIG } from "@/lib/copilot/policy/policy-types";

export type { PolicyRule, PolicyRuleResult } from "@/lib/copilot/policy/policy-rules";

export {
  PolicyEngine,
  createProductionPolicyEngine,
  createPermissivePolicyEngine,
  createDefaultPolicyEngine,
} from "@/lib/copilot/policy/policy-engine";

export { buildPolicyContext }          from "@/lib/copilot/policy/policy-context";
export { gateFromPolicyDecision }      from "./approval-gate";

// ── Internal imports for helpers ───────────────────────────────────────────────

import type { IntentExecutionPlan } from "@/lib/copilot/intent-resolver/intent-types";
import type { RuntimeExecutionPlan, RuntimeStepSpec } from "./runtime-types";

// ── Adapter helpers ────────────────────────────────────────────────────────────

/**
 * Convert an `IntentExecutionPlan` (from the intent resolver) into a
 * `RuntimeExecutionPlan` (consumed by `executeExecutionPlan()`).
 *
 * This is the bridge between the intent resolution layer and the execution layer.
 *
 * @param intentPlan    - Plan produced by `intentResolver.buildExecutionPlan()`
 * @param opts          - Optional overrides for generated step defaults
 */
export function planFromIntentPlan(
  intentPlan: IntentExecutionPlan,
  opts: {
    planId?:  string;
    stepId?:  string;
    domain?:  string;
  } = {},
): RuntimeExecutionPlan {
  const planId = opts.planId ?? `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stepId = opts.stepId ?? `step_1`;

  const step: RuntimeStepSpec = {
    stepId,
    actionId:           intentPlan.actionId,
    domain:             opts.domain ?? intentPlan.domain.toLowerCase(),
    displayName:        intentPlan.title,
    parameters:         intentPlan.parameters,
    requiresApproval:   intentPlan.requiresApproval,
    automationEligible: intentPlan.automationEligible,
    order:              1,
    dependsOn:          [],
  };

  return {
    planId,
    title:   intentPlan.title,
    summary: intentPlan.summary,
    steps:   [step],
  };
}

/**
 * Build a minimal `RuntimeExecutionPlan` from raw step specs.
 * Useful when constructing multi-step plans programmatically.
 *
 * @param title  - Human-readable plan title
 * @param steps  - Ordered step specifications
 * @param opts   - Optional: planId, summary
 */
export function buildRuntimePlan(
  title:  string,
  steps:  RuntimeStepSpec[],
  opts:   { planId?: string; summary?: string } = {},
): RuntimeExecutionPlan {
  return {
    planId:  opts.planId ?? `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    summary: opts.summary,
    steps,
  };
}
