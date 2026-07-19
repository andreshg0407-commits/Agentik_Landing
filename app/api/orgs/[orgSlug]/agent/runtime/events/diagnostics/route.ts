/**
 * GET /api/orgs/[orgSlug]/agent/runtime/events/diagnostics
 *
 * Agentik Runtime Event Store — Diagnostics Endpoint
 *
 * Returns event store health and metrics:
 * - totalEvents, byCategory, byAgent, bySeverity
 * - correlationCount, orphanEvents
 * - latestEventAt, oldestEventAt
 * - storeType, schemaVersion
 *
 * Read-only — no state mutation.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

import { NextResponse }           from "next/server";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { getEventStoreDiagnostics } from "@/lib/agent-runtime/event-store";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/events/diagnostics/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const diagnostics = await getEventStoreDiagnostics(organization.id);

    return NextResponse.json({
      diagnostics,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return handleError(err);
  }
}
