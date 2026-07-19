/**
 * scripts/integration/run-copilot-memory-aware-planning-harness.ts
 *
 * Agentik — AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 * HTTP Client for the Memory-Aware Planning integration harness.
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   npx ts-node --project tsconfig.scripts.json \
 *     scripts/integration/run-copilot-memory-aware-planning-harness.ts
 *
 * Requires the Next.js dev server running at PLANNING_BASE_URL (default: localhost:3000).
 */

export {};

const PLANNING_BASE_URL = process.env.PLANNING_BASE_URL ?? "http://localhost:3000";
const PLANNING_ENDPOINT = "/api/internal/integration-tests/copilot-memory-aware-planning";
const TOKEN             = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";

interface HarnessResult {
  test:   string;
  status: "PASS" | "FAIL";
  detail?: unknown;
}

interface HarnessResponse {
  sprint:  string;
  passed:  number;
  failed:  number;
  total:   number;
  status:  "ALL_PASS" | "SOME_FAIL";
  results: HarnessResult[];
}

async function main(): Promise<void> {
  console.log(`\nAGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01 — Integration Harness`);
  console.log(`Target: ${PLANNING_BASE_URL}${PLANNING_ENDPOINT}\n`);

  let data: HarnessResponse;

  try {
    const response = await fetch(`${PLANNING_BASE_URL}${PLANNING_ENDPOINT}`, {
      method:  "POST",
      headers: {
        "Content-Type":               "application/json",
        "x-agentik-integration-token": TOKEN,
      },
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${await response.text()}`);
      process.exit(1);
    }

    data = (await response.json()) as HarnessResponse;
  } catch (err) {
    console.error("Failed to reach harness:", err);
    process.exit(1);
  }

  // Print results
  for (const result of data.results) {
    const icon = result.status === "PASS" ? "  PASS" : "  FAIL";
    console.log(`${icon}  ${result.test}`);
    if (result.status === "FAIL" && result.detail) {
      console.log(`        → ${JSON.stringify(result.detail)}`);
    }
  }

  console.log(`\n${"═".repeat(58)}`);
  console.log(`  ${data.sprint}`);
  console.log(`  PASS: ${data.passed}  |  FAIL: ${data.failed}  |  TOTAL: ${data.total}`);
  console.log(`  STATUS: ${data.status}`);
  console.log("═".repeat(58) + "\n");

  process.exit(data.failed === 0 ? 0 : 1);
}

main().then(() => {/* handled in main */}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
