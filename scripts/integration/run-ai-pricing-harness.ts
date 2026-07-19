/**
 * scripts/integration/run-ai-pricing-harness.ts
 *
 * Agentik — AI Pricing Engine — Integration Harness HTTP Client
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Calls the integration test route and prints the result.
 *
 * Usage:
 *   npx tsx scripts/integration/run-ai-pricing-harness.ts
 *
 * Requires:
 *   - Dev server running on localhost:3000
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 */
export type { };

const AP_BASE_URL  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const AP_TOKEN     = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
const AP_ENDPOINT  = `${AP_BASE_URL}/api/internal/integration-tests/ai-pricing`;

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-PRICING-ENGINE-01 — Integration Harness Client");
  console.log("=================================================================");
  console.log(`  Endpoint: ${AP_ENDPOINT}\n`);

  const response = await fetch(AP_ENDPOINT, {
    method:  "POST",
    headers: {
      "Content-Type":              "application/json",
      "x-agentik-integration-token": AP_TOKEN,
    },
  });

  if (!response.ok) {
    console.error(`  HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
  }

  const json = await response.json() as {
    sprint: string; verdict: string;
    summary: { total: number; pass: number; fail: number };
    results: Array<{ test: number; label: string; pass: boolean; detail: string; error?: string }>;
  };

  console.log(`  Sprint:  ${json.sprint}`);
  console.log(`  Verdict: ${json.verdict}`);
  console.log(`  Summary: ${json.summary.pass}/${json.summary.total} pass\n`);

  for (const r of json.results) {
    const icon = r.pass ? "✓" : "✗";
    console.log(`  ${icon} [${String(r.test).padStart(2, "0")}] ${r.label}`);
    console.log(`       ${r.detail}${r.error ? ` | ERROR: ${r.error}` : ""}`);
  }

  console.log("\n=================================================================\n");
  process.exit(json.verdict === "PASS" ? 0 : 1);
}

main().catch(err => { console.error("Harness crashed:", err); process.exit(1); });
