/**
 * lib/marketing-studio/visual-format-types.ts
 *
 * Visual format domain types for Foto Estudio.
 *
 * ── What this is ──────────────────────────────────────────────────────────────
 *
 *   A VisualFormat describes the canvas specification for a generation run:
 *   pixel dimensions, safe-area margins, and composition rules.
 *
 *   It replaces raw AspectRatio for the Castillitos retail path.
 *   The generate route translates VisualFormat → prompt composition instructions.
 *
 * ── Multitenant rule ──────────────────────────────────────────────────────────
 *
 *   CASTILLITOS_FORMATS  — only shown when tenantMode = "retail".
 *   Other tenants        — retain the existing AspectRatio pill selector.
 *
 * ── Custom format persistence ─────────────────────────────────────────────────
 *
 *   Built-in formats: registry constants, no DB needed.
 *   Custom formats:   local session state only.
 *
 *   TODO (Sprint AGENTIK-FOTOESTUDIO-CUSTOM-FORMATS-01):
 *     Persist custom formats in TenantMarketingConfig.configJson so they
 *     survive across sessions and can be managed from Settings.
 */

// ── Core types ────────────────────────────────────────────────────────────────

export interface VisualFormatMargins {
  top:    number;  // px
  bottom: number;  // px
  left:   number;  // px
  right:  number;  // px
}

/**
 * Canvas specification sent to the generation pipeline.
 *
 * id              — stable identifier used to correlate format across sessions
 * name            — human-readable label shown in the wizard UI
 * description     — seller-facing explanation (1 sentence, shown under name)
 * width / height  — canvas pixel dimensions
 * margins         — spacing from canvas edge to safe area
 * safeArea        — effective area for the product (derived from margins)
 * compositionNotes — plain-English composition rules injected into the prompt
 * isCustom        — true when created by the user in the wizard
 */
export interface VisualFormat {
  id:               string;
  name:             string;
  description:      string;
  width:            number;
  height:           number;
  margins:          VisualFormatMargins;
  safeArea: {
    width:  number;
    height: number;
  };
  compositionNotes: string;
  isCustom?:        boolean;
}

// ── Stored (persisted) visual format ──────────────────────────────────────────

/**
 * A VisualFormat that has been persisted to TenantMarketingConfig.configJson.
 * Stable id from crypto.randomUUID() — never Date.now().
 * Scoped per organization (stored inside the org's TenantMarketingConfig row).
 */
export interface StoredVisualFormat extends VisualFormat {
  isCustom:  true;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

// ── Castillitos canonical formats — 820×1200 ──────────────────────────────────
//
// All formats share the same canvas (820×1200 px) for consistency across the
// Castillitos product grid. What changes is the safe area and composition rules,
// derived from the official Castillitos grid templates.
//
// Grid interpretation (composition rules only — never rendered as overlays):
//   prendas_superiores: red top guide ≈14%, red bottom guide ≈18% from bottom
//                       → breathing room above collar, weight below hem
//   cuerpo_completo:    red guides ≈9% from each end
//                       → maximum vertical space for head-to-toe garments
//   accesorios:         red guides ≈17% from each end, black side guides ≈10%
//                       → generous negative space around centered object
//
// Canvas: 820×1200 px (all formats). Safe areas derived from grid proportions.

export const CASTILLITOS_FORMATS: VisualFormat[] = [
  // ── Universal fallback ──────────────────────────────────────────────────────
  {
    id:          "standard_castillitos",
    name:        "Estándar Castillitos",
    description: "Formato universal para toda la tienda.",
    width:  820, height: 1200,
    margins:  { top: 60, bottom: 60, left: 40, right: 40 },
    safeArea: { width: 740, height: 1080 },
    compositionNotes:
      "Product centered and fully visible within safe area (740×1080 px). " +
      "Consistent framing across all product types. " +
      "No cropping of product edges, labels, or accessories.",
  },

  // ── Plantilla: Prendas superiores ──────────────────────────────────────────
  // Basada en cuadrícula oficial Castillitos para camisas / prendas de torso.
  // Guía roja superior ≈14% (168 px) · guía roja inferior ≈18% (216 px).
  // Asimetría intencional: más aire inferior para anclaje visual.
  {
    id:          "prendas_superiores",
    name:        "Prendas superiores",
    description: "Camisas, blusas, busos, chaquetas y prendas de torso.",
    width:  820, height: 1200,
    margins:  { top: 160, bottom: 200, left: 80, right: 80 },
    safeArea: { width: 660, height: 840 },
    compositionNotes:
      "Upper garment centered in safe area (660×840 px). " +
      "Neckline or collar must be visible in the upper section of the safe area — " +
      "never touching the top margin. " +
      "Full garment including hem must be fully visible. " +
      "No cropping at shoulders, sleeve cuffs, or bottom hem. " +
      "Breathing room above neckline (top margin 160 px) and below hem (bottom margin 200 px) " +
      "ensures consistent visual anchor across catalog grid.",
  },

  // ── Plantilla: Cuerpo completo ──────────────────────────────────────────────
  // Basada en cuadrícula oficial Castillitos para conjuntos / prendas de cuerpo entero.
  // Guías rojas simétricas ≈9% (108 px) · máxima área útil vertical.
  {
    id:          "cuerpo_completo",
    name:        "Cuerpo completo",
    description: "Conjuntos, vestidos, enterizos, pijamas y prendas de cuerpo entero.",
    width:  820, height: 1200,
    margins:  { top: 110, bottom: 110, left: 80, right: 80 },
    safeArea: { width: 660, height: 980 },
    compositionNotes:
      "Complete garment or outfit visible head-to-toe within safe area (660×980 px). " +
      "Prioritize vertical space — product must not be cropped at any point. " +
      "For outfits (top + bottom): both pieces clearly identifiable and visually separated. " +
      "No cropping of bottom hem or ankle area. " +
      "Product centered horizontally. " +
      "Symmetric top and bottom margins (110 px each) ensure even visual weight " +
      "across the catalog grid.",
  },

  // ── Plantilla: Accesorios y juguetes ───────────────────────────────────────
  // Basada en cuadrícula oficial Castillitos para accesorios y juguetes.
  // Guías rojas ≈17% (204 px) top/bottom · guías negras ≈10% (80 px) laterales.
  // Espacio negativo generoso: el objeto ocupa 50–65% del área útil.
  {
    id:          "accesorios",
    name:        "Accesorios y juguetes",
    description: "Juguetes, accesorios, elementos pequeños y productos rígidos.",
    width:  820, height: 1200,
    margins:  { top: 200, bottom: 200, left: 80, right: 80 },
    safeArea: { width: 660, height: 800 },
    compositionNotes:
      "Product centered with generous negative space within safe area (660×800 px). " +
      "Product fully in frame — no clipping of any part of the object. " +
      "Product occupies 50–65% of safe area, centered both horizontally and vertically. " +
      "Symmetric margins (200 px top and bottom, 80 px sides) create uniform breathing room. " +
      "Clean background with no distracting elements. " +
      "Detail-forward composition to highlight product features and textures.",
  },
];

export const DEFAULT_CASTILLITOS_FORMAT: VisualFormat = CASTILLITOS_FORMATS[0];

// ── Category → format mapping ─────────────────────────────────────────────────
//
// RULE: a broad product category (ropa_nino, ropa_nina, bebe) does NOT carry
// enough composition information to select a specialized template.
// Those categories can contain tops, full-body garments, sets, or accessories —
// assuming one composition type would be wrong.
//
// Only categories that are unambiguously non-garment (toys, accessories, small
// rigid objects) are mapped to the specialized "accesorios" template.
// Everything else → "standard_castillitos" (safe universal fallback).
//
// Future: when SAG delivers composition signals (garmentType, pieceType, etc.),
// use getCastillitosFormatForComposition() instead.

const CASTILLITOS_ACCESSORY_CATEGORIES = new Set<string>([
  "juguete", "accesorio_bebe", "transporte", "aseo",
]);

/**
 * Returns the recommended VisualFormat for a Castillitos product category.
 *
 * ── Intentionally conservative ────────────────────────────────────────────────
 *
 *   Broad clothing categories (ropa_nino, ropa_nina, bebe) can contain tops,
 *   full-body sets, or accessories — the category alone does NOT identify the
 *   correct composition template. Attempting to guess causes mis-framed images.
 *
 *   Specialized templates (prendas_superiores, cuerpo_completo) are only
 *   selected when a more specific composition signal is available via
 *   getCastillitosFormatForComposition().
 *
 *   Unambiguous non-garment categories (toys, accessories) → accesorios.
 *   All others → standard_castillitos (universal, safe, always correct).
 */
export function getCastillitosFormatForCategory(productCategory: string): VisualFormat {
  const byId = (id: string) => CASTILLITOS_FORMATS.find(f => f.id === id) ?? DEFAULT_CASTILLITOS_FORMAT;
  if (CASTILLITOS_ACCESSORY_CATEGORIES.has(productCategory)) return byId("accesorios");
  // No other category provides sufficient composition signal → universal fallback
  return DEFAULT_CASTILLITOS_FORMAT;
}

// ── Composition-signal → format mapping ───────────────────────────────────────
//
// Used when specific composition data is available (future SAG integration).
// This is the correct entry point for auto-selecting specialized templates.
//
// Inputs: garmentType or pieceType — more granular than ProductCategory.
// When SAG delivers this data, wire it through getCastillitosFormatForComposition()
// and the specialized template will be selected automatically.

/** Garment/piece types that map to the "prendas_superiores" template. */
const UPPER_GARMENT_SIGNALS = new Set<string>([
  "top", "shirt", "blouse", "polo", "sweatshirt", "jacket", "cardigan",
  "camisa", "camiseta", "blusa", "buzo", "saco", "chaqueta", "polo",
]);

/** Garment/piece types that map to the "cuerpo_completo" template. */
const FULL_BODY_SIGNALS = new Set<string>([
  "set", "dress", "romper", "onesie", "jumpsuit", "uniform", "pajamas",
  "conjunto", "vestido", "enterizo", "overol", "pijama", "uniforme",
  "full_body",
]);

/** Garment/piece types that map to the "accesorios" template. */
const ACCESSORY_SIGNALS = new Set<string>([
  "accessory", "toy", "bag", "hat", "shoes", "socks", "belt", "jewelry",
  "accesorio", "juguete", "bolsa", "sombrero", "zapatos", "medias",
]);

/**
 * Returns the recommended VisualFormat based on specific composition signals.
 *
 * Use this when SAG or another source delivers garmentType / pieceType data.
 * Falls back to standard_castillitos when no signal matches.
 *
 * @param signal - garmentType, pieceType, or any composition classifier
 */
export function getCastillitosFormatForComposition(signal: string): VisualFormat {
  const byId = (id: string) => CASTILLITOS_FORMATS.find(f => f.id === id) ?? DEFAULT_CASTILLITOS_FORMAT;
  const normalized = signal.toLowerCase().trim();
  if (UPPER_GARMENT_SIGNALS.has(normalized)) return byId("prendas_superiores");
  if (FULL_BODY_SIGNALS.has(normalized))     return byId("cuerpo_completo");
  if (ACCESSORY_SIGNALS.has(normalized))     return byId("accesorios");
  return DEFAULT_CASTILLITOS_FORMAT;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

/**
 * Returns the default VisualFormat for a tenant, or null for tenants
 * that use the existing AspectRatio pill selector instead.
 */
export function getDefaultVisualFormat(tenantId: string): VisualFormat | null {
  if (tenantId === "castillitos") return DEFAULT_CASTILLITOS_FORMAT;
  return null;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Converts a VisualFormat into a concise prompt instruction string.
 * Injected into the catalog prompt to inform the AI of canvas constraints.
 *
 * Example output:
 *   "Canvas: 820×1200 px. Safe area: 740×1080 px (margins: top 60 px,
 *    bottom 60 px, left 40 px, right 40 px). Product centered and fully
 *    visible within safe area. ..."
 */
export function buildCanvasInstruction(format: VisualFormat): string {
  const { width, height, margins, safeArea, compositionNotes } = format;
  return [
    `Canvas: ${width}×${height} px.`,
    `Safe area: ${safeArea.width}×${safeArea.height} px` +
      ` (margins — top: ${margins.top} px, bottom: ${margins.bottom} px,` +
      ` left: ${margins.left} px, right: ${margins.right} px).`,
    compositionNotes,
  ].join(" ");
}
