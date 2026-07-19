/**
 * POST /api/orgs/[orgSlug]/integrations/connections/[connectionId]/disconnect
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Disconnect a Connection
 *
 * Sets status=not_connected, timestamps disconnectedAt, revokes vault secrets.
 * Does NOT delete the IntegrationConnection record — retains audit trail.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - connectionId must belong to the org (enforced at repository layer).
 * - Token revocation with provider is best-effort (fire-and-forget).
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { disconnectConnectionById }    from "@/lib/integrations/integration-repository";
import { revokeIntegrationSecret }     from "@/lib/integrations/vault/vault-service";
import { recordIntegrationAuditEvent } from "@/lib/integrations/integration-audit";

type RouteContext = { params: Promise<{ orgSlug: string; connectionId: string }> };

export async function POST(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, connectionId } = await params;

  try {
    const { organization, membership } = await requireOrgAccess(orgSlug);

    // Revoke vault secrets (best-effort)
    await revokeIntegrationSecret({
      organizationId: organization.id,
      connectionId,
      // No secretType = revoke all secrets for this connection
    }).catch(() => {});

    // Update connection status
    await disconnectConnectionById(connectionId, organization.id);

    await recordIntegrationAuditEvent({
      organizationId: organization.id,
      connectionId,
      provider:       "unknown",
      eventType:      "INTEGRATION_DISCONNECTED",
      payload:        { action: "user_disconnect", actorId: membership.id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
