/**
 * lib/integrations/shopify/shopify-publisher.ts
 *
 * MS-11 — Shopify Publish Executor
 *
 * Orchestrates the full product publication pipeline:
 *   1. Load product from DB (with variants + asset links + generated assets)
 *   2. Validate publishability via mapper
 *   3. Build variant payload via variant engine
 *   4. Validate image readiness via image pipeline
 *   5. POST to Shopify Admin API via createDraftProduct()
 *   6. Persist external IDs into ProductPublicationState
 *   7. Create CommercePublicationEvent audit record
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Access token is passed in at call time — never stored, never logged.
 *   All Prisma writes are scoped to organizationId.
 *   No token or secret is included in publication events or results.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────────
 *   MS-11 creates Shopify DRAFT products only.
 *   NO inventory sync. NO bidirectional sync. NO webhook registration here.
 */

import { prisma }                                    from "@/lib/prisma";
import { createShopifyClient }                       from "./shopify-client";
import { mapAgentikProductToShopifyDraftPayload }    from "./shopify-mapper";
import { transformAgentikVariantsToShopify }         from "./shopify-variants";
import { checkImageReadiness, buildShopifyImagePayload } from "./shopify-images";
import type { ProductConsoleItem }                   from "@/lib/marketing-studio/products/product-display";
import type { ShopifyCreatedProduct }                from "./shopify-types";
import { ShopifyProductCreateError }                 from "./shopify-errors";

// ── Result types ──────────────────────────────────────────────────────────────

export interface PublishResult {
  success:           boolean;
  shopifyProductId:  number | null;
  shopifyHandle:     string | null;
  adminUrl:          string | null;
  variantCount:      number;
  imageCount:        number;
  warnings:          string[];
  errorMessage:      string | null;
}

export interface PublisherInput {
  organizationId:  string;
  productId:       string;
  connectionId:    string;
  jobId:           string;
  accessToken:     string;   // ⚠ server-only — never log
  shopDomain:      string;
}

// ── Publisher ─────────────────────────────────────────────────────────────────

export async function publishProductToShopify(
  input: PublisherInput,
): Promise<PublishResult> {
  const { organizationId, productId, connectionId, jobId, accessToken, shopDomain } = input;
  const warnings: string[] = [];

  // ── 1. Load product entity with full relations ─────────────────────────────
  const productEntity = await prisma.productEntity.findFirst({
    where: { id: productId, organizationId },
    include: {
      variants: {
        where:  { status: "active" },
        select: { id: true, name: true, sku: true, status: true, attributes: true },
      },
      assetLinks: {
        select:  { assetId: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!productEntity) {
    return _failResult(`Product not found: ${productId}`, warnings);
  }

  // ── 2. Load generated assets for image URLs ────────────────────────────────
  // ProductAssetLink.assetId → GeneratedAsset has no @relation — two queries.
  const assetIds = productEntity.assetLinks.map(l => l.assetId);
  const generatedAssets = assetIds.length > 0
    ? await prisma.generatedAsset.findMany({
        where:  { id: { in: assetIds }, assetUrl: { not: null } },
        select: { id: true, assetUrl: true },
      })
    : [];

  const assetMap   = new Map(generatedAssets.map(a => [a.id, a.assetUrl as string]));
  const heroIds    = productEntity.assetLinks.filter(l => l.role === "hero").map(l => l.assetId);
  const galleryIds = productEntity.assetLinks.filter(l => l.role !== "hero").map(l => l.assetId);

  const imageUrls: string[] = [
    ...heroIds.filter(id => assetMap.has(id)).map(id => assetMap.get(id)!),
    ...galleryIds.filter(id => assetMap.has(id)).map(id => assetMap.get(id)!),
  ];

  // ── 3. Validate image readiness ────────────────────────────────────────────
  const imageReadiness = checkImageReadiness(imageUrls);
  if (!imageReadiness.isReady) {
    const msg = imageReadiness.blockerReason ?? "No valid images for publication";
    await _appendPublicationEvent({ organizationId, productId, jobId, eventType: "failed", resultState: "failed", message: msg });
    return _failResult(msg, warnings);
  }
  if (imageReadiness.invalidImages.length > 0) {
    warnings.push(
      `${imageReadiness.invalidImages.length} image(s) skipped: ` +
      imageReadiness.invalidImages.map(i => i.reason).join("; "),
    );
  }

  // ── 4. Build ProductConsoleItem for the mapper ─────────────────────────────
  const primaryAssetUrl = imageReadiness.validImages[0] ?? null;
  const consoleItem = _buildConsoleItem({
    id:             productEntity.id,
    organizationId: productEntity.organizationId,
    name:           productEntity.name,
    sku:            productEntity.sku,
    category:       productEntity.category,
    readinessScore: productEntity.readinessScore,
    variantCount:   productEntity.variants.length,
    primaryAssetUrl,
  });

  // ── 5. Validate publishability via mapper ──────────────────────────────────
  const draftPayload = mapAgentikProductToShopifyDraftPayload(consoleItem);
  if (!draftPayload) {
    const msg = "Product is not publishable — missing required fields (title, price, or images)";
    await _appendPublicationEvent({ organizationId, productId, jobId, eventType: "failed", resultState: "failed", message: msg });
    return _failResult(msg, warnings);
  }

  // ── 6. Build variant payload via variant engine ────────────────────────────
  const defaultPrice = productEntity.price != null ? String(productEntity.price) : "0.00";
  const variantInput = productEntity.variants.map(v => ({
    id:         v.id,
    name:       v.name,
    sku:        v.sku,
    status:     v.status,
    attributes: v.attributes as Record<string, string> | null,
  }));

  const variantResult = transformAgentikVariantsToShopify(variantInput, defaultPrice);
  warnings.push(...variantResult.warnings);

  // ── 7. Assemble final payload ──────────────────────────────────────────────
  const images = buildShopifyImagePayload(imageReadiness.validImages, productEntity.name);
  const finalPayload = {
    product: {
      ...draftPayload.product,
      options:  variantResult.options,
      variants: variantResult.variants,
      images,
    },
  };

  // ── 8. POST to Shopify Admin API ───────────────────────────────────────────
  const client = createShopifyClient(shopDomain);
  let created: ShopifyCreatedProduct;

  try {
    created = await client.createDraftProduct(accessToken, finalPayload);
  } catch (err) {
    const msg = err instanceof ShopifyProductCreateError
      ? err.message
      : "Shopify product create failed";
    await _appendPublicationEvent({ organizationId, productId, jobId, eventType: "failed", resultState: "failed", message: msg });
    return _failResult(msg, warnings);
  }

  // ── 9. Build Agentik variantId → Shopify variantId map ────────────────────
  const activeVariantIds = variantInput.filter(v => v.status === "active").map(v => v.id);
  const externalVariantIds: Record<string, number> = {};
  created.variants.forEach((sv, i) => {
    const agentikId = activeVariantIds[i];
    if (agentikId) externalVariantIds[agentikId] = sv.id;
  });

  // ── 10. Persist external IDs into ProductPublicationState ─────────────────
  const pubState = await prisma.productPublicationState.upsert({
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
      externalVariantIds,
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
      externalVariantIds,
      lastSyncAt:               new Date(),
      errorMessage:             null,
    },
    select: { id: true },
  });

  // ── 11. Append CommercePublicationEvent ────────────────────────────────────
  await prisma.commercePublicationEvent.create({
    data: {
      organizationId,
      productId,
      channel:           "shopify",
      publicationStateId: pubState.id,
      eventType:         "published",
      resultState:       "published",
      jobId,
      message:           `Draft created on Shopify — handle: ${created.handle}`,
      payload: {
        shopifyProductId: created.id,
        handle:           created.handle,
        adminUrl:         created.adminUrl,
        variantCount:     created.variants.length,
        imageCount:       created.images.length,
      },
    },
  });

  return {
    success:          true,
    shopifyProductId: created.id,
    shopifyHandle:    created.handle,
    adminUrl:         created.adminUrl,
    variantCount:     created.variants.length,
    imageCount:       created.images.length,
    warnings,
    errorMessage:     null,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _failResult(errorMessage: string, warnings: string[]): PublishResult {
  return {
    success: false, shopifyProductId: null, shopifyHandle: null,
    adminUrl: null, variantCount: 0, imageCount: 0, warnings, errorMessage,
  };
}

async function _appendPublicationEvent(opts: {
  organizationId: string;
  productId:      string;
  jobId:          string;
  eventType:      string;
  resultState:    string;
  message:        string;
}): Promise<void> {
  try {
    const pubState = await prisma.productPublicationState.findUnique({
      where:  { productId_channel: { productId: opts.productId, channel: "shopify" } },
      select: { id: true },
    });
    if (!pubState) return;

    await prisma.commercePublicationEvent.create({
      data: {
        organizationId:    opts.organizationId,
        productId:         opts.productId,
        channel:           "shopify",
        publicationStateId: pubState.id,
        eventType:         opts.eventType,
        resultState:       opts.resultState,
        jobId:             opts.jobId,
        message:           opts.message,
      },
    });
  } catch {
    // fire-and-forget — never block publication flow
  }
}

/**
 * Builds a minimal ProductConsoleItem from a Prisma entity for use with
 * the shopify-mapping layer. Only includes the fields that buildShopifyPayload reads:
 * name, sku, category, readinessScore, variantCount, readyDestinations, milaSignals.
 * primaryAssetUrl is passed separately (derived from our image pipeline).
 */
function _buildConsoleItem(entity: {
  id:              string;
  organizationId:  string;
  name:            string;
  sku:             string | null;
  category?:       string | null;
  readinessScore?: number;
  variantCount?:   number;
  primaryAssetUrl?: string | null;
}): ProductConsoleItem {
  return {
    productId:           entity.id,
    organizationId:      entity.organizationId,
    name:                entity.name,
    sku:                 entity.sku,
    category:            entity.category ?? null,
    status:              "active" as ProductConsoleItem["status"],
    commercialStatus:    "active" as ProductConsoleItem["commercialStatus"],
    primaryAssetUrl:     entity.primaryAssetUrl ?? null,
    assetCount:          0,
    variantCount:        entity.variantCount ?? 0,
    assetRoleGroups:     [],
    readinessLevel:      "ready" as ProductConsoleItem["readinessLevel"],
    readinessScore:      entity.readinessScore ?? 70,
    readyDestinations:   [],
    partialDestinations: [],
    blockedDestinations: [],
    syncSummary:         [],
    publicationSummary:  [],
    activitySummary:     null,
    lucaSignals:         [],
    milaSignals:         [],
    price:               null,
    productLine:         null,
    assetDetails:        [],
    approvedAt:          null,
    createdAt:           new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
  };
}
