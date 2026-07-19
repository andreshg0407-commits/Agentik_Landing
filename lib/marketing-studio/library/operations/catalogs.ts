/**
 * lib/marketing-studio/library/operations/catalogs.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Catalog operational foundations — how the Biblioteca produces catalogs.
 *
 * ── RULE ──────────────────────────────────────────────────────────────────────
 *
 *   "A catalog is not a folder. A catalog is a curated, ordered, channel-specific
 *    compilation of approved assets — produced from the Biblioteca on demand."
 *
 *   Catalogs are generated artifacts, not live views.
 *   They are compiled from the Biblioteca → frozen → distributed.
 *
 * ── CATALOG TYPES ─────────────────────────────────────────────────────────────
 *
 *   mayorista    — wholesale price + availability focus (B2B — PDF / WhatsApp)
 *   retail       — consumer-facing product catalog (print / digital)
 *   premium      — editorial / lookbook (high-end fashion / brand)
 *   whatsapp     — compact WhatsApp message catalog (5-10 products, images + prices)
 *   shopify      — Shopify collection page (image sequence + metadata export)
 *   social       — social media asset bundle (Instagram grid, TikTok series)
 *
 * ── GENERATION CONTEXTS ───────────────────────────────────────────────────────
 *
 *   A CatalogGenerationContext captures EVERYTHING the catalog compiler needs:
 *     - which assets to include (via CatalogQuery from library/types.ts)
 *     - how to arrange them (sections, ordering, grouping)
 *     - what channel-specific constraints apply (WhatsApp: 5 MB, print: 300dpi)
 *     - which tenant settings to apply (brand line, pricing tier, market)
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   catalog.ts covers the DEFINITION and CONTEXT layers.
 *   The actual compiler (PDF rendering, image bundling, Shopify push) lives in:
 *     - app/api/orgs/[orgSlug]/marketing-studio/catalogs/ (sprint MS-API)
 *     - lib/marketing-studio/catalog-compiler.ts (sprint MS-CATALOG)
 */

import type { AssetType, AssetChannel } from "../types";

// ── Catalog types ─────────────────────────────────────────────────────────────

/**
 * CatalogType — the six catalog formats.
 */
export type CatalogType =
  | "mayorista"    // wholesale B2B catalog
  | "retail"       // consumer product catalog
  | "premium"      // editorial / lookbook
  | "whatsapp"     // WhatsApp compact catalog
  | "shopify"      // Shopify collection page
  | "social";      // social media asset bundle

/**
 * CatalogStatus — compilation lifecycle.
 *
 *   draft       → being configured (no assets locked in yet)
 *   queued      → submitted for compilation
 *   compiling   → compiler is running
 *   ready       → compilation complete, available for review/distribution
 *   distributed → sent to destination(s)
 *   archived    → retired
 */
export type CatalogStatus =
  | "draft"
  | "queued"
  | "compiling"
  | "ready"
  | "distributed"
  | "archived";

// ── Catalog section ───────────────────────────────────────────────────────────

/**
 * CatalogAssetReference — a single asset slot in a catalog section.
 *
 * Contains the asset ID plus catalog-specific display overrides
 * (e.g. show a different name in the catalog than the Biblioteca name).
 */
export interface CatalogAssetReference {
  /** MarketingAsset.id */
  assetId:        string;
  /** Display order within its section (1-indexed). */
  order:          number;
  /** Override display name in the catalog layout. */
  displayName?:   string;
  /** Override price string (formatted for this catalog type). */
  displayPrice?:  string;
  /** Override SKU text shown in catalog. */
  catalogSku?:    string;
  /** Caption / descriptive text for this asset in the layout. */
  caption?:       string;
  /** Page number hint for PDF rendering. */
  page?:          number;
  /** Whether this asset is a "hero" / featured item in its section. */
  isHero?:        boolean;
  /** True if this slot was manually curated vs auto-selected from query. */
  manuallyAdded?: boolean;
}

/**
 * CatalogSection — a logical grouping of assets within a catalog.
 *
 * Examples:
 *   "Ropa Niño — Temporada Escolar 2026"
 *   "Novedades de la Semana"
 *   "Más Vendidos"
 *   "Kit Escolar Completo"
 */
export interface CatalogSection {
  /** Unique ID within the catalog. */
  id:           string;
  /** Section title (shown in layout). */
  title:        string;
  /** Optional subtitle or description. */
  subtitle?:    string;
  /** Display order within the catalog. */
  order:        number;
  /** Assets in this section. */
  assets:       CatalogAssetReference[];
  /**
   * Layout hint for the catalog renderer.
   * "grid_2x" = 2-column grid, "grid_3x" = 3-column, "list" = list view, etc.
   */
  layoutHint?:  "grid_2x" | "grid_3x" | "grid_4x" | "list" | "hero_feature" | "hero_with_grid";
  /** Visual theme override for this section (premium catalogs). */
  themeOverride?: string;
}

// ── Catalog definition ─────────────────────────────────────────────────────────

/**
 * CatalogDefinition — the complete spec for a catalog compilation job.
 *
 * This is the "blueprint" — it defines everything the compiler needs
 * to produce the final catalog artifact.
 */
export interface CatalogDefinition {
  id:             string;
  tenantId:       string;
  /** Human-readable catalog title. */
  title:          string;
  /** Optional subtitle. */
  subtitle?:      string;
  type:           CatalogType;
  status:         CatalogStatus;
  /** The channel this catalog targets. */
  channel:        AssetChannel;
  /** Asset types included in this catalog. */
  assetTypes:     AssetType[];
  /** Ordered sections with asset lists. */
  sections:       CatalogSection[];
  /**
   * Auto-query — if provided, sections are populated automatically
   * from Biblioteca assets matching this filter before manual curation.
   */
  autoQuery?: {
    tags?:         string[];
    businessLine?: string;
    productCategory?: string;
    seasonTag?:    string;
    minApproved?:  boolean;
  };
  /** The operator who defined this catalog. */
  createdBy:      string;
  createdAt:      string;
  updatedAt?:     string;
  /** When compilation was triggered. */
  compiledAt?:    string;
  /** Who triggered compilation. */
  compiledBy?:    string;
  /** URL to the compiled artifact (PDF, ZIP, etc.). */
  artifactUrl?:   string;
  /** Distribution records — where the catalog was sent. */
  distributions?: CatalogDistribution[];
  /** Renderer-specific settings. */
  renderSettings?: CatalogRenderSettings;
}

// ── Render settings ────────────────────────────────────────────────────────────

/**
 * CatalogRenderSettings — controls the catalog renderer's output.
 *
 * Applied per catalog type — not all settings apply to all types.
 */
export interface CatalogRenderSettings {
  /** Output format. */
  format:           "pdf" | "image_bundle" | "json_export" | "shopify_csv";
  /** Page size for PDF. */
  pageSize?:        "A4" | "A3" | "Letter" | "custom";
  /** DPI for print catalogs. 72 for digital, 300 for print. */
  dpi?:             72 | 150 | 300;
  /** Include prices in the layout. */
  showPrices?:      boolean;
  /** Include SKUs in the layout. */
  showSkus?:        boolean;
  /** Include QR codes per product. */
  showQrCodes?:     boolean;
  /** Max assets per page (grid layout). */
  assetsPerPage?:   number;
  /** Max total assets in catalog (WhatsApp: 10 hard limit). */
  maxAssets?:       number;
  /** Max file size in bytes for the output artifact. */
  maxOutputSizeBytes?: number;
  /** Brand header/footer to inject. */
  brandHeader?:     boolean;
  /** Cover page included. */
  includeCover?:    boolean;
  /** Index page included. */
  includeIndex?:    boolean;
  /** Language for labels and metadata. "es" | "en". */
  locale?:          "es" | "en";
}

// ── Catalog distribution ───────────────────────────────────────────────────────

/**
 * CatalogDistribution — a record of where a compiled catalog was sent.
 */
export interface CatalogDistribution {
  id:           string;
  catalogId:    string;
  /** Where it was sent. */
  channel:      "whatsapp" | "email" | "shopify" | "download" | "crm" | "print_queue";
  /** Destination identifier (phone number, email, shopify collection id). */
  destination?: string;
  sentAt:       string;
  sentBy:       string;
  /** Whether the recipient has viewed/downloaded the catalog. */
  acknowledged?: boolean;
}

// ── Catalog generation context ─────────────────────────────────────────────────

/**
 * CatalogGenerationContext — the runtime context passed to the catalog compiler.
 *
 * Merges the CatalogDefinition with tenant config and operational constraints.
 * The compiler uses this — not the raw CatalogDefinition — to produce artifacts.
 */
export interface CatalogGenerationContext {
  /** The catalog being compiled. */
  catalog:        CatalogDefinition;
  /** Tenant context. */
  tenantId:       string;
  tenantName?:    string;
  /** Total assets resolved across all sections. */
  totalAssets:    number;
  /** Compile-time timestamp (ISO). */
  compiledAt:     string;
  /** UserId of the operator or system triggering compilation. */
  triggeredBy:    string;
  /**
   * Whether this is a preview (fast, lower quality)
   * or a production run (full quality, distribution-ready).
   */
  mode:           "preview" | "production";
  /** Channel-specific constraints to enforce. */
  constraints?:   CatalogChannelConstraints;
}

/**
 * CatalogChannelConstraints — enforced during compilation per channel.
 */
export interface CatalogChannelConstraints {
  /** Hard maximum number of assets. */
  maxAssets?:       number;
  /** Hard maximum file size for the output artifact in bytes. */
  maxOutputBytes?:  number;
  /** Required image dimensions (min). */
  minImageWidth?:   number;
  minImageHeight?:  number;
  /** Allowed image formats for this channel. */
  allowedFormats?:  string[];
}

// ── Catalog type registry ──────────────────────────────────────────────────────

/**
 * CATALOG_TYPE_CONFIG — defaults and constraints per catalog type.
 *
 * Used by the catalog wizard and compiler to auto-populate settings.
 */
export const CATALOG_TYPE_CONFIG: Record<CatalogType, {
  label:          string;
  description:    string;
  defaultChannel: AssetChannel;
  defaultFormat:  CatalogRenderSettings["format"];
  constraints:    CatalogChannelConstraints;
  notes?:         string;
}> = {

  mayorista: {
    label:          "Mayorista",
    description:    "Catálogo B2B para clientes mayoristas. Precios y disponibilidad.",
    defaultChannel: "whatsapp",
    defaultFormat:  "pdf",
    constraints:    { maxAssets: 80, maxOutputBytes: 20 * 1024 * 1024 },
    notes:          "Optimizado para envío por WhatsApp o email. Incluir precios y SKUs.",
  },

  retail: {
    label:          "Retail",
    description:    "Catálogo para consumidor final. Visual y orientado al producto.",
    defaultChannel: "catalog",
    defaultFormat:  "pdf",
    constraints:    { maxAssets: 120, maxOutputBytes: 50 * 1024 * 1024 },
    notes:          "Incluir portada. Puede enviarse digital o imprimirse.",
  },

  premium: {
    label:          "Premium / Lookbook",
    description:    "Catálogo editorial de alta calidad. Solo assets aprobados.",
    defaultChannel: "catalog",
    defaultFormat:  "pdf",
    constraints:    { maxAssets: 40, minImageWidth: 1200, minImageHeight: 1200, allowedFormats: ["image/jpeg", "image/png"] },
    notes:          "Resolución mínima 1200px. Solo product_photo y lifestyle_photo.",
  },

  whatsapp: {
    label:          "Catálogo WhatsApp",
    description:    "Catálogo compacto para enviar por WhatsApp (máx 10 productos).",
    defaultChannel: "whatsapp",
    defaultFormat:  "image_bundle",
    constraints:    { maxAssets: 10, maxOutputBytes: 5 * 1024 * 1024, allowedFormats: ["image/jpeg", "image/png"] },
    notes:          "Límite WhatsApp: 5 MB total. Máx 10 productos. Imágenes cuadradas o portrait.",
  },

  shopify: {
    label:          "Shopify Collection",
    description:    "Exportación de assets para actualizar una colección en Shopify.",
    defaultChannel: "shopify",
    defaultFormat:  "shopify_csv",
    constraints:    { maxAssets: 250, minImageWidth: 800, allowedFormats: ["image/jpeg", "image/png", "image/webp"] },
    notes:          "Exporta CSV compatible con Shopify bulk import. Requiere Shopify habilitado en tenant.",
  },

  social: {
    label:          "Bundle Redes Sociales",
    description:    "Paquete de assets para campañas de Instagram, TikTok o Facebook.",
    defaultChannel: "instagram",
    defaultFormat:  "image_bundle",
    constraints:    { maxAssets: 30, maxOutputBytes: 100 * 1024 * 1024 },
    notes:          "ZIP con imágenes organizadas por canal/formato. Para uso en plataformas de scheduling.",
  },

};

// ── Catalog builder helpers ────────────────────────────────────────────────────

/**
 * buildCatalogSection — constructs a new empty CatalogSection.
 */
export function buildCatalogSection(
  id:     string,
  title:  string,
  order:  number,
  opts?: { subtitle?: string; layoutHint?: CatalogSection["layoutHint"] },
): CatalogSection {
  return {
    id,
    title,
    subtitle: opts?.subtitle,
    order,
    assets:   [],
    layoutHint: opts?.layoutHint,
  };
}

/**
 * buildCatalogAssetRef — constructs a CatalogAssetReference for insertion into a section.
 */
export function buildCatalogAssetRef(
  assetId: string,
  order:   number,
  opts?: Pick<CatalogAssetReference, "displayName" | "displayPrice" | "catalogSku" | "caption" | "isHero">,
): CatalogAssetReference {
  return { assetId, order, ...opts, manuallyAdded: true };
}

/**
 * getCatalogConstraints — returns channel constraints for a catalog type.
 * Used by the compiler to enforce limits during compilation.
 */
export function getCatalogConstraints(type: CatalogType): CatalogChannelConstraints {
  return CATALOG_TYPE_CONFIG[type].constraints;
}

/**
 * countCatalogAssets — returns the total number of asset slots across all sections.
 */
export function countCatalogAssets(catalog: Pick<CatalogDefinition, "sections">): number {
  return catalog.sections.reduce((sum, s) => sum + s.assets.length, 0);
}
