import { NextRequest, NextResponse } from "next/server";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { serviceListAlerts } from "@/lib/alerts/alerts-service";
import type { AlertStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const organizationId = searchParams.get("organizationId");
  const status = searchParams.get("status") as AlertStatus | null;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alerts = await serviceListAlerts(organizationId, status ? { status } : undefined);
    return NextResponse.json({ ok: true, alerts });
  } catch (e) {
    console.error("listAlerts failed:", e);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}
