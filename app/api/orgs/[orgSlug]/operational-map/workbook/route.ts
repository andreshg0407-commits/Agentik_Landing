/**
 * GET /api/orgs/[orgSlug]/operational-map/workbook
 *
 * Returns the SAG Validation Workbook for an org.
 *
 * Query parameters:
 *   ?view=executive|technical|domain|priority|blockers
 *   ?domain=comercial|inventario|cartera|...
 *   ?priority=critical|high|medium|low
 *   ?status=pending|answered|blocked|not_applicable
 *   ?format=json|csv|markdown|checklist
 *
 * The workbook is generated fresh on each request (pure computation,
 * no DB reads). Future: overlay per-org answer state from DB.
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { generateValidationWorkbook }     from "@/lib/operational-map/workbook/generate-validation-workbook";
import { exportWorkbookView }             from "@/lib/operational-map/workbook/exporters/export-workbook-json";
import {
  exportWorkbookToCsv,
  exportMeetingChecklistCsv,
  exportExecutiveSummaryCsv,
}                                          from "@/lib/operational-map/workbook/exporters/export-workbook-csv";
import {
  exportWorkbookToMarkdown,
  exportMeetingChecklistMarkdown,
  exportExecutiveReportMarkdown,
}                                          from "@/lib/operational-map/workbook/exporters/export-workbook-markdown";
import type { WorkbookView }              from "@/lib/operational-map/workbook/operational-validation-workbook-types";
import type { OperationalDomainKey }      from "@/lib/operational-map/operational-source-map";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url    = new URL(req.url);
    const view   = (url.searchParams.get("view") ?? "technical") as WorkbookView;
    const domain = url.searchParams.get("domain") as OperationalDomainKey | null;
    const priority = url.searchParams.get("priority") as "critical" | "high" | "medium" | "low" | null;
    const status = url.searchParams.get("status") as "pending" | "answered" | "blocked" | "not_applicable" | null;
    const format = url.searchParams.get("format") ?? "json";

    const workbook = generateValidationWorkbook(organization.id);

    // ── CSV exports ────────────────────────────────────────────────────────
    if (format === "csv") {
      const csv = exportWorkbookToCsv(workbook);
      return new Response(csv, {
        headers: {
          "Content-Type":        "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agentik-sag-workbook.csv"',
        },
      });
    }

    if (format === "checklist_csv") {
      const csv = exportMeetingChecklistCsv(workbook);
      return new Response(csv, {
        headers: {
          "Content-Type":        "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agentik-sag-checklist.csv"',
        },
      });
    }

    if (format === "executive_csv") {
      const csv = exportExecutiveSummaryCsv(workbook);
      return new Response(csv, {
        headers: {
          "Content-Type":        "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agentik-sag-executive.csv"',
        },
      });
    }

    // ── Markdown exports ────────────────────────────────────────────────────
    if (format === "markdown") {
      const md = exportWorkbookToMarkdown(workbook);
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    if (format === "checklist_md") {
      const md = exportMeetingChecklistMarkdown(workbook);
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    if (format === "executive_md") {
      const md = exportExecutiveReportMarkdown(workbook);
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    // ── JSON (default) ──────────────────────────────────────────────────────
    const result = exportWorkbookView(workbook, view, {
      ...(domain   ? { domain }   : {}),
      ...(priority ? { priority } : {}),
      ...(status   ? { status }   : {}),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
