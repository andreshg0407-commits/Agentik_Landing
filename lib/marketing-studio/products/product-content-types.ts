/**
 * lib/marketing-studio/products/product-content-types.ts
 *
 * MARKETING-STUDIO-PRODUCT-CONTENT-01 — Content Domain Types
 *
 * Commercial master content for a ProductEntity.
 * One ProductContent per product, created lazily (1:1).
 *
 * ── SEPARATION OF CONCERNS ────────────────────────────────────────────────────
 *   ProductEntity    = commercial identity (name, SKU, price, CRM enrichment)
 *   ProductContent   = editorial / commercial copy (titles, descriptions, SEO)
 *   ProductAssetLink = visual assets (images, video)
 *
 * ── CONTENT TIERS ─────────────────────────────────────────────────────────────
 *   basic       — commercialTitle + shortDescription
 *   commercial  — + longDescription + keyBenefits + keyFeatures
 *   seo         — + seoTitle + seoDescription + searchKeywords
 *   advanced    — + materials + dimensions + weight + care + usage + FAQ
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No `any` types
 *   - No business logic
 *   - No Prisma imports
 *   - All JSON columns are typed; the repository handles serialization
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT:  ai-generated drafts for shortDescription/longDescription
 *   SHOPIFY_SYNC_SLOT:   map commercialTitle→Shopify.title, longDescription→body_html
 *   TRANSLATION_SLOT:    per-locale content variants (future localization sprint)
 */

// ── Status ────────────────────────────────────────────────────────────────────

export type ProductContentStatus = "draft" | "complete" | "approved";

export const PRODUCT_CONTENT_STATUS_LABELS: Record<ProductContentStatus, string> = {
  draft:    "Borrador",
  complete: "Completo",
  approved: "Aprobado",
};

// ── Content completeness tiers ────────────────────────────────────────────────

export type ContentTier = "none" | "basic" | "commercial" | "seo" | "advanced";

export const CONTENT_TIER_LABELS: Record<ContentTier, string> = {
  none:       "Sin contenido",
  basic:      "Básico",
  commercial: "Comercial",
  seo:        "SEO",
  advanced:   "Completo",
};

// ── FAQ item ──────────────────────────────────────────────────────────────────

export interface FaqItem {
  q: string;
  a: string;
}

// ── Core record ───────────────────────────────────────────────────────────────

/** Full ProductContent as returned from DB (all JSON fields already parsed). */
export interface ProductContentRecord {
  id:             string;
  productId:      string;
  organizationId: string;

  // ── Commercial titles ──
  commercialTitle:  string | null;
  subtitle:         string | null;
  shortDescription: string | null;
  longDescription:  string | null;

  // ── Commercial value layer ──
  keyBenefits: string[];   // [] when not set
  keyFeatures: string[];   // [] when not set

  // ── Physical / technical specs ──
  materials:  string | null;
  dimensions: string | null;
  weight:     string | null;

  // ── Usage / care ──
  careInstructions:  string | null;
  usageInstructions: string | null;
  recommendedAge:    string | null;

  // ── FAQ ──
  faq: FaqItem[];   // [] when not set

  // ── SEO layer ──
  seoTitle:       string | null;
  seoDescription: string | null;
  searchKeywords: string[];   // [] when not set

  status:    ProductContentStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ── Upsert input ──────────────────────────────────────────────────────────────

/**
 * Input for create-or-update (upsert) operations.
 * All content fields optional — only provided fields are written.
 */
export interface ProductContentUpsertInput {
  productId:      string;
  organizationId: string;

  commercialTitle?:  string | null;
  subtitle?:         string | null;
  shortDescription?: string | null;
  longDescription?:  string | null;

  keyBenefits?: string[];
  keyFeatures?: string[];

  materials?:  string | null;
  dimensions?: string | null;
  weight?:     string | null;

  careInstructions?:  string | null;
  usageInstructions?: string | null;
  recommendedAge?:    string | null;

  faq?: FaqItem[];

  seoTitle?:       string | null;
  seoDescription?: string | null;
  searchKeywords?: string[];

  status?: ProductContentStatus;
}

// ── Content readiness ─────────────────────────────────────────────────────────

export interface ContentTierReadiness {
  tier:     ContentTier;
  complete: boolean;
  /** Fields contributing to this tier that are missing */
  missing:  string[];
}

export interface ProductContentReadiness {
  productId: string;
  tier:      ContentTier;     // highest completed tier
  tiers:     ContentTierReadiness[];
  score:     number;          // 0–100 content completeness score
  computedAt: Date;
}

// ── Catalog projection ────────────────────────────────────────────────────────

/**
 * Minimal content fields surfaced on CatalogProductItem.
 * CATALOG_CONTENT_SLOT: enriches catalog cards with editorial copy.
 */
export interface CatalogContentProjection {
  commercialTitle:  string | null;
  shortDescription: string | null;
}
