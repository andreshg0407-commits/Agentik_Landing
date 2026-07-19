/**
 * lib/copilot/policy/policy-rules.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — PolicyRule interface and built-in rules.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Each rule is a single-responsibility object with a stable id.
 *   - Rules are synchronous — no I/O, no DB, no external calls.
 *   - Rules never mutate PolicyContext.
 *   - Rules return exactly one of: allow | require_approval | deny | abstain.
 *   - "abstain" means "this rule has no opinion for this context".
 *
 * Built-in rules (Phase 1):
 *   MissingTenantRule          — deny if no tenantId
 *   MissingUserRule            — deny if no userId (unless system mode)
 *   RequiresApprovalRule       — require_approval if action.requiresApproval=true
 *   AutomationEligibilityRule  — deny if automation mode but not automationEligible
 *   EnvironmentSafetyRule      — require_approval if production + destructive pattern
 *   PermissiveRule             — always allow (used in bypass/test engines)
 *
 * Dependency direction (must never be violated):
 *   policy-types ← policy-rules ← policy-engine
 */
import "server-only";

import type { PolicyContext, PolicyEffect, PolicyReason, PolicyViolation } from "./policy-types";

// ── Rule result ────────────────────────────────────────────────────────────────

/**
 * Result returned by every PolicyRule.evaluate() call.
 * Carries the effect plus structured explanation and optional violation.
 */
export interface PolicyRuleResult {
  /** Rule that produced this result */
  ruleId:     string;
  ruleName:   string;
  /** Effect this evaluation produced */
  effect:     PolicyEffect;
  /** Plain-language explanation */
  explanation: string;
  /** Present when effect is deny or require_approval due to a constraint */
  violation?: Omit<PolicyViolation, "ruleId" | "ruleName">;
}

// ── Rule interface ─────────────────────────────────────────────────────────────

/**
 * A single policy rule.
 *
 * To add a new rule:
 *   1. Create a class implementing PolicyRule.
 *   2. Give it a stable `id` (never rename — used in audit logs).
 *   3. Register it with PolicyEngine.registerRule(new MyRule()).
 *
 * Rules must:
 *   - Be pure functions of PolicyContext (no side effects)
 *   - Return within microseconds (no async)
 *   - Never throw (use try/catch internally and return abstain on error)
 */
export interface PolicyRule {
  readonly id:   string;
  readonly name: string;
  evaluate(ctx: PolicyContext): PolicyRuleResult;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function result(
  rule:        PolicyRule,
  effect:      PolicyEffect,
  explanation: string,
  violation?:  Omit<PolicyViolation, "ruleId" | "ruleName">,
): PolicyRuleResult {
  return { ruleId: rule.id, ruleName: rule.name, effect, explanation, violation };
}

// ── Built-in rules ─────────────────────────────────────────────────────────────

/**
 * MissingTenantRule
 *
 * Denies any action when no tenantId is present.
 * A missing tenant means there is no authorization context — fail closed.
 *
 * Effect: deny
 * Trigger: ctx.tenantId is empty
 */
export class MissingTenantRule implements PolicyRule {
  readonly id   = "missing_tenant";
  readonly name = "Missing Tenant";

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    if (!ctx.tenantId || ctx.tenantId.trim().length === 0) {
      return result(this, "deny",
        "Execution blocked: no tenantId in context. Authorization context is missing.",
        { explanation: "tenantId is required for all policy decisions.", severity: "critical" },
      );
    }
    return result(this, "abstain", "tenantId is present — rule abstains.");
  }
}

/**
 * MissingUserRule
 *
 * Denies any action when no userId is present, unless executionMode is "system".
 * System-mode executions (migrations, background sync) may run without a human actor.
 *
 * Effect: deny (when triggered)
 * Trigger: ctx.userId is empty AND ctx.executionMode !== "system"
 */
export class MissingUserRule implements PolicyRule {
  readonly id   = "missing_user";
  readonly name = "Missing User";

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    if (ctx.executionMode === "system") {
      return result(this, "abstain", "System execution mode — userId not required.");
    }
    if (!ctx.userId || ctx.userId.trim().length === 0) {
      return result(this, "deny",
        `Execution blocked: no userId in context for executionMode="${ctx.executionMode}".`,
        { explanation: "userId is required for non-system executions.", severity: "critical" },
      );
    }
    return result(this, "abstain", "userId is present — rule abstains.");
  }
}

/**
 * RequiresApprovalRule
 *
 * Requires approval when the action's registry entry declares requiresApproval=true.
 * This is the primary bridge between the action registry and the policy layer.
 *
 * Effect: require_approval (when triggered), abstain otherwise
 * Trigger: ctx.requiresApproval === true
 */
export class RequiresApprovalRule implements PolicyRule {
  readonly id   = "requires_approval";
  readonly name = "Requires Approval";

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    if (ctx.requiresApproval) {
      return result(this, "require_approval",
        `Action "${ctx.actionId}" is flagged requiresApproval=true in the action registry. ` +
        `Human review is required before execution.`,
        { explanation: "Action declared requiresApproval=true in domain registry.", severity: "medium" },
      );
    }
    return result(this, "abstain",
      `Action "${ctx.actionId}" does not require approval — rule abstains.`,
    );
  }
}

/**
 * AutomationEligibilityRule
 *
 * Denies execution when running in automation or scheduled mode,
 * but the action was not declared automationEligible=true.
 *
 * This prevents unsafe actions from being silently executed in pipelines.
 *
 * Effect: deny (when triggered), abstain otherwise
 * Trigger: executionMode is "automation" or "scheduled" AND automationEligible=false
 */
export class AutomationEligibilityRule implements PolicyRule {
  readonly id   = "automation_eligibility";
  readonly name = "Automation Eligibility";

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    const isAutomatedMode =
      ctx.executionMode === "automation" || ctx.executionMode === "scheduled";

    if (!isAutomatedMode) {
      return result(this, "abstain",
        `executionMode="${ctx.executionMode}" — automation eligibility rule abstains.`,
      );
    }

    if (!ctx.automationEligible) {
      return result(this, "deny",
        `Action "${ctx.actionId}" is NOT automation-eligible but was triggered in ` +
        `"${ctx.executionMode}" mode. Blocking to prevent unattended unsafe execution.`,
        {
          explanation: "Action declared automationEligible=false and triggered in automated mode.",
          severity:    "high",
        },
      );
    }

    return result(this, "allow",
      `Action "${ctx.actionId}" is automation-eligible and in "${ctx.executionMode}" mode — allowing.`,
    );
  }
}

/**
 * EnvironmentSafetyRule
 *
 * Requires approval for actions in production environment when the action
 * pattern suggests destructive behavior (delete, publish, overwrite).
 *
 * Effect: require_approval (when triggered), abstain otherwise
 * Trigger: environment=production AND destructive action pattern
 *
 * Phase 1: heuristic detection by actionId keyword.
 * Phase 2: action registry will declare a `riskLevel` field.
 */
export class EnvironmentSafetyRule implements PolicyRule {
  readonly id   = "environment_safety";
  readonly name = "Environment Safety";

  private static DESTRUCTIVE_PATTERNS = [
    "delete", "remove", "purge", "archive", "overwrite",
    "publish", "sync", "create", "generate",
  ];

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    if (ctx.environment !== "production") {
      return result(this, "abstain",
        `environment="${ctx.environment ?? "unset"}" — environment safety rule abstains.`,
      );
    }

    const actionLower = ctx.actionId.toLowerCase();
    const isDestructive = EnvironmentSafetyRule.DESTRUCTIVE_PATTERNS.some(
      p => actionLower.includes(p),
    );

    if (isDestructive) {
      return result(this, "require_approval",
        `Action "${ctx.actionId}" matches a destructive pattern in production environment. ` +
        `Human approval required as production safety measure.`,
        {
          explanation: "Destructive action pattern detected in production environment.",
          severity:    "high",
        },
      );
    }

    return result(this, "abstain",
      `Action "${ctx.actionId}" does not match destructive patterns — rule abstains.`,
    );
  }
}

/**
 * PermissiveRule
 *
 * Always returns "allow". Used in bypass/test/development engines where
 * the caller wants to skip all blocking policies.
 *
 * NEVER register this rule in production engines.
 * Production systems MUST NOT use this rule.
 */
export class PermissiveRule implements PolicyRule {
  readonly id   = "permissive_bypass";
  readonly name = "Permissive Bypass (Dev/Test)";

  evaluate(ctx: PolicyContext): PolicyRuleResult {
    void ctx;
    return result(this, "allow",
      "DEVELOPMENT/TEST BYPASS: PermissiveRule always grants allow. " +
      "This rule MUST NOT be active in production.",
    );
  }
}

// ── Default rule set ───────────────────────────────────────────────────────────

/**
 * Standard production rule set.
 * Order matters for logging clarity but not for decision (engine uses priority, not order).
 */
export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  new MissingTenantRule(),
  new MissingUserRule(),
  new RequiresApprovalRule(),
  new AutomationEligibilityRule(),
  new EnvironmentSafetyRule(),
];

// ── Re-exports for convenience ─────────────────────────────────────────────────

export type { PolicyReason, PolicyViolation } from "./policy-types";
