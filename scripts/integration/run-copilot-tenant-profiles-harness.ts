/**
 * scripts/integration/run-copilot-tenant-profiles-harness.ts
 *
 * Agentik — AGENTIK-COPILOT-TENANT-PROFILES-01
 * HTTP Client for the Copilot Tenant Profiles integration harness.
 *
 * Usage:
 *   ENABLE_INTERNAL_INTEGRATION_TESTS=true \
 *   npx ts-node --project tsconfig.scripts.json \
 *     scripts/integration/run-copilot-tenant-profiles-harness.ts
 */

export {};

const PROFILES_BASE_URL = process.env.PROFILES_BASE_URL ?? "http://localhost:3000";
const PROFILES_ENDPOINT = "/api/internal/integration-tests/copilot-tenant-profiles";
const TOKEN             = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";

interface HarnessResult {
  test:    string;
  status:  "PASS" | "FAIL";
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
  console.log(`\nAGENTIK-COPILOT-TENANT-PROFILES-01 — Integration Harness`);
  console.log(`Target: ${PROFILES_BASE_URL}${PROFILES_ENDPOINT}\n`);

  let data: HarnessResponse;

  try {
    const response = await fetch(`${PROFILES_BASE_URL}${PROFILES_ENDPOINT}`, {
      method:  "POST",
      headers: {
        "Content-Type":                "application/json",
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

  for (const result of data.results) {
    const icon = result.status === "PASS" ? "  PASS" : "  FAIL";
    console.log(`${icon}  ${result.test}`);
    if (result.status === "FAIL" && result.detail) {
      console.log(`        → ${JSON.stringify(result.detail)}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${data.sprint}`);
  console.log(`  PASS: ${data.passed}  |  FAIL: ${data.failed}  |  TOTAL: ${data.total}`);
  console.log(`  STATUS: ${data.status}`);
  console.log("═".repeat(60) + "\n");

  process.exit(data.failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
