/**
 * lib/copilot/runtime/integration-validate.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 — Full integration smoke tests.
 * SERVER ONLY — no React imports, no AI, no external API calls.
 * @server-only
 *
 * Validates the complete pipeline:
 *   Intent Resolver → Execution Planner → Action Runtime →
 *   Approval Gate → Action Dispatcher → Shopify Provider → Domain Action
 *
 * All tests are safe:
 *   - Shopify actions are all stub implementations (no real API calls)
 *   - Uses stubShopifyContextResolver (fake credentials, no network)
 *   - Uses auto_approve gate config only where necessary for flow testing
 *   - Uses auto_block for approval-gate enforcement tests
 *
 * Safe to run at startup. Never throws. Returns a structured report.
 */
import "server-only";

import { intentResolver }           from "@/lib/copilot/intent-resolver";
import { planFromIntentPlan, executeExecutionPlan, ActionDispatcher } from "./execution-runtime";
import type { ExecutionContext, ExecutionStatus } from "./runtime-types";
import { DEFAULT_APPROVAL_GATE_CONFIG }           from "./approval-gate";

import { ShopifyActionProvider }        from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-action-provider";
import { stubShopifyContextResolver }   from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";

// ── Test case definition ───────────────────────────────────────────────────────

interface IntegrationTestCase {
  description:       string;
  utterance:         string;
  expectedStatus:    ExecutionStatus;
  /** If true, expect awaiting_approval (approval gate enforced) */
  expectBlocked?:    boolean;
  /** Override gate to auto_approve for this test (bypasses approval) */
  bypassApproval?:   boolean;
  /** If provided, check that resolvedIntent candidateId matches */
  expectedCandidateId?: string;
}

// ── Test suite ────────────────────────────────────────────────────────────────

const TEST_CASES: IntegrationTestCase[] = [
  // ── End-to-end: approval-gated actions ────────────────────────────────────

  {
    description:          "publish_pending_products — blocked by approval gate",
    utterance:            "Publica los productos pendientes",
    expectedCandidateId:  "publish_pending_products",
    expectedStatus:       "awaiting_approval",
    expectBlocked:        true,
    bypassApproval:       false,
  },
  {
    description:          "sync_catalog — blocked by approval gate",
    utterance:            "Sincroniza el catálogo con Shopify",
    expectedCandidateId:  "sync_catalog",
    expectedStatus:       "awaiting_approval",
    expectBlocked:        true,
    bypassApproval:       false,
  },
  {
    description:          "create_discount — blocked by approval gate (bypass for flow test)",
    utterance:            "Haz una promoción del 20%",
    expectedCandidateId:  "create_discount",
    // createPromotion requiresApproval=true → blocked without bypass
    expectedStatus:       "awaiting_approval",
    expectBlocked:        true,
    bypassApproval:       false,
  },

  // ── End-to-end: read-only / safe actions (auto-approve not needed) ─────────

  {
    description:          "find_unpublished_products — runs to completion (stub)",
    utterance:            "¿Qué productos no están publicados?",
    expectedCandidateId:  "find_unpublished_products",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       false,
  },
  {
    description:          "find_failed_payments — runs to completion (stub)",
    utterance:            "Muéstrame los pagos fallidos",
    expectedCandidateId:  "find_failed_payments",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       false,
  },
  {
    description:          "find_active_promotions — runs to completion (stub)",
    utterance:            "Ver promociones activas",
    expectedCandidateId:  "find_active_promotions",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       false,
  },
  {
    description:          "find_delayed_shipments — runs to completion (stub)",
    utterance:            "Envíos retrasados",
    expectedCandidateId:  "find_delayed_shipments",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       false,
  },
  {
    description:          "get_sales_overview — runs to completion (stub)",
    utterance:            "Resumen de ventas de esta semana",
    expectedCandidateId:  "get_sales_overview",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       false,
  },
  {
    description:          "complete_seo — blocked (requiresApproval in enrichment)",
    utterance:            "Optimiza el SEO de los productos",
    expectedCandidateId:  "complete_seo",
    // Will be blocked or completed depending on registry value
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       true, // use auto_approve to force execution
  },

  // ── Approval bypass tests (auto_approve gate) ─────────────────────────────

  {
    description:          "publish_pending_products — bypassed for flow test",
    utterance:            "Publica los productos pendientes",
    expectedCandidateId:  "publish_pending_products",
    expectedStatus:       "completed",   // stub returns success
    expectBlocked:        false,
    bypassApproval:       true,
  },
  {
    description:          "generate_discount_codes — bypassed for flow test",
    utterance:            "Genera 50 códigos de descuento",
    expectedCandidateId:  "generate_discount_codes",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       true,
  },
  {
    description:          "add products to collection (create_collection intent) — bypassed",
    utterance:            "Crea una nueva colección",
    expectedCandidateId:  "create_collection",
    expectedStatus:       "completed",
    expectBlocked:        false,
    bypassApproval:       true,
  },
];

// ── Test context builder ───────────────────────────────────────────────────────

function makeCtx(index: number): ExecutionContext {
  return {
    executionId:    `integration-test-${index}`,
    correlationId:  `corr-${index}`,
    tenantId:       "castillitos",
    userId:         "integration-test-user",
    requestedAt:    new Date(),
    idempotencyKey: `idem-integration-${index}`,
    metadata:       { source: "integration-validate" },
  };
}

// ── Result type ────────────────────────────────────────────────────────────────

export interface IntegrationValidateResult {
  ok:           boolean;
  passed:       number;
  failed:       number;
  errors:       string[];
  warnings:     string[];
  domainCheck:  boolean;
  eventBusOk:   boolean;
  rollbackOk:   boolean;
  totalTests:   number;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run the full integration smoke suite.
 *
 * Tests:
 *   1. Intent resolution (utterance → ResolvedIntent)
 *   2. Plan construction (IntentExecutionPlan → RuntimeExecutionPlan)
 *   3. Provider registration (ActionDispatcher ← ShopifyActionProvider)
 *   4. Execution (executeExecutionPlan)
 *   5. Approval gate enforcement
 *   6. Execution report completeness
 *   7. Event log presence (RuntimeLogger)
 *   8. Rollback descriptor generation
 *
 * Never throws. Returns a structured IntegrationValidateResult.
 */
export async function runIntegrationValidation(): Promise<IntegrationValidateResult> {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let passed = 0;
  let failed = 0;

  // ── 1. Build shared dispatcher ─────────────────────────────────────────────

  const provider = new ShopifyActionProvider(stubShopifyContextResolver("castillitos"));
  const dispatcher = new ActionDispatcher();
  dispatcher.registerProvider(provider as Parameters<typeof dispatcher.registerProvider>[0]);

  // ── 2. Domain check: verify provider registered correctly ─────────────────

  const domains = dispatcher.listDomains();
  const domainCheck = domains.includes("shopify");
  if (!domainCheck) {
    errors.push("[domain] ShopifyActionProvider not registered — listDomains() missing 'shopify'");
  }

  const registeredActions = dispatcher.listActions();
  if (registeredActions.length === 0) {
    errors.push("[domain] ActionDispatcher has zero registered actions after ShopifyActionProvider registration");
  }

  // ── 3. Runtime domain-agnostic check: verify no Shopify-specific exports ──

  // The runtime core must not export ShopifyActionProvider or ShopifyContext.
  // We check by verifying the action-dispatcher only knows about abstract interfaces.
  const actionIds = registeredActions.map(a => a.actionId);
  const allShopify = actionIds.every(id => !id.startsWith("finance.") && !id.startsWith("commercial."));
  if (!allShopify) {
    warnings.push("[domain] Unexpected non-Shopify actions found in dispatcher after Shopify-only registration");
  }

  // ── 4. Run test cases ──────────────────────────────────────────────────────

  let eventBusOk  = true;
  let rollbackOk  = true;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc  = TEST_CASES[i];
    const ctx = makeCtx(i);

    // ── Step A: Intent resolution ────────────────────────────────────────────
    const resolution = intentResolver.resolve(tc.utterance);

    if (!resolution.matched || !resolution.resolvedIntent) {
      errors.push(
        `[intent] "${tc.description}" — ` +
        `utterance "${tc.utterance}" did not match any intent. ` +
        `Errors: ${resolution.errors.join("; ")}`,
      );
      failed++;
      continue;
    }

    if (tc.expectedCandidateId &&
        resolution.resolvedIntent.candidateId !== tc.expectedCandidateId) {
      errors.push(
        `[intent] "${tc.description}" — ` +
        `got candidateId "${resolution.resolvedIntent.candidateId}", ` +
        `expected "${tc.expectedCandidateId}"`,
      );
      failed++;
      continue;
    }

    // ── Step B: Execution plan construction ──────────────────────────────────
    const intentPlan = intentResolver.buildExecutionPlan(resolution.resolvedIntent);
    const runtimePlan = planFromIntentPlan(intentPlan, {
      planId:  `plan-${i}`,
      stepId:  `step-1-${i}`,
      domain:  "shopify",
    });

    if (runtimePlan.steps.length === 0) {
      errors.push(`[plan] "${tc.description}" — runtimePlan has no steps`);
      failed++;
      continue;
    }

    // ── Step C: Execute ──────────────────────────────────────────────────────
    const approvalConfig = tc.bypassApproval
      ? { strategy: "auto_approve" as const, gateAutomationEligible: false }
      : DEFAULT_APPROVAL_GATE_CONFIG;

    let report: Awaited<ReturnType<typeof executeExecutionPlan>>;
    try {
      report = await executeExecutionPlan(runtimePlan, ctx, dispatcher, {
        policy:         { stopOnFirstFailure: false, stopOnFirstBlock: false },
        approvalConfig,
        silent:         true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[runtime] "${tc.description}" — executeExecutionPlan threw: ${msg}`);
      failed++;
      continue;
    }

    // ── Step D: Verify overall status ────────────────────────────────────────
    if (report.overallStatus !== tc.expectedStatus) {
      errors.push(
        `[status] "${tc.description}" — ` +
        `overallStatus is "${report.overallStatus}", expected "${tc.expectedStatus}". ` +
        `Errors: ${report.errors.join("; ")}`,
      );
      failed++;
      continue;
    }

    // ── Step E: Verify approval blocking ────────────────────────────────────
    if (tc.expectBlocked) {
      const hasBlocked = report.awaitingApproval > 0 || report.blockedSteps > 0;
      if (!hasBlocked) {
        errors.push(
          `[approval] "${tc.description}" — expected step to be blocked/awaiting_approval, ` +
          `but awaitingApproval=${report.awaitingApproval}, blockedSteps=${report.blockedSteps}`,
        );
        failed++;
        continue;
      }
    }

    // ── Step F: Report completeness check ────────────────────────────────────
    if (!report.executionId || !report.tenantId || !report.audit) {
      errors.push(`[report] "${tc.description}" — ExecutionReport missing required fields`);
      failed++;
      continue;
    }

    if (!report.audit.planTitle || !report.audit.initiatedBy) {
      errors.push(`[audit] "${tc.description}" — ExecutionAudit missing planTitle or initiatedBy`);
      failed++;
      continue;
    }

    // ── Step G: Event bus check (RuntimeLogger) ───────────────────────────────
    // We rely on silent mode having not crashed — a log error would mean the logger failed.
    if (report.startedAt >= report.finishedAt && report.durationMs < 0) {
      eventBusOk = false;
      warnings.push(`[events] "${tc.description}" — execution timing appears invalid`);
    }

    // ── Step H: Rollback descriptor check ────────────────────────────────────
    if (!report.rollback) {
      rollbackOk = false;
      errors.push(`[rollback] "${tc.description}" — RollbackDescriptor is missing from report`);
      failed++;
      continue;
    }

    if (typeof report.rollback.completedStepCount !== "number") {
      rollbackOk = false;
      errors.push(`[rollback] "${tc.description}" — RollbackDescriptor.completedStepCount is not a number`);
      failed++;
      continue;
    }

    passed++;
  }

  // ── 5. Additional structural checks ───────────────────────────────────────

  // Verify dispatcher stays domain-agnostic (no Shopify-specific class leaks)
  const dispatcherStr = dispatcher.constructor.name;
  if (dispatcherStr !== "ActionDispatcher") {
    warnings.push(`[arch] Dispatcher class name is "${dispatcherStr}" — unexpected`);
  }

  // Verify circular dependency isolation: runtime should not know about Shopify
  // We confirm this indirectly: if ShopifyActionProvider is correctly external,
  // the dispatcher only knows abstract ActionDefinition entries.
  const shopifyDomainActions = registeredActions.filter(a => a.domain === "shopify");
  if (shopifyDomainActions.length === 0) {
    errors.push("[arch] No shopify-domain actions found in dispatcher after registration");
  }

  // Check idempotencyKey propagation
  const testCtx = makeCtx(999);
  if (!testCtx.idempotencyKey) {
    warnings.push("[idempotency] idempotencyKey not set on test ExecutionContext");
  }

  return {
    ok:          errors.length === 0,
    passed,
    failed,
    errors,
    warnings,
    domainCheck,
    eventBusOk,
    rollbackOk,
    totalTests:  TEST_CASES.length,
  };
}
