export {};
/**
 * scripts/integration/run-secret-rotation-harness.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * HTTP client to invoke the integration test harness
 *
 * Usage:
 *   npx ts-node --skip-project scripts/integration/run-secret-rotation-harness.ts
 *
 * Requires: app running at BASE_URL (default: http://localhost:3000)
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/internal/integration-tests/secret-rotation`;

async function main(): Promise<void> {
  console.log(`\n=== AGENTIK-SECURITY-SECRET-ROTATION-01 Integration Harness ===`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  let data: Record<string, unknown>;
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) {
      console.error(`HTTP error: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error(`Failed to reach harness: ${String(err)}`);
    process.exit(1);
  }

  const passed  = data["passed"]  as number;
  const failed  = data["failed"]  as number;
  const total   = data["total"]   as number;
  const verdict = data["verdict"] as string;
  const results = data["results"] as Array<{ id: string; label: string; passed: boolean; error?: string }>;

  results.forEach(r => {
    const icon = r.passed ? "✓" : "✗";
    const line = `  ${icon} ${r.id}: ${r.label}`;
    if (r.passed) {
      console.log(line);
    } else {
      console.error(line);
      if (r.error) console.error(`       Error: ${r.error}`);
    }
  });

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${passed}/${total} passed`);
  console.log(verdict === "PASS"
    ? "✅ ALL TESTS PASSED"
    : `❌ ${failed} test(s) FAILED`
  );

  process.exit(failed === 0 ? 0 : 1);
}

main();
