/**
 * lib/copilot/policy/policy-engine.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — Central Policy Engine.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * The PolicyEngine is the single authority on whether an action can execute.
 * It replaces the ad-hoc logic previously scattered in the Approval Gate.
 *
 * Architecture:
 *   PolicyContext
 *     │
 *     ▼
 *   PolicyEngine.evaluate()
 *     │
 *     ├── MissingTenantRule
 *     ├── MissingUserRule
 *     ├── RequiresApprovalRule
 *     ├── AutomationEligibilityRule
 *     ├── EnvironmentSafetyRule
 *     └── [future: TenantConfigRule, UserRoleRule, DynamicRule, ...]
 *     │
 *     ▼ combine(priority: deny > require_approval > allow > abstain)
 *     │
 *     ▼
 *   PolicyEvaluationResult { decision, reasons, violations, ... }
 *
 * Fail-closed guarantee:
 *   If ALL rules abstain → decision = "require_approval"
 *   If no rules are registered → decision = "require_approval"
 *
 * Dependency direction (must never be violated):
 *   policy-types ← policy-rules ← policy-engine
 *   (runtime modules import from policy-engine, never vice-versa)
 */
import "server-only";

import type {
  PolicyContext,
  PolicyDecision,
  PolicyEvaluationResult,
  PolicyViolation,
  PolicyReason,
} from "./policy-types";

import type { PolicyRule, PolicyRuleResult } from "./policy-rules";
import {
  DEFAULT_POLICY_RULES,
  PermissiveRule,
  MissingTenantRule,
  MissingUserRule,
} from "./policy-rules";

import type { ApprovalGateConfig } from "@/lib/copilot/runtime/approval-gate";

// ── Priority constants ─────────────────────────────────────────────────────────

/** Effect priority (higher = wins). deny beats everything. */
const EFFECT_PRIORITY: Record<string, number> = {
  deny:             3,
  require_approval: 2,
  allow:            1,
  abstain:          0,
};

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * PolicyEngine — evaluates a set of PolicyRules against a PolicyContext
 * and produces a deterministic PolicyEvaluationResult.
 *
 * Usage:
 *   const engine = new PolicyEngine();
 *   engine.registerRules(DEFAULT_POLICY_RULES);
 *   const result = engine.evaluate(ctx);
 *
 *   if (result.decision === "allow") { ... }
 *   if (result.decision === "require_approval") { ... }
 *   if (result.decision === "deny") { ... }
 */
export class PolicyEngine {
  private rules: PolicyRule[] = [];

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Register a single policy rule.
   * Duplicate rule ids are rejected — first registration wins.
   */
  registerRule(rule: PolicyRule): void {
    if (this.rules.some(r => r.id === rule.id)) {
      console.warn(
        `[PolicyEngine] Rule "${rule.id}" already registered — skipping duplicate.`,
      );
      return;
    }
    this.rules.push(rule);
  }

  /**
   * Register multiple rules at once.
   */
  registerRules(rules: PolicyRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * Return the list of registered rule ids (for introspection).
   */
  listRuleIds(): string[] {
    return this.rules.map(r => r.id);
  }

  // ── Evaluation ──────────────────────────────────────────────────────────────

  /**
   * Evaluate all registered rules against the given context.
   *
   * Steps:
   *   1. Run every rule (synchronously, in order)
   *   2. Collect non-abstain results
   *   3. Combine via priority: deny > require_approval > allow > abstain
   *   4. If all abstain → fail-closed: decision = require_approval
   *   5. Build and return PolicyEvaluationResult
   *
   * This method NEVER throws. All rule errors are caught and logged.
   */
  evaluate(ctx: PolicyContext): PolicyEvaluationResult {
    const t0 = Date.now();

    const evaluatedRuleIds: string[]       = [];
    const triggeredRuleIds: string[]       = [];
    const ruleResults:      PolicyRuleResult[] = [];

    // ── Run all rules ────────────────────────────────────────────────────────

    for (const rule of this.rules) {
      let ruleResult: PolicyRuleResult;
      try {
        ruleResult = rule.evaluate(ctx);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Fail closed: a crashing rule is treated as deny
        ruleResult = {
          ruleId:      rule.id,
          ruleName:    rule.name,
          effect:      "deny",
          explanation: `Rule "${rule.id}" threw an unhandled exception: ${msg}. Failing closed.`,
          violation:   { explanation: `Rule exception: ${msg}`, severity: "critical" },
        };
      }

      evaluatedRuleIds.push(rule.id);
      ruleResults.push(ruleResult);

      if (ruleResult.effect !== "abstain") {
        triggeredRuleIds.push(rule.id);
      }
    }

    // ── Combine effects ──────────────────────────────────────────────────────

    const decision = this.combineEffects(ruleResults);

    // ── Build reasons and violations ─────────────────────────────────────────

    const reasons: PolicyReason[]    = [];
    const violations: PolicyViolation[] = [];

    for (const r of ruleResults) {
      if (r.effect === "abstain") continue;
      reasons.push({
        ruleId:      r.ruleId,
        ruleName:    r.ruleName,
        effect:      r.effect,
        explanation: r.explanation,
      });
      if (r.violation) {
        violations.push({
          ruleId:      r.ruleId,
          ruleName:    r.ruleName,
          explanation: r.violation.explanation,
          severity:    r.violation.severity,
        });
      }
    }

    return {
      executionId:      ctx.executionId,
      correlationId:    ctx.correlationId,
      tenantId:         ctx.tenantId,
      actionId:         ctx.actionId,
      domain:           ctx.domain,
      evaluatedAt:      new Date(),
      decision,
      reasons,
      violations,
      evaluatedRuleIds,
      triggeredRuleIds,
      durationMs:       Date.now() - t0,
    };
  }

  // ── Combination logic ────────────────────────────────────────────────────────

  private combineEffects(results: PolicyRuleResult[]): PolicyDecision {
    if (results.length === 0) {
      // No rules registered — fail closed
      return "require_approval";
    }

    let highestPriority = -1;
    let winningEffect = "abstain";

    for (const r of results) {
      const priority = EFFECT_PRIORITY[r.effect] ?? 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        winningEffect = r.effect;
      }
    }

    // Map to PolicyDecision (abstain is not a valid final decision)
    if (winningEffect === "deny")             return "deny";
    if (winningEffect === "require_approval") return "require_approval";
    if (winningEffect === "allow")            return "allow";

    // All abstain → fail closed
    return "require_approval";
  }
}

// ── Factory functions ──────────────────────────────────────────────────────────

/**
 * Create the standard production PolicyEngine with all DEFAULT_POLICY_RULES.
 * Use in all production paths.
 */
export function createProductionPolicyEngine(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.registerRules(DEFAULT_POLICY_RULES);
  return engine;
}

/**
 * Create a development/test PolicyEngine that always allows execution.
 * Uses PermissiveRule — still checks MissingTenantRule and MissingUserRule
 * so invalid contexts are still denied.
 *
 * NEVER use in production.
 */
export function createPermissivePolicyEngine(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.registerRule(new MissingTenantRule());
  engine.registerRule(new MissingUserRule());
  engine.registerRule(new PermissiveRule()); // overrides RequiresApproval etc.
  return engine;
}

/**
 * Create a default PolicyEngine from an optional ApprovalGateConfig.
 *
 * This is the bridge between the legacy ApprovalGateConfig (from ApprovalGate)
 * and the new PolicyEngine system. Used in `executeExecutionPlan()` when no
 * explicit policyEngine is provided.
 *
 *   config.strategy === "auto_approve" → permissive engine (dev/test bypass)
 *   config.strategy === "auto_block"   → production engine (all 5 rules)
 *   config === undefined               → production engine (safe default)
 */
export function createDefaultPolicyEngine(config?: ApprovalGateConfig): PolicyEngine {
  if (config?.strategy === "auto_approve") {
    return createPermissivePolicyEngine();
  }
  return createProductionPolicyEngine();
}
