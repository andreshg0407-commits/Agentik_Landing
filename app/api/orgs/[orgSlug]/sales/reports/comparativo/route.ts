/**
 * GET /api/orgs/[orgSlug]/sales/reports/comparativo
 * Query params:
 *   start – YYYYMM (required)
 *   end   – YYYYMM (required, default = current month)
 */

import { NextResponse }            from "next/server";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { getComparativoAnoMes }    from "@/lib/sales/reports";

export const runtime = "nodejs";

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } }
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start");
    const end   = searchParams.get("end") ?? currentPeriodo();

    if (!start || !/^\d{6}$/.test(start)) {
      return NextResponse.json({ error: "start param required (YYYYMM)" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(end)) {
      return NextResponse.json({ error: "end param must be YYYYMM" }, { status: 400 });
    }

    const data = await getComparativoAnoMes(organization.id, start, end);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Access denied" },   { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Org not found" },   { status: 404 });
    console.error("[reports/comparativo]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
