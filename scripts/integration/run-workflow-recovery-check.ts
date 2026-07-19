/**
 * scripts/integration/run-workflow-recovery-check.ts
 *
 * Agentik — Workflow Recovery Check HTTP Client
 * Sprint: AGENTIK-WORKFLOW-HARDENING-CLOSEOUT-01 — Phase 3
 *
 * Calls GET /api/internal/workflow-chains/recover?orgSlug=castillitos
 * and prints stuck run diagnostic report.
 *
 * No server-only imports. Pure HTTP client.
 *
 * Usage:
 *   ENABLE_INTERNAL_WORKFLOW_RECOVERY=true \
 *   npx tsx scripts/integration/run-workflow-recovery-check.ts [BASE_URL] [ORG_SLUG]
 */
export {};

const BASE_URL  = process.argv[2] ?? "http://localhost:3000";
const ORG_SLUG  = process.argv[3] ?? "castillitos";
const TOKEN     = process.env.AGENTIK_INTEGRATION_TEST_TOKEN ?? "agentik-dev-test-token";
const ENDPOINT  = `${BASE_URL}/api/internal/workflow-chains/recover?orgSlug=${ORG_SLUG}`;

interface StuckRunReport {
  runId:             string;
  chainId:           string;
  chainName:         string;
  status:            string;
  currentStepId:     string | null;
  recommendedAction: string;
  staleSinceMs:      number;
  staleSinceMin:     number;
  lastAuditEvent:    unknown;
}

interface RecoveryResponse {
  orgSlug:  string;
  total:    number;
  reports:  StuckRunReport[];
  note:     string;
  error?:   string;
  message?: string;
}

async function main(): Promise<void> {
  console.log("\nAGENTIK-WORKFLOW-HARDENING-CLOSEOUT-01 — Recovery Check");
  console.log("──────────────────────────────────────────────────────────");
  console.log(`Org:      ${ORG_SLUG}`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method:  "GET",
      headers: {
        "x-agentik-integration-token": TOKEN,
      },
    });
  } catch (err: unknown) {
    console.error("Network error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const body = await res.json() as RecoveryResponse;

  if (!res.ok) {
    console.error(`Error ${res.status}:`, body.error ?? body.message ?? "Unknown error");
    process.exit(1);
  }

  if (body.total === 0) {
    console.log("No stuck runs found. System is healthy.");
    console.log(`\n${body.note}`);
    process.exit(0);
  }

  console.log(`Found ${body.total} stuck run(s):\n`);

  for (const r of body.reports) {
    console.log(`─── Run: ${r.runId}`);
    console.log(`    status:                 ${r.status}`);
    console.log(`    chainId:                ${r.chainId}`);
    console.log(`    chainName:              ${r.chainName}`);
    console.log(`    currentStepId:          ${r.currentStepId ?? "null"}`);
    console.log(`    staleSinceMin:          ${r.staleSinceMin} min`);
    console.log(`    recommendedAction:      ${r.recommendedAction}`);

    const lastEvent = r.lastAuditEvent as Record<string, unknown> | null;
    if (lastEvent) {
      console.log(`    lastAuditEvent.event:   ${lastEvent["event"] ?? "—"}`);
      console.log(`    lastAuditEvent.message: ${lastEvent["message"] ?? "—"}`);
    } else {
      console.log(`    lastAuditEvent:         null`);
    }
    console.log();
  }

  console.log(`${body.note}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
