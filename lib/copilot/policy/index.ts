/**
 * lib/copilot/policy/index.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — Public barrel for the Policy Engine.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THE POLICY ENGINE?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Policy Engine is the central authorization layer of Agentik OS.
 * It sits between the Execution Planner and the Action Dispatcher:
 *
 *   Intent Resolver
 *     │
 *     ▼ IntentExecutionPlan
 *   Action Runtime
 *     │
 *     ▼ RuntimeStepSpec + ExecutionContext
 *   Policy Engine              ← THIS MODULE
 *     │
 *     ▼ PolicyEvaluationResult { decision: allow | require_approval | deny }
 *   Approval Gate (thin adapter)
 *     │
 *     ▼
 *   Action Dispatcher → Domain Action
 *
 * The Policy Engine:
 *   - Is completely domain-agnostic (no Shopify, Finance, Commercial references)
 *   - Evaluates all rules synchronously (deterministic, auditable)
 *   - Is fail-closed: any doubt → require_approval
 *   - Produces a complete audit trail per evaluation
 *   - Is extensible for future DB-backed policies, per-tenant configs, RBAC, etc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import {
 *     PolicyEngine,
 *     createProductionPolicyEngine,
 *     buildPolicyContext,
 *   } from "@/lib/copilot/policy";
 *
 *   const engine = createProductionPolicyEngine();
 *   const ctx = buildPolicyContext(stepSpec, executionCtx, "copilot");
 *   const result = engine.evaluate(ctx);
 *
 *   if (result.decision === "allow")            { dispatch() }
 *   if (result.decision === "require_approval") { awaitHumanApproval() }
 *   if (result.decision === "deny")             { blockAndLog(result.violations) }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

// ── Type exports ───────────────────────────────────────────────────────────────

export type {
  ExecutionMode,
  PolicyEffect,
  PolicyDecision,
  PolicyContext,
  PolicyReason,
  PolicyViolation,
  PolicyEvaluationResult,
  TenantPolicyConfig,
} from "./policy-types";

export { DEFAULT_TENANT_POLICY_CONFIG } from "./policy-types";

export type { PolicyRuleResult, PolicyRule } from "./policy-rules";

export {
  MissingTenantRule,
  MissingUserRule,
  RequiresApprovalRule,
  AutomationEligibilityRule,
  EnvironmentSafetyRule,
  PermissiveRule,
  DEFAULT_POLICY_RULES,
} from "./policy-rules";

export {
  PolicyEngine,
  createProductionPolicyEngine,
  createPermissivePolicyEngine,
  createDefaultPolicyEngine,
} from "./policy-engine";

export { buildPolicyContext } from "./policy-context";

export type { PolicyValidateResult } from "./policy-validate";
export { runPolicyEngineSmokeCheck } from "./policy-validate";
