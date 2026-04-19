/**
 * POST /api/orgs/[orgSlug]/reports
 *
 * Mobile Report Copilot — unified report API.
 *
 * Body: { query: string }
 * Response: ReportResult JSON
 */

import { NextResponse }      from "next/server";
import { requireOrgAccess }  from "@/lib/auth/org-access";
import { interpret }         from "@/lib/reports/interpreter";
import { runReport }         from "@/lib/reports/runners";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId            = organization.id;

    const body = await req.json().catch(() => ({}));
    const query: string = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json(
        { error: "El campo 'query' es requerido." },
        { status: 400 },
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: "Consulta demasiado larga (máx 500 caracteres)." },
        { status: 400 },
      );
    }

    const spec   = interpret(query);
    const result = await runReport(orgId, spec);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[ReportCopilot] error:", err);
    return NextResponse.json(
      { error: "Error al ejecutar el informe. Inténtelo de nuevo." },
      { status: 500 },
    );
  }
}
