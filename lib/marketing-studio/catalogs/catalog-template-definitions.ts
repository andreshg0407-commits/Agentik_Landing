/**
 * lib/marketing-studio/catalogs/catalog-template-definitions.ts
 *
 * MARKETING-STUDIO-CATALOG-TEMPLATES-01 — Commercial Template Catalog
 *
 * Defines the 4 initial commercial templates for CatalogDefinition.
 * Templates control HOW the catalog is communicated — not what it contains.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - No DB table — templates are defined in code (first version)
 *   - templateKey is stored on CatalogDefinition (String field)
 *   - Templates carry recommended pricingMode / ctaMode but do NOT override them
 *   - Visual variations: density, image priority, metadata priority
 *   - Extension points for branding (logo, color, banner, copy, footer) are
 *     marked as TODO — left for a future branding sprint
 *
 * ── TEMPLATE KEYS ─────────────────────────────────────────────────────────────
 *   wholesale     — B2B compact list, prices visible, no CTA
 *   retail        — B2C visual grid, prices, WhatsApp CTA (default)
 *   institutional — formal clean layout, no prices, no CTA
 *   campaign      — expressive hero layout, large images, seasonal
 */

import type { PricingMode, CtaMode } from "./catalog-definition-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CatalogTemplateKey = "wholesale" | "retail" | "institutional" | "campaign";

/** How densely products are packed in the layout. */
export type VisualDensity = "compact" | "standard" | "spacious";

/** How much visual weight images receive. */
export type ImagePriority = "low" | "standard" | "high" | "hero";

/** How much product metadata (SKU, category, attributes) is surfaced. */
export type MetadataPriority = "minimal" | "standard" | "rich";

export interface CatalogTemplateDefinition {
  key:   CatalogTemplateKey;
  label: string;
  /** 1–2 sentence summary shown in the template selector. */
  description: string;
  /** Short phrase describing the intended audience / channel. */
  useCase: string;

  // ── Commercial defaults ────────────────────────────────────────────────────
  /** Suggested pricingMode for this template. Never overrides saved value. */
  recommendedPricingMode: PricingMode;
  /** Suggested ctaMode for this template. Never overrides saved value. */
  recommendedCtaMode: CtaMode;

  // ── Visual hints ──────────────────────────────────────────────────────────
  visualDensity:    VisualDensity;
  imagePriority:    ImagePriority;
  metadataPriority: MetadataPriority;

  /** Tone tag for copy guidance — not enforced at render time. */
  tone: "professional" | "warm" | "formal" | "expressive";

  // ── Branding extension points (future sprint) ─────────────────────────────
  // TODO: logoUrl?: string;
  // TODO: accentColor?: string;
  // TODO: bannerImageUrl?: string;
  // TODO: headerCopy?: string;
  // TODO: footerCopy?: string;
}

// ── Template Registry ─────────────────────────────────────────────────────────

export const CATALOG_TEMPLATES: Record<CatalogTemplateKey, CatalogTemplateDefinition> = {

  wholesale: {
    key:         "wholesale",
    label:       "Mayorista",
    description: "Listas de referencia con precio de costo. Diseño compacto para revisión rápida de portafolio.",
    useCase:     "B2B: compradores, distribuidores, proveedores",
    recommendedPricingMode: "with_prices",
    recommendedCtaMode:     "none",
    visualDensity:    "compact",
    imagePriority:    "low",
    metadataPriority: "rich",
    tone: "professional",
  },

  retail: {
    key:         "retail",
    label:       "Retail",
    description: "Catálogo visual para clientes finales. Imágenes protagonistas con CTA de compra directa.",
    useCase:     "B2C: tienda, WhatsApp, redes sociales",
    recommendedPricingMode: "with_prices",
    recommendedCtaMode:     "whatsapp_order",
    visualDensity:    "standard",
    imagePriority:    "high",
    metadataPriority: "standard",
    tone: "warm",
  },

  institutional: {
    key:         "institutional",
    label:       "Institucional",
    description: "Presentación limpia sin precios. Ideal para licitaciones y clientes corporativos.",
    useCase:     "Gobierno, licitaciones, clientes enterprise",
    recommendedPricingMode: "without_prices",
    recommendedCtaMode:     "none",
    visualDensity:    "standard",
    imagePriority:    "standard",
    metadataPriority: "rich",
    tone: "formal",
  },

  campaign: {
    key:         "campaign",
    label:       "Campaña",
    description: "Layout expresivo para lanzamientos y temporadas. Imágenes grandes, menos texto.",
    useCase:     "Temporada alta, lanzamiento de colección, Black Friday",
    recommendedPricingMode: "with_prices",
    recommendedCtaMode:     "whatsapp_order",
    visualDensity:    "spacious",
    imagePriority:    "hero",
    metadataPriority: "minimal",
    tone: "expressive",
  },

};

// ── Helpers ───────────────────────────────────────────────────────────────────

export const CATALOG_TEMPLATE_LABELS: Record<CatalogTemplateKey, string> = {
  wholesale:     "Mayorista",
  retail:        "Retail",
  institutional: "Institucional",
  campaign:      "Campaña",
};

export const CATALOG_TEMPLATE_KEYS = Object.keys(CATALOG_TEMPLATES) as CatalogTemplateKey[];

export function getCatalogTemplate(key: string): CatalogTemplateDefinition {
  return CATALOG_TEMPLATES[(key as CatalogTemplateKey)] ?? CATALOG_TEMPLATES.retail;
}

export function isValidTemplateKey(key: string): key is CatalogTemplateKey {
  return key in CATALOG_TEMPLATES;
}
