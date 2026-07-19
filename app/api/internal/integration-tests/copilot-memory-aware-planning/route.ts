/**
 * app/api/internal/integration-tests/copilot-memory-aware-planning/route.ts
 *
 * Agentik — AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 * Integration Test Harness — Memory-Aware Planning Layer
 *
 * Security: only accessible in development with the correct integration token.
 * POST /api/internal/integration-tests/copilot-memory-aware-planning
 *
 * 8 tests:
 *   1. extractPlanningSignals — empty context → no signals
 *   2. extractPlanningSignals — finance memory → PRIORITIZE_DOMAIN FINANCE
 *   3. extractPlanningSignals — collections memory → PRIORITIZE_AGENT + ESCALATE
 *   4. calculatePlanPriority — ESCALATE_ATTENTION signal → HIGH
 *   5. calculatePlanPriority — CRITICAL signal → CRITICAL
 *   6. applyMemoryAwareSelection — base agents preserved, memory agents appended
 *   7. buildPlanningContext — all fields populated correctly
 *   8. Non-blocking degradation — empty signals → base agents unchanged
 */

import { NextResponse } from "next/server";

// ── Security guard ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const token = request.headers.get("x-agentik-integration-token");
  const expected = process.env.AGENTIK_INTEGRATION_TOKEN ?? "dev-integration-token";
  if (token !== expected) {
    return NextResponse.json({ error: "Forbidden — invalid token" }, { status: 403 });
  }

  if (!process.env.ENABLE_INTERNAL_INTEGRATION_TESTS) {
    return NextResponse.json({ error: "Integration tests not enabled" }, { status: 403 });
  }

  // ── Test runner ─────────────────────────────────────────────────────────────

  const results: Record<string, unknown>[] = [];
  let passed = 0;
  let failed = 0;

  function record(
    name:    string,
    ok:      boolean,
    detail?: unknown,
  ): void {
    results.push({ test: name, status: ok ? "PASS" : "FAIL", detail });
    if (ok) passed++; else failed++;
  }

  // ── Dynamic imports (all pure domain — no Prisma, no server-only) ─────────

  const { extractPlanningSignals }   = await import("@/lib/copilot/memory-planning/memory-signal-extractor");
  const { calculatePlanPriority }    = await import("@/lib/copilot/memory-planning/copilot-plan-priority");
  const { applyMemoryAwareSelection }= await import("@/lib/copilot/memory-planning/memory-aware-agent-selector");
  const { buildPlanningContext }     = await import("@/lib/copilot/memory-planning/planning-context");

  // ── Test helpers ─────────────────────────────────────────────────────────────

  function makeEntry(
    overrides: Partial<{
      id: string; orgSlug: string; type: string; importance: string;
      title: string; content: string; tags: string[]; source: string;
      scope: string;
    }> = {},
  ) {
    return {
      id:         overrides.id         ?? "mem-test-001",
      orgSlug:    overrides.orgSlug    ?? "castillitos",
      type:       overrides.type       ?? "STRATEGIC",
      importance: overrides.importance ?? "HIGH",
      title:      overrides.title      ?? "Test Memory",
      content:    overrides.content    ?? "Test content",
      tags:       overrides.tags       ?? [],
      source:     overrides.source     ?? "user",
      scope:      overrides.scope      ?? "TENANT",
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    };
  }

  // ── Test 1: Empty context → no signals ───────────────────────────────────────

  try {
    const emptyCtx = { orgSlug: "castillitos", entries: [], retrievedAt: new Date().toISOString(), overflow: false };
    const signals = extractPlanningSignals(emptyCtx as never);
    record("Test 1 - empty context → no signals", signals.length === 0, { count: signals.length });
  } catch (err) {
    record("Test 1 - empty context → no signals", false, { error: String(err) });
  }

  // ── Test 2: Finance memory → PRIORITIZE_DOMAIN FINANCE ───────────────────────

  try {
    const ctx = {
      orgSlug:     "castillitos",
      entries:     [makeEntry({ title: "PagosNet pendiente", content: "conciliacion bancaria pendiente de integracion" })],
      retrievedAt: new Date().toISOString(),
      overflow:    false,
    };
    const signals = extractPlanningSignals(ctx as never);
    const hasDomainFinance = signals.some(s => s.signalType === "PRIORITIZE_DOMAIN" && s.targetDomain === "FINANCE");
    const hasWarning       = signals.some(s => s.signalType === "ADD_WARNING");
    record("Test 2 - finance memory → PRIORITIZE_DOMAIN FINANCE", hasDomainFinance, {
      signals: signals.map(s => ({ type: s.signalType, domain: s.targetDomain })),
      hasWarning,
    });
  } catch (err) {
    record("Test 2 - finance memory → PRIORITIZE_DOMAIN FINANCE", false, { error: String(err) });
  }

  // ── Test 3: Collections memory → PRIORITIZE_AGENT + ESCALATE ─────────────────

  try {
    const ctx = {
      orgSlug:     "castillitos",
      entries:     [makeEntry({ title: "Cartera vencida", content: "mora alta de clientes cartera vencida critico" })],
      retrievedAt: new Date().toISOString(),
      overflow:    false,
    };
    const signals = extractPlanningSignals(ctx as never);
    const hasAgent   = signals.some(s => s.signalType === "PRIORITIZE_AGENT" && s.targetAgentId === "collections_agent");
    const hasEscalate= signals.some(s => s.signalType === "ESCALATE_ATTENTION");
    record("Test 3 - collections memory → PRIORITIZE_AGENT + ESCALATE", hasAgent && hasEscalate, {
      signals: signals.map(s => ({ type: s.signalType, agent: s.targetAgentId, strength: s.strength })),
    });
  } catch (err) {
    record("Test 3 - collections memory → PRIORITIZE_AGENT + ESCALATE", false, { error: String(err) });
  }

  // ── Test 4: ESCALATE_ATTENTION signal → HIGH priority ─────────────────────────

  try {
    const escalateSignal = {
      id: "sig-001", orgSlug: "castillitos", memoryId: "mem-001",
      signalType: "ESCALATE_ATTENTION" as const,
      strength: "MEDIUM" as const,
      reason: "Test escalation",
      createdAt: new Date().toISOString(),
    };
    const result = calculatePlanPriority("FINANCE", [escalateSignal]);
    record("Test 4 - ESCALATE_ATTENTION → HIGH priority", result === "HIGH", { result });
  } catch (err) {
    record("Test 4 - ESCALATE_ATTENTION → HIGH priority", false, { error: String(err) });
  }

  // ── Test 5: CRITICAL signal → CRITICAL priority ────────────────────────────────

  try {
    const criticalSignal = {
      id: "sig-002", orgSlug: "castillitos", memoryId: "mem-002",
      signalType: "PRIORITIZE_DOMAIN" as const,
      strength: "CRITICAL" as const,
      reason: "Critical finance issue",
      createdAt: new Date().toISOString(),
    };
    const result = calculatePlanPriority("GENERAL", [criticalSignal]);
    record("Test 5 - CRITICAL signal → CRITICAL priority", result === "CRITICAL", { result });
  } catch (err) {
    record("Test 5 - CRITICAL signal → CRITICAL priority", false, { error: String(err) });
  }

  // ── Test 6: memory-aware selection — base preserved, memory appended ───────────

  try {
    const signals = [{
      id: "sig-003", orgSlug: "castillitos", memoryId: "mem-003",
      signalType: "PRIORITIZE_DOMAIN" as const,
      strength: "HIGH" as const,
      targetDomain: "FINANCE" as const,
      reason: "Finance domain signal",
      createdAt: new Date().toISOString(),
    }];
    const result = applyMemoryAwareSelection(
      "GENERAL",
      ["marketing_agent"],
      signals,
      "castillitos",
    );
    // marketing_agent is base; finance_agent may be added (if enabled in registry)
    const basePreserved = result.finalAgents[0] === "marketing_agent";
    record("Test 6 - base agents preserved in order", basePreserved, {
      finalAgents: result.finalAgents,
      added: result.addedAgents,
    });
  } catch (err) {
    record("Test 6 - base agents preserved in order", false, { error: String(err) });
  }

  // ── Test 7: buildPlanningContext — all fields populated ────────────────────────

  try {
    const signals = [{
      id: "sig-004", orgSlug: "castillitos", memoryId: "mem-004",
      signalType: "ADD_WARNING" as const,
      strength: "MEDIUM" as const,
      reason: "Test warning",
      createdAt: new Date().toISOString(),
    }];
    const ctx = buildPlanningContext(
      "req-test-001",
      "castillitos",
      "FINANCE",
      signals,
      ["finance_agent"],
      ["finance_agent"],
      [],
      ["PagosNet pendiente"],
      ["Revisar integración PagosNet"],
      ["Reason 1"],
      "HIGH",
    );
    const allFields = ctx.requestId === "req-test-001"
      && ctx.orgSlug === "castillitos"
      && ctx.intent === "FINANCE"
      && ctx.memorySignalCount === 1
      && ctx.priority === "HIGH"
      && ctx.warnings.length === 1
      && ctx.suggestedActions.length === 1
      && ctx.planningReasons.length === 1
      && typeof ctx.createdAt === "string";
    record("Test 7 - buildPlanningContext all fields populated", allFields, {
      requestId: ctx.requestId,
      memorySignalCount: ctx.memorySignalCount,
      priority: ctx.priority,
    });
  } catch (err) {
    record("Test 7 - buildPlanningContext all fields populated", false, { error: String(err) });
  }

  // ── Test 8: Non-blocking — empty signals → base agents unchanged ───────────────

  try {
    const result = applyMemoryAwareSelection("FINANCE", ["finance_agent"], [], "castillitos");
    const baseUnchanged = result.finalAgents.length === 1
      && result.finalAgents[0] === "finance_agent"
      && result.addedAgents.length === 0;
    record("Test 8 - non-blocking degradation: empty signals → base unchanged", baseUnchanged, {
      finalAgents: result.finalAgents,
      added: result.addedAgents,
    });
  } catch (err) {
    record("Test 8 - non-blocking degradation: empty signals → base unchanged", false, { error: String(err) });
  }

  // ── Response ─────────────────────────────────────────────────────────────────

  return NextResponse.json({
    sprint:  "AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01",
    passed,
    failed,
    total:   passed + failed,
    status:  failed === 0 ? "ALL_PASS" : "SOME_FAIL",
    results,
  });
}
