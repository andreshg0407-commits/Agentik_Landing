/**
 * lib/marketing-studio/products/product-content-service.ts
 *
 * MARKETING-STUDIO-PRODUCT-CONTENT-01 — Service Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * Responsibilities:
 *   1. Orchestrate content upsert with org-boundary enforcement
 *   2. Compute content completeness readiness (4 tiers)
 *   3. Expose clean API for the route handler
 *
 * ── CONTENT READINESS MODEL ────────────────────────────────────────────────────
 *   Tier scoring (cumulative):
 *     basic:       commercialTitle + shortDescription              → +30 pts
 *     commercial:  longDescription + ≥1 benefit + ≥1 feature      → +30 pts
 *     seo:         seoTitle + seoDescription + ≥1 keyword         → +20 pts
 *     advanced:    ≥1 of: materials, dimensions, weight, care,     → +20 pts
 *                  usage, faq
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT:  plug in AI draft generation (shortDescription, keyBenefits)
 *   SHOPIFY_SYNC_SLOT:   trigger Shopify product update after approve
 *   TRANSLATION_SLOT:    create per-locale content variants
 */

import {
  getProductContent,
  upsertProductContent,
} from "./product-content-repository";
import type {
  ProductContentRecord,
  ProductContentUpsertInput,
  ProductContentReadiness,
  ContentTier,
  ContentTierReadiness,
} from "./product-content-types";

// ── Readiness engine ──────────────────────────────────────────────────────────

function computeContentReadiness(
  productId: string,
  c: ProductContentRecord | null,
): ProductContentReadiness {
  // Tier checks
  const basicMissing: string[]      = [];
  const commercialMissing: string[] = [];
  const seoMissing: string[]        = [];
  const advancedMissing: string[]   = [];

  // Basic tier
  if (!c?.commercialTitle?.trim())  basicMissing.push("Título comercial");
  if (!c?.shortDescription?.trim()) basicMissing.push("Descripción corta");
  const basicComplete = basicMissing.length === 0;

  // Commercial tier
  if (!c?.longDescription?.trim())         commercialMissing.push("Descripción larga");
  if (!c?.keyBenefits || c.keyBenefits.length === 0) commercialMissing.push("Beneficios clave");
  if (!c?.keyFeatures || c.keyFeatures.length === 0) commercialMissing.push("Características");
  const commercialComplete = commercialMissing.length === 0;

  // SEO tier
  if (!c?.seoTitle?.trim())       seoMissing.push("Título SEO");
  if (!c?.seoDescription?.trim()) seoMissing.push("Descripción SEO");
  if (!c?.searchKeywords || c.searchKeywords.length === 0) seoMissing.push("Palabras clave");
  const seoComplete = seoMissing.length === 0;

  // Advanced tier — need at least one of the optional spec fields
  const hasAdvanced = !!(
    c?.materials?.trim() ||
    c?.dimensions?.trim() ||
    c?.weight?.trim() ||
    c?.careInstructions?.trim() ||
    c?.usageInstructions?.trim() ||
    (c?.faq && c.faq.length > 0)
  );
  if (!hasAdvanced) advancedMissing.push("Al menos un campo: materiales, dimensiones, cuidados, uso o FAQ");
  const advancedComplete = advancedMissing.length === 0;

  // Score: points per completed tier
  let score = 0;
  if (basicComplete)      score += 30;
  if (commercialComplete) score += 30;
  if (seoComplete)        score += 20;
  if (advancedComplete)   score += 20;

  // Highest completed tier
  let tier: ContentTier = "none";
  if (basicComplete)      tier = "basic";
  if (commercialComplete) tier = "commercial";
  if (seoComplete)        tier = "seo";
  if (advancedComplete)   tier = "advanced";

  const tiers: ContentTierReadiness[] = [
    { tier: "basic",      complete: basicComplete,      missing: basicMissing      },
    { tier: "commercial", complete: commercialComplete, missing: commercialMissing },
    { tier: "seo",        complete: seoComplete,        missing: seoMissing        },
    { tier: "advanced",   complete: advancedComplete,   missing: advancedMissing   },
  ];

  return { productId, tier, tiers, score, computedAt: new Date() };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch content + readiness for one product.
 * Returns { content: null } when no record exists — the record is created lazily on first save.
 */
export async function getProductContentWithReadiness(
  organizationId: string,
  productId:       string,
): Promise<{ content: ProductContentRecord | null; readiness: ProductContentReadiness }> {
  const content   = await getProductContent(organizationId, productId);
  const readiness = computeContentReadiness(productId, content);
  return { content, readiness };
}

/**
 * Create or update the content record for a product.
 * Enforces org boundary — throws if input.organizationId !== organizationId.
 */
export async function saveProductContent(
  organizationId: string,
  input: ProductContentUpsertInput,
): Promise<{ content: ProductContentRecord; readiness: ProductContentReadiness }> {
  if (input.organizationId !== organizationId) {
    throw new Error("org_boundary_violation");
  }

  const content   = await upsertProductContent(input);
  const readiness = computeContentReadiness(input.productId, content);
  return { content, readiness };
}
