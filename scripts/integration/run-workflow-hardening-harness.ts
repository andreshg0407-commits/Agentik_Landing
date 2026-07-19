/**
 * scripts/integration/run-workflow-hardening-harness.ts
 *
 * Agentik — Workflow Hardening Integration Harness HTTP Client
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01 — Phase 19
 *
 * Calls POST /api/internal/integration-tests/workflow-hardening
 * and prints pass/fail results.
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   npx tsx scripts/integration/run-workflow-hardening-harness.ts [BASE_URL]
 */
export {};

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const TOKEN    = process.env.AGENTIK_INTEGRATION_TEST_TOKEN ?? "agentik-dev-test-token";
const ENDPOINT = `${BASE_URL}/api/internal/integration-tests/workflow-hardening`;

interface TestResult {
  name:    string;
  passed:  boolean;
  message: string;
}

interface HarnessResponse {
  sprint:  string;
  phase:   string;
  passed:  number;
  failed:  number;
  total:   number;
  success: boolean;
  results: TestResult[];
}

async function main(): Promise<void> {
  console.log("\nAGENTIK-WORKFLOW-HARDENING-01 — Integration Harness");
  console.log("─────────────────────────────────────────────────────");
  console.log(`Endpoint: ${ENDPOINT}\n`);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":                "application/json",
        "x-agentik-integration-token": TOKEN,
      },
    });
  } catch (err: unknown) {
    console.error("Network error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const body = await res.json() as HarnessResponse;

  if (!res.ok && !body.results) {
    console.error("Error response:", JSON.stringify(body, null, 2));
    process.exit(1);
  }

  for (const r of body.results ?? []) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} ${r.name}${r.passed ? "" : ` — ${r.message}`}`);
  }

  console.log("\n─────────────────────────────────────────────────────");
  console.log(`Sprint:  ${body.sprint}`);
  console.log(`Phase:   ${body.phase}`);
  console.log(`Total:   ${body.total} | Passed: ${body.passed} | Failed: ${body.failed}`);

  if (body.success) {
    console.log("\nAll workflow hardening integration tests passed.");
    process.exit(0);
  } else {
    console.log("\nSome tests failed. See above for details.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
