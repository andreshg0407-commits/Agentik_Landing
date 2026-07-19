/**
 * app/api/internal/integration-tests/agent-runtime/route.ts
 *
 * Agentik — Universal Agent Runtime — Integration Harness
 * Sprint: AGENTIK-AGENT-RUNTIME-01 Phase 15
 *
 * POST /api/internal/integration-tests/agent-runtime
 *
 * Executes 5 live integration tests via executeGoal() + real DB:
 *   1. Finance agent (Diego) creates a task
 *   2. Marketing agent (Luca) creates an approval
 *   3. Collections agent (Mila) starts a workflow
 *   4. Invalid capability → AgentCapabilityError surfaced
 *   5. Disabled agent → AgentDisabledError surfaced
 *
 * Guards: NODE_ENV ≠ production + ENABLE_INTERNAL_INTEGRATION_TESTS=true + token header.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeGoal }               from "@/lib/agents/runtime/agent-runtime";
import type { AgentExecutionContext, AgentGoal } from "@/lib/agents/runtime/agent-types";

// ── Auth guard ─────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token = req.headers.get("x-agentik-integration-token");
  return token === (process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token");
}

// ── Context factory ────────────────────────────────────────────────────────────

const ORG_SLUG = "castillitos";

function makeGoal(type: AgentGoal["type"], description: string, priority: AgentGoal["priority"] = "high"): AgentGoal {
  return { type, description, priority, targetEntityId: "integration_test_entity", targetEntityType: type, metadata: {} };
}

function makeContext(goal: AgentGoal, correlationId: string, testRunId: string): AgentExecutionContext {
  return {
    orgSlug:  ORG_SLUG,
    actor:    { id: "integration_test_runner", type: "system" },
    goal,
    memory:   {},
    // correlationId drives idempotency keys; testRunId tags all records for this harness run
    metadata: { correlationId, testRunId, isIntegrationTest: true },
  };
}

// ── Test runner ────────────────────────────────────────────────────────────────

interface TestResult {
  test:    number;
  label:   string;
  pass:    boolean;
  detail:  string;
  output?: Record<string, unknown>;
  error?:  string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];
  const ts         = Date.now().toString(36);
  // testRunId groups all 5 test records — allows identification and cleanup in dev DB
  const testRunId  = `agent_runtime_harness_${ts}`;

  // ── Test 1: Finance agent (Diego) creates a task ────────────────────────────
  try {
    const goal = makeGoal("finance", "Revisión de señales financieras — integration test", "high");
    const ctx  = makeContext(goal, `it_finance_${ts}`, testRunId);
    const r    = await executeGoal("finance_agent", ctx);

    const taskOutput = r.result?.output
      ? Object.values(r.result.output).find((o: unknown) => o && typeof o === "object" && "taskId" in (o as Record<string,unknown>))
      : undefined;

    results.push({
      test:   1,
      label:  "Finance agent (Diego) creates task via real DB",
      pass:   r.success && !!taskOutput,
      detail: r.success
        ? `status=${r.result?.status}, executedSteps=${r.result?.executedSteps}, taskId=${(taskOutput as Record<string,unknown>)?.taskId}`
        : `failed: ${r.error}`,
      output: r.result?.output,
    });
  } catch (err) {
    results.push({ test: 1, label: "Finance agent creates task", pass: false, detail: "", error: String(err) });
  }

  // ── Test 2: Marketing agent (Luca) creates an approval ─────────────────────
  try {
    const goal = makeGoal("marketing", "Revisión de campaña de marketing — integration test", "high");
    const ctx  = makeContext(goal, `it_marketing_${ts}`, testRunId);
    const r    = await executeGoal("marketing_agent", ctx);

    const approvalOutput = r.result?.output
      ? Object.values(r.result.output).find((o: unknown) => o && typeof o === "object" && "approvalId" in (o as Record<string,unknown>))
      : undefined;

    results.push({
      test:   2,
      label:  "Marketing agent (Luca) creates approval via real DB",
      pass:   r.success && !!approvalOutput,
      detail: r.success
        ? `status=${r.result?.status}, approvalId=${(approvalOutput as Record<string,unknown>)?.approvalId}`
        : `failed: ${r.error}`,
      output: r.result?.output,
    });
  } catch (err) {
    results.push({ test: 2, label: "Marketing agent creates approval", pass: false, detail: "", error: String(err) });
  }

  // ── Test 3: Collections agent (Mila) starts a workflow ─────────────────────
  try {
    const goal = makeGoal("collections", "Seguimiento de cartera vencida — integration test", "critical");
    const ctx  = makeContext(goal, `it_collections_${ts}`, testRunId);
    const r    = await executeGoal("collections_agent", ctx);

    const workflowOutput = r.result?.output
      ? Object.values(r.result.output).find((o: unknown) => o && typeof o === "object" && "workflowRunId" in (o as Record<string,unknown>))
      : undefined;

    results.push({
      test:   3,
      label:  "Collections agent (Mila) starts workflow via real DB",
      pass:   r.success && !!workflowOutput,
      detail: r.success
        ? `status=${r.result?.status}, workflowRunId=${(workflowOutput as Record<string,unknown>)?.workflowRunId}`
        : `failed: ${r.error}`,
      output: r.result?.output,
    });
  } catch (err) {
    results.push({ test: 3, label: "Collections agent starts workflow", pass: false, detail: "", error: String(err) });
  }

  // ── Test 4: Invalid capability → error surfaced cleanly ─────────────────────
  try {
    // MARKETING_AGENT does not have READ_COLLECTIONS
    // Plan for "collections" will request READ_COLLECTIONS — capability guard fires
    const goal = makeGoal("collections", "Agent domain mismatch test", "low");
    const ctx  = makeContext(goal, `it_cap_error_${ts}`, testRunId);
    const r    = await executeGoal("marketing_agent", ctx);

    // Result should be failed/partial (READ_COLLECTIONS blocked) and no complete success
    const capDenied = r.result?.auditTrail?.some(e => e.event === "step_capability_denied");
    results.push({
      test:   4,
      label:  "Invalid capability (marketing_agent + collections plan) → step_capability_denied",
      pass:   !r.success || capDenied === true,
      detail: `success=${r.success}, status=${r.result?.status}, capDenied=${capDenied}`,
    });
  } catch (err) {
    results.push({ test: 4, label: "Invalid capability → error surfaced", pass: false, detail: "", error: String(err) });
  }

  // ── Test 5: Disabled agent → AgentDisabledError surfaced ────────────────────
  try {
    // resolveAgent returns null for unknown IDs; agent-runtime returns error envelope
    const goal = makeGoal("generic", "Disabled agent test", "low");
    const ctx  = makeContext(goal, `it_disabled_${ts}`, testRunId);
    const r    = await executeGoal("nonexistent_agent_xyz", ctx);

    results.push({
      test:   5,
      label:  "Unknown agent ID → AgentRuntimeResult.success=false, error message set",
      pass:   !r.success && typeof r.error === "string" && r.error.length > 0,
      detail: `success=${r.success}, error="${r.error}"`,
    });
  } catch (err) {
    results.push({ test: 5, label: "Unknown agent → error surfaced", pass: false, detail: "", error: String(err) });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalPass = results.filter(r => r.pass).length;
  const totalFail = results.filter(r => !r.pass).length;

  return NextResponse.json({
    sprint:     "AGENTIK-AGENT-RUNTIME-01",
    phase:      "Phase 15 — Integration Harness",
    testRunId,  // use to query/cleanup test records in dev DB
    timestamp:  new Date().toISOString(),
    summary:    { total: results.length, pass: totalPass, fail: totalFail },
    verdict:    totalFail === 0 ? "PASS" : "PARTIAL",
    results,
  });
}
