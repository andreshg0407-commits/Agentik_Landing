/**
 * scripts/integration/run-autonomous-runtime-harness.ts
 *
 * Agentik — Autonomous Operations — HTTP Integration Harness Client
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Consumes: POST /api/internal/integration-tests/autonomous-runtime
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   npx tsx scripts/integration/run-autonomous-runtime-harness.ts
 *
 * Or with a custom URL:
 *   HARNESS_URL=http://localhost:3000 npx tsx scripts/integration/run-autonomous-runtime-harness.ts
 *
 * Exits with code 1 if any test fails.
 */

// Module isolation — keeps this file's declarations out of global script scope
export type { };

// ── Config ────────────────────────────────────────────────────────────────────

const AO_BASE_URL  = process.env.HARNESS_URL ?? "http://localhost:3000";
const AO_TOKEN     = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";
const AO_ENDPOINT  = `${AO_BASE_URL}/api/internal/integration-tests/autonomous-runtime`;

// ── Response shape ────────────────────────────────────────────────────────────

interface AoTestResult {
  test:    number;
  label:   string;
  pass:    boolean;
  detail:  string;
  error?:  string;
}

interface AoHarnessResponse {
  sprint:    string;
  phase:     string;
  testRunId: string;
  timestamp: string;
  summary:   { total: number; pass: number; fail: number };
  verdict:   "PASS" | "PARTIAL" | "FAIL";
  results:   AoTestResult[];
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runAutonomousHarness(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AUTONOMOUS-OPERATIONS-01 — Integration Harness Client");
  console.log(`  Endpoint: ${AO_ENDPOINT}`);
  console.log("=================================================================\n");

  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    console.error("ERROR: ENABLE_INTERNAL_INTEGRATION_TESTS must be set to 'true'.");
    process.exit(1);
  }

  let response: Response;
  try {
    response = await fetch(AO_ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":                "application/json",
        "x-agentik-integration-token": AO_TOKEN,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.error(`\nNetwork error — is the dev server running at ${AO_BASE_URL}?`);
    console.error(String(err));
    process.exit(1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`\nHTTP ${response.status} — ${text}`);
    process.exit(1);
  }

  const data = await response.json() as AoHarnessResponse;

  console.log(`Sprint:    ${data.sprint}`);
  console.log(`Phase:     ${data.phase}`);
  console.log(`TestRunId: ${data.testRunId}`);
  console.log(`Timestamp: ${data.timestamp}`);
  console.log(`\nResults:\n`);

  for (const r of data.results) {
    const icon   = r.pass ? "✓" : "✗";
    const label  = `[${r.test.toString().padStart(2, "0")}] ${r.label}`;
    console.log(`  ${icon} ${label}`);
    if (!r.pass || process.env.VERBOSE === "1") {
      const detail = `${r.detail}${r.error ? ` | ERROR: ${r.error}` : ""}`;
      console.log(`     ${detail}`);
    }
  }

  console.log(`\n-----------------------------------------------------------------`);
  console.log(`  Total: ${data.summary.total}`);
  console.log(`  Pass:  ${data.summary.pass}`);
  console.log(`  Fail:  ${data.summary.fail}`);
  console.log(`  Verdict: ${data.verdict}`);
  console.log(`=================================================================\n`);

  if (data.verdict !== "PASS") {
    process.exit(1);
  }
}

runAutonomousHarness().catch(err => {
  console.error("Harness client crashed:", err);
  process.exit(1);
});
