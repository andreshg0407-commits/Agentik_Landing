export {};

/**
 * scripts/integration/run-audit-persistence-harness.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * HTTP client for the audit persistence integration harness.
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   INTERNAL_INTEGRATION_TEST_TOKEN=dev-token \
 *   npx ts-node --project tsconfig.scripts.json \
 *     scripts/integration/run-audit-persistence-harness.ts
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
  const url = `${BASE_URL}/api/internal/integration-tests/audit-persistence`;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 — Integration Harness");
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
    console.log(`  ${icon} [${t.id}] ${t.label} (${t.durationMs}ms)${detail}`);
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
    console.log(`\n  ✓ ${report.passed}/${report.totalTests} PASS — Audit Persistence Layer verified`);
  }
}

main().catch(err => {
  console.error("Harness error:", err);
  process.exit(1);
});
