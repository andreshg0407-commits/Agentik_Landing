/**
 * scripts/integration/run-copilot-intelligence-harness.ts
 *
 * HTTP client for the Copilot Intelligence integration test harness.
 * Run: npx tsx scripts/integration/run-copilot-intelligence-harness.ts
 *
 * Requires: Next.js dev server running on localhost:3000
 *           ENABLE_INTERNAL_INTEGRATION_TESTS=true in .env.local
 */

// Module marker — prevents TypeScript from treating this as an ambient script
// and conflicting with other harness scripts that share function names.
export {};

const COPILOT_BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const COPILOT_ENDPOINT = `${COPILOT_BASE_URL}/api/internal/integration-tests/copilot-intelligence`;

async function main(): Promise<void> {
  console.log(`AGENTIK-COPILOT-INTELLIGENCE-01 — Integration Harness`);
  console.log(`Endpoint: ${COPILOT_ENDPOINT}\n`);

  const token = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";

  let res: Response;
  try {
    res = await fetch(COPILOT_ENDPOINT, {
      method:  "GET",
      headers: { "x-agentik-integration-token": token },
    });
  } catch (err) {
    console.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Is the Next.js dev server running?");
    process.exit(1);
  }

  const body = await res.json() as {
    summary: { passed: number; failed: number; total: number; elapsedMs: number; verdict: string };
    results: Array<{ test: string; passed: boolean; message: string; data?: unknown }>;
  };

  const { summary, results } = body;

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} [${r.test}] ${r.message}`);
    if (!r.passed && r.data) {
      console.error(`    Data: ${JSON.stringify(r.data, null, 2)}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Passed: ${summary.passed}  |  Failed: ${summary.failed}  |  Total: ${summary.total}  |  ${summary.elapsedMs}ms`);
  console.log(`Verdict: ${summary.verdict}`);

  process.exit(summary.verdict === "PASS" ? 0 : 1);
}

main();
