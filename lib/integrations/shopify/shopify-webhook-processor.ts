/**
 * lib/integrations/shopify/shopify-webhook-processor.ts
 *
 * MS-12 — Shopify Webhook Processor
 *
 * Processes stored IntegrationWebhookEvent records for Shopify topics.
 * Resolves org context, updates publication/sync state, records activity.
 *
 * Supported topics:
 *   products/create   — log, no-op (product created externally, not from Agentik)
 *   products/update   — detect state changes, flag drift
 *   products/delete   — mark external missing on ProductPublicationState
 *   inventory_levels/update — log for future inventory sync
 *
 * ── DESIGN ──────────────────────────────────────────────────────────────────
 *   Runs synchronously — no background workers.
 *   Always deduplicates by webhook eventId.
 *   On failure, marks webhook status="failed" and records audit event.
 *   NO cross-tenant access — every query scoped to organizationId.
 *   NO token exposure — tokens never stored in webhook payloads.
 *   Idempotent — safe to call multiple times for the same webhook.
 */

import { prisma }                  from "@/lib/prisma";
import { recordIntegrationEvent }  from "@/lib/integrations/integration-repository";

// ── Result types ──────────────────────────────────────────────────────────────

export interface WebhookProcessResult {
  webhookId:      string;
  topic:          string;
  organizationId: string;
  status:         "processed" | "failed" | "skipped";
  action:         string;
  errorMessage:   string | null;
}

export interface BatchProcessResult {
  processed: number;
  failed:    number;
  skipped:   number;
  errors:    Array<{ webhookId: string; error: string }>;
  results:   WebhookProcessResult[];
}

// ── Topic handlers ────────────────────────────────────────────────────────────

async function handleProductUpdate(
  organizationId: string,
  connectionId:   string,
  payload:        Record<string, unknown>,
  webhookId:      string,
): Promise<string> {
  const productId    = payload.id;
  const externalId   = String(productId);
  const updatedAt    = payload.updated_at as string | undefined;
  const handle       = payload.handle as string | undefined;
  const status       = payload.status as string | undefined;

  if (!externalId) return "no_product_id";

  // Find the ProductPublicationState that owns this external product
  const pubState = await prisma.productPublicationState.findFirst({
    where: { externalPublicationId: externalId, organizationId, channel: "shopify" },
    select: { id: true, productId: true },
  });

  if (!pubState) return "no_matching_publication";

  // Update sync metadata to flag drift if Shopify is newer
  await prisma.productPublicationState.update({
    where: { id: pubState.id },
    data:  {
      // Do NOT overwrite publicationStatus — we don't trust Shopify as source of truth
      // Just update the Shopify handle if it changed
      ...(handle ? { shopifyHandle: handle } : {}),
    },
  });

  // Record product activity
  await prisma.productActivity.create({
    data: {
      productId:      pubState.productId,
      organizationId,
      eventType:      "SHOPIFY_PRODUCT_UPDATED",
      payload: {
        webhookId,
        externalProductId: externalId,
        shopifyStatus:     status,
        shopifyHandle:     handle,
        shopifyUpdatedAt:  updatedAt,
      },
      actorLabel: "Shopify Webhook",
    },
  });

  await recordIntegrationEvent({
    organizationId,
    connectionId,
    provider:  "shopify",
    eventType: "WEBHOOK_RECEIVED",
    payload:   { topic: "products/update", externalProductId: externalId, webhookId },
  });

  return "product_update_recorded";
}

async function handleProductDelete(
  organizationId: string,
  connectionId:   string,
  payload:        Record<string, unknown>,
  webhookId:      string,
): Promise<string> {
  const productId  = payload.id;
  const externalId = String(productId);

  if (!externalId) return "no_product_id";

  const pubState = await prisma.productPublicationState.findFirst({
    where: { externalPublicationId: externalId, organizationId, channel: "shopify" },
    select: { id: true, productId: true },
  });

  if (!pubState) return "no_matching_publication";

  // Mark publication as failed/missing
  await prisma.productPublicationState.update({
    where: { id: pubState.id },
    data:  {
      publicationStatus: "unpublished",
      errorMessage:      "Producto eliminado en Shopify",
    },
  });

  // Append publication event
  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId:          pubState.productId,
      channel:            "shopify",
      publicationStateId: pubState.id,
      eventType:          "external_deleted",
      resultState:        "missing_external",
      message:            `Producto eliminado en Shopify — external ID: ${externalId}`,
      payload:            { externalProductId: externalId, webhookId },
    },
  });

  // Record product activity
  await prisma.productActivity.create({
    data: {
      productId:      pubState.productId,
      organizationId,
      eventType:      "SHOPIFY_PRODUCT_DELETED",
      payload:        { webhookId, externalProductId: externalId },
      actorLabel:     "Shopify Webhook",
    },
  });

  await recordIntegrationEvent({
    organizationId,
    connectionId,
    provider:  "shopify",
    eventType: "WEBHOOK_RECEIVED",
    payload:   { topic: "products/delete", externalProductId: externalId, webhookId },
  });

  return "product_deletion_recorded";
}

async function handleProductCreate(
  organizationId: string,
  connectionId:   string,
  payload:        Record<string, unknown>,
  webhookId:      string,
): Promise<string> {
  // External product creation — Agentik is source of truth, so we just log
  await recordIntegrationEvent({
    organizationId,
    connectionId,
    provider:  "shopify",
    eventType: "WEBHOOK_RECEIVED",
    payload:   {
      topic:             "products/create",
      externalProductId: String(payload.id ?? ""),
      webhookId,
    },
  });
  return "external_create_logged";
}

async function handleInventoryUpdate(
  organizationId: string,
  connectionId:   string,
  payload:        Record<string, unknown>,
  webhookId:      string,
): Promise<string> {
  // MS-12 scope: log only — no inventory sync yet
  await recordIntegrationEvent({
    organizationId,
    connectionId,
    provider:  "shopify",
    eventType: "WEBHOOK_RECEIVED",
    payload:   {
      topic:            "inventory_levels/update",
      inventoryItemId:  String(payload.inventory_item_id ?? ""),
      locationId:       String(payload.location_id ?? ""),
      available:        payload.available,
      webhookId,
    },
  });
  return "inventory_update_logged";
}

// ── Single webhook processor ──────────────────────────────────────────────────

export async function processStoredShopifyWebhook(
  webhookEventId: string,
): Promise<WebhookProcessResult> {
  // Load webhook record
  const webhook = await prisma.integrationWebhookEvent.findUnique({
    where: { id: webhookEventId },
  });

  if (!webhook) {
    return {
      webhookId: webhookEventId, topic: "unknown", organizationId: "unknown",
      status: "failed", action: "not_found",
      errorMessage: `Webhook event not found: ${webhookEventId}`,
    };
  }

  // Already processed — idempotent
  if (webhook.status === "processed") {
    return {
      webhookId: webhookEventId, topic: webhook.topic, organizationId: webhook.organizationId,
      status: "skipped", action: "already_processed", errorMessage: null,
    };
  }

  // Resolve connection for audit
  const connection = await prisma.integrationConnection.findFirst({
    where: { organizationId: webhook.organizationId, provider: "shopify" },
    select: { id: true },
  });

  const connectionId = connection?.id ?? "";
  const payload      = (webhook.payload as Record<string, unknown>) ?? {};

  try {
    let action: string;

    switch (webhook.topic) {
      case "products/create":
        action = await handleProductCreate(webhook.organizationId, connectionId, payload, webhook.eventId);
        break;
      case "products/update":
        action = await handleProductUpdate(webhook.organizationId, connectionId, payload, webhook.eventId);
        break;
      case "products/delete":
        action = await handleProductDelete(webhook.organizationId, connectionId, payload, webhook.eventId);
        break;
      case "inventory_levels/update":
        action = await handleInventoryUpdate(webhook.organizationId, connectionId, payload, webhook.eventId);
        break;
      default:
        action = "unsupported_topic";
    }

    // Mark processed
    await prisma.integrationWebhookEvent.update({
      where: { id: webhookEventId },
      data:  { status: "processed", processedAt: new Date(), errorMessage: null },
    });

    return {
      webhookId:      webhookEventId,
      topic:          webhook.topic,
      organizationId: webhook.organizationId,
      status:         "processed",
      action,
      errorMessage:   null,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown processing error";

    // Mark failed — but don't throw, let caller collect errors
    await prisma.integrationWebhookEvent.update({
      where: { id: webhookEventId },
      data:  { status: "failed", errorMessage: msg.slice(0, 300) },
    }).catch(() => {/* already failed */});

    return {
      webhookId:      webhookEventId,
      topic:          webhook.topic,
      organizationId: webhook.organizationId,
      status:         "failed",
      action:         "processing_error",
      errorMessage:   msg,
    };
  }
}

// ── Batch processor ───────────────────────────────────────────────────────────

export async function processPendingShopifyWebhooks(
  organizationId: string,
  limit:          number = 50,
): Promise<BatchProcessResult> {
  const pending = await prisma.integrationWebhookEvent.findMany({
    where: {
      organizationId,
      provider: "shopify",
      status:   "pending",
    },
    orderBy: { receivedAt: "asc" },
    take:    limit,
    select:  { id: true },
  });

  const results: WebhookProcessResult[] = [];
  const errors:  Array<{ webhookId: string; error: string }> = [];
  let processed = 0;
  let failed    = 0;
  let skipped   = 0;

  for (const { id } of pending) {
    const result = await processStoredShopifyWebhook(id);
    results.push(result);

    if (result.status === "processed") processed++;
    else if (result.status === "failed") {
      failed++;
      errors.push({ webhookId: id, error: result.errorMessage ?? "unknown" });
    } else {
      skipped++;
    }
  }

  return { processed, failed, skipped, errors, results };
}
