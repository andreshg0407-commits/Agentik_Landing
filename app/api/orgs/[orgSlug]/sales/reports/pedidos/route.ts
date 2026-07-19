/**
 * GET /api/orgs/[orgSlug]/sales/reports/pedidos
 * Query params:
 *   start – YYYYMM (required)
 *   end   – YYYYMM (default = start)
 */

import { NextResponse }         from "next/server";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { getPedidosResumidos }  from "@/lib/sales/reports";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } }
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start");
    if (!start || !/^\d{6}$/.test(start)) {
      return NextResponse.json({ error: "start param required (YYYYMM)" }, { status: 400 });
    }
    const end = searchParams.get("end") ?? start;

    const data = await getPedidosResumidos(organization.id, start, end);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Access denied" },   { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Org not found" },   { status: 404 });
    console.error("[reports/pedidos]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
