/**
 * lib/copilot/policy/policy-validate.ts
 *
 * AGENTIK-POLICY-ENGINE-01 — Policy Engine smoke tests.
 * SERVER ONLY — no React imports, no AI, no external calls.
 * @server-only
 *
 * All tests are deterministic and synchronous.
 * Safe to run at startup for health checks.
 * Never throws — returns a structured report.
 */
import "server-only";

import type { PolicyContext } from "./policy-types";
import type { PolicyDecision } from "./policy-types";
import {
  PolicyEngine,
  createProductionPolicyEngine,
  createPermissivePolicyEngine,
} from "./policy-engine";
import {
  MissingTenantRule,
  MissingUserRule,
  RequiresApprovalRule,
  AutomationEligibilityRule,
  EnvironmentSafetyRule,
  PermissiveRule,
  DEFAULT_POLICY_RULES,
} from "./policy-rules";

// ── Test case definition ───────────────────────────────────────────────────────

interface PolicyTestCase {
  description:      string;
  ctx:              PolicyContext;
  expectedDecision: PolicyDecision;
  /** If provided, at least one reason with this ruleId must be present */
  expectedRuleId?:  string;
  /** If true, at least one violation must be present */
  expectViolation?: boolean;
  /** Custom engine for this test (defaults to production engine) */
  engine?:          PolicyEngine;
}

// ── Test context factory ───────────────────────────────────────────────────────

function makeCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    executionId:        "test-exec-001",
    correlationId:      "test-corr-001",
    tenantId:           "castillitos",
    userId:             "user-abc",
    actionId:           "catalog.findUnpublishedProducts",
    domain:             "shopify",
    requiresApproval:   false,
    automationEligible: true,
    requestedAt:        new Date(),
    executionMode:      "copilot",
    environment:        "development",
    metadata:           {},
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

const TEST_CASES: PolicyTestCase[] = [

  // ── 1. Basic allow ────────────────────────────────────────────────────────
  {
    description:      "Safe read action — should be allowed",
    ctx:              makeCtx({
      requiresApproval:   false,
      automationEligible: true,
      executionMode:      "copilot",
    }),
    expectedDecision: "allow",
  },

  // ── 2. requiresApproval=true ──────────────────────────────────────────────
  {
    description:      "requiresApproval=true — must require_approval",
    ctx:              makeCtx({
      actionId:         "catalog.publishPendingProducts",
      requiresApproval: true,
      executionMode:    "copilot",
    }),
    expectedDecision: "require_approval",
    expectedRuleId:   "requires_approval",
    expectViolation:  true,
  },

  // ── 3. Missing tenant ─────────────────────────────────────────────────────
  {
    description:      "Missing tenantId — must deny",
    ctx:              makeCtx({ tenantId: "" }),
    expectedDecision: "deny",
    expectedRuleId:   "missing_tenant",
    expectViolation:  true,
  },

  // ── 4. Missing userId (non-system) ────────────────────────────────────────
  {
    description:      "Missing userId in copilot mode — must deny",
    ctx:              makeCtx({ userId: "", executionMode: "copilot" }),
    expectedDecision: "deny",
    expectedRuleId:   "missing_user",
    expectViolation:  true,
  },

  // ── 5. Missing userId in system mode — allowed ────────────────────────────
  {
    description:      "Missing userId in system mode — should be allowed (system bypass)",
    ctx:              makeCtx({ userId: "", executionMode: "system" }),
    expectedDecision: "allow",
  },

  // ── 6. automationEligible=false in automation mode — deny ─────────────────
  {
    description:      "automation mode + automationEligible=false — must deny",
    ctx:              makeCtx({
      executionMode:      "automation",
      automationEligible: false,
      requiresApproval:   true,
    }),
    expectedDecision: "deny",
    expectedRuleId:   "automation_eligibility",
    expectViolation:  true,
  },

  // ── 7. automationEligible=true in automation mode — allow ─────────────────
  {
    description:      "automation mode + automationEligible=true — should be allowed",
    ctx:              makeCtx({
      executionMode:      "automation",
      automationEligible: true,
      requiresApproval:   false,
    }),
    expectedDecision: "allow",
    expectedRuleId:   "automation_eligibility",
  },

  // ── 8. deny overrides require_approval (priority test) ────────────────────
  {
    description:      "deny beats require_approval (priority: deny > require_approval)",
    ctx:              makeCtx({
      tenantId:         "",           // → MissingTenantRule: deny
      requiresApproval: true,         // → RequiresApprovalRule: require_approval
    }),
    expectedDecision: "deny",         // deny wins
    expectedRuleId:   "missing_tenant",
  },

  // ── 9. require_approval overrides allow (priority test) ───────────────────
  {
    description:      "require_approval beats allow (priority: require_approval > allow)",
    ctx:              makeCtx({
      requiresApproval:   true,       // → RequiresApprovalRule: require_approval
      automationEligible: true,       // → AutomationEligibilityRule: abstain (copilot mode)
    }),
    expectedDecision: "require_approval",
  },

  // ── 10. Permissive engine bypasses all ────────────────────────────────────
  {
    description:      "permissive engine bypasses requiresApproval=true",
    ctx:              makeCtx({
      requiresApproval: true,
      executionMode:    "copilot",
    }),
    expectedDecision: "allow",
    engine:           createPermissivePolicyEngine(),
  },

  // ── 11. Multiple rules, deny wins ────────────────────────────────────────
  {
    description:      "automation mode + not eligible + requiresApproval → deny wins",
    ctx:              makeCtx({
      executionMode:      "automation",
      automationEligible: false,
      requiresApproval:   true,
    }),
    expectedDecision: "deny",
    expectedRuleId:   "automation_eligibility",
  },

  // ── 12. Empty engine — fail-closed default ────────────────────────────────
  {
    description:      "empty engine (no rules) — fail-closed → require_approval",
    ctx:              makeCtx({ requiresApproval: false }),
    expectedDecision: "require_approval",
    engine:           new PolicyEngine(), // no rules registered
  },

];

// ── Report type ────────────────────────────────────────────────────────────────

export interface PolicyValidateResult {
  ok:         boolean;
  passed:     number;
  failed:     number;
  total:      number;
  errors:     string[];
  warnings:   string[];
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run the full Policy Engine smoke check suite.
 * Returns a structured report. Never throws.
 * All operations are synchronous — no I/O, no API calls.
 */
export function runPolicyEngineSmokeCheck(): PolicyValidateResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let passed = 0;
  let failed = 0;

  // ── Structural checks ────────────────────────────────────────────────────

  // Verify DEFAULT_POLICY_RULES has all 5 expected rules
  const expectedIds = [
    "missing_tenant",
    "missing_user",
    "requires_approval",
    "automation_eligibility",
    "environment_safety",
  ];
  for (const id of expectedIds) {
    if (!DEFAULT_POLICY_RULES.some(r => r.id === id)) {
      errors.push(`[structure] DEFAULT_POLICY_RULES is missing rule "${id}"`);
    }
  }

  // Verify duplicate registration is safely rejected
  const dupeEngine = new PolicyEngine();
  dupeEngine.registerRule(new RequiresApprovalRule());
  dupeEngine.registerRule(new RequiresApprovalRule()); // duplicate
  if (dupeEngine.listRuleIds().filter(id => id === "requires_approval").length > 1) {
    errors.push("[structure] Duplicate rule registration was not rejected");
  }

  // ── Test cases ────────────────────────────────────────────────────────────

  const prodEngine = createProductionPolicyEngine();

  for (const tc of TEST_CASES) {
    const engine = tc.engine ?? prodEngine;
    const result = engine.evaluate(tc.ctx);

    // Check decision
    if (result.decision !== tc.expectedDecision) {
      errors.push(
        `[decision] "${tc.description}" — ` +
        `got "${result.decision}", expected "${tc.expectedDecision}". ` +
        `Triggered rules: [${result.triggeredRuleIds.join(", ")}]. ` +
        `Reasons: ${result.reasons.map(r => `${r.ruleId}:${r.effect}`).join(", ")}`,
      );
      failed++;
      continue;
    }

    // Check expected rule triggered
    if (tc.expectedRuleId && !result.triggeredRuleIds.includes(tc.expectedRuleId)) {
      errors.push(
        `[rule] "${tc.description}" — ` +
        `expected rule "${tc.expectedRuleId}" to be triggered, ` +
        `but triggered: [${result.triggeredRuleIds.join(", ")}]`,
      );
      failed++;
      continue;
    }

    // Check violation presence
    if (tc.expectViolation && result.violations.length === 0) {
      errors.push(
        `[violation] "${tc.description}" — expected at least one violation, got none`,
      );
      failed++;
      continue;
    }

    // Check report completeness
    if (!result.executionId || !result.tenantId || !result.actionId) {
      errors.push(
        `[report] "${tc.description}" — PolicyEvaluationResult missing required fields`,
      );
      failed++;
      continue;
    }

    if (typeof result.durationMs !== "number") {
      errors.push(`[report] "${tc.description}" — durationMs is not a number`);
      failed++;
      continue;
    }

    passed++;
  }

  // ── Priority invariants ───────────────────────────────────────────────────

  // Verify priority: deny wins over everything
  const priorityEngine = new PolicyEngine();
  priorityEngine.registerRule(new RequiresApprovalRule()); // require_approval
  priorityEngine.registerRule(new MissingTenantRule());    // deny

  const priorityCtx = makeCtx({ tenantId: "", requiresApproval: true });
  const priorityResult = priorityEngine.evaluate(priorityCtx);

  if (priorityResult.decision !== "deny") {
    errors.push(
      `[priority] deny should win over require_approval, ` +
      `but got "${priorityResult.decision}"`,
    );
  }

  // Verify priority: require_approval wins over allow
  const ra_engine = new PolicyEngine();
  ra_engine.registerRule(new PermissiveRule());       // allow
  ra_engine.registerRule(new RequiresApprovalRule()); // require_approval

  const ra_ctx = makeCtx({ requiresApproval: true });
  const ra_result = ra_engine.evaluate(ra_ctx);

  if (ra_result.decision !== "require_approval") {
    errors.push(
      `[priority] require_approval should win over allow, ` +
      `but got "${ra_result.decision}"`,
    );
  }

  return {
    ok:       errors.length === 0,
    passed,
    failed,
    total:    TEST_CASES.length,
    errors,
    warnings,
  };
}
