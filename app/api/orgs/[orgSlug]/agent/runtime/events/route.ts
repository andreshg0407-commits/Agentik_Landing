/**
 * GET /api/orgs/[orgSlug]/agent/runtime/events
 *
 * Agentik Runtime Event Store — Event Timeline Endpoint
 *
 * Returns the runtime event timeline with filtering support.
 * Read-only — no state mutation.
 *
 * Query params:
 *   category       — filter by event category
 *   agentId        — filter by agent
 *   actionId       — filter by action
 *   delegationId   — filter by delegation
 *   planId         — filter by plan
 *   correlationId  — filter by correlation
 *   severity       — filter by severity
 *   limit          — max events (default 100)
 *   since          — ISO timestamp lower bound
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  queryRuntimeEvents,
  buildRuntimeEventTimeline,
}                                    from "@/lib/agent-runtime/event-store";
import type { EventStoreFilter, EventCategory, EventSeverity } from "@/lib/agent-runtime/event-store-types";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/events/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url = new URL(req.url);

    const filter: EventStoreFilter = {
      orgId:         organization.id,
      limit:         Number(url.searchParams.get("limit") ?? "100"),
    };

    const category    = url.searchParams.get("category");
    const agentId     = url.searchParams.get("agentId");
    const actionId    = url.searchParams.get("actionId");
    const delegationId = url.searchParams.get("delegationId");
    const planId      = url.searchParams.get("planId");
    const corrId      = url.searchParams.get("correlationId");
    const severity    = url.searchParams.get("severity");
    const since       = url.searchParams.get("since");

    if (category)     filter.category     = category as EventCategory;
    if (agentId)      filter.agentId      = agentId;
    if (actionId)     filter.actionId     = actionId;
    if (delegationId) filter.delegationId = delegationId;
    if (planId)       filter.planId       = planId;
    if (corrId)       filter.correlationId = corrId;
    if (severity)     filter.severity     = severity as EventSeverity;
    if (since)        filter.since        = since;

    const [events, timeline] = await Promise.all([
      queryRuntimeEvents(filter),
      buildRuntimeEventTimeline(organization.id, filter),
    ]);

    // Summary
    const byCategory: Record<string, number> = {};
    const byAgent:    Record<string, number> = {};
    for (const e of events) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      if (e.agentId) byAgent[e.agentId] = (byAgent[e.agentId] ?? 0) + 1;
    }

    return NextResponse.json({
      events,
      timeline,
      summary: {
        totalEvents: events.length,
        byCategory,
        byAgent,
        oldestEvent: events.at(-1)?.occurredAt ?? null,
        newestEvent: events[0]?.occurredAt ?? null,
      },
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return handleError(err);
  }
}
