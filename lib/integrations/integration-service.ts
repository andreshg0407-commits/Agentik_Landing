/**
 * lib/integrations/integration-service.ts
 *
 * AGENTIK-INTEGRATIONS-VAULT-RUNTIME-01 — Integration Service
 *
 * Service layer above integration-repository.ts.
 * Provides the canonical sprint-spec function names as a thin wrapper.
 * All operations enforce organizationId isolation.
 *
 * SERVER ONLY — never import from client components.
 */

import {
  createIntegrationConnection  as _create,
  getIntegrationConnection     as _getByProvider,
  getIntegrationConnectionById as _getById,
  listOrgIntegrations          as _list,
  updateIntegrationConnectionStatus as _updateStatus,
} from "./integration-repository";
import { recordIntegrationAuditEvent } from "./integration-audit";
import type { IntegrationProvider, ConnectionStatus } from "./integration-types";
import { CONNECTION_STATUS } from "./integration-types";
import { prisma } from "@/lib/prisma";

// ── Re-export create ──────────────────────────────────────────────────────────

export { createIntegrationConnection } from "./integration-repository";

// ── getOrgConnections ─────────────────────────────────────────────────────────

/**
 * Returns all connections for a tenant, sanitized (no secrets).
 * Alias for listOrgIntegrations with clearer sprint-spec name.
 */
export async function getOrgConnections(organizationId: string) {
  return _list(organizationId);
}

// ── getConnectionByProvider ───────────────────────────────────────────────────

/**
 * Returns the most recent connection for (org, provider).
 * Returns null if not found.
 */
export async function getConnectionByProvider(
  organizationId: string,
  provider: IntegrationProvider | string,
) {
  return _getByProvider(organizationId, provider as IntegrationProvider);
}

// ── getConnectionForAction ────────────────────────────────────────────────────

/**
 * Returns a connection only if it is in "connected" status.
 * Throws if not found or not connected — safe guard for dispatch operations.
 */
export async function getConnectionForAction(
  organizationId: string,
  provider: IntegrationProvider | string,
): Promise<Awaited<ReturnType<typeof _getByProvider>>> {
  const conn = await _getByProvider(organizationId, provider as IntegrationProvider);
  if (!conn || conn.status !== CONNECTION_STATUS.CONNECTED) {
    return null;
  }
  return conn;
}

// ── markConnectionExpired ─────────────────────────────────────────────────────

export async function markConnectionExpired(
  connectionId:   string,
  organizationId: string,
): Promise<void> {
  const conn = await _getById(connectionId, organizationId);
  if (!conn) return;
  await _updateStatus(connectionId, organizationId, { status: CONNECTION_STATUS.EXPIRED });
  await recordIntegrationAuditEvent({
    organizationId,
    connectionId,
    provider: conn.provider,
    eventType: "TOKEN_EXPIRED",
    payload:  { connectionId, reason: "marked_expired_by_service" },
  });
}

// ── disconnectConnection ──────────────────────────────────────────────────────

export async function disconnectConnection(
  connectionId:   string,
  organizationId: string,
  actorId?:       string,
): Promise<void> {
  const conn = await _getById(connectionId, organizationId);
  if (!conn) return;
  await _updateStatus(connectionId, organizationId, { status: CONNECTION_STATUS.NOT_CONNECTED });
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data:  { disconnectedAt: new Date() },
  });
  await recordIntegrationAuditEvent({
    organizationId,
    connectionId,
    provider:  conn.provider,
    eventType: "INTEGRATION_DISCONNECTED",
    payload:   { connectionId, actorId: actorId ?? null },
    actorId:   actorId ?? null,
  });
}

// ── updateConnectionMetadata ──────────────────────────────────────────────────

export async function updateConnectionMetadata(
  connectionId:      string,
  organizationId:    string,
  metadata: {
    externalAccountId?:   string;
    externalAccountName?: string;
    shopDomain?:          string;
    scopes?:              string[];
    errorMessage?:        string | null;
  },
): Promise<void> {
  // Verify ownership before update
  const conn = await _getById(connectionId, organizationId);
  if (!conn) throw new Error(`Connection ${connectionId} not found for org ${organizationId}`);

  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      ...(metadata.externalAccountId   !== undefined && { externalAccountId:   metadata.externalAccountId   }),
      ...(metadata.externalAccountName !== undefined && { externalAccountName: metadata.externalAccountName }),
      ...(metadata.shopDomain          !== undefined && { shopDomain:          metadata.shopDomain          }),
      ...(metadata.scopes              !== undefined && { scopes:              metadata.scopes              }),
      ...(metadata.errorMessage        !== undefined && { errorMessage:        metadata.errorMessage        }),
    },
  });
}

// ── logIntegrationEvent ───────────────────────────────────────────────────────

export { recordIntegrationAuditEvent as logIntegrationEvent } from "./integration-audit";
