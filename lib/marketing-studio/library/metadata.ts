/**
 * lib/marketing-studio/library/metadata.ts
 *
 * MARKETING-STUDIO-LIBRARY-CORE — Sprint MS-01
 *
 * Metadata schema helpers for Biblioteca / Asset Hub assets.
 *
 * ── TWO LAYERS ────────────────────────────────────────────────────────────────
 *
 *   AssetMinimalMetadata — required at intake time.
 *     Every asset entering the Biblioteca must have this.
 *     Small surface area: name, category, assetType, cleared channels.
 *
 *   AssetContextualMetadata — filled progressively. All fields optional.
 *     Added by: ERP sync, operator manual entry, AI extraction (future).
 *     Covers: size, color, collection, price, age, availability, supplier.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   "No form fatigue."
 *
 *   Minimal metadata is enforced so the Biblioteca always has enough to filter.
 *   Contextual metadata is accumulated over time — never a blocker at creation.
 *   Operators fill it in progressively; AI extraction fills it automatically (future).
 *
 * ── STORAGE ───────────────────────────────────────────────────────────────────
 *
 *   Both metadata objects are stored in MarketingAsset.metadata as a flat JSON blob.
 *   The Prisma column is jsonb — no schema migration needed for new fields.
 *   Use buildMetadata() to compose the stored blob from both layers.
 */

import type { AssetType, AssetChannel, MarketingAsset } from "./types";

// ── Minimal metadata ───────────────────────────────────────────────────────────

/**
 * AssetMinimalMetadata — the minimum set of fields required for every Biblioteca asset.
 *
 * Enforced at:
 *   - Foto Estudio wizard "save to library" action
 *   - Manual upload intake form
 *   - Bulk/batch import validation
 *
 * Validation: use validateMinimalMetadata() before persisting.
 */
export interface AssetMinimalMetadata {
  /** Display name of the asset. E.g. "Conjunto niño azul temporada escolar". */
  name:            string;
  /**
   * The AssetType classification. Must match the actual content.
   * product_photo ≠ lifestyle_photo — they route to different channels.
   */
  assetType:       AssetType;
  /**
   * Channels this asset is cleared for at creation time.
   * Minimum: at least one channel must be declared.
   * Can be expanded later as additional clearances are obtained.
   */
  clearedChannels: AssetChannel[];
}

export interface MetadataValidationResult {
  valid:    boolean;
  missing:  string[];
  errors:   string[];
}

/**
 * validateMinimalMetadata — validates that all required minimal fields are present.
 * Returns a result object — never throws.
 */
export function validateMinimalMetadata(
  meta: Partial<AssetMinimalMetadata>,
): MetadataValidationResult {
  const missing: string[] = [];
  const errors:  string[] = [];

  if (!meta.name || meta.name.trim().length === 0) {
    missing.push("name");
  } else if (meta.name.trim().length > 200) {
    errors.push("name must be 200 characters or fewer");
  }

  if (!meta.assetType) {
    missing.push("assetType");
  }

  if (!meta.clearedChannels || meta.clearedChannels.length === 0) {
    missing.push("clearedChannels (at least one channel required)");
  }

  return {
    valid:   missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}

// ── Contextual metadata ────────────────────────────────────────────────────────

/**
 * AssetContextualMetadata — enrichment fields filled progressively.
 *
 * These are never required at intake. They can be:
 *   - Filled manually by an operator in the Biblioteca panel
 *   - Synced from the ERP (future sprint)
 *   - Extracted by AI from the image (future sprint)
 *   - Imported from Shopify product data (sprint MS-Shopify)
 *
 * Each field is independent — filling one does not require any other.
 */
export interface AssetContextualMetadata {
  // ── Product commercial data ────────────────────────────────────────────────
  /** Price as displayed on the product (not necessarily the selling price). */
  displayPrice?:    number;
  /** ISO 4217 currency code, e.g. "COP" */
  currency?:        string;
  /** Available sizes, e.g. ["2", "4", "6", "8", "10", "12"] for kids clothing */
  sizes?:           string[];
  /** Normalized color names, e.g. ["azul marino", "blanco"] */
  colors?:          string[];
  /** Brand or sub-brand, e.g. "Latin Kids", "Castillitos Bebé" */
  brand?:           string;
  /** Product line or collection name, e.g. "Regreso a Clases 2026" */
  collection?:      string;
  /** Internal supplier / vendor code */
  supplierCode?:    string;
  /** Supplier / vendor display name */
  supplierName?:    string;

  // ── Retail commercial context ──────────────────────────────────────────────
  /** Whether this product is currently in stock */
  inStock?:         boolean;
  /** Stock quantity (if tracked) */
  stockQty?:        number;
  /** Age range for kids products, e.g. "4-6 años" */
  ageRange?:        string;
  /** Gender / target audience: "niño" | "niña" | "unisex" | "bebé" */
  targetGender?:    "niño" | "niña" | "unisex" | "bebé" | "adulto";

  // ── Digital / production context ──────────────────────────────────────────
  /** Original image resolution, e.g. "4096x4096" */
  resolution?:      string;
  /** Physical print dimensions if applicable, e.g. "30x40cm @300dpi" */
  printSpec?:       string;
  /** ISO date of expiry for time-limited content (e.g. flash sale creative) */
  expiresAt?:       string;
  /** Campaign or activation this asset was created for */
  campaignName?:    string;
  /** Free-text internal notes from the operator */
  operatorNotes?:   string;

  // ── AI extraction enrichment (future sprint) ───────────────────────────────
  /**
   * AI-extracted dominant colors from the image.
   * Populated automatically when AI color extraction pipeline is active.
   */
  dominantColors?:  string[];
  /**
   * AI-extracted keywords/objects detected in the image.
   * Used for semantic search and auto-tagging.
   */
  aiTags?:          string[];
  /**
   * Perceptual hash of the image — used for duplicate detection.
   * Populated when image processing pipeline runs.
   */
  perceptualHash?:  string;
}

// ── Metadata composition helpers ───────────────────────────────────────────────

/**
 * buildMetadata — composes the metadata blob stored in MarketingAsset.metadata.
 * Merges minimal + contextual into a single flat object.
 *
 * This is the only function that should write to MarketingAsset.metadata.
 */
export function buildMetadata(
  minimal:     AssetMinimalMetadata,
  contextual?: Partial<AssetContextualMetadata>,
): Record<string, unknown> {
  return {
    ...minimal,
    ...(contextual ?? {}),
  };
}

/**
 * extractMinimalMetadata — reads the typed minimal fields from a raw metadata blob.
 * Returns null when required fields are missing (corrupted record guard).
 */
export function extractMinimalMetadata(
  raw: Record<string, unknown> | undefined,
): AssetMinimalMetadata | null {
  if (!raw) return null;
  const { name, assetType, clearedChannels } = raw as Partial<AssetMinimalMetadata>;
  if (!name || !assetType || !clearedChannels) return null;
  return { name, assetType, clearedChannels };
}

/**
 * extractContextualMetadata — reads the typed contextual fields from a raw metadata blob.
 * Always returns an object (may be empty — that's valid).
 */
export function extractContextualMetadata(
  raw: Record<string, unknown> | undefined,
): Partial<AssetContextualMetadata> {
  if (!raw) return {};
  const {
    displayPrice, currency, sizes, colors, brand, collection,
    supplierCode, supplierName, inStock, stockQty, ageRange,
    targetGender, resolution, printSpec, expiresAt, campaignName,
    operatorNotes, dominantColors, aiTags, perceptualHash,
  } = raw as Partial<AssetContextualMetadata>;
  return {
    displayPrice, currency, sizes, colors, brand, collection,
    supplierCode, supplierName, inStock, stockQty, ageRange,
    targetGender, resolution, printSpec, expiresAt, campaignName,
    operatorNotes, dominantColors, aiTags, perceptualHash,
  };
}

// ── Asset summary helper ───────────────────────────────────────────────────────

/**
 * buildAssetDisplayName — generates a human-readable display name for an asset
 * when no explicit name was provided at intake.
 *
 * Format: "{assetType label} — {sku or productCategory} — {retailSeason}"
 *
 * Used as a fallback in the Biblioteca grid when asset.name is generic.
 */
export function buildAssetDisplayName(
  asset: Pick<MarketingAsset, "assetType" | "sku" | "productCategory" | "retailSeason" | "name">,
): string {
  const ASSET_TYPE_LABELS: Record<string, string> = {
    product_photo:   "Foto producto",
    lifestyle_photo: "Foto lifestyle",
    banner:          "Banner",
    hero:            "Hero",
    short_video:     "Video corto",
    catalog_page:    "Página catálogo",
    template:        "Plantilla",
    ad_creative:     "Pieza pauta",
    landing_asset:   "Asset landing",
    whatsapp_asset:  "Asset WhatsApp",
  };

  const SEASON_SHORT: Record<string, string> = {
    regreso_clases: "Regreso Clases",
    navidad:        "Navidad",
    dia_nino:       "Día del Niño",
    halloween:      "Halloween",
    san_valentin:   "San Valentín",
    dia_madre:      "Día de la Madre",
    normal:         "",
  };

  const parts: string[] = [];
  parts.push(ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType);

  if (asset.sku) {
    parts.push(asset.sku);
  } else if (asset.productCategory) {
    parts.push(asset.productCategory.replace(/_/g, " "));
  }

  if (asset.retailSeason && asset.retailSeason !== "normal") {
    const seasonLabel = SEASON_SHORT[asset.retailSeason];
    if (seasonLabel) parts.push(seasonLabel);
  }

  return parts.join(" — ");
}
