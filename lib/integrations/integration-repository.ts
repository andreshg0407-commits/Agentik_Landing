/**
 * lib/integrations/integration-repository.ts
 *
 * MS-10 — Integration Repository
 *
 * All Prisma access for the integration runtime.
 * organizationId-scoped on every query — no cross-tenant leakage.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   No UI imports, no client components.
 *   All returned objects are serializable (no Prisma model instances).
 *   Secrets are NEVER returned from this layer — call vault-service directly.
 *   SERVER ONLY.
 */

import { prisma } from "@/lib/prisma";
import type {
  IntegrationConnectionSnapshot,
  IntegrationProvider,
  CommerceJobSnapshot,
  CommerceJobType,
} from "./integration-types";
import {
  CONNECTION_STATUS,
  CONNECTION_HEALTH,
  COMMERCE_JOB_STATUS,
} from "./integration-types";

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapConnection(record: {
  id:                  string;
  organizationId:      string;
  provider:            string;
  status:              string;
  health:              string;
  shopDomain:          string | null;
  externalAccountId:   string | null;
  externalAccountName: string | null;
  label:               string | null;
  isPrimary:           boolean;
  accountHandle:       string | null;
  accountAvatarUrl:    string | null;
  accountType:         string | null;
  providerGroup:       string | null;
  externalPageId:      string | null;
  externalBusinessId:  string | null;
  externalAdAccountId: string | null;
  scopes:              unknown;
  connectedAt:         Date | null;
  disconnectedAt:      Date | null;
  lastHealthCheckAt:   Date | null;
  errorMessage:        string | null;
}): IntegrationConnectionSnapshot {
  return {
    id:                  record.id,
    organizationId:      record.organizationId,
    provider:            record.provider as IntegrationProvider,
    status:              record.status as IntegrationConnectionSnapshot["status"],
    health:              record.health as IntegrationConnectionSnapshot["health"],
    shopDomain:          record.shopDomain,
    externalAccountId:   record.externalAccountId,
    externalAccountName: record.externalAccountName,
    label:               record.label,
    isPrimary:           record.isPrimary,
    accountHandle:       record.accountHandle,
    accountAvatarUrl:    record.accountAvatarUrl,
    accountType:         record.accountType,
    providerGroup:       record.providerGroup,
    externalPageId:      record.externalPageId,
    externalBusinessId:  record.externalBusinessId,
    externalAdAccountId: record.externalAdAccountId,
    scopes:              Array.isArray(record.scopes) ? record.scopes as string[] : [],
    connectedAt:         record.connectedAt?.toISOString() ?? null,
    disconnectedAt:      record.disconnectedAt?.toISOString() ?? null,
    lastHealthCheckAt:   record.lastHealthCheckAt?.toISOString() ?? null,
    errorMessage:        record.errorMessage,
  };
}

// ── Connection CRUD ───────────────────────────────────────────────────────────

export async function createIntegrationConnection(opts: {
  organizationId:      string;
  provider:            IntegrationProvider;
  shopDomain:          string;
  externalAccountId?:  string | null;
  externalAccountName?: string | null;
  scopes?:             string[];
}): Promise<IntegrationConnectionSnapshot> {
  const record = await prisma.integrationConnection.create({
    data: {
      organizationId:      opts.organizationId,
      provider:            opts.provider,
      status:              CONNECTION_STATUS.NOT_CONNECTED,
      health:              CONNECTION_HEALTH.DISCONNECTED,
      externalAccountId:   opts.externalAccountId  ?? null,
      externalAccountName: opts.externalAccountName ?? null,
      shopDomain:          opts.shopDomain,
      scopes:              opts.scopes ?? [],
    },
  });
  return mapConnection(record);
}

export async function getIntegrationConnection(
  organizationId: string,
  provider:        IntegrationProvider,
): Promise<IntegrationConnectionSnapshot | null> {
  const record = await prisma.integrationConnection.findFirst({
    where: {
      organizationId,
      provider,
      // Only return non-revoked connections
      status: { not: CONNECTION_STATUS.REVOKED },
    },
    orderBy: { createdAt: "desc" },
  });
  return record ? mapConnection(record) : null;
}

export async function getIntegrationConnectionById(
  id:             string,
  organizationId: string,
): Promise<IntegrationConnectionSnapshot | null> {
  const record = await prisma.integrationConnection.findFirst({
    where: { id, organizationId },
  });
  return record ? mapConnection(record) : null;
}

export async function listOrgIntegrations(
  organizationId: string,
): Promise<IntegrationConnectionSnapshot[]> {
  const records = await prisma.integrationConnection.findMany({
    where:   { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return records.map(mapConnection);
}

/**
 * Upsert a connection by (organizationId, provider, externalAccountId).
 * If same externalAccountId exists: update status/tokens/metadata.
 * If not: create a new connection.
 * Use this in OAuth callbacks to prevent duplicate connections.
 */
export async function upsertConnectionByExternalId(opts: {
  organizationId:       string;
  provider:             string;
  externalAccountId:    string;
  externalAccountName?: string | null;
  accountHandle?:       string | null;
  accountAvatarUrl?:    string | null;
  accountType?:         string | null;
  providerGroup?:       string | null;
  externalPageId?:      string | null;
  externalBusinessId?:  string | null;
  label?:               string | null;
  isPrimary?:           boolean;
  scopes?:              string[];
  connectedAt?:         Date;
}): Promise<IntegrationConnectionSnapshot> {
  const existing = await prisma.integrationConnection.findFirst({
    where: {
      organizationId:   opts.organizationId,
      provider:         opts.provider,
      externalAccountId: opts.externalAccountId,
    },
  });

  if (existing) {
    const updated = await prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        status:              CONNECTION_STATUS.CONNECTED,
        health:              CONNECTION_HEALTH.HEALTHY,
        externalAccountName: opts.externalAccountName ?? existing.externalAccountName,
        accountHandle:       opts.accountHandle       ?? existing.accountHandle,
        accountAvatarUrl:    opts.accountAvatarUrl    ?? existing.accountAvatarUrl,
        accountType:         opts.accountType         ?? existing.accountType,
        providerGroup:       opts.providerGroup       ?? existing.providerGroup,
        externalPageId:      opts.externalPageId      ?? existing.externalPageId,
        externalBusinessId:  opts.externalBusinessId  ?? existing.externalBusinessId,
        label:               opts.label               ?? existing.label,
        isPrimary:           opts.isPrimary           ?? existing.isPrimary,
        scopes:              opts.scopes              ?? (existing.scopes as string[]),
        connectedAt:         opts.connectedAt         ?? existing.connectedAt ?? new Date(),
        disconnectedAt:      null,
        errorMessage:        null,
        updatedAt:           new Date(),
      },
    });
    return mapConnection(updated);
  }

  // Check if this is the first connection for this org+provider — make it primary
  const existingCount = await prisma.integrationConnection.count({
    where: { organizationId: opts.organizationId, provider: opts.provider },
  });

  const created = await prisma.integrationConnection.create({
    data: {
      organizationId:      opts.organizationId,
      provider:            opts.provider,
      status:              CONNECTION_STATUS.CONNECTED,
      health:              CONNECTION_HEALTH.HEALTHY,
      externalAccountId:   opts.externalAccountId,
      externalAccountName: opts.externalAccountName ?? null,
      accountHandle:       opts.accountHandle       ?? null,
      accountAvatarUrl:    opts.accountAvatarUrl    ?? null,
      accountType:         opts.accountType         ?? null,
      providerGroup:       opts.providerGroup       ?? null,
      externalPageId:      opts.externalPageId      ?? null,
      externalBusinessId:  opts.externalBusinessId  ?? null,
      shopDomain:          null,
      label:               opts.label               ?? null,
      isPrimary:           opts.isPrimary           ?? existingCount === 0,
      scopes:              opts.scopes              ?? [],
      connectedAt:         opts.connectedAt         ?? new Date(),
    },
  });
  return mapConnection(created);
}

/**
 * List all connections for an org grouped by provider.
 * Returns all statuses (not just connected).
 */
export async function listConnectionsByProvider(
  organizationId: string,
): Promise<Record<string, IntegrationConnectionSnapshot[]>> {
  const records = await prisma.integrationConnection.findMany({
    where:   { organizationId },
    orderBy: [{ isPrimary: "desc" }, { connectedAt: "desc" }],
  });
  const grouped: Record<string, IntegrationConnectionSnapshot[]> = {};
  for (const r of records) {
    const snap = mapConnection(r);
    if (!grouped[r.provider]) grouped[r.provider] = [];
    grouped[r.provider].push(snap);
  }
  return grouped;
}

/**
 * Sets isPrimary=true for one connection, isPrimary=false for all others in same provider.
 */
export async function setPrimaryConnection(
  connectionId:   string,
  organizationId: string,
): Promise<void> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, organizationId },
    select: { provider: true },
  });
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  // Clear primary on all connections of same provider
  await prisma.integrationConnection.updateMany({
    where: { organizationId, provider: conn.provider },
    data:  { isPrimary: false },
  });
  // Set primary on chosen connection
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data:  { isPrimary: true },
  });
}

/**
 * Disconnect a connection — set status to not_connected, timestampedisconnectedAt.
 */
export async function disconnectConnectionById(
  connectionId:   string,
  organizationId: string,
): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: { id: connectionId, organizationId },
    data: {
      status:        CONNECTION_STATUS.NOT_CONNECTED,
      health:        CONNECTION_HEALTH.DISCONNECTED,
      disconnectedAt: new Date(),
      updatedAt:     new Date(),
    },
  });
}

/**
 * Get primary connection for a provider, or most recent connected one.
 */
export async function getPrimaryOrLatestConnection(
  organizationId: string,
  provider:       string,
): Promise<IntegrationConnectionSnapshot | null> {
  // First: try primary
  const primary = await prisma.integrationConnection.findFirst({
    where: { organizationId, provider, isPrimary: true, status: CONNECTION_STATUS.CONNECTED },
  });
  if (primary) return mapConnection(primary);

  // Fallback: most recent connected
  const latest = await prisma.integrationConnection.findFirst({
    where:   { organizationId, provider, status: CONNECTION_STATUS.CONNECTED },
    orderBy: { connectedAt: "desc" },
  });
  return latest ? mapConnection(latest) : null;
}

export async function updateIntegrationConnectionStatus(
  id:             string,
  organizationId: string,
  data: Partial<{
    status:              string;
    health:              string;
    externalAccountId:   string | null;
    externalAccountName: string | null;
    scopes:              string[];
    connectedAt:         Date;
    disconnectedAt:      Date;
    errorMessage:        string | null;
  }>,
): Promise<void> {
  // Scope to organizationId to prevent cross-tenant write
  await prisma.integrationConnection.updateMany({
    where: { id, organizationId },
    data:  { ...data, updatedAt: new Date() },
  });
}

export async function updateIntegrationConnectionHealth(
  id:             string,
  organizationId: string,
  data: Partial<{
    health:            string;
    lastHealthCheckAt: Date;
    errorMessage:      string | null;
    status:            string;
  }>,
): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: { id, organizationId },
    data:  { ...data, updatedAt: new Date() },
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function recordIntegrationEvent(opts: {
  organizationId: string;
  connectionId?:  string | null;
  provider:       string;
  eventType:      string;
  payload?:       Record<string, unknown>;
  actorId?:       string | null;
}): Promise<void> {
  await prisma.integrationEvent.create({
    data: {
      organizationId: opts.organizationId,
      connectionId:   opts.connectionId ?? null,
      provider:       opts.provider,
      eventType:      opts.eventType,
      payload:        (opts.payload ?? {}) as object,
      actorId:        opts.actorId ?? null,
      occurredAt:     new Date(),
    },
  });
}

// ── Webhook events ────────────────────────────────────────────────────────────

export async function recordWebhookEvent(opts: {
  organizationId: string;
  provider:       string;
  eventId:        string;
  topic:          string;
  payload:        Record<string, unknown>;
}): Promise<string> {
  const record = await prisma.integrationWebhookEvent.create({
    data: {
      organizationId: opts.organizationId,
      provider:       opts.provider,
      eventId:        opts.eventId,
      topic:          opts.topic,
      payload:        opts.payload as object,
      status:         "pending",
      receivedAt:     new Date(),
    },
  });
  return record.id;
}

export async function markWebhookProcessed(
  id:             string,
  organizationId: string,
  errorMessage?:  string,
): Promise<void> {
  await prisma.integrationWebhookEvent.updateMany({
    where: { id, organizationId },
    data: {
      status:       errorMessage ? "failed" : "processed",
      processedAt:  new Date(),
      errorMessage: errorMessage ?? null,
    },
  });
}

/** Check if a webhook event ID has already been processed (deduplication). */
export async function isWebhookEventDuplicate(
  organizationId: string,
  provider:        string,
  eventId:         string,
): Promise<boolean> {
  const existing = await prisma.integrationWebhookEvent.findFirst({
    where: { organizationId, provider, eventId },
    select: { id: true },
  });
  return existing !== null;
}

// ── Commerce jobs ─────────────────────────────────────────────────────────────

export async function createIntegrationSyncJob(opts: {
  organizationId: string;
  connectionId:   string;
  provider:       IntegrationProvider;
  jobType:        CommerceJobType;
  priority?:      number;
  productId?:     string | null;
  payload?:       Record<string, unknown>;
  scheduledAt?:   Date;
}): Promise<CommerceJobSnapshot> {
  const record = await prisma.commerceJob.create({
    data: {
      organizationId: opts.organizationId,
      connectionId:   opts.connectionId,
      provider:       opts.provider,
      jobType:        opts.jobType,
      status:         COMMERCE_JOB_STATUS.PENDING,
      priority:       opts.priority ?? 5,
      productId:      opts.productId ?? null,
      payload:        (opts.payload ?? {}) as object,
      scheduledAt:    opts.scheduledAt ?? new Date(),
    },
  });
  return mapCommerceJob(record);
}

export async function getPendingIntegrationSyncJobs(
  organizationId: string,
  provider:        IntegrationProvider,
): Promise<CommerceJobSnapshot[]> {
  const records = await prisma.commerceJob.findMany({
    where: {
      organizationId,
      provider,
      status: COMMERCE_JOB_STATUS.PENDING,
    },
    orderBy: [
      { priority:    "asc" },
      { scheduledAt: "asc" },
    ],
    take: 50,
  });
  return records.map(mapCommerceJob);
}

function mapCommerceJob(record: {
  id:             string;
  organizationId: string;
  connectionId:   string | null;
  provider:       string;
  jobType:        string;
  status:         string;
  priority:       number;
  productId:      string | null;
  retryCount:     number;
  scheduledAt:    Date;
  startedAt:      Date | null;
  completedAt:    Date | null;
  lastError:      string | null;
}): CommerceJobSnapshot {
  return {
    id:             record.id,
    organizationId: record.organizationId,
    connectionId:   record.connectionId,
    provider:       record.provider as IntegrationProvider,
    jobType:        record.jobType as CommerceJobSnapshot["jobType"],
    status:         record.status as CommerceJobSnapshot["status"],
    priority:       record.priority,
    productId:      record.productId,
    retryCount:     record.retryCount,
    scheduledAt:    record.scheduledAt.toISOString(),
    startedAt:      record.startedAt?.toISOString() ?? null,
    completedAt:    record.completedAt?.toISOString() ?? null,
    lastError:      record.lastError,
  };
}

// ── Sync job bridge ───────────────────────────────────────────────────────────

/**
 * Creates a Shopify product publication job (pending, not executed).
 * MS-11 will execute this job.
 */
export async function createShopifyPublicationJob(opts: {
  organizationId: string;
  productId:      string;
  connectionId:   string;
  payload:        Record<string, unknown>;
  priority?:      number;
}): Promise<CommerceJobSnapshot> {
  return createIntegrationSyncJob({
    organizationId: opts.organizationId,
    connectionId:   opts.connectionId,
    provider:       "shopify",
    jobType:        "publish_product_draft",
    priority:       opts.priority ?? 5,
    productId:      opts.productId,
    payload:        opts.payload,
  });
}

// ── Recovery jobs (MS-12) ─────────────────────────────────────────────────────

export type RecoveryJobType =
  | "re_publish_draft"
  | "update_shopify_product"
  | "refresh_images"
  | "rebuild_variants"
  | "mark_external_missing";

/**
 * Creates a recovery CommerceJob for a product that needs remediation.
 * Status is "pending" — execution must be triggered separately.
 * Does NOT execute the job.
 */
export async function createRecoveryJob(opts: {
  organizationId: string;
  productId:      string;
  connectionId:   string;
  recoveryType:   RecoveryJobType;
  payload?:       Record<string, unknown>;
  priority?:      number;
}): Promise<CommerceJobSnapshot> {
  return createIntegrationSyncJob({
    organizationId: opts.organizationId,
    connectionId:   opts.connectionId,
    provider:       "shopify",
    jobType:        opts.recoveryType as import("./integration-types").CommerceJobType,
    priority:       opts.priority ?? 3,   // recovery jobs are higher priority
    productId:      opts.productId,
    payload:        opts.payload ?? { trigger: "recovery", recoveryType: opts.recoveryType },
  });
}
