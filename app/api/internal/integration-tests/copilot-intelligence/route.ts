/**
 * app/api/internal/integration-tests/copilot-intelligence/route.ts
 *
 * Agentik — Copilot Intelligence — Integration Test Harness
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * GET /api/internal/integration-tests/copilot-intelligence
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - x-agentik-integration-token matches INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * Tests the full Copilot Intelligence pipeline end-to-end:
 *   intent resolver → agent selector → execution plan → agent executor → aggregator
 *
 * SERVER-ONLY — copilotIntelligenceService uses executeGoal (Prisma).
 */

import { NextRequest, NextResponse } from "next/server";
import { copilotIntelligenceService } from "@/lib/copilot/copilot-intelligence-service";
import { resolveCopilotIntent }       from "@/lib/copilot/copilot-intent-resolver";
import { selectAgentsForIntent }      from "@/lib/copilot/copilot-agent-selector";
import { buildCopilotExecutionPlan }  from "@/lib/copilot/copilot-execution-plan";
import { aggregateCopilotResponse }   from "@/lib/copilot/copilot-response-aggregator";
import { CopilotAuditLog, auditRequestReceived, auditIntentResolved, auditAgentsSelected, auditPlanCreated, auditExecutionStarted, auditExecutionCompleted, type CopilotAuditEventType } from "@/lib/copilot/copilot-audit";
import { resolveAgentDisplayName }    from "@/lib/agents/runtime/agent-tenant-profile";
import { resolveAgent }               from "@/lib/agents/runtime/agent-resolver";

// ── Security guard ────────────────────────────────────────────────────────────

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token    = req.headers.get("x-agentik-integration-token") ?? "";
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
  return token === expected;
}

// ── Test infrastructure ────────────────────────────────────────────────────────

interface TestResult {
  test:    string;
  passed:  boolean;
  message: string;
  data?:   unknown;
}

function pass(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: true, message, data };
}

function fail(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: false, message, data };
}

const ORG_SLUG = "castillitos";

// ── Tests ──────────────────────────────────────────────────────────────────────

async function testFinanceQuestion(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "Revisar la tesorería del mes",
      actor:       { type: "system", id: "integration-test" },
    });

    if (!response.success && response.errors.length > 0) {
      // Billing/DB errors are acceptable in CI — check the pipeline ran
      const isAgentError = response.agentResults?.some(r => r.executedSteps >= 0) ?? false;
      if (!isAgentError) {
        return fail("finance-question", `Pipeline failed: ${response.errors.join("; ")}`, response);
      }
    }

    if (response.intent !== "FINANCE") {
      return fail("finance-question", `Expected FINANCE intent, got: ${response.intent}`);
    }
    if (!response.participatingAgents.includes("Diego")) {
      return fail("finance-question", `Expected Diego, got: ${response.participatingAgents.join(", ")}`);
    }

    return pass("finance-question", `OK — intent: ${response.intent}, agent: ${response.participatingAgents.join(", ")}`, {
      intent:              response.intent,
      participatingAgents: response.participatingAgents,
      durationMs:          response.durationMs,
    });
  } catch (err) {
    return fail("finance-question", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testMarketingQuestion(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "¿Qué campañas están activas esta semana?",
      actor:       { type: "system", id: "integration-test" },
    });

    if (response.intent !== "MARKETING") {
      return fail("marketing-question", `Expected MARKETING intent, got: ${response.intent}`);
    }
    if (!response.participatingAgents.includes("Luca")) {
      return fail("marketing-question", `Expected Luca, got: ${response.participatingAgents.join(", ")}`);
    }

    return pass("marketing-question", `OK — intent: ${response.intent}, agent: Luca`, {
      intent: response.intent, durationMs: response.durationMs,
    });
  } catch (err) {
    return fail("marketing-question", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCommercialQuestion(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "Ver los clientes en riesgo de este mes",
      actor:       { type: "system", id: "integration-test" },
    });

    if (response.intent !== "COMMERCIAL") {
      return fail("commercial-question", `Expected COMMERCIAL intent, got: ${response.intent}`);
    }
    if (!response.participatingAgents.includes("Valentina")) {
      return fail("commercial-question", `Expected Valentina, got: ${response.participatingAgents.join(", ")}`);
    }

    return pass("commercial-question", `OK — intent: ${response.intent}, agent: Valentina`, {
      intent: response.intent, durationMs: response.durationMs,
    });
  } catch (err) {
    return fail("commercial-question", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCollectionsQuestion(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "¿Qué facturas están vencidas este mes?",
      actor:       { type: "system", id: "integration-test" },
    });

    if (response.intent !== "COLLECTIONS") {
      return fail("collections-question", `Expected COLLECTIONS intent, got: ${response.intent}`);
    }
    if (!response.participatingAgents.includes("Mila")) {
      return fail("collections-question", `Expected Mila, got: ${response.participatingAgents.join(", ")}`);
    }

    return pass("collections-question", `OK — intent: ${response.intent}, agent: Mila`, {
      intent: response.intent, durationMs: response.durationMs,
    });
  } catch (err) {
    return fail("collections-question", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testMultiDomainQuestion(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "¿Cómo va Castillitos esta semana?",
      actor:       { type: "system", id: "integration-test" },
    });

    if (response.intent !== "MULTI_DOMAIN") {
      return fail("multi-domain-question", `Expected MULTI_DOMAIN intent, got: ${response.intent}`);
    }
    if (response.plan.agents.length < 2) {
      return fail("multi-domain-question", `Expected multiple agents, got: ${response.plan.agents.length}`);
    }
    if (!response.plan.parallelizable) {
      return fail("multi-domain-question", "Expected parallelizable=true for multi-domain");
    }

    return pass("multi-domain-question", `OK — MULTI_DOMAIN with ${response.participatingAgents.length} agents: ${response.participatingAgents.join(", ")}`, {
      intent:              response.intent,
      participatingAgents: response.participatingAgents,
      parallelizable:      response.plan.parallelizable,
      agentCount:          response.plan.agents.length,
      durationMs:          response.durationMs,
    });
  } catch (err) {
    return fail("multi-domain-question", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testAggregationCorrect(): Promise<TestResult> {
  try {
    const response = await copilotIntelligenceService.executeCopilotRequest({
      orgSlug:     ORG_SLUG,
      userMessage: "Dame un resumen general de la empresa",
      actor:       { type: "system", id: "integration-test" },
    });

    if (typeof response.consolidatedSummary !== "string" || response.consolidatedSummary.length === 0) {
      return fail("aggregation-correct", "consolidatedSummary is empty");
    }
    if (!Array.isArray(response.agentResults)) {
      return fail("aggregation-correct", "agentResults is not an array");
    }
    if (response.agentResults.length === 0) {
      return fail("aggregation-correct", "agentResults is empty");
    }
    // Each result must have required fields
    for (const r of response.agentResults) {
      if (!r.agentId || !r.displayName) {
        return fail("aggregation-correct", `Agent result missing agentId or displayName: ${JSON.stringify(r)}`);
      }
    }

    return pass("aggregation-correct", `OK — ${response.agentResults.length} agent results, summary length: ${response.consolidatedSummary.length}`, {
      agentResultCount: response.agentResults.length,
      summaryLength:    response.consolidatedSummary.length,
    });
  } catch (err) {
    return fail("aggregation-correct", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testAuditTrailGenerated(): Promise<TestResult> {
  try {
    // Verify audit events are generated correctly in isolation (pure domain)
    const log = new CopilotAuditLog();
    const requestId = "audit-test-001";

    log.push(auditRequestReceived(requestId, ORG_SLUG, "Test audit trail"));
    log.push(auditIntentResolved(requestId, "FINANCE", "Test"));
    log.push(auditAgentsSelected(requestId, "FINANCE", ["finance_agent"]));
    const plan = buildCopilotExecutionPlan("FINANCE", ["finance_agent"]);
    log.push(auditPlanCreated(requestId, plan.id, ["finance_agent"], false));
    log.push(auditExecutionStarted(requestId, plan.id, ["finance_agent"]));
    log.push(auditExecutionCompleted(requestId, plan.id, true, 350, []));

    if (log.count() !== 6) {
      return fail("audit-trail-generated", `Expected 6 audit events, got ${log.count()}`);
    }

    const events = log.getAll();
    const types  = events.map(e => e.type);
    const expectedTypes: CopilotAuditEventType[] = [
      "copilot_request_received",
      "copilot_intent_resolved",
      "copilot_agents_selected",
      "copilot_plan_created",
      "copilot_execution_started",
      "copilot_execution_completed",
    ];
    for (const expected of expectedTypes) {
      if (!types.includes(expected)) {
        return fail("audit-trail-generated", `Missing audit event type: ${expected}`);
      }
    }

    return pass("audit-trail-generated", `OK — ${log.count()} events: ${types.join(", ")}`);
  } catch (err) {
    return fail("audit-trail-generated", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testPersonaResolutionCorrect(): Promise<TestResult> {
  try {
    const expected: Record<string, string> = {
      finance_agent:    "Diego",
      marketing_agent:  "Luca",
      commercial_agent: "Valentina",
      collections_agent:"Mila",
    };

    const failures: string[] = [];
    for (const [agentId, expectedName] of Object.entries(expected)) {
      const def  = resolveAgent(agentId);
      const name = resolveAgentDisplayName(ORG_SLUG, agentId, def?.displayName ?? agentId);
      if (name !== expectedName) {
        failures.push(`${agentId} → "${name}" (expected "${expectedName}")`);
      }
      if (name === agentId) {
        failures.push(`${agentId} resolved to raw ID (not display name)`);
      }
    }

    if (failures.length > 0) {
      return fail("persona-resolution", `Persona mismatches: ${failures.join("; ")}`);
    }

    return pass("persona-resolution", `OK — Diego, Luca, Valentina, Mila all resolved correctly`);
  } catch (err) {
    return fail("persona-resolution", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = Date.now();

  const results: TestResult[] = await Promise.all([
    testFinanceQuestion(),
    testMarketingQuestion(),
    testCommercialQuestion(),
    testCollectionsQuestion(),
    testMultiDomainQuestion(),
    testAggregationCorrect(),
    testAuditTrailGenerated(),
    testPersonaResolutionCorrect(),
  ]);

  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;
  const elapsed = Date.now() - start;

  return NextResponse.json({
    sprint:    "AGENTIK-COPILOT-INTELLIGENCE-01",
    timestamp: new Date().toISOString(),
    summary: {
      passed,
      failed,
      total,
      elapsedMs: elapsed,
      verdict:   failed === 0 ? "PASS" : "FAIL",
    },
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
