/**
 * app/api/orgs/[orgSlug]/marketing-studio/sessions/route.ts
 *
 * POST — create a new StudioSession row (called when the wizard initialises).
 * GET  — list sessions for the org (admin view).
 *
 * POST body:  { sessionId: string; tenantId: string }
 * GET  query: ?limit=20
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { createDbSession, listDbSessions } from "@/lib/marketing-studio/session-service";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — create session ─────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body      = await req.json() as { sessionId?: string; tenantId?: string };
    const sessionId = body.sessionId?.trim();
    const tenantId  = body.tenantId?.trim();

    if (!sessionId || !tenantId) {
      return NextResponse.json(
        { error: "sessionId and tenantId are required" },
        { status: 400 },
      );
    }

    const session = await createDbSession({
      id:             sessionId,
      organizationId: organization.id,
      tenantId,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[marketing-studio/sessions/POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET — list sessions ───────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const limit    = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const sessions = await listDbSessions(organization.id, Math.min(limit, 100));

    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[marketing-studio/sessions/GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
