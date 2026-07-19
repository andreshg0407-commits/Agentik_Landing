/**
 * GET  /api/orgs/[orgSlug]/notifications          — list notifications for current user
 * GET  /api/orgs/[orgSlug]/notifications?unread=1  — unread only
 * POST /api/orgs/[orgSlug]/notifications/mark-all-read — mark all read (see sub-route)
 */

import { NextResponse }         from "next/server";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import {
  listNotifications,
  getUnreadCount,
  markAllRead,
}                               from "@/lib/notifications/service";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[notifications]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req:      Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const userEmail  = user.email ?? user.id;
    const url        = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const countOnly  = url.searchParams.get("count")  === "1";
    const limit      = Math.min(100, Number(url.searchParams.get("limit") ?? "50"));

    if (countOnly) {
      const count = await getUnreadCount(organization.id, userEmail);
      return NextResponse.json({ count });
    }

    const notifications = await listNotifications(organization.id, userEmail, {
      limit,
      unreadOnly,
    });
    return NextResponse.json({ notifications });

  } catch (err) {
    return handleError(err);
  }
}

// ── PATCH /notifications (mark-all-read) ─────────────────────────────────────

export async function PATCH(
  _req:     Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const userEmail = user.email ?? user.id;
    const result    = await markAllRead(organization.id, userEmail);
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
