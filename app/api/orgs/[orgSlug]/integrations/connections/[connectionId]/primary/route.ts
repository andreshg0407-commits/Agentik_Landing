/**
 * POST /api/orgs/[orgSlug]/integrations/connections/[connectionId]/primary
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Set Primary Connection
 *
 * Marks a connection as primary for its provider.
 * Clears isPrimary on all other connections of the same provider for this org.
 *
 * SECURITY: requireOrgAccess — connectionId must belong to the org.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { setPrimaryConnection }        from "@/lib/integrations/integration-repository";
import { recordIntegrationAuditEvent } from "@/lib/integrations/integration-audit";

type RouteContext = { params: Promise<{ orgSlug: string; connectionId: string }> };

export async function POST(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, connectionId } = await params;

  try {
    const { organization, membership } = await requireOrgAccess(orgSlug);

    await setPrimaryConnection(connectionId, organization.id);

    await recordIntegrationAuditEvent({
      organizationId: organization.id,
      connectionId,
      provider:       "unknown",
      eventType:      "INTEGRATION_CONNECTED",
      payload:        { action: "set_primary", actorId: membership.id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
