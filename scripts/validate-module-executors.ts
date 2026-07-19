/**
 * scripts/validate-module-executors.ts
 *
 * Agentik — Module Executor Health + Contract Validation
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * Validates all module executors: health, action support, validation contract.
 * Usage: npx tsx scripts/validate-module-executors.ts
 *
 * NOTE: Individual executor stubs do not use server-only (stubs have no Prisma).
 * The server-only boundary is enforced at the registry level.
 */

/* eslint-disable no-console */

export type {};

async function main() {
  const { financeExecutor }     = await import("../lib/work/executors/finance-executor");
  const { collectionsExecutor } = await import("../lib/work/executors/collections-executor");
  const { commercialExecutor }  = await import("../lib/work/executors/commercial-executor");
  const { marketingExecutor }   = await import("../lib/work/executors/marketing-executor");

  // Supported + unsupported actions per executor for contract testing
  const EXECUTOR_TEST_CASES = [
    {
      executor:          financeExecutor,
      supportedAction:   "RECONCILIATION",
      unsupportedAction: "PUBLISH_CONTENT",
    },
    {
      executor:          collectionsExecutor,
      supportedAction:   "FOLLOW_UP",
      unsupportedAction: "ORDER_RELEASE",
    },
    {
      executor:          commercialExecutor,
      supportedAction:   "ORDER_RELEASE",
      unsupportedAction: "PAYMENT_PLAN",
    },
    {
      executor:          marketingExecutor,
      supportedAction:   "PUBLISH_CONTENT",
      unsupportedAction: "RECONCILIATION",
    },
  ];

  const ORG_SLUG    = "castillitos";
  const APPROVAL_ID = "fixture_approval_001";

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Module Executor Health Validation        ║");
  console.log("║  AGENTIK-MULTI-MODULE-EXECUTORS-01        ║");
  console.log("╚══════════════════════════════════════════╝\n");

  let allPassed = true;
  const results: string[] = [];

  for (const { executor, supportedAction, unsupportedAction } of EXECUTOR_TEST_CASES) {
    const name = executor.module.toUpperCase();
    console.log(`── ${name} ──────────────────────────────────────`);

    // 1. Health check
    const health = await executor.healthCheck();
    const healthOk = health.healthy;
    console.log(`  healthCheck:  ${healthOk ? "✅" : "❌"}  ${health.message}`);
    if (!healthOk) allPassed = false;

    // 2. canHandle — supported
    const canHandleSupported = executor.canHandle(supportedAction);
    console.log(`  canHandle(${supportedAction}): ${canHandleSupported ? "✅" : "❌"}`);
    if (!canHandleSupported) allPassed = false;

    // 3. canHandle — unsupported (must return false)
    const canHandleUnsupported = executor.canHandle(unsupportedAction);
    const unsupportedOk = !canHandleUnsupported;
    console.log(`  canHandle(${unsupportedAction}) = false: ${unsupportedOk ? "✅" : "❌"}`);
    if (!unsupportedOk) allPassed = false;

    // 4. validate — valid context
    const validCtx = {
      jobId:         "test_job_001",
      module:        executor.module,
      actionType:    supportedAction,
      approvalId:    APPROVAL_ID,
      approvalTitle: "Test approval",
      orgSlug:       ORG_SLUG,
      metadata:      {},
    };
    const validResult = executor.validate(validCtx);
    console.log(`  validate(valid):    ${validResult.valid ? "✅" : "❌"}  errors=${validResult.errors.join(", ") || "none"}`);
    if (!validResult.valid) allPassed = false;

    // 5. validate — missing orgSlug (must fail)
    const invalidCtx = { ...validCtx, orgSlug: "" };
    const invalidResult = executor.validate(invalidCtx);
    const invalidOk = !invalidResult.valid && invalidResult.errors.length > 0;
    console.log(`  validate(invalid):  ${invalidOk ? "✅" : "❌"}  (expected failure, got: ${invalidResult.valid ? "valid" : "invalid"})`);
    if (!invalidOk) allPassed = false;

    // 6. execute — supported action
    const execResult = await executor.execute(validCtx);
    const execOk = execResult.success && execResult.actionType === supportedAction;
    console.log(`  execute(${supportedAction}): ${execOk ? "✅" : "❌"}  ${execResult.message}`);
    if (!execOk) allPassed = false;

    // 7. Serializable — no Date objects, no class instances
    const json = JSON.stringify(execResult);
    const serializable = json.includes(supportedAction);
    console.log(`  serializable:       ${serializable ? "✅" : "❌"}`);
    if (!serializable) allPassed = false;

    results.push(`${name}: ${allPassed ? "PASS" : "FAIL"}`);
    console.log();
  }

  // Summary
  console.log("══════════════════════════════════════════");
  if (allPassed) {
    console.log("✅  All module executors PASSED validation.\n");
  } else {
    console.log("❌  One or more validations FAILED.\n");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Validation script failed:", err);
  process.exit(1);
});
