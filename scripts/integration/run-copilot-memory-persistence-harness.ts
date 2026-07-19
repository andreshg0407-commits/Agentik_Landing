/**
 * scripts/integration/run-copilot-memory-persistence-harness.ts
 *
 * AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 — HTTP client for integration harness
 *
 * Calls the integration test route and prints a formatted report.
 * Run while Next.js dev server is running:
 *
 *   npx tsx scripts/integration/run-copilot-memory-persistence-harness.ts
 */

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const PATH = "/api/internal/integration-tests/copilot-memory-persistence";

interface HarnessResult {
  sprint: string;
  total: number;
  passed: number;
  failed: number;
  verdict: string;
  results: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
}

async function main(): Promise<void> {
  console.log(`\nCalling ${BASE}${PATH} ...\n`);

  const res  = await fetch(`${BASE}${PATH}`);
  const data = (await res.json()) as HarnessResult;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENTIK-COPILOT-MEMORY-PERSISTENCE-01 — Integration Harness");
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const t of data.results) {
    const icon = t.passed ? "✓" : "✗";
    console.log(`  ${icon} [${t.id}] ${t.label}`);
    if (t.detail) console.log(`       → ${t.detail}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Total: ${data.total} | Passed: ${data.passed} | Failed: ${data.failed}`);
  console.log(`  Verdict: ${data.verdict}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(data.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fetch failed:", err);
  process.exit(1);
});

export {};
