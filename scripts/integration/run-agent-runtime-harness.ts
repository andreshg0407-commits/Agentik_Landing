/**
 * scripts/integration/run-agent-runtime-harness.ts
 *
 * Agentik — Universal Agent Runtime — Integration Harness HTTP Client
 * Sprint: AGENTIK-AGENT-RUNTIME-01 Phase 15
 *
 * Calls POST /api/internal/integration-tests/agent-runtime
 * and prints per-test results.
 *
 * Prerequisites:
 *   - Next.js dev server running on localhost:3000
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true in .env.local
 *
 * Run:
 *   npx tsx scripts/integration/run-agent-runtime-harness.ts
 */

// Module isolation — keeps this file's declarations out of global script scope
export type { };

const BASE_URL = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";
const TOKEN    = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";

interface TestResult {
  test:    number;
  label:   string;
  pass:    boolean;
  detail:  string;
  error?:  string;
}

interface HarnessResponse {
  sprint:    string;
  phase:     string;
  timestamp: string;
  summary:   { total: number; pass: number; fail: number };
  verdict:   "PASS" | "PARTIAL" | "FAIL";
  results:   TestResult[];
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("AGENTIK-AGENT-RUNTIME-01 — Integration Harness");
  console.log(`Target: ${BASE_URL}/api/internal/integration-tests/agent-runtime`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/internal/integration-tests/agent-runtime`, {
      method:  "POST",
      headers: {
        "Content-Type":                  "application/json",
        "x-agentik-integration-token":   TOKEN,
      },
    });
  } catch (err) {
    console.error(`Connection failed: ${err}`);
    console.error("Is the Next.js dev server running?");
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = (await res.json()) as HarnessResponse;

  console.log(`Sprint:    ${data.sprint}`);
  console.log(`Phase:     ${data.phase}`);
  console.log(`Timestamp: ${data.timestamp}`);
  console.log(`Verdict:   ${data.verdict}\n`);

  for (const r of data.results) {
    const icon = r.pass ? "✓" : "✗";
    console.log(`  ${icon} Test ${r.test}: ${r.label}`);
    if (r.detail) console.log(`       ${r.detail}`);
    if (r.error)  console.error(`       ERROR: ${r.error}`);
  }

  console.log(`\n─────────────────────────────────────────────────`);
  console.log(`Total: ${data.summary.total} | Pass: ${data.summary.pass} | Fail: ${data.summary.fail}`);
  console.log(`Verdict: ${data.verdict}`);
  console.log(`─────────────────────────────────────────────────\n`);

  process.exit(data.summary.fail === 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
