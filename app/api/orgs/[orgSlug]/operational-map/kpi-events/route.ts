/**
 * app/api/orgs/[orgSlug]/operational-map/kpi-events/route.ts
 *
 * KPI Event Timeline API (read + append notes).
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET ?kpiKey=xxx  — get timeline for a specific KPI (last 50 events)
 * GET              — get full org timeline (last 100 events)
 * POST             — append a manual note to a KPI timeline
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { NextResponse }        from "next/server";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { isInternalRole }      from "@/lib/auth/module-access";
import {
  getKpiTimeline,
  getOrgTimeline,
  appendKpiEvent,
}                              from "@/lib/operational-map/certification/operational-kpi-event-service";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const url    = new URL(req.url);
    const kpiKey = url.searchParams.get("kpiKey");
    const limit  = parseInt(url.searchParams.get("limit") ?? "50", 10);

    if (kpiKey) {
      const events = await getKpiTimeline(organization.id, kpiKey, limit);
      return NextResponse.json({ ok: true, events, count: events.length });
    }

    const events = await getOrgTimeline(organization.id, Math.min(limit, 200));
    return NextResponse.json({ ok: true, events, count: events.length });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — append manual note ────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body = await req.json() as {
      kpiKey:      string;
      description: string;
      metadata?:   Record<string, unknown>;
    };

    if (!body.kpiKey || !body.description) {
      return NextResponse.json(
        { ok: false, error: "kpiKey and description are required" },
        { status: 400 },
      );
    }

    const event = await appendKpiEvent({
      organizationId: organization.id,
      kpiKey:         body.kpiKey,
      eventType:      "note_added",
      actorId:        user.id,
      description:    body.description,
      metadata:       body.metadata,
    });

    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
