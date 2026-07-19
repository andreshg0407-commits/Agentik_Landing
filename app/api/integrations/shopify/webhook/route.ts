/**
 * app/api/integrations/shopify/webhook/route.ts
 *
 * MS-10 — Shopify Webhook Receiver
 *
 * Receives and stores Shopify webhook events.
 * MS-10: store only — no deep processing.
 * MS-11: worker will process stored events.
 *
 * POST /api/integrations/shopify/webhook
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - HMAC verified against raw body BEFORE parsing
 *   - Deduplication via eventId uniqueness constraint
 *   - Returns 200 immediately to prevent Shopify retries from false negatives
 *   - organizationId resolved from shop domain (not from payload)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertShopifyWebhookValid,
  extractShopifyWebhookMeta,
} from "@/lib/integrations/shopify/shopify-webhooks";
import {
  recordWebhookEvent,
  isWebhookEventDuplicate,
} from "@/lib/integrations/integration-repository";
import { recordIntegrationAuditEvent } from "@/lib/integrations/integration-audit";
import { INTEGRATION_EVENT_TYPE }       from "@/lib/integrations/integration-events";
import { prisma }                       from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // ── 1. Read raw body (required for HMAC verification) ──
  const rawBody = Buffer.from(await req.arrayBuffer());
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";

  // ── 2. Verify HMAC FIRST — reject invalid requests immediately ──
  try {
    assertShopifyWebhookValid(rawBody, hmacHeader);
  } catch {
    // Return 401 to tell Shopify the secret is wrong, but log nothing sensitive
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Extract webhook metadata ──
  const meta = extractShopifyWebhookMeta(req.headers);

  if (!meta.webhookId || !meta.topic || !meta.shopDomain) {
    return NextResponse.json({ error: "Missing webhook headers" }, { status: 400 });
  }

  // ── 4. Resolve organization from shop domain ──
  const connection = await prisma.integrationConnection.findFirst({
    where: {
      shopDomain: meta.shopDomain,
      provider:   "shopify",
      status:     "connected",
    },
    select: { id: true, organizationId: true },
  });

  if (!connection) {
    // Unknown shop — return 200 to prevent Shopify retry loops for unregistered shops
    return new NextResponse(null, { status: 200 });
  }

  const { organizationId, id: connectionId } = connection;

  // ── 5. Deduplication check ──
  const isDuplicate = await isWebhookEventDuplicate(organizationId, "shopify", meta.webhookId);
  if (isDuplicate) {
    return new NextResponse(null, { status: 200 });
  }

  // ── 6. Parse and store payload ──
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    payload = { raw: rawBody.toString("utf8").slice(0, 1000) };
  }

  await recordWebhookEvent({
    organizationId,
    provider:   "shopify",
    eventId:    meta.webhookId,
    topic:      meta.topic,
    payload,
  });

  // ── 7. Audit ──
  await recordIntegrationAuditEvent({
    organizationId,
    connectionId,
    provider:  "shopify",
    eventType: INTEGRATION_EVENT_TYPE.WEBHOOK_RECEIVED,
    payload: {
      topic:      meta.topic,
      webhookId:  meta.webhookId,
      apiVersion: meta.apiVersion,
    },
  });

  // Always return 200 — Shopify will retry on non-2xx
  return new NextResponse(null, { status: 200 });
}
