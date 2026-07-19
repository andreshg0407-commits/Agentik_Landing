/**
 * POST /api/internal/integrations/resolve-token
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Internal Token Resolution (multi-account)
 *
 * Server-to-server only. Called by n8n workflows to obtain a decrypted
 * access token for a specific tenant + provider combination.
 *
 * MULTI-ACCOUNT RESOLUTION:
 * - If connectionId is provided: resolve that exact connection.
 * - If connectionId is absent + provider has isPrimary=true: use primary.
 * - If connectionId is absent + no primary + exactly 1 connected: use it.
 * - If connectionId is absent + no primary + multiple connected:
 *     → ok:false, reason:"multiple_connections_require_connection_id"
 *
 * SECURITY RULES:
 * - Auth: x-agentik-internal-secret header MUST match INTERNAL_API_SECRET env var.
 * - Never expose tokens in logs, error messages, or response caching.
 * - organizationId always required — no cross-tenant fallback.
 * - connectionId is always validated against the organizationId.
 */

import { NextRequest, NextResponse }            from "next/server";
import { prisma }                               from "@/lib/prisma";
import { getIntegrationSecret }                 from "@/lib/integrations/vault/vault-service";
import { getPrimaryOrLatestConnection }         from "@/lib/integrations/integration-repository";
import { recordIntegrationAuditEvent }          from "@/lib/integrations/integration-audit";
import { CONNECTION_STATUS }                    from "@/lib/integrations/integration-types";

// ── Auth guard ────────────────────────────────────────────────────────────────

function verifyInternalSecret(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return req.headers.get("x-agentik-internal-secret") === secret;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: {
    organizationId?: string;
    provider?:       string;
    action?:         string;
    connectionId?:   string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const { organizationId, provider, action = "resolve", connectionId } = body;
  if (!organizationId || !provider) {
    return NextResponse.json(
      { ok: false, reason: "missing_fields", required: ["organizationId", "provider"] },
      { status: 400 },
    );
  }

  try {
    // ── Resolve which connection to use ───────────────────────────────────────
    let connection;

    if (connectionId) {
      // Explicit connectionId — validate it belongs to this org
      const record = await prisma.integrationConnection.findFirst({
        where: { id: connectionId, organizationId, provider },
      });
      if (!record) {
        await recordIntegrationAuditEvent({
          organizationId, provider,
          eventType: "API_REQUEST_FAILED",
          payload:   { reason: "connection_not_found", connectionId, action },
        });
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
      }
      connection = record;

    } else {
      // No connectionId — try primary, then fallback
      const snapshot = await getPrimaryOrLatestConnection(organizationId, provider);

      if (!snapshot) {
        // Check if any connections exist (for better error message)
        const anyCount = await prisma.integrationConnection.count({
          where: { organizationId, provider },
        });
        await recordIntegrationAuditEvent({
          organizationId, provider,
          eventType: "API_REQUEST_FAILED",
          payload:   { reason: anyCount > 0 ? "no_connected_connection" : "no_connection", action },
        });
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
      }

      // If no primary was found but multiple connected exist, require connectionId
      if (!snapshot.isPrimary) {
        const connectedCount = await prisma.integrationConnection.count({
          where: { organizationId, provider, status: CONNECTION_STATUS.CONNECTED },
        });
        if (connectedCount > 1) {
          return NextResponse.json({
            ok:     false,
            reason: "multiple_connections_require_connection_id",
            hint:   "Set isPrimary on one connection or provide connectionId in the request",
          }, { status: 400 });
        }
      }

      // Re-fetch as full Prisma record for consistency
      const record = await prisma.integrationConnection.findFirst({
        where: { id: snapshot.id, organizationId },
      });
      if (!record) {
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
      }
      connection = record;
    }

    // ── Check status ──────────────────────────────────────────────────────────
    if (connection.status === "expired" || connection.status === "revoked") {
      await recordIntegrationAuditEvent({
        organizationId,
        connectionId: connection.id,
        provider,
        eventType: "TOKEN_EXPIRED",
        payload:   { reason: connection.status, action },
      });
      return NextResponse.json({ ok: false, reason: connection.status }, { status: 200 });
    }

    if (connection.status !== "connected") {
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 200 });
    }

    // ── Retrieve vault secret ─────────────────────────────────────────────────
    const secret = await getIntegrationSecret({
      organizationId,
      connectionId: connection.id,
      secretType:   "access_token",
    });

    if (!secret) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    if (secret.expiresAt && secret.expiresAt < new Date()) {
      await recordIntegrationAuditEvent({
        organizationId,
        connectionId: connection.id,
        provider,
        eventType: "TOKEN_EXPIRED",
        payload:   { reason: "vault_secret_expired", action, expiresAt: secret.expiresAt },
      });
      return NextResponse.json({ ok: false, reason: "expired" }, { status: 200 });
    }

    // ── Audit successful resolution ───────────────────────────────────────────
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId: connection.id,
      provider,
      eventType: "TOKEN_REFRESHED",
      payload: {
        action,
        scopes:            Array.isArray(connection.scopes) ? connection.scopes : [],
        externalAccountId: connection.externalAccountId,
        isPrimary:         connection.isPrimary,
      },
    });

    return NextResponse.json({
      ok:                true,
      provider,
      connectionId:      connection.id,
      accessToken:       secret.plainValue,
      expiresAt:         secret.expiresAt?.toISOString() ?? null,
      scopes:            Array.isArray(connection.scopes) ? connection.scopes : [],
      accountName:       connection.externalAccountName,
      accountHandle:     (connection as Record<string, unknown>).accountHandle as string | null ?? null,
      externalAccountId: connection.externalAccountId,
      isPrimary:         connection.isPrimary,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId: connectionId ?? null,
      provider,
      eventType: "API_REQUEST_FAILED",
      payload:   { reason: "resolve_error", action, errorCode: message.slice(0, 50) },
    }).catch(() => {});

    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
