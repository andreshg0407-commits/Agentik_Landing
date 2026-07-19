/**
 * scripts/integration/run-autonomous-operations-harness.ts
 *
 * AGENTIK-INTEGRATION-HARNESS-01 — HTTP client for the integration harness
 *
 * Calls POST /api/internal/integration-tests/autonomous-operations
 * and prints results. NO server-only imports — pure HTTP fetch client.
 *
 * Prerequisites:
 *   - Next.js dev server running (or deployed)
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true in .env
 *   - INTERNAL_INTEGRATION_TEST_TOKEN=<token> in .env
 *
 * Run:
 *   npx dotenv-cli -e .env -- npx tsx scripts/integration/run-autonomous-operations-harness.ts
 *
 * Or with a custom base URL:
 *   BASE_URL=http://localhost:3000 \
 *   npx dotenv-cli -e .env -- npx tsx scripts/integration/run-autonomous-operations-harness.ts
 */

export {};

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TOKEN    = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;
const ENDPOINT = `${BASE_URL}/api/internal/integration-tests/autonomous-operations`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestCheck {
  label:   string;
  passed:  boolean;
  detail?: string;
}

interface TestSection {
  name:    string;
  checks:  TestCheck[];
  error?:  string;
}

interface HarnessResponse {
  ok:        boolean;
  testRunId: string;
  orgSlug:   string;
  summary:   { passed: number; failed: number; total: number; sections: number };
  sections:  TestSection[];
  cleanup:   string[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("AGENTIK-INTEGRATION-HARNESS-01 — Autonomous Operations");
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log("═".repeat(60));

  if (!TOKEN) {
    console.error("\nABORT: INTERNAL_INTEGRATION_TEST_TOKEN is not set.");
    console.error("  Set it in .env and load via dotenv-cli.\n");
    process.exit(1);
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":                "application/json",
        "x-agentik-integration-token": TOKEN,
      },
    });
  } catch (err) {
    console.error(`\nConnection error: ${(err as Error).message}`);
    console.error("  Is the Next.js dev server running?");
    process.exit(1);
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    console.error(`\n403 Forbidden: ${(body as { error?: string }).error ?? "unknown"}`);
    console.error("  Check ENABLE_INTERNAL_INTEGRATION_TESTS and INTERNAL_INTEGRATION_TEST_TOKEN.\n");
    process.exit(1);
  }

  let data: HarnessResponse;
  try {
    data = await res.json() as HarnessResponse;
  } catch {
    console.error(`\nFailed to parse response (HTTP ${res.status})`);
    process.exit(1);
  }

  console.log(`\ntestRunId:  ${data.testRunId}`);
  console.log(`orgSlug:    ${data.orgSlug}`);

  // ── Print sections ─────────────────────────────────────────────────────────

  for (const section of data.sections) {
    console.log(`\n── ${section.name} ──`);
    if (section.error) {
      console.error(`  ERROR: ${section.error}`);
      continue;
    }
    for (const c of section.checks) {
      const icon   = c.passed ? "✓" : "✗";
      const detail = c.detail ? `  [${c.detail}]` : "";
      if (c.passed) {
        console.log(`  ${icon} ${c.label}${detail}`);
      } else {
        console.error(`  ${icon} ${c.label}${detail}`);
      }
    }
    // Show idempotency metadata from section checks if present
    const idemCheck = section.checks.find(c => c.label.startsWith("idempotencyKey:"));
    if (idemCheck) {
      console.log(`     key: ${idemCheck.label.replace("idempotencyKey: ", "")}`);
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  if (data.cleanup.length > 0) {
    console.log("\n── Cleanup ──");
    data.cleanup.forEach(r => console.log(`  ${r}`));
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log(`Passed: ${data.summary.passed}  |  Failed: ${data.summary.failed}  |  Total: ${data.summary.total}`);

  if (!data.ok) {
    console.error("\nSome checks failed. See details above.");
    process.exit(1);
  }

  console.log("\nAll checks passed.");
  process.exit(0);
}

main().catch(err => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
