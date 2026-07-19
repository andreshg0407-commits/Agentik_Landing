/**
 * lib/marketing-studio/commerce/product-enrichment-types.ts
 *
 * SHOPIFY-CATALOG-OPERATIONS-01C — Product Enrichment Contract
 *
 * Defines the domain contract for AI-driven product content enrichment.
 * Used by the Copilot action layer to communicate what can be improved
 * on a product before or after publication.
 *
 * ── Governance ────────────────────────────────────────────────────────────────
 *   No UI imports, no Prisma imports, no side effects.
 *   Pure domain types — safe for both server and client bundles.
 *
 * ── Copilot integration ───────────────────────────────────────────────────────
 *   shopify.applyEnrichmentSuggestions — consumes ProductEnrichmentPlan
 *   shopify.enrichProductContent       — produces ProductEnrichmentPlan
 *   shopify.publishAfterEnrichment     — builds plan then publishes
 */

// ── Field registry ────────────────────────────────────────────────────────────

/**
 * Fields that the AI enrichment pipeline can generate or improve.
 * Each maps to a product entity field in Agentik's data model.
 */
export type ProductEnrichmentField =
  | "seoTitle"              // <title> tag for SEO — 60-70 chars
  | "seoDescription"        // <meta description> — 150-160 chars
  | "commercialDescription" // Human-facing product body — multi-paragraph prose
  | "primaryAssetUrl"       // Hero image URL — via foto-estudio generation
  | "tags"                  // Shopify tags array — derived from category + attributes
  | "altText"               // Image alt text for accessibility and SEO
  | "searchKeywords"        // Internal search keywords (not always surfaced to storefront)
  | "shopifyTitle"          // Override title sent to Shopify (vs internal product name)
  | "price";                // Commercial price — requires human approval before apply

export const ENRICHMENT_FIELD_LABEL: Record<ProductEnrichmentField, string> = {
  seoTitle:              "Título SEO",
  seoDescription:        "Descripción SEO",
  commercialDescription: "Descripción comercial",
  primaryAssetUrl:       "Imagen principal",
  tags:                  "Etiquetas",
  altText:               "Texto alternativo de imagen",
  searchKeywords:        "Palabras clave de búsqueda",
  shopifyTitle:          "Título en Shopify",
  price:                 "Precio",
};

// ── Suggestion ────────────────────────────────────────────────────────────────

/**
 * A single enrichment suggestion for one product field.
 *
 * source:
 *   "ai_generated"   — can be applied automatically via Copilot action
 *   "human_required" — field requires human decision (e.g. price)
 */
export interface ProductEnrichmentSuggestion {
  field:            ProductEnrichmentField;
  label:            string;
  currentValue:     string | null;
  /** Pre-generated value (present when source=ai_generated and model already ran). */
  suggestedValue?:  string;
  /** 0–1 confidence score for the suggested value. */
  confidence:       number;
  source:           "ai_generated" | "human_required";
  canAutoFix:       boolean;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

/**
 * Full enrichment plan for a single product.
 * Produced by buildProductEnrichmentPlan() and consumed by Copilot actions.
 */
export interface ProductEnrichmentPlan {
  productId:              string;
  productName:            string;
  suggestions:            ProductEnrichmentSuggestion[];
  /** Number of suggestions that can be applied automatically (source=ai_generated). */
  autoFixCount:           number;
  /** Number of suggestions that require a human decision before applying. */
  humanRequiredCount:     number;
  /**
   * Estimated readiness score gain if all auto-fix suggestions are applied.
   * Range: 0–100. Heuristic — not a guarantee.
   */
  estimatedReadinessGain: number;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a ProductEnrichmentPlan from a lightweight product snapshot.
 * No AI calls are made here — this is a structural analysis pass that
 * identifies which fields are missing and how each can be resolved.
 *
 * The actual AI generation of suggestedValue happens in a separate Copilot
 * action (shopify.enrichProductContent) that consumes this plan.
 *
 * Input:  minimal product shape (name, sku, fields needed for gap analysis)
 * Output: ProductEnrichmentPlan with gap-derived suggestions
 * Errors: never throws — returns empty suggestions on unknown fields
 */
export function buildProductEnrichmentPlan(product: {
  productId:              string;
  name:                   string | null;
  sku:                    string | null;
  category:               string | null;
  primaryAssetUrl:        string | null;
  seoTitle?:              string | null;
  seoDescription?:        string | null;
  commercialDescription?: string | null;
  altText?:               string | null;
  searchKeywords?:        string | null;
  shopifyTitle?:          string | null;
  tags?:                  string[];
  price?:                 number | null;
  readinessScore:         number;
}): ProductEnrichmentPlan {
  const suggestions: ProductEnrichmentSuggestion[] = [];

  // ── SEO title ─────────────────────────────────────────────────────────────
  if (!product.seoTitle) {
    suggestions.push({
      field:        "seoTitle",
      label:        ENRICHMENT_FIELD_LABEL.seoTitle,
      currentValue: null,
      confidence:   0.85,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── SEO description ───────────────────────────────────────────────────────
  if (!product.seoDescription) {
    suggestions.push({
      field:        "seoDescription",
      label:        ENRICHMENT_FIELD_LABEL.seoDescription,
      currentValue: null,
      confidence:   0.85,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Commercial description ────────────────────────────────────────────────
  if (!product.commercialDescription) {
    suggestions.push({
      field:        "commercialDescription",
      label:        ENRICHMENT_FIELD_LABEL.commercialDescription,
      currentValue: null,
      confidence:   0.75,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Primary image ─────────────────────────────────────────────────────────
  if (!product.primaryAssetUrl) {
    suggestions.push({
      field:        "primaryAssetUrl",
      label:        ENRICHMENT_FIELD_LABEL.primaryAssetUrl,
      currentValue: null,
      confidence:   0.70,
      source:       "ai_generated",   // via foto-estudio generation pipeline
      canAutoFix:   true,
    });
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  if (!product.tags || product.tags.length === 0) {
    suggestions.push({
      field:        "tags",
      label:        ENRICHMENT_FIELD_LABEL.tags,
      currentValue: null,
      confidence:   0.80,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Alt text ──────────────────────────────────────────────────────────────
  if (!product.altText && product.primaryAssetUrl) {
    suggestions.push({
      field:        "altText",
      label:        ENRICHMENT_FIELD_LABEL.altText,
      currentValue: null,
      confidence:   0.80,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Search keywords ───────────────────────────────────────────────────────
  if (!product.searchKeywords) {
    suggestions.push({
      field:        "searchKeywords",
      label:        ENRICHMENT_FIELD_LABEL.searchKeywords,
      currentValue: null,
      confidence:   0.75,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Shopify title override ────────────────────────────────────────────────
  // Only suggest if the product has a name that may not be commercial-ready
  if (!product.shopifyTitle && product.name && product.name.length < 10) {
    suggestions.push({
      field:        "shopifyTitle",
      label:        ENRICHMENT_FIELD_LABEL.shopifyTitle,
      currentValue: product.name,
      confidence:   0.70,
      source:       "ai_generated",
      canAutoFix:   true,
    });
  }

  // ── Price (human required) ────────────────────────────────────────────────
  if (product.price == null || product.price <= 0) {
    suggestions.push({
      field:        "price",
      label:        ENRICHMENT_FIELD_LABEL.price,
      currentValue: null,
      confidence:   0,               // AI cannot assign commercial price
      source:       "human_required",
      canAutoFix:   false,
    });
  }

  const autoFixCount    = suggestions.filter(s => s.canAutoFix).length;
  const humanRequired   = suggestions.filter(s => !s.canAutoFix).length;

  // Heuristic: each auto-fixable content field contributes ~8 pts to readiness,
  // capped so the total does not exceed 100.
  const gain = Math.min(100 - product.readinessScore, autoFixCount * 8);

  return {
    productId:              product.productId,
    productName:            product.name ?? "(sin nombre)",
    suggestions,
    autoFixCount,
    humanRequiredCount:     humanRequired,
    estimatedReadinessGain: gain,
  };
}
