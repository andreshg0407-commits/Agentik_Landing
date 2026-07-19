/**
 * app/api/orgs/[orgSlug]/operational-map/connection-audit/route.ts
 *
 * Operational Connection Audit + KPI Certification API.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 * Any non-internal role receives 403. Enforced at API level independently of nav.
 *
 * GET  — audit data (query: view, domain, health, priority, flag, format)
 * POST — certification mutations (body: kpiKey, domain, action, notes, ...)
 *
 * GET views:
 *   summary | full | blockers | stale | mock | partial | wrong-source
 *   certified | production-ready | blocked | sag-pending | manual
 *
 * GET formats:
 *   json | csv | markdown
 *
 * POST actions (KpiApprovalAction):
 *   start_review | approve_technical | approve_business | approve_sag |
 *   certify | mark_production_ready | block | revoke | deprecate
 *
 * Sprint: AGENTIK-OPERATIONAL-KPI-CERTIFICATION-01
 */

import { NextResponse }                           from "next/server";
import { requireOrgAccess }                       from "@/lib/auth/org-access";
import { isInternalRole }                         from "@/lib/auth/module-access";
import { generateOperationalConnectionAudit }     from "@/lib/operational-map/audit/generate-operational-connection-audit";
import { filterAuditRows }                        from "@/lib/operational-map/audit/generate-operational-connection-audit";
import {
  getAllCertifications,
  applyAction,
}                                                 from "@/lib/operational-map/certification/operational-kpi-certification-service";
import { getAllKpiDefinitions }                    from "@/lib/operational-map/certification/operational-kpi-definition-service";
import { getAllKpiSources }                        from "@/lib/operational-map/certification/operational-kpi-source-service";
import type { KpiSourceRecord }                   from "@/lib/operational-map/certification/operational-kpi-source-service";
import type { OperationalConnectionAuditRow }     from "@/lib/operational-map/audit/operational-connection-audit-types";
import type { KpiApprovalAction }                 from "@/lib/operational-map/certification/operational-kpi-certification-types";

export const runtime = "nodejs";

// ─── Security helper ──────────────────────────────────────────────────────────

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) {
    throw new Error("FORBIDDEN");
  }
  return result;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);

    const url      = new URL(req.url);
    const view     = url.searchParams.get("view") ?? "full";
    const domain   = url.searchParams.get("domain") ?? undefined;
    const health   = url.searchParams.get("health") ?? undefined;
    const priority = url.searchParams.get("priority") ?? undefined;
    const flag     = url.searchParams.get("flag") ?? undefined;
    const format   = url.searchParams.get("format") ?? "json";

    const [certifications, customKpis, kpiSources] = await Promise.all([
      getAllCertifications(organization.id),
      getAllKpiDefinitions(organization.id),
      getAllKpiSources(organization.id),
    ]);
    const audit = generateOperationalConnectionAudit(organization.id, certifications, customKpis, kpiSources);

    // ── Exports ─────────────────────────────────────────────────────────────
    if (format === "csv") {
      const rows = filterAuditRows(audit, { domain, health, priority, flag });
      return new Response(buildAuditCsv(rows), {
        headers: {
          "Content-Type":        "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agentik-connection-audit.csv"',
        },
      });
    }

    if (format === "markdown") {
      const rows = filterAuditRows(audit, { domain, health, priority, flag });
      return new Response(buildAuditMarkdown(audit, rows), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    // ── Integration Build Sheet (Phase 9) ────────────────────────────────────
    if (format === "integration-sheet-csv") {
      const rows = filterAuditRows(audit, { domain, health, priority, flag });
      return new Response(buildIntegrationSheetCsv(rows, kpiSources), {
        headers: {
          "Content-Type":        "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agentik-integration-build-sheet.csv"',
        },
      });
    }

    if (format === "integration-sheet-json") {
      const rows = filterAuditRows(audit, { domain, health, priority, flag });
      return NextResponse.json({
        ok: true,
        generatedAt:  audit.generatedAt,
        totalKpis:    rows.length,
        integrations: buildIntegrationSheetJson(rows, kpiSources),
      }, {
        headers: { "Content-Disposition": 'attachment; filename="agentik-integration-build-sheet.json"' },
      });
    }

    if (format === "integration-sheet-md") {
      const rows = filterAuditRows(audit, { domain, health, priority, flag });
      return new Response(buildIntegrationSheetMarkdown(audit, rows, kpiSources), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    // ── JSON views ───────────────────────────────────────────────────────────
    if (view === "summary") {
      return NextResponse.json({
        ok: true,
        generatedAt:           audit.generatedAt,
        overallReadinessScore: audit.overallReadinessScore,
        totalKpis:             audit.totalKpis,
        totalIssues:           audit.totalIssues,
        criticalIssues:        audit.criticalIssues,
        byDomain:              audit.byDomain,
        byFlag:                audit.byFlag,
        certifications: {
          total:          certifications.length,
          production_ready: certifications.filter(c => c.productionReady).length,
          certified:      certifications.filter(c => c.certificationStatus === "certified").length,
          blocked:        certifications.filter(c => c.certificationStatus === "blocked").length,
        },
      });
    }

    if (view === "blockers") {
      const blockers = filterAuditRows(audit, { priority: "critical", onlyIssues: true });
      return NextResponse.json({ ok: true, blockers, count: blockers.length });
    }

    if (view === "certified") {
      const rows = audit.rows.filter(r => r.certificationStatus === "certified" || r.certificationStatus === "production_ready");
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "production-ready") {
      const rows = audit.rows.filter(r => r.productionReady);
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "blocked") {
      const rows = audit.rows.filter(r => r.certificationStatus === "blocked");
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "sag-pending") {
      const rows = filterAuditRows(audit, { flag: "isSagUnvalidated" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "manual") {
      const rows = filterAuditRows(audit, { flag: "isManual" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "mock") {
      const rows = filterAuditRows(audit, { flag: "isMock" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "partial") {
      const rows = filterAuditRows(audit, { flag: "isPartial" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "stale") {
      const rows = filterAuditRows(audit, { flag: "isStale" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (view === "wrong-source") {
      const rows = filterAuditRows(audit, { flag: "isWrongSource" });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    // Default: full filtered view
    const rows = filterAuditRows(audit, { domain, health, priority, flag });
    return NextResponse.json({ ok: true, audit: { ...audit, rows }, count: rows.length });

  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — certification mutations ──────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);

    const body = await req.json() as {
      kpiKey:          string;
      domain:          string;
      action:          KpiApprovalAction;
      notes?:          string;
      validationNotes?: string;
      blockerNotes?:   string;
      approvedTable?:  string;
      approvedFields?: string[];
      approvedQuery?:  string;
      expectedSyncFrequency?: string;
    };

    if (!body.kpiKey || !body.domain || !body.action) {
      return NextResponse.json({ ok: false, error: "kpiKey, domain, and action are required" }, { status: 400 });
    }

    const result = await applyAction({
      organizationId:       organization.id,
      kpiKey:               body.kpiKey,
      domain:               body.domain,
      action:               body.action,
      actorId:              user.id,
      actorRole:            "AGENTIK_ADMIN", // Enforced by requireInternalAccess
      notes:                body.notes,
      validationNotes:      body.validationNotes,
      blockerNotes:         body.blockerNotes,
      approvedTable:        body.approvedTable,
      approvedFields:       body.approvedFields,
      approvedQuery:        body.approvedQuery,
      expectedSyncFrequency: body.expectedSyncFrequency,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true, certification: result.certification });

  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildAuditCsv(rows: OperationalConnectionAuditRow[]): string {
  const headers = [
    "Dominio", "KPI", "Definición", "Prioridad", "Source of Truth",
    "Estado conexión", "Certificación", "Trust Score", "Negocio", "SAG",
    "Fuente esperada", "Fuente actual", "SAG query status",
    "Mock", "Parcial", "Manual", "Desconectado", "SAG sin validar",
    "Riesgo", "Acción recomendada",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.domainLabel ?? r.domain, r.entityLabel, r.kpiDefinition,
      r.priority, r.sourceOfTruth,
      r.connectionHealth, r.certificationStatus ?? "draft",
      r.trustScore, r.businessApproved ? "Sí" : "No", r.sagApproved ? "Sí" : "No",
      r.expectedSources.join(" | "), r.actualSources.join(" | "),
      r.sagQueryStatus,
      r.flags.isMock ? "Sí" : "", r.flags.isPartial ? "Sí" : "",
      r.flags.isManual ? "Sí" : "", r.flags.isDisconnected ? "Sí" : "",
      r.flags.isSagUnvalidated ? "Sí" : "",
      r.riskDescription, r.recommendedAction,
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function buildAuditMarkdown(
  audit: ReturnType<typeof generateOperationalConnectionAudit>,
  rows:  OperationalConnectionAuditRow[],
): string {
  const now = new Date(audit.generatedAt).toLocaleString("es-CO");
  const certified = audit.rows.filter(r => r.certificationStatus === "certified" || r.certificationStatus === "production_ready").length;
  const lines = [
    "# Agentik — Centro de Certificación Operacional",
    `**Generado:** ${now}`,
    `**Readiness global:** ${audit.overallReadinessScore}%`,
    `**KPIs auditados:** ${audit.totalKpis} | **Certificados:** ${certified} | **Críticos bloqueados:** ${audit.criticalIssues}`,
    "",
    "## Resumen por dominio",
    "",
    "| Dominio | Readiness | Live | Mock | Parcial | Desconectado | Pendiente |",
    "|---|---|---|---|---|---|---|",
    ...audit.byDomain.map(d =>
      `| ${d.label} | ${d.readinessScore}% | ${d.byHealth.live} | ${d.byHealth.mock} | ${d.byHealth.partial} | ${d.byHealth.disconnected} | ${d.byHealth.pending} |`
    ),
    "",
    "## KPIs",
    "",
    "| Dominio | KPI | Conexión | Certificación | Trust | Negocio | SAG | Prioridad |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(r =>
      `| ${r.domainLabel ?? r.domain} | ${r.entityLabel} | ${r.connectionHealth} | ${r.certificationStatus ?? "draft"} | ${r.trustScore} | ${r.businessApproved ? "✓" : "×"} | ${r.sagApproved ? "✓" : "×"} | ${r.priority} |`
    ),
  ];
  return lines.join("\n");
}

// ─── Integration Build Sheet builders (Phase 9) ───────────────────────────────

function buildIntegrationSheetCsv(
  rows:       OperationalConnectionAuditRow[],
  kpiSources: KpiSourceRecord[],
): string {
  const srcMap = new Map<string, KpiSourceRecord[]>();
  for (const s of kpiSources) {
    const list = srcMap.get(s.kpiKey) ?? [];
    list.push(s);
    srcMap.set(s.kpiKey, list);
  }
  const headers = [
    "Dominio", "KPI", "KPI Key", "Definición", "Prioridad",
    // Layer 1: Fuente operacional SAG
    "Código fuente SAG", "Nombre fuente SAG", "Clasificación SAG", "Impacto ventas", "Fuente F1/F2",
    // Layer 2: Modelo interno / runtime
    "Modelo interno Agentik", "Fuente primaria", "Provider", "Tipo fuente",
    "Tabla SAG real", "Query aprobada", "Campos", "Filtros", "Frecuencia",
    // Runtime stats
    "Filas runtime", "Fecha más antigua", "Fecha más reciente",
    "Pendiente DBA", "Confianza lineage",
    // Certification
    "Validado SAG", "Validado negocio", "Trust Score",
    "Notas", "Acción técnica requerida",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const sources   = srcMap.get(r.entityKey) ?? [];
    // Prefer runtime sources for lineage data
    const runtimeSrc = sources.find(s =>
      s.validationStatus === "runtime_detected" || s.validationStatus === "connected_partial" ||
      s.validationStatus === "snapshot_detected" || s.validationStatus === "used_by_agentik"
    );
    const primary   = sources.find(s => s.sourceOfTruth || s.sourceRole === "primary") ?? sources[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineage   = (runtimeSrc?.runtimeLineage ?? primary?.runtimeLineage) as any ?? null;
    const topGroup  = lineage?.sourceCodeGroups?.[0] ?? null;
    const allCodes  = (lineage?.sourceCodeGroups ?? []).map((g: { code: string }) => g.code).join("; ");
    const allNames  = (lineage?.sourceCodeGroups ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((g: any) => g.catalogMatch?.nombreFuente)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((g: any) => g.catalogMatch.nombreFuente as string)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .join("; ");
    lines.push([
      r.domainLabel ?? r.domain, r.entityLabel, r.entityKey, r.kpiDefinition, r.priority,
      // Layer 1: SAG operational source
      allCodes || "No detectado",
      allNames || "No detectado",
      topGroup?.catalogMatch?.clasificacion ?? "—",
      topGroup?.catalogMatch?.impactoVentasSigno ?? "—",
      lineage?.fuente ?? "—",
      // Layer 2: internal model
      lineage?.runtimeModel ?? primary?.moduleName ?? "—",
      primary?.sourceName ?? r.expectedSources[0] ?? "Sin fuente",
      primary?.provider ?? r.sourceOfTruth,
      primary?.sourceType ?? "—",
      primary?.tableName ?? "Pendiente DBA",
      primary?.approvedQuery ?? "Pendiente DBA",
      primary?.approvedFields ? (primary.approvedFields as string[]).join("; ") : "Pendiente DBA",
      primary?.approvedFilters ? (primary.approvedFilters as string[]).join("; ") : "—",
      primary?.expectedFrequency ?? r.frequency,
      // Runtime stats
      (runtimeSrc?.runtimeRowCount ?? lineage?.rowCount ?? "—"),
      lineage?.dateRange?.earliest?.slice(0, 10) ?? "—",
      lineage?.dateRange?.latest?.slice(0, 10) ?? "—",
      lineage?.missingConfirmations?.join("; ") ?? "—",
      lineage?.confidence ?? "—",
      // Certification
      r.sagApproved ? "Sí" : "No",
      r.businessApproved ? "Sí" : "No",
      r.trustScore,
      primary?.notes ?? "—",
      r.recommendedAction,
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

function buildIntegrationSheetJson(
  rows:       OperationalConnectionAuditRow[],
  kpiSources: KpiSourceRecord[],
) {
  const srcMap = new Map<string, KpiSourceRecord[]>();
  for (const s of kpiSources) {
    const list = srcMap.get(s.kpiKey) ?? [];
    list.push(s);
    srcMap.set(s.kpiKey, list);
  }
  return rows.map(r => {
    const sources = srcMap.get(r.entityKey) ?? [];
    const primary = sources.find(s => s.sourceOfTruth || s.sourceRole === "primary") ?? sources[0];
    const runtimeSrc2 = sources.find(s =>
      s.validationStatus === "runtime_detected" || s.validationStatus === "connected_partial" ||
      s.validationStatus === "snapshot_detected" || s.validationStatus === "used_by_agentik"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lin2 = (runtimeSrc2?.runtimeLineage ?? primary?.runtimeLineage) as any ?? null;
    return {
      kpiKey:           r.entityKey,
      domain:           r.domainLabel ?? r.domain,
      entityLabel:      r.entityLabel,
      definition:       r.kpiDefinition,
      priority:         r.priority,
      // Layer 1: SAG operational source codes
      operationalSourceCodes:  (lin2?.sourceCodeGroups ?? []).map((g: { code: string }) => g.code),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operationalSourceNames:  (lin2?.sourceCodeGroups ?? []).filter((g: any) => g.catalogMatch).map((g: any) => g.catalogMatch.nombreFuente as string),
      operationalClassification: lin2?.sourceCodeGroups?.[0]?.catalogMatch?.clasificacion ?? null,
      operationalImpact:       lin2?.sourceCodeGroups?.[0]?.catalogMatch?.impactoVentasSigno ?? null,
      operationalFuente:       lin2?.fuente ?? null,
      // Layer 2: internal runtime model
      runtimeModel:     lin2?.runtimeModel ?? primary?.moduleName ?? null,
      runtimeRows:      runtimeSrc2?.runtimeRowCount ?? lin2?.rowCount ?? null,
      runtimeDateRange: lin2?.dateRange ?? null,
      // Layer 3: SAG table (confirmed or pending)
      sagTableConfirmed: primary?.tableName ?? null,
      approvedQuery:    primary?.approvedQuery ?? null,
      pendingDbaConfirmation: lin2?.missingConfirmations ?? [],
      lineageConfidence: lin2?.confidence ?? null,
      // Standard source
      primarySource:    primary?.sourceName ?? r.expectedSources[0] ?? null,
      provider:         primary?.provider ?? r.sourceOfTruth,
      sourceType:       primary?.sourceType ?? null,
      fields:           primary?.approvedFields ?? null,
      filters:          primary?.approvedFilters ?? null,
      frequency:        primary?.expectedFrequency ?? r.frequency,
      sagValidated:     r.sagApproved,
      businessValidated: r.businessApproved,
      trustScore:       r.trustScore,
      notes:            primary?.notes ?? null,
      technicalAction:  r.recommendedAction,
      allSources:       sources.map(s => ({
        name: s.sourceName, role: s.sourceRole, provider: s.provider,
        table: s.tableName, sagValidated: s.sagValidated, businessValidated: s.businessValidated,
      })),
    };
  });
}

function buildIntegrationSheetMarkdown(
  audit:      ReturnType<typeof generateOperationalConnectionAudit>,
  rows:       OperationalConnectionAuditRow[],
  kpiSources: KpiSourceRecord[],
): string {
  const now    = new Date(audit.generatedAt).toLocaleString("es-CO");
  const srcMap = new Map<string, KpiSourceRecord[]>();
  for (const s of kpiSources) {
    const list = srcMap.get(s.kpiKey) ?? [];
    list.push(s);
    srcMap.set(s.kpiKey, list);
  }
  const lines = [
    "# Agentik — Integration Build Sheet",
    `**Generado:** ${now}  |  **Total KPIs:** ${rows.length}`,
    "",
    "Este documento define las integraciones técnicas requeridas por KPI.",
    "Usa este output para construir conectores ODBC / API / CRM.",
    "",
    "---",
    "",
    "| KPI | Dominio | Fuente primaria | Tabla/API | Campos | Frec. | SAG | Neg | Trust | Acción |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(r => {
      const sources = srcMap.get(r.entityKey) ?? [];
      const p       = sources.find(s => s.sourceOfTruth || s.sourceRole === "primary") ?? sources[0];
      const fields  = p?.approvedFields ? (p.approvedFields as string[]).slice(0, 3).join(", ") + (((p.approvedFields as string[]).length > 3) ? "…" : "") : "—";
      return `| **${r.entityLabel}** | ${r.domainLabel ?? r.domain} | ${p?.sourceName ?? r.expectedSources[0] ?? "Sin fuente"} | ${p?.tableName ?? "—"} | ${fields} | ${p?.expectedFrequency ?? r.frequency} | ${r.sagApproved ? "✓" : "×"} | ${r.businessApproved ? "✓" : "×"} | ${r.trustScore} | ${r.recommendedAction.substring(0, 60)} |`;
    }),
    "",
    "---",
    "",
    "## Detalle por KPI",
    "",
    ...rows.flatMap(r => {
      const sources = srcMap.get(r.entityKey) ?? [];
      const p       = sources.find(s => s.sourceOfTruth || s.sourceRole === "primary") ?? sources[0];
      return [
        `### ${r.entityLabel}`,
        `- **Dominio:** ${r.domainLabel ?? r.domain}`,
        `- **Prioridad:** ${r.priority.toUpperCase()}`,
        `- **Definición:** ${r.kpiDefinition}`,
        `- **Fuente primaria:** ${p?.sourceName ?? r.expectedSources[0] ?? "Sin asignar"}`,
        `- **Provider:** ${p?.provider ?? r.sourceOfTruth}`,
        `- **Tabla/Vista/API:** ${p?.tableName ?? "Por confirmar con DBA SAG"}`,
        `- **Campos:** ${p?.approvedFields ? (p.approvedFields as string[]).join(", ") : "Por confirmar"}`,
        `- **Filtros:** ${p?.approvedFilters ? (p.approvedFilters as string[]).join(", ") : "Ninguno"}`,
        `- **Frecuencia:** ${p?.expectedFrequency ?? r.frequency}`,
        `- **SAG validado:** ${r.sagApproved ? "Sí" : "No"}  |  **Negocio validado:** ${r.businessApproved ? "Sí" : "No"}`,
        `- **Trust Score:** ${r.trustScore}/100`,
        `- **Acción técnica:** ${r.recommendedAction}`,
        ...(p?.notes ? [`- **Notas:** ${p.notes}`] : []),
        "",
      ];
    }),
  ];
  return lines.join("\n");
}
