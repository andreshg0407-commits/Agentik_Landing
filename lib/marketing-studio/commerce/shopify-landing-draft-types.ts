/**
 * lib/marketing-studio/commerce/shopify-landing-draft-types.ts
 *
 * SHOPIFY-EXPERIENCIAS-02 — Landing Draft Types
 *
 * Domain types for landing draft generation and lifecycle.
 * Safe for RSC -> client boundary (all plain JSON values).
 *
 * NOT:
 *   NOT the generator (see shopify-landing-generator.ts).
 *   NOT the draft service (see shopify-landing-draft-service.ts).
 *   NOT the experiences workspace types (see shopify-experiences-types.ts).
 */

import type { GenerationRules } from "./shopify-experiences-types";

// ── Block types ──────────────────────────────────────────────────────────────

export type LandingBlockType =
  | "hero"
  | "gallery"
  | "video"
  | "benefits"
  | "product_details"
  | "related_products"
  | "trust"
  | "cta";

export const LANDING_BLOCK_LABEL: Record<LandingBlockType, string> = {
  hero:             "Hero principal",
  gallery:          "Galeria de imagenes",
  video:            "Video del producto",
  benefits:         "Beneficios",
  product_details:  "Detalle del producto",
  related_products: "Productos relacionados",
  trust:            "Confianza y garantias",
  cta:              "Llamada a la accion",
};

/**
 * A single block in the landing draft structure.
 * Each block has a type, order, and content payload.
 */
export interface LandingDraftBlock {
  type:     LandingBlockType;
  order:    number;
  visible:  boolean;
  content:  LandingBlockContent;
}

/**
 * Content payload for a landing block.
 * Fields are optional — only populated based on block type.
 */
export interface LandingBlockContent {
  title?:       string;
  subtitle?:    string;
  description?: string;
  imageUrl?:    string;
  imageUrls?:   string[];
  videoUrl?:    string;
  price?:       string;
  sku?:         string;
  collection?:  string;
  ctaLabel?:    string;
  ctaUrl?:      string;
  items?:       string[];
}

// ── Draft status ─────────────────────────────────────────────────────────────

export type LandingDraftStatus =
  | "borrador"
  | "en_revision"
  | "aprobado"
  | "rechazado"
  | "archivado";

export const LANDING_DRAFT_STATUS_LABEL: Record<LandingDraftStatus, string> = {
  borrador:    "Borrador",
  en_revision: "En revision",
  aprobado:    "Aprobado",
  rechazado:   "Rechazado",
  archivado:   "Archivado",
};

// ── Draft source ─────────────────────────────────────────────────────────────

export type LandingDraftSource = "manual" | "auto_single" | "auto_bulk";

// ── Landing draft ────────────────────────────────────────────────────────────

/**
 * A persisted landing draft. Represents the full structure of a generated
 * landing page before publication. All fields are plain JSON.
 */
export interface LandingDraft {
  id:            string;
  productId:     string;
  productName:   string;
  sku:           string | null;
  templateId:    string;
  templateName:  string;
  tenantPreset:  string | null;
  status:        LandingDraftStatus;
  source:        LandingDraftSource;
  blocks:        LandingDraftBlock[];
  assetsUsed:    LandingDraftAssetRef[];
  generatedAt:   string;
  updatedAt:     string;
  createdBy:     string;
  orgId:         string;
}

/**
 * Reference to a Biblioteca asset used in the landing draft.
 */
export interface LandingDraftAssetRef {
  assetId:   string;
  assetType: "foto" | "video" | "banner";
  url:       string | null;
}

// ── Generation input ─────────────────────────────────────────────────────────

/**
 * Input for the landing generator.
 * Contains everything needed to build a draft structure.
 */
export interface LandingDraftGenerationInput {
  productId:       string;
  productName:     string;
  sku:             string | null;
  price:           string | null;
  collection:      string | null;
  shopifyUrl:      string | null;
  templateId:      string;
  photoUrls:       string[];
  videoUrl:        string | null;
  bannerUrl:       string | null;
  generationRules: GenerationRules;
  tenantPreset:    string | null;
  orgId:           string;
  createdBy:       string;
}

// ── Generation result ────────────────────────────────────────────────────────

export interface LandingDraftGenerationResult {
  ok:      boolean;
  draft:   LandingDraft | null;
  error:   string | null;
}
