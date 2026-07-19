/**
 * scripts/integration/run-vault-migration-harness.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * HTTP client for the vault-migration integration harness.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/integration/run-vault-migration-harness.ts
 *   BASE_URL=http://localhost:3000 npx ts-node ... (override host)
 */

export {};

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/internal/integration-tests/vault-migration`;

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

async function run(): Promise<void> {
  console.log(`\nAGENTIK-SECURITY-VAULT-MIGRATION-01 — Integration Harness`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`─────────────────────────────────────────────────────────\n`);

  let res: Response;
  try {
    res = await fetch(ENDPOINT);
  } catch (e: any) {
    console.error(`[ERROR] Could not reach harness endpoint: ${e?.message ?? e}`);
    console.error("Is the dev server running? Start with: npm run dev");
    process.exit(2);
  }

  let report: HarnessReport;
  try {
    report = await res.json() as HarnessReport;
  } catch {
    console.error("[ERROR] Could not parse harness response as JSON");
    process.exit(2);
  }

  for (const t of report.results) {
    const icon = t.status === "PASS" ? "✓" : t.status === "SKIP" ? "○" : "✗";
    const line = `  ${icon} [${t.id}] ${t.label} (${t.durationMs}ms)`;
    console.log(line);
    if (t.status === "FAIL" && t.detail) {
      console.log(`      → ${t.detail}`);
    }
  }

  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`  Total : ${report.totalTests}`);
  console.log(`  PASS  : ${report.passed}`);
  console.log(`  FAIL  : ${report.failed}`);
  console.log(`  SKIP  : ${report.skipped}`);
  console.log(`  Ran at: ${report.ranAt}`);

  if (report.failed === 0) {
    console.log(`\n  ✓ All ${report.passed} tests passed.\n`);
    process.exit(0);
  } else {
    console.log(`\n  ✗ ${report.failed} test(s) failed. Review above.\n`);
    process.exit(1);
  }
}

run();
