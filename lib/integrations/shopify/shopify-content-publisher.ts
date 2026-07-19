/**
 * lib/integrations/shopify/shopify-content-publisher.ts
 *
 * MARKETING-STUDIO-SHOPIFY-PUBLISHING-01 — Content-Aware Publisher
 *
 * SERVER ONLY — never import from client components.
 *
 * Extends the existing MS-11 pipeline with content-awareness:
 *   - publishWithContent()  → new product on Shopify using resolveShopifyPayload()
 *   - updateWithContent()   → update existing Shopify product from Agentik content
 *   - archiveProduct()      → soft-unpublish (archive) on Shopify
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Does NOT replace publishProductToShopify() — the existing pipeline is used
 *   for job-runner based background publication. This service is called from
 *   the org-scoped product detail API route for immediate operator actions.
 *
 *   Both flows write to the same ProductPublicationState and CommercePublicationEvent
 *   tables, so state is always consistent.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   accessToken is injected at call time — never stored, never logged.
 *   All DB writes scoped to organizationId.
 *   No tokens in any log message, event payload, or response.
 */

import { prisma }                    from "@/lib/prisma";
import { createShopifyClient }       from "./shopify-client";
import { resolveShopifyPayload }     from "./shopify-content-resolver";
import { ShopifyProductCreateError } from "./shopify-errors";

// ── Shared input/output ───────────────────────────────────────────────────────

export interface ContentPublisherInput {
  organizationId: string;
  productId:       string;
  accessToken:     string;   // ⚠ server-only — never log
  shopDomain:      string;
  jobId?:          string;   // optional — if called from job runner context
}

export interface ContentPublisherResult {
  success:          boolean;
  shopifyProductId: number | null;
  shopifyHandle:    string | null;
  adminUrl:         string | null;
  variantCount:     number;
  imageCount:       number;
  metafieldCount:   number;
  warnings:         string[];
  errorMessage:     string | null;
  contentScore:     number;
  hasShopifyOverrides: boolean;
}

// ── Publish new product ───────────────────────────────────────────────────────

export async function publishWithContent(
  input: ContentPublisherInput,
): Promise<ContentPublisherResult> {
  const { organizationId, productId, accessToken, shopDomain } = input;

  // ── Resolve payload from full content stack ──────────────────────────────
  let resolved: Awaited<ReturnType<typeof resolveShopifyPayload>>;
  try {
    resolved = await resolveShopifyPayload(organizationId, productId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payload resolution failed";
    return _fail(msg, 0, false);
  }

  if (!resolved.readiness.isPublishable) {
    const msg = `No publicable: ${resolved.readiness.missingRequired.join(", ")}`;
    await _appendEvent({ organizationId, productId, eventType: "failed", resultState: "failed", message: msg });
    return _fail(msg, resolved.readiness.contentScore, resolved.readiness.hasShopifyOverrides);
  }

  // ── POST to Shopify ──────────────────────────────────────────────────────
  const client = createShopifyClient(shopDomain);
  let created: Awaited<ReturnType<typeof client.createDraftProduct>>;

  try {
    created = await client.createDraftProduct(accessToken, resolved.productPayload);
  } catch (err) {
    const msg = err instanceof ShopifyProductCreateError ? err.message : "Shopify product create failed";
    await _appendEvent({ organizationId, productId, eventType: "failed", resultState: "failed", message: msg });
    return _fail(msg, resolved.readiness.contentScore, resolved.readiness.hasShopifyOverrides);
  }

  // ── Upsert metafields ────────────────────────────────────────────────────
  await client.upsertProductMetafields(accessToken, created.id, resolved.metafields);

  // ── Persist publication state ────────────────────────────────────────────
  let pubState: { id: string };
  try {
    pubState = await prisma.productPublicationState.upsert({
      where:  { productId_channel: { productId, channel: "shopify" } },
      create: {
        productId,
        organizationId,
        channel:                  "shopify",
        publicationStatus:        "published",
        publishedAt:              new Date(),
        lastPublicationAttemptAt: new Date(),
        externalPublicationId:    String(created.id),
        publicationUrl:           created.adminUrl,
        shopifyHandle:            created.handle,
        lastSyncAt:               new Date(),
        version:                  1,
      },
      update: {
        publicationStatus:        "published",
        publishedAt:              new Date(),
        lastPublicationAttemptAt: new Date(),
        externalPublicationId:    String(created.id),
        publicationUrl:           created.adminUrl,
        shopifyHandle:            created.handle,
        lastSyncAt:               new Date(),
        errorMessage:             null,
      },
      select: { id: true },
    });
  } catch {
    // Rollback: archive the Shopify product we just created so it does not
    // exist without a corresponding DB record tracking it.
    try { await client.archiveProduct(accessToken, created.id); } catch {}
    return _fail(
      "Error al guardar estado de publicación. El producto fue archivado en Shopify como rollback.",
      resolved.readiness.contentScore,
      resolved.readiness.hasShopifyOverrides,
    );
  }

  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId,
      channel:            "shopify",
      publicationStateId: pubState.id,
      eventType:          "published",
      resultState:        "published",
      jobId:              input.jobId ?? `manual-${Date.now()}`,
      message:            `Publicado con contenido enriquecido — handle: ${created.handle}`,
      payload: {
        shopifyProductId:    created.id,
        handle:              created.handle,
        adminUrl:            created.adminUrl,
        variantCount:        created.variants.length,
        imageCount:          created.images.length,
        metafieldCount:      resolved.metafields.length,
        contentScore:        resolved.readiness.contentScore,
        hasShopifyOverrides: resolved.readiness.hasShopifyOverrides,
      },
    },
  });

  return {
    success:             true,
    shopifyProductId:    created.id,
    shopifyHandle:       created.handle,
    adminUrl:            created.adminUrl,
    variantCount:        created.variants.length,
    imageCount:          created.images.length,
    metafieldCount:      resolved.metafields.length,
    warnings:            resolved.readiness.warnings,
    errorMessage:        null,
    contentScore:        resolved.readiness.contentScore,
    hasShopifyOverrides: resolved.readiness.hasShopifyOverrides,
  };
}

// ── Update existing product ───────────────────────────────────────────────────

export async function updateWithContent(
  input: ContentPublisherInput,
): Promise<ContentPublisherResult> {
  const { organizationId, productId, accessToken, shopDomain } = input;

  // Load current publication state
  const pubState = await prisma.productPublicationState.findUnique({
    where:  { productId_channel: { productId, channel: "shopify" } },
    select: { id: true, externalPublicationId: true },
  });

  if (!pubState?.externalPublicationId) {
    return _fail("Producto no publicado en Shopify todavía — usa Publicar primero.", 0, false);
  }

  const shopifyProductId = Number(pubState.externalPublicationId);

  // Resolve content-aware payload
  let resolved: Awaited<ReturnType<typeof resolveShopifyPayload>>;
  try {
    resolved = await resolveShopifyPayload(organizationId, productId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payload resolution failed";
    return _fail(msg, 0, false);
  }

  const client = createShopifyClient(shopDomain);
  const patch   = resolved.productPayload.product;

  let updated: Awaited<ReturnType<typeof client.updateProduct>>;
  try {
    updated = await client.updateProduct(accessToken, shopifyProductId, patch as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shopify product update failed";
    await _appendEvent({ organizationId, productId, eventType: "failed", resultState: "failed", message: msg });
    return _fail(msg, resolved.readiness.contentScore, resolved.readiness.hasShopifyOverrides);
  }

  // Upsert metafields
  await client.upsertProductMetafields(accessToken, shopifyProductId, resolved.metafields);

  // Update publication state
  await prisma.productPublicationState.update({
    where: { id: pubState.id },
    data: {
      lastPublicationAttemptAt: new Date(),
      shopifyHandle:            updated.handle,
      lastSyncAt:               new Date(),
      errorMessage:             null,
    },
  });

  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId,
      channel:            "shopify",
      publicationStateId: pubState.id,
      eventType:          "updated",
      resultState:        "published",
      jobId:              input.jobId ?? `update-${Date.now()}`,
      message:            `Actualizado con contenido enriquecido — handle: ${updated.handle}`,
      payload: {
        shopifyProductId,
        handle:              updated.handle,
        metafieldCount:      resolved.metafields.length,
        contentScore:        resolved.readiness.contentScore,
        hasShopifyOverrides: resolved.readiness.hasShopifyOverrides,
      },
    },
  });

  return {
    success:             true,
    shopifyProductId,
    shopifyHandle:       updated.handle,
    adminUrl:            updated.adminUrl,
    variantCount:        updated.variants.length,
    imageCount:          updated.images.length,
    metafieldCount:      resolved.metafields.length,
    warnings:            resolved.readiness.warnings,
    errorMessage:        null,
    contentScore:        resolved.readiness.contentScore,
    hasShopifyOverrides: resolved.readiness.hasShopifyOverrides,
  };
}

// ── Activate product (draft → active) ────────────────────────────────────────

/**
 * Activates a Shopify draft product, making it visible in the store.
 * Only valid when the product already exists in Shopify (externalPublicationId set).
 */
export async function activateShopifyProduct(
  input: ContentPublisherInput,
): Promise<{ success: boolean; shopifyStatus: string | null; errorMessage: string | null }> {
  const { organizationId, productId, accessToken, shopDomain } = input;

  const pubState = await prisma.productPublicationState.findUnique({
    where:  { productId_channel: { productId, channel: "shopify" } },
    select: { id: true, externalPublicationId: true },
  });

  if (!pubState?.externalPublicationId) {
    return { success: false, shopifyStatus: null, errorMessage: "Producto no publicado en Shopify — usa Publicar primero." };
  }

  const shopifyProductId = Number(pubState.externalPublicationId);
  const client = createShopifyClient(shopDomain);

  let activated: { id: number; status: string; handle: string };
  try {
    activated = await client.activateProduct(accessToken, shopifyProductId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shopify activation failed";
    await _appendEvent({ organizationId, productId, eventType: "failed", resultState: "failed", message: msg });
    return { success: false, shopifyStatus: null, errorMessage: msg };
  }

  await prisma.productPublicationState.update({
    where: { id: pubState.id },
    data:  { publicationStatus: "published", lastSyncAt: new Date(), errorMessage: null },
  });

  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId,
      channel:            "shopify",
      publicationStateId: pubState.id,
      eventType:          "updated",
      resultState:        "published",
      jobId:              `activate-${Date.now()}`,
      message:            `Producto activado en Shopify — estado: ${activated.status}`,
    },
  });

  return { success: true, shopifyStatus: activated.status, errorMessage: null };
}

// ── Archive (soft-unpublish) ──────────────────────────────────────────────────

export async function archiveShopifyProduct(
  input: ContentPublisherInput,
): Promise<{ success: boolean; errorMessage: string | null }> {
  const { organizationId, productId, accessToken, shopDomain } = input;

  const pubState = await prisma.productPublicationState.findUnique({
    where:  { productId_channel: { productId, channel: "shopify" } },
    select: { id: true, externalPublicationId: true },
  });

  if (!pubState?.externalPublicationId) {
    return { success: false, errorMessage: "Producto no publicado en Shopify." };
  }

  const shopifyProductId = Number(pubState.externalPublicationId);
  const client = createShopifyClient(shopDomain);

  try {
    await client.archiveProduct(accessToken, shopifyProductId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Archive failed";
    return { success: false, errorMessage: msg };
  }

  await prisma.productPublicationState.update({
    where: { id: pubState.id },
    data:  { publicationStatus: "archived", lastSyncAt: new Date(), errorMessage: null },
  });

  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId,
      channel:            "shopify",
      publicationStateId: pubState.id,
      eventType:          "archived",
      resultState:        "archived",
      jobId:              `archive-${Date.now()}`,
      message:            "Producto archivado en Shopify",
    },
  });

  return { success: true, errorMessage: null };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _fail(msg: string, score: number, overrides: boolean): ContentPublisherResult {
  return {
    success: false, shopifyProductId: null, shopifyHandle: null,
    adminUrl: null, variantCount: 0, imageCount: 0, metafieldCount: 0,
    warnings: [], errorMessage: msg, contentScore: score, hasShopifyOverrides: overrides,
  };
}

async function _appendEvent(opts: {
  organizationId: string;
  productId:      string;
  eventType:      string;
  resultState:    string;
  message:        string;
}): Promise<void> {
  try {
    const ps = await prisma.productPublicationState.findUnique({
      where:  { productId_channel: { productId: opts.productId, channel: "shopify" } },
      select: { id: true },
    });
    if (!ps) return;
    await prisma.commercePublicationEvent.create({
      data: {
        organizationId:    opts.organizationId,
        productId:         opts.productId,
        channel:           "shopify",
        publicationStateId: ps.id,
        eventType:         opts.eventType,
        resultState:       opts.resultState,
        jobId:             `event-${Date.now()}`,
        message:           opts.message,
      },
    });
  } catch { /* fire-and-forget */ }
}
