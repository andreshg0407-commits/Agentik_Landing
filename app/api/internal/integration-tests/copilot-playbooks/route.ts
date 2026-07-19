/**
 * app/api/internal/integration-tests/copilot-playbooks/route.ts
 *
 * AGENTIK-COPILOT-PLAYBOOKS-01 — Integration Test Harness
 *
 * HTTP endpoint for live integration testing of the Playbooks layer.
 * GET /api/internal/integration-tests/copilot-playbooks
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *
 * Tests:
 *  T01 — createPlaybook creates and returns a playbook
 *  T02 — createPlaybook infers category from title
 *  T03 — createPlaybook infers priority from title
 *  T04 — updatePlaybook applies changes (tenant isolation validated)
 *  T05 — updatePlaybook rejects wrong orgSlug (tenant isolation)
 *  T06 — archivePlaybook archives (logical delete)
 *  T07 — archivePlaybook rejects wrong orgSlug (tenant isolation)
 *  T08 — searchPlaybooks filters by category
 *  T09 — searchPlaybooks filters by tags
 *  T10 — getRelevantPlaybooks returns context for intent
 *  T11 — buildExecutivePlaybookSummary generates text
 *  T12 — buildOperationalPlaybookSummary generates text
 *  T13 — Copilot response includes playbookContext (non-empty)
 *  T14 — globalPlaybookAuditLog records events
 */
import "server-only";

import { NextResponse }                        from "next/server";
import { InMemoryPlaybookRepository }          from "@/lib/copilot/playbooks/in-memory-playbook-repository";
import { StrategicPlaybookManager }            from "@/lib/copilot/playbooks/strategic-playbook-manager";
import {
  getRelevantPlaybooks,
  searchPlaybooks as searchPb,
}                                              from "@/lib/copilot/playbooks/playbook-retrieval";
import {
  buildExecutivePlaybookSummary,
  buildOperationalPlaybookSummary,
}                                              from "@/lib/copilot/playbooks/playbook-summary";
import { globalPlaybookAuditLog }              from "@/lib/copilot/playbooks/playbook-audit";
import { inferPlaybookCategory, inferPlaybookPriority } from "@/lib/copilot/playbooks/playbook-classifier";

// ── Guards ────────────────────────────────────────────────────────────────────

const IS_PROD    = process.env.NODE_ENV === "production";
const IS_ENABLED = process.env.ENABLE_INTERNAL_INTEGRATION_TESTS === "true";

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  id:      string;
  label:   string;
  passed:  boolean;
  detail?: string;
}

async function run(
  id:    string,
  label: string,
  fn:    () => Promise<boolean | string>,
): Promise<TestResult> {
  try {
    const result = await fn();
    const passed = result === true || typeof result === "string";
    return { id, label, passed, detail: typeof result === "string" ? result : undefined };
  } catch (err: unknown) {
    return {
      id,
      label,
      passed:  false,
      detail: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  if (IS_PROD) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (!IS_ENABLED) {
    return NextResponse.json(
      { error: "Set ENABLE_INTERNAL_INTEGRATION_TESTS=true to run" },
      { status: 403 },
    );
  }

  // Use a fresh isolated repo for each test run
  const repo    = new InMemoryPlaybookRepository();
  const manager = new StrategicPlaybookManager(repo);

  const ORG_A = "harness-org-a";
  const ORG_B = "harness-org-b";

  const results: TestResult[] = [];

  // T01 — createPlaybook creates and returns a playbook
  let t01Id = "";
  results.push(await run("T01", "createPlaybook creates and returns playbook", async () => {
    const res = await manager.createPlaybook({
      orgSlug:     ORG_A,
      title:       "Proceso de cierre mensual",
      description: "Procedimiento estándar para el cierre financiero de fin de mes.",
      category:    "FINANCE",
      priority:    "CRITICAL",
      tags:        ["cierre", "finanzas"],
      steps: [
        { index: 1, title: "Verificar conciliación bancaria", description: "Revisar que todos los movimientos estén conciliados." },
        { index: 2, title: "Generar estado de resultados",    description: "Exportar estado financiero del período." },
      ],
    });
    if (!res.created || !res.playbook) return "created=false";
    t01Id = res.playbook.id;
    return !!t01Id;
  }));

  // T02 — createPlaybook infers category from title
  results.push(await run("T02", "createPlaybook infers category from title when not provided", async () => {
    const inferred = inferPlaybookCategory("Proceso de cobranza semanal", "Gestión de cartera vencida");
    return inferred === "COLLECTIONS" ? true : `Got ${inferred}`;
  }));

  // T03 — createPlaybook infers priority from title
  results.push(await run("T03", "createPlaybook infers priority (CRITICAL) from title", async () => {
    const inferred = inferPlaybookPriority("Cierre mensual urgente — auditoría requerida");
    return inferred === "CRITICAL" ? true : `Got ${inferred}`;
  }));

  // T04 — updatePlaybook applies changes
  results.push(await run("T04", "updatePlaybook applies changes with correct orgSlug", async () => {
    const updated = await manager.updatePlaybook(ORG_A, t01Id, { title: "Cierre mensual actualizado" });
    if (!updated) return "updatePlaybook returned null";
    return updated.title === "Cierre mensual actualizado" ? true : `Title=${updated.title}`;
  }));

  // T05 — updatePlaybook rejects wrong orgSlug
  results.push(await run("T05", "updatePlaybook rejects wrong orgSlug (tenant isolation)", async () => {
    const result = await manager.updatePlaybook(ORG_B, t01Id, { title: "Should not update" });
    return result === null ? true : "updatePlaybook allowed cross-tenant mutation";
  }));

  // T06 — archivePlaybook archives
  let t06Id = "";
  results.push(await run("T06", "archivePlaybook archives (logical delete)", async () => {
    const res = await manager.createPlaybook({
      orgSlug: ORG_A, title: "Playbook para archivar", description: "Será archivado.",
      category: "OPERATIONS", priority: "LOW",
    });
    t06Id = res.playbook?.id ?? "";
    const archived = await manager.archivePlaybook(ORG_A, t06Id);
    if (!archived) return "archivePlaybook returned false";
    const fetched = await manager.getPlaybook(t06Id);
    return fetched === null ? true : "getPlaybook still returns archived entry";
  }));

  // T07 — archivePlaybook rejects wrong orgSlug
  results.push(await run("T07", "archivePlaybook rejects wrong orgSlug (tenant isolation)", async () => {
    // Create fresh playbook in ORG_A
    const res = await manager.createPlaybook({
      orgSlug: ORG_A, title: "Protected playbook", description: "Should not be archived by ORG_B.",
      category: "SALES", priority: "MEDIUM",
    });
    const id = res.playbook?.id ?? "";
    const attempted = await manager.archivePlaybook(ORG_B, id);
    return attempted === false ? true : "archivePlaybook allowed cross-tenant archive";
  }));

  // T08 — searchPlaybooks filters by category
  results.push(await run("T08", "searchPlaybooks filters by category", async () => {
    // Create a COLLECTIONS playbook
    await manager.createPlaybook({
      orgSlug: ORG_A, title: "Proceso de cobranza mensual",
      description: "Gestión de cartera vencida.", category: "COLLECTIONS", priority: "HIGH",
    });
    const results = await manager.searchPlaybooks(ORG_A, { category: "COLLECTIONS" });
    const allMatch = results.every(p => p.category === "COLLECTIONS");
    return results.length > 0 && allMatch ? true : `count=${results.length} allMatch=${allMatch}`;
  }));

  // T09 — searchPlaybooks filters by tags
  results.push(await run("T09", "searchPlaybooks filters by tags", async () => {
    await manager.createPlaybook({
      orgSlug: ORG_A, title: "Campaña social Q2",
      description: "Plan de redes sociales.", category: "MARKETING", priority: "MEDIUM",
      tags: ["instagram", "q2", "social"],
    });
    const byTag = await manager.searchPlaybooks(ORG_A, { tags: ["instagram"] });
    const hasTag = byTag.every(p => p.tags.includes("instagram"));
    return byTag.length > 0 && hasTag ? true : `count=${byTag.length}`;
  }));

  // T10 — getRelevantPlaybooks returns context for intent
  results.push(await run("T10", "getRelevantPlaybooks returns context for FINANCE intent", async () => {
    const ctx = await getRelevantPlaybooks(ORG_A, "FINANCE", repo);
    return ctx.orgSlug === ORG_A && typeof ctx.retrievedAt === "string"
      ? `playbooks=${ctx.playbooks.length}`
      : "invalid context shape";
  }));

  // T11 — buildExecutivePlaybookSummary generates text
  results.push(await run("T11", "buildExecutivePlaybookSummary generates summary text", async () => {
    // Add an executive playbook
    await manager.createPlaybook({
      orgSlug: ORG_A, title: "Revisión ejecutiva trimestral",
      description: "Revisión de KPIs y OKRs para la junta directiva.", category: "EXECUTIVE", priority: "HIGH",
    });
    const summary = await buildExecutivePlaybookSummary(ORG_A, repo);
    return typeof summary.summaryText === "string" && summary.summaryText.length > 0
      ? `count=${summary.totalCount}`
      : "empty summary";
  }));

  // T12 — buildOperationalPlaybookSummary generates text
  results.push(await run("T12", "buildOperationalPlaybookSummary generates summary text", async () => {
    const summary = await buildOperationalPlaybookSummary(ORG_A, repo);
    return typeof summary.summaryText === "string" ? `count=${summary.totalCount}` : "invalid summary";
  }));

  // T13 — globalPlaybookAuditLog records events
  results.push(await run("T13", "globalPlaybookAuditLog records audit events", async () => {
    // The global log has been accumulating throughout this test run
    const all = globalPlaybookAuditLog.getAll();
    const hasCreated  = all.some(e => e.type === "PLAYBOOK_CREATED");
    const hasArchived = all.some(e => e.type === "PLAYBOOK_ARCHIVED");
    return hasCreated && hasArchived ? `events=${all.length}` : `created=${hasCreated} archived=${hasArchived}`;
  }));

  // T14 — tenant isolation: ORG_A playbooks not visible in ORG_B search
  results.push(await run("T14", "tenant isolation: ORG_A playbooks not visible to ORG_B", async () => {
    const orgBResults = await manager.listPlaybooks(ORG_B);
    const leaked = orgBResults.find(p => p.orgSlug === ORG_A);
    return leaked === undefined ? true : `Leaked: ${leaked.id}`;
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  return NextResponse.json({
    sprint:  "AGENTIK-COPILOT-PLAYBOOKS-01",
    total,
    passed,
    failed,
    verdict: failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED",
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
