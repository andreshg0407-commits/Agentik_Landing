/**
 * lib/marketing-studio/commerce/shopify-landing-generator.ts
 *
 * SHOPIFY-EXPERIENCIAS-02 — Landing Draft Generator
 *
 * Builds a landing draft structure from:
 *   - product data (name, SKU, price, collection)
 *   - Biblioteca assets (photos, videos, banners)
 *   - template definition
 *   - generation rules
 *
 * Does NOT persist anything. Does NOT call Shopify API.
 * Returns a LandingDraft ready to be saved by the draft service.
 */

import { EXPERIENCE_TEMPLATES }        from "./shopify-experiences-templates";
import type {
  LandingDraft,
  LandingDraftBlock,
  LandingDraftAssetRef,
  LandingDraftGenerationInput,
  LandingDraftGenerationResult,
  LandingBlockContent,
  LandingBlockType,
}                                       from "./shopify-landing-draft-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return `ld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBlock(
  type:    LandingBlockType,
  order:   number,
  content: LandingBlockContent,
  visible = true,
): LandingDraftBlock {
  return { type, order, visible, content };
}

// ── Block builders ───────────────────────────────────────────────────────────

function buildHeroBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  return makeBlock("hero", order, {
    title:    input.productName,
    subtitle: input.collection ?? undefined,
    imageUrl: input.photoUrls[0] ?? undefined,
    price:    input.price ?? undefined,
    sku:      input.sku ?? undefined,
  });
}

function buildGalleryBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  const maxImages = input.generationRules.maxImages ?? 6;
  const urls = input.photoUrls.slice(0, maxImages);
  return makeBlock("gallery", order, {
    title:     "Galeria",
    imageUrls: urls,
  }, urls.length > 0);
}

function buildVideoBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  return makeBlock("video", order, {
    title:    "Video del producto",
    videoUrl: input.videoUrl ?? undefined,
  }, !!input.videoUrl);
}

function buildBenefitsBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  return makeBlock("benefits", order, {
    title: "Beneficios",
    items: [
      "Calidad garantizada",
      "Envio seguro",
      input.collection ? `Parte de la coleccion ${input.collection}` : "Producto destacado",
    ],
  });
}

function buildProductDetailsBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  const showPrice      = input.generationRules.showPrice !== false;
  const showCollection = input.generationRules.showCollection !== false;

  return makeBlock("product_details", order, {
    title:      input.productName,
    sku:        input.sku ?? undefined,
    price:      showPrice ? (input.price ?? undefined) : undefined,
    collection: showCollection ? (input.collection ?? undefined) : undefined,
  });
}

function buildRelatedProductsBlock(order: number): LandingDraftBlock {
  return makeBlock("related_products", order, {
    title: "Productos relacionados",
    items: [],
  }, false);
}

function buildTrustBlock(order: number): LandingDraftBlock {
  return makeBlock("trust", order, {
    title: "Compra segura",
    items: [
      "Pago seguro",
      "Devolucion garantizada",
      "Soporte al cliente",
    ],
  });
}

function buildCtaBlock(input: LandingDraftGenerationInput, order: number): LandingDraftBlock {
  return makeBlock("cta", order, {
    title:    "Comprar ahora",
    ctaLabel: "Agregar al carrito",
    ctaUrl:   input.shopifyUrl ?? undefined,
    price:    input.price ?? undefined,
  });
}

// ── Asset ref builder ────────────────────────────────────────────────────────

function buildAssetRefs(input: LandingDraftGenerationInput): LandingDraftAssetRef[] {
  const refs: LandingDraftAssetRef[] = [];

  for (const url of input.photoUrls) {
    refs.push({ assetId: url, assetType: "foto", url });
  }

  if (input.videoUrl) {
    refs.push({ assetId: input.videoUrl, assetType: "video", url: input.videoUrl });
  }

  if (input.bannerUrl) {
    refs.push({ assetId: input.bannerUrl, assetType: "banner", url: input.bannerUrl });
  }

  return refs;
}

// ── Main generator ───────────────────────────────────────────────────────────

/**
 * Generates a landing draft from the given input.
 * Does not persist. Does not call external APIs.
 *
 * Returns { ok: true, draft } on success.
 * Returns { ok: false, error } on validation failure.
 */
export function generateLandingDraft(
  input: LandingDraftGenerationInput,
): LandingDraftGenerationResult {
  // Validate template exists
  const template = EXPERIENCE_TEMPLATES.find(t => t.id === input.templateId);
  if (!template) {
    return { ok: false, draft: null, error: `Plantilla no encontrada: ${input.templateId}` };
  }

  // Validate minimum assets
  if (input.photoUrls.length === 0) {
    return { ok: false, draft: null, error: "No hay fotografias aprobadas para generar la landing." };
  }

  // Build blocks
  const blocks: LandingDraftBlock[] = [
    buildHeroBlock(input, 1),
    buildGalleryBlock(input, 2),
    buildVideoBlock(input, 3),
    buildBenefitsBlock(input, 4),
    buildProductDetailsBlock(input, 5),
    buildRelatedProductsBlock(6),
    buildTrustBlock(7),
    buildCtaBlock(input, 8),
  ];

  const now = new Date().toISOString();

  const draft: LandingDraft = {
    id:            makeId(),
    productId:     input.productId,
    productName:   input.productName,
    sku:           input.sku,
    templateId:    input.templateId,
    templateName:  template.nombre,
    tenantPreset:  input.tenantPreset,
    status:        "borrador",
    source:        "auto_single",
    blocks,
    assetsUsed:    buildAssetRefs(input),
    generatedAt:   now,
    updatedAt:     now,
    createdBy:     input.createdBy,
    orgId:         input.orgId,
  };

  return { ok: true, draft, error: null };
}
