/**
 * PATCH /api/orgs/[orgSlug]/notifications/[notifId]/read — mark single notification read
 */

import { NextResponse }       from "next/server";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { markNotificationRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function PATCH(
  _req:     Request,
  { params }: { params: { orgSlug: string; notifId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const notif = await markNotificationRead(organization.id, params.notifId);
    return NextResponse.json({ notification: notif });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED")        return NextResponse.json({ error: "Unauthorized" },       { status: 401 });
    if (msg === "ACCESS_DENIED")          return NextResponse.json({ error: "Forbidden" },          { status: 403 });
    if (msg === "NOTIFICATION_NOT_FOUND") return NextResponse.json({ error: "Not found" },          { status: 404 });
    console.error("[notifications/read]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
