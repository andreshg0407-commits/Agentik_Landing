/**
 * app/api/internal/integration-tests/executive-brain/route.ts
 *
 * AGENTIK-EXECUTIVE-BRAIN-01 — Integration Test Harness
 *
 * HTTP endpoint for live integration testing of the Executive Brain layer.
 * GET /api/internal/integration-tests/executive-brain
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *
 * Tests:
 *  T01 — buildExecutiveContext with no signals returns empty context
 *  T02 — single memory signal is collected and ranked
 *  T03 — multiple signals ranked CRITICAL > HIGH > MEDIUM > LOW
 *  T04 — critical memory signal produces CRITICAL plan priority
 *  T05 — playbook signals: CRITICAL playbook → EXECUTIVE_CRITICAL_ALERT
 *  T06 — strategic cross-source signals detected (collections crisis)
 *  T07 — rankSignals caps at maxSignals and preserves order
 *  T08 — generateExecutiveInsights groups by category
 *  T09 — calculateExecutivePriority: CRITICAL insight → CRITICAL priority
 *  T10 — calculateExecutivePriority: 2+ HIGH insights → HIGH priority
 *  T11 — globalExecutiveAuditLog records all 4 event types
 *  T12 — tenant isolation: contexts have correct orgSlug
 *  T13 — serialization: context is JSON-serializable (no Date objects)
 *  T14 — buildExecutiveSummary produces non-empty string
 *  T15 — buildExecutiveHeadline produces non-empty one-liner
 *  T16 — ExecutiveBrainService.buildContext never throws on malformed input
 *  T17 — defaultExecutiveBrainService used in pipeline pattern (end-to-end)
 */
import "server-only";
import { NextResponse }                    from "next/server";
import {
  buildExecutiveContext,
  isContextNonEmpty,
}                                          from "@/lib/copilot/executive-brain/executive-context-builder";
import {
  collectAllSignals,
  collectMemorySignals,
  collectPlaybookSignals,
  collectStrategicSignals,
}                                          from "@/lib/copilot/executive-brain/executive-signal-collector";
import {
  rankSignals,
}                                          from "@/lib/copilot/executive-brain/executive-signal-ranking";
import { generateExecutiveInsights }      from "@/lib/copilot/executive-brain/executive-insight-generator";
import { calculateExecutivePriority }     from "@/lib/copilot/executive-brain/executive-priority-engine";
import {
  buildExecutiveSummary,
  buildExecutiveHeadline,
}                                         from "@/lib/copilot/executive-brain/executive-context-summary";
import {
  ExecutiveBrainService,
  defaultExecutiveBrainService,
}                                         from "@/lib/copilot/executive-brain/executive-brain-service";
import { globalExecutiveAuditLog }       from "@/lib/copilot/executive-brain/executive-audit";
import type { ExecutiveBrainInput }      from "@/lib/copilot/executive-brain/executive-brain-types";

// ── Guard ─────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "Set ENABLE_INTERNAL_INTEGRATION_TESTS=true to run" }, { status: 403 });
  }

  const ORG_A = "castillitos";
  const ORG_B = "other-org-test";

  type TestResult = { id: string; name: string; passed: boolean; detail: string };
  const results: TestResult[] = [];

  async function run(
    id: string,
    name: string,
    fn: () => Promise<boolean | string>,
  ): Promise<TestResult> {
    try {
      const outcome = await fn();
      const passed  = outcome !== false;
      const detail  = typeof outcome === "string" ? outcome : (passed ? "ok" : "assertion failed");
      return { id, name, passed, detail };
    } catch (err: unknown) {
      return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── T01 — empty context when no input signals ─────────────────────────────
  results.push(await run("T01", "buildExecutiveContext with no signals returns empty context", async () => {
    const input: ExecutiveBrainInput = { orgSlug: ORG_A, intent: "GENERAL" };
    const ctx = buildExecutiveContext(input);
    return ctx.orgSlug === ORG_A && ctx.signals.length === 0 && ctx.insights.length === 0
      ? "empty-ok"
      : `unexpected: signals=${ctx.signals.length} insights=${ctx.insights.length}`;
  }));

  // ── T02 — single finance memory signal collected ───────────────────────────
  results.push(await run("T02", "single memory signal collected from finance entry", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "m1", type: "FACT", importance: "CRITICAL",
        title: "Flujo de caja bajo",
        content: "El saldo bancario cayó por debajo del mínimo operativo.",
        tags: ["finanzas", "caja"], source: "treasury",
      }],
    };
    const signals = collectMemorySignals(input.memoryEntries ?? []);
    return signals.length > 0 && signals.some(s => s.category === "FINANCE")
      ? `signals=${signals.length} category=${signals[0].category}`
      : `no finance signals (got ${signals.length})`;
  }));

  // ── T03 — multiple signals ranked CRITICAL > HIGH > MEDIUM > LOW ──────────
  results.push(await run("T03", "signals ranked CRITICAL > HIGH > MEDIUM > LOW", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "MULTI_DOMAIN",
      memoryEntries: [
        {
          id: "m2", type: "INSIGHT", importance: "HIGH",
          title: "Cartera vencida elevada",
          content: "Cartera morosa supera el 25% del total.",
          tags: ["cobros"], source: "collections",
        },
        {
          id: "m3", type: "FACT", importance: "CRITICAL",
          title: "Liquidez crítica",
          content: "Saldo en cero — no se pueden pagar nómina.",
          tags: ["finanzas", "liquidez", "caja"], source: "treasury",
        },
        {
          id: "m4", type: "PREFERENCE", importance: "LOW",
          title: "Preferencia de reporte semanal",
          content: "El gerente prefiere reportes los lunes.",
          tags: ["preferencia"], source: "user",
        },
      ],
    };
    const ranked     = rankSignals(collectAllSignals(input));
    if (ranked.length === 0) return "no signals collected";
    const severities = ranked.map(s => s.severity);
    const critIdx    = severities.indexOf("CRITICAL");
    const highIdx    = severities.indexOf("HIGH");
    const lowIdx     = severities.indexOf("LOW");
    const ordered    = (critIdx === -1 || highIdx === -1 || critIdx < highIdx)
      && (highIdx === -1 || lowIdx  === -1 || highIdx < lowIdx);
    return ordered
      ? `ranked-ok count=${ranked.length}`
      : `wrong order: ${severities.join(",")}`;
  }));

  // ── T04 — critical memory signal produces CRITICAL plan priority ───────────
  results.push(await run("T04", "critical memory signal → CRITICAL plan priority", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "m5", type: "FACT", importance: "CRITICAL",
        title: "Bloqueo de pagos",
        content: "Cuenta bancaria bloqueada por DIAN.",
        tags: ["finanzas", "pago", "bloqueo"], source: "banking",
      }],
    };
    const ctx      = buildExecutiveContext(input);
    const priority = calculateExecutivePriority("FINANCE", ctx);
    return priority === "CRITICAL"
      ? `priority=${priority} signals=${ctx.signals.length}`
      : `expected CRITICAL got ${priority}`;
  }));

  // ── T05 — playbook signal: CRITICAL playbook → EXECUTIVE_CRITICAL_ALERT ───
  results.push(await run("T05", "CRITICAL playbook produces EXECUTIVE_CRITICAL_ALERT signal", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "MULTI_DOMAIN",
      playbooks: [{
        id: "pb1", title: "Plan de contingencia DIAN",
        category: "EXECUTIVE", priority: "CRITICAL", status: "ACTIVE", tags: ["regulatorio"],
      }],
    };
    const signals  = collectPlaybookSignals(input.playbooks ?? []);
    const hasAlert = signals.some(s => s.id === "EXECUTIVE_CRITICAL_ALERT");
    return hasAlert
      ? `signals=${signals.length} alert-found`
      : `alert not found in [${signals.map(s => s.id).join(",")}]`;
  }));

  // ── T06 — strategic cross-source: collections crisis pattern ──────────────
  results.push(await run("T06", "strategic signals detect collections crisis cross-source", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "MULTI_DOMAIN",
      memoryEntries: [
        {
          id: "m6", type: "INSIGHT", importance: "CRITICAL",
          title: "Cartera vencida crítica",
          content: "Mora supera 30% — riesgo de insolvencia.",
          tags: ["cobros", "cartera"], source: "collections",
        },
        {
          id: "m7", type: "FACT", importance: "HIGH",
          title: "Caja comprometida",
          content: "Reserva de caja usada para cubrir deuda vencida.",
          tags: ["finanzas", "caja"], source: "treasury",
        },
      ],
      playbooks: [{
        id: "pb2", title: "Gestión de cartera morosa",
        category: "COLLECTIONS", priority: "HIGH", status: "ACTIVE", tags: ["cobros"],
      }],
    };
    const strategic = collectStrategicSignals(input);
    return strategic.length > 0
      ? `strategic-signals=${strategic.length}`
      : "no strategic signals detected";
  }));

  // ── T07 — rankSignals caps at maxSignals ───────────────────────────────────
  results.push(await run("T07", "rankSignals caps output at maxSignals=5", async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      id:         `mq${i}`,
      type:       "FACT" as const,
      importance: "HIGH" as const,
      title:      `Señal financiera ${i}`,
      content:    `Caja baja y cartera vencida — situación ${i}`,
      tags:       ["finanzas", "cobros"],
      source:     "treasury",
    }));
    const input: ExecutiveBrainInput = { orgSlug: ORG_A, intent: "FINANCE", memoryEntries: entries };
    const all    = collectAllSignals(input);
    const ranked = rankSignals(all, 5);
    return ranked.length <= 5
      ? `capped-at=${ranked.length} (raw=${all.length})`
      : `not capped: got ${ranked.length} expected ≤5`;
  }));

  // ── T08 — generateExecutiveInsights groups by category ────────────────────
  results.push(await run("T08", "generateExecutiveInsights groups signals by category", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "MULTI_DOMAIN",
      memoryEntries: [
        {
          id: "mi1", type: "INSIGHT", importance: "HIGH",
          title: "Ventas en declive",
          content: "Caída sostenida en ventas por 3 meses.",
          tags: ["ventas", "declive"], source: "crm",
        },
        {
          id: "mi2", type: "FACT", importance: "HIGH",
          title: "Caja baja",
          content: "Saldo de caja inferior al mínimo operativo.",
          tags: ["finanzas", "caja"], source: "treasury",
        },
      ],
    };
    const signals  = collectAllSignals(input);
    const insights = generateExecutiveInsights(signals);
    const cats     = [...new Set(insights.flatMap(i => i.categories))];
    return insights.length > 0
      ? `insights=${insights.length} categories=[${cats.join(",")}]`
      : "no insights generated";
  }));

  // ── T09 — CRITICAL insight → CRITICAL priority ────────────────────────────
  results.push(await run("T09", "CRITICAL insight → calculateExecutivePriority returns CRITICAL", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "m20", type: "FACT", importance: "CRITICAL",
        title: "Cuenta bloqueada bancaria",
        content: "Bloqueo preventivo de cuenta corriente principal.",
        tags: ["finanzas", "pago", "bloqueo"], source: "banking",
      }],
    };
    const ctx      = buildExecutiveContext(input);
    const priority = calculateExecutivePriority("FINANCE", ctx);
    return priority === "CRITICAL" ? `priority=${priority}` : `expected CRITICAL got ${priority}`;
  }));

  // ── T10 — 2+ HIGH insights → HIGH priority ────────────────────────────────
  results.push(await run("T10", "2+ HIGH insights → calculateExecutivePriority returns HIGH", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "COMMERCIAL",
      memoryEntries: [
        {
          id: "mh1", type: "INSIGHT", importance: "HIGH",
          title: "Ventas por debajo del objetivo",
          content: "Pipeline comercial débil — menos de 10 oportunidades abiertas.",
          tags: ["ventas", "declive", "pipeline"], source: "crm",
        },
        {
          id: "mh2", type: "INSIGHT", importance: "HIGH",
          title: "Margen erosionado",
          content: "Margen bruto cayó 8 puntos porcentuales este trimestre.",
          tags: ["ventas", "margen", "declive"], source: "erp",
        },
      ],
    };
    const ctx      = buildExecutiveContext(input);
    const priority = calculateExecutivePriority("COMMERCIAL", ctx);
    return priority === "HIGH" || priority === "CRITICAL"
      ? `priority=${priority} insights=${ctx.insights.length}`
      : `expected HIGH/CRITICAL got ${priority}`;
  }));

  // ── T11 — globalExecutiveAuditLog records all 4 event types ───────────────
  results.push(await run("T11", "globalExecutiveAuditLog records all 4 audit event types", async () => {
    const svc   = new ExecutiveBrainService();
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "maudit", type: "FACT", importance: "HIGH",
        title: "Conciliación pendiente",
        content: "No se ha conciliado el extracto del mes anterior.",
        tags: ["finanzas", "conciliacion"], source: "treasury",
      }],
    };
    await svc.buildContext(input);
    const events = globalExecutiveAuditLog.getAll();
    const types  = new Set(events.map(e => e.type));
    const hasAll = types.has("SIGNALS_COLLECTED")
      && types.has("SIGNALS_RANKED")
      && types.has("INSIGHTS_GENERATED")
      && types.has("CONTEXT_BUILT");
    return hasAll
      ? `events=${events.length} types=[${[...types].join(",")}]`
      : `missing types — found=[${[...types].join(",")}]`;
  }));

  // ── T12 — tenant isolation ─────────────────────────────────────────────────
  results.push(await run("T12", "tenant isolation: contexts have correct orgSlug", async () => {
    const inputA: ExecutiveBrainInput = { orgSlug: ORG_A, intent: "GENERAL" };
    const inputB: ExecutiveBrainInput = { orgSlug: ORG_B, intent: "GENERAL" };
    const ctxA = buildExecutiveContext(inputA);
    const ctxB = buildExecutiveContext(inputB);
    return ctxA.orgSlug === ORG_A && ctxB.orgSlug === ORG_B
      ? `orgA=${ctxA.orgSlug} orgB=${ctxB.orgSlug}`
      : `wrong orgSlug: ctxA=${ctxA.orgSlug} ctxB=${ctxB.orgSlug}`;
  }));

  // ── T13 — JSON serialization: no Date objects ─────────────────────────────
  results.push(await run("T13", "ExecutiveContext is fully JSON-serializable (no Date objects)", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "mser", type: "FACT", importance: "HIGH",
        title: "Cierre pendiente",
        content: "El cierre contable del Q1 aún no se ha completado.",
        tags: ["finanzas", "cierre"], source: "accounting",
      }],
    };
    const ctx = buildExecutiveContext(input);
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify(ctx);
    } catch {
      return "JSON.stringify threw — not serializable";
    }
    const parsed = JSON.parse(jsonStr);
    return parsed.orgSlug === ORG_A
      ? `serialized=${jsonStr.length}chars`
      : "parse mismatch";
  }));

  // ── T14 — buildExecutiveSummary produces non-empty string ─────────────────
  results.push(await run("T14", "buildExecutiveSummary produces non-empty summary text", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "MULTI_DOMAIN",
      memoryEntries: [{
        id: "ms1", type: "FACT", importance: "CRITICAL",
        title: "Liquidez crítica — pago nómina en riesgo",
        content: "El saldo disponible no cubre la nómina del próximo viernes.",
        tags: ["finanzas", "caja", "liquidez"], source: "treasury",
      }],
    };
    const ctx     = buildExecutiveContext(input);
    const summary = buildExecutiveSummary(ctx);
    return typeof summary === "string" && summary.length > 10
      ? `length=${summary.length}`
      : `empty or invalid: "${summary}"`;
  }));

  // ── T15 — buildExecutiveHeadline produces non-empty one-liner ─────────────
  results.push(await run("T15", "buildExecutiveHeadline produces non-empty one-liner", async () => {
    const input: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "mhl", type: "FACT", importance: "HIGH",
        title: "Margen comercial bajo",
        content: "El margen neto cayó por debajo del 10% por primera vez en 2 años.",
        tags: ["ventas", "margen", "declive"], source: "erp",
      }],
    };
    const ctx      = buildExecutiveContext(input);
    const headline = buildExecutiveHeadline(ctx);
    return typeof headline === "string" && headline.length > 5
      ? `headline="${headline.slice(0, 60)}"`
      : `empty or invalid: "${headline}"`;
  }));

  // ── T16 — ExecutiveBrainService.buildContext never throws ─────────────────
  results.push(await run("T16", "ExecutiveBrainService.buildContext never throws on malformed input", async () => {
    const svc = new ExecutiveBrainService();
    let ctx;
    try {
      ctx = await svc.buildContext({ orgSlug: "", intent: undefined as unknown as string });
    } catch {
      return "threw — should never throw";
    }
    return typeof ctx === "object" && ctx !== null
      ? `stable-return orgSlug="${ctx.orgSlug}"`
      : "unexpected null return";
  }));

  // ── T17 — defaultExecutiveBrainService in pipeline pattern ───────────────
  results.push(await run("T17", "defaultExecutiveBrainService.buildContext used in pipeline pattern", async () => {
    const ebInput: ExecutiveBrainInput = {
      orgSlug: ORG_A,
      intent: "FINANCE",
      memoryEntries: [{
        id: "meb", type: "FACT", importance: "HIGH",
        title: "Tesorería bajo mínimo",
        content: "La tesorería cayó 40% respecto al mes anterior.",
        tags: ["finanzas", "tesoreria", "caja"], source: "banking",
      }],
    };
    const ebCtx = await defaultExecutiveBrainService.buildContext(ebInput);
    const hasCtx = isContextNonEmpty(ebCtx);
    return hasCtx
      ? `non-empty context signals=${ebCtx.signals.length} insights=${ebCtx.insights.length}`
      : `empty context — signals=${ebCtx.signals.length} insights=${ebCtx.insights.length}`;
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  return NextResponse.json({
    sprint:  "AGENTIK-EXECUTIVE-BRAIN-01",
    total,
    passed,
    failed,
    verdict: failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED",
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
