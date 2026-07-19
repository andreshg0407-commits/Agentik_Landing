import { NextRequest, NextResponse } from "next/server";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { serviceResolveAlert } from "@/lib/alerts/alerts-service";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => null);
  const organizationId = body?.organizationId;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alert = await serviceResolveAlert(params.id, organizationId, auth.user.id);
    return NextResponse.json({ ok: true, alert });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "ALERT_NOT_FOUND") {
        return NextResponse.json({ error: "Alert not found" }, { status: 404 });
      }
      if (e.message === "ALERT_ALREADY_RESOLVED") {
        return NextResponse.json({ error: "Alert is already resolved" }, { status: 409 });
      }
    }
    console.error("resolveAlert failed:", e);
    return NextResponse.json({ error: "Failed to resolve alert" }, { status: 500 });
  }
}
