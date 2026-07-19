export {};

/**
 * scripts/integration/run-security-encryption-harness.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * HTTP client for the security encryption integration harness.
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   INTERNAL_INTEGRATION_TEST_TOKEN=dev-token \
 *   AGENTIK_ENCRYPTION_KEY=<64-hex-chars> \
 *   npx ts-node --project tsconfig.scripts.json \
 *     scripts/integration/run-security-encryption-harness.ts
 *
 * Note: Tests that require AGENTIK_ENCRYPTION_KEY will FAIL if the key
 * is not set. Set a 64-char hex key for full test coverage.
 * Generate: node -e "require('crypto').randomBytes(32).toString('hex') |> console.log"
 */

const BASE_URL =
  process.env.INTEGRATION_TEST_BASE_URL ?? "http://localhost:3000";

const TOKEN = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "";

interface TestResult {
  id:         string;
  label:      string;
  status:     "PASS" | "FAIL" | "SKIP";
  detail?:    string;
  durationMs: number;
}

interface HarnessReport {
  totalTests: number;
  passed:     number;
  failed:     number;
  skipped:    number;
  results:    TestResult[];
  ranAt:      string;
}

async function main(): Promise<void> {
  const url = `${BASE_URL}/api/internal/integration-tests/security-encryption`;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENTIK-SECURITY-ENCRYPTION-01 — Integration Harness");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Endpoint: ${url}`);
  console.log();

  const res = await fetch(url, {
    method:  "GET",
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  });

  if (res.status === 403) {
    console.error("  ✗ BLOCKED — Integration tests are disabled.");
    console.error("    Set ENABLE_INTERNAL_INTEGRATION_TESTS=true and NODE_ENV != production.");
    process.exit(1);
  }

  if (res.status === 401) {
    console.error("  ✗ UNAUTHORIZED — Check INTERNAL_INTEGRATION_TEST_TOKEN.");
    process.exit(1);
  }

  const report: HarnessReport = await res.json();

  for (const t of report.results) {
    const icon   = t.status === "PASS" ? "✓" : t.status === "SKIP" ? "○" : "✗";
    const detail = t.detail ? `  → ${t.detail}` : "";
    const skip   = t.status === "SKIP" ? " [SKIP — key not set]" : "";
    console.log(`  ${icon} [${t.id}] ${t.label} (${t.durationMs}ms)${skip}${detail}`);
  }

  console.log();
  console.log("───────────────────────────────────────────────────────────────");
  console.log(`  Total   : ${report.totalTests}`);
  console.log(`  PASS    : ${report.passed}`);
  console.log(`  FAIL    : ${report.failed}`);
  console.log(`  SKIP    : ${report.skipped}`);
  console.log(`  Ran at  : ${report.ranAt}`);
  console.log("───────────────────────────────────────────────────────────────");

  if (report.failed > 0) {
    console.error(`\n  ✗ ${report.failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n  ✓ ${report.passed}/${report.totalTests} PASS — Encryption Layer verified`);
  }
}

main().catch(err => {
  console.error("Harness error:", err);
  process.exit(1);
});
