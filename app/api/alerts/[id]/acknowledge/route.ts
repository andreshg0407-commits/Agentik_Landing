import { NextRequest, NextResponse } from "next/server";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { serviceAcknowledgeAlert } from "@/lib/alerts/alerts-service";

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
    const alert = await serviceAcknowledgeAlert(params.id, organizationId, auth.user.id);
    return NextResponse.json({ ok: true, alert });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "ALERT_NOT_FOUND") {
        return NextResponse.json({ error: "Alert not found" }, { status: 404 });
      }
      if (e.message === "ALERT_NOT_OPEN") {
        return NextResponse.json({ error: "Alert is not open" }, { status: 409 });
      }
    }
    console.error("acknowledgeAlert failed:", e);
    return NextResponse.json({ error: "Failed to acknowledge alert" }, { status: 500 });
  }
}
