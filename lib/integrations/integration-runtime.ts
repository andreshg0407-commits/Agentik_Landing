/**
 * lib/integrations/integration-runtime.ts
 *
 * MS-10 — Integration Runtime
 *
 * Coordination layer for integration lifecycle operations.
 * Bridges the repository, vault, and audit layers.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   No direct Prisma access — delegates to integration-repository.ts.
 *   No token handling — delegates to vault-service.ts.
 *   Audit events fired for all state transitions.
 *   organizationId enforced on every operation.
 *   SERVER ONLY.
 */

import type { IntegrationConnectionSnapshot, IntegrationProvider } from "./integration-types";
import { CONNECTION_STATUS, CONNECTION_HEALTH } from "./integration-types";
import type { AuditEventInput } from "./integration-audit";
import { recordIntegrationAuditEvent } from "./integration-audit";
import { INTEGRATION_EVENT_TYPE } from "./integration-events";
import {
  getIntegrationConnection,
  updateIntegrationConnectionStatus,
  updateIntegrationConnectionHealth,
} from "./integration-repository";
import {
  IntegrationNotConnectedError,
  IntegrationDisabledError,
  IntegrationTokenExpiredError,
} from "./integration-errors";

// ── Connection state queries ──────────────────────────────────────────────────

/**
 * Returns a safe snapshot of the integration connection for an org + provider.
 * Returns null if not connected.
 */
export async function getIntegrationConnectionForOrg(
  organizationId: string,
  provider:       IntegrationProvider,
): Promise<IntegrationConnectionSnapshot | null> {
  return getIntegrationConnection(organizationId, provider);
}

/**
 * Returns true if the connection is active and healthy.
 */
export function isIntegrationActive(
  connection: IntegrationConnectionSnapshot | null,
): boolean {
  if (!connection) return false;
  return (
    connection.status === CONNECTION_STATUS.CONNECTED &&
    connection.health !== CONNECTION_HEALTH.CRITICAL
  );
}

/**
 * Asserts that the connection is active. Throws if not.
 */
export function assertIntegrationActive(
  connection:     IntegrationConnectionSnapshot | null,
  provider:       IntegrationProvider,
  organizationId: string,
): void {
  if (!connection || connection.status === CONNECTION_STATUS.NOT_CONNECTED) {
    throw new IntegrationNotConnectedError(provider, organizationId);
  }
  if (connection.status === CONNECTION_STATUS.DISABLED) {
    throw new IntegrationDisabledError(provider, organizationId);
  }
  if (connection.status === CONNECTION_STATUS.EXPIRED) {
    throw new IntegrationTokenExpiredError(provider, organizationId);
  }
}

// ── Connection lifecycle ──────────────────────────────────────────────────────

/**
 * Marks a connection as connected and fires the audit event.
 */
export async function activateIntegrationConnection(opts: {
  connectionId:        string;
  organizationId:      string;
  provider:            IntegrationProvider;
  externalAccountId:   string | null;
  externalAccountName: string | null;
  scopes:              string[];
  actorId?:            string | null;
}): Promise<void> {
  await updateIntegrationConnectionStatus(opts.connectionId, opts.organizationId, {
    status:              CONNECTION_STATUS.CONNECTED,
    health:              CONNECTION_HEALTH.HEALTHY,
    externalAccountId:   opts.externalAccountId,
    externalAccountName: opts.externalAccountName,
    scopes:              opts.scopes,
    connectedAt:         new Date(),
    errorMessage:        null,
  });

  await recordIntegrationAuditEvent({
    organizationId: opts.organizationId,
    connectionId:   opts.connectionId,
    provider:       opts.provider,
    eventType:      INTEGRATION_EVENT_TYPE.INTEGRATION_CONNECTED,
    payload: {
      externalAccountId:   opts.externalAccountId,
      externalAccountName: opts.externalAccountName,
      scopes:              opts.scopes,
    },
    actorId: opts.actorId ?? null,
  });
}

/**
 * Marks a connection as errored.
 */
export async function markIntegrationConnectionError(opts: {
  connectionId:   string;
  organizationId: string;
  provider:       IntegrationProvider;
  errorMessage:   string;
  actorId?:       string | null;
}): Promise<void> {
  await updateIntegrationConnectionStatus(opts.connectionId, opts.organizationId, {
    status:       CONNECTION_STATUS.ERROR,
    health:       CONNECTION_HEALTH.CRITICAL,
    errorMessage: opts.errorMessage,
  });

  await recordIntegrationAuditEvent({
    organizationId: opts.organizationId,
    connectionId:   opts.connectionId,
    provider:       opts.provider,
    eventType:      INTEGRATION_EVENT_TYPE.API_REQUEST_FAILED,
    payload: {
      // errorMessage is safe (no token content — ShopifyApiError.message is safe by contract)
      errorMessage: opts.errorMessage,
    },
    actorId: opts.actorId ?? null,
  });
}

/**
 * Marks a connection as disconnected.
 */
export async function disconnectIntegration(opts: {
  connectionId:   string;
  organizationId: string;
  provider:       IntegrationProvider;
  reason:         "user_initiated" | "token_expired" | "revoked" | "error";
  actorId?:       string | null;
}): Promise<void> {
  await updateIntegrationConnectionStatus(opts.connectionId, opts.organizationId, {
    status:         CONNECTION_STATUS.REVOKED,
    health:         CONNECTION_HEALTH.DISCONNECTED,
    disconnectedAt: new Date(),
  });

  await recordIntegrationAuditEvent({
    organizationId: opts.organizationId,
    connectionId:   opts.connectionId,
    provider:       opts.provider,
    eventType:      INTEGRATION_EVENT_TYPE.INTEGRATION_DISCONNECTED,
    payload:        { reason: opts.reason },
    actorId:        opts.actorId ?? null,
  });
}

/**
 * Records a health check result.
 */
export async function recordHealthCheck(opts: {
  connectionId:   string;
  organizationId: string;
  provider:       IntegrationProvider;
  healthy:        boolean;
  errorMessage?:  string | null;
}): Promise<void> {
  await updateIntegrationConnectionHealth(opts.connectionId, opts.organizationId, {
    health:             opts.healthy ? CONNECTION_HEALTH.HEALTHY : CONNECTION_HEALTH.CRITICAL,
    lastHealthCheckAt:  new Date(),
    errorMessage:       opts.errorMessage ?? null,
    status:             opts.healthy ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.ERROR,
  });
}
