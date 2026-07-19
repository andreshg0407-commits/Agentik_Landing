/**
 * scripts/integration/run-security-foundation-harness.ts
 *
 * Agentik — Security Foundation — Integration Harness HTTP Client
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01 Phase 15
 *
 * Calls GET /api/internal/integration-tests/security-foundation
 * and prints per-test results to stdout.
 *
 * Prerequisites:
 *   - Next.js dev server running on localhost:3000
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true in .env.local
 *
 * Run:
 *   npx tsx scripts/integration/run-security-foundation-harness.ts
 */

// Module isolation — keeps declarations out of global script scope
export type { };

const BASE_URL = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/internal/integration-tests/security-foundation`;

interface TestResult {
  id:     string;
  name:   string;
  passed: boolean;
  detail: string;
}

interface HarnessResponse {
  sprint:  string;
  total:   number;
  passed:  number;
  failed:  number;
  verdict: "ALL_PASS" | "FAILURES_DETECTED";
  results: TestResult[];
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENTIK-SECURITY-FOUNDATION-01 — Integration Harness");
  console.log(`  Target: ${ENDPOINT}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "GET" });
  } catch (err) {
    console.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Is the Next.js dev server running? (npm run dev)");
    process.exit(1);
  }

  let body: HarnessResponse;
  try {
    body = await res.json() as HarnessResponse;
  } catch {
    console.error(`Failed to parse response (status ${res.status})`);
    process.exit(1);
  }

  if (res.status === 403) {
    console.error("403 Forbidden — set ENABLE_INTERNAL_INTEGRATION_TESTS=true in .env.local");
    process.exit(1);
  }

  const { results, total, passed, failed, verdict } = body;

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} [${r.id}] ${r.name}`);
    if (!r.passed) {
      console.error(`        detail: ${r.detail}`);
    } else {
      console.log(`        ${r.detail}`);
    }
  }

  console.log(`\n${"═".repeat(63)}`);
  console.log(`  Sprint : ${body.sprint}`);
  console.log(`  Total  : ${total}  |  Passed: ${passed}  |  Failed: ${failed}`);
  console.log(`  Verdict: ${verdict}`);
  console.log("═".repeat(63));

  process.exit(verdict === "ALL_PASS" ? 0 : 1);
}

main();
