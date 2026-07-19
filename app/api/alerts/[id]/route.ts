import { NextRequest, NextResponse } from "next/server";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { serviceGetAlert } from "@/lib/alerts/alerts-service";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const organizationId = req.nextUrl.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alert = await serviceGetAlert(params.id, organizationId);
    return NextResponse.json({ ok: true, alert });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ALERT_NOT_FOUND") {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }
    console.error("getAlert failed:", e);
    return NextResponse.json({ error: "Failed to fetch alert" }, { status: 500 });
  }
}
