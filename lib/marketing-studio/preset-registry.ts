/**
 * lib/marketing-studio/preset-registry.ts
 *
 * Global photo preset registry — super admin authoritative source.
 *
 * Presets define the default visual treatment for a garment photo session:
 * background, lighting, camera angles, and shoot style.  Tenants reference
 * presets by id and may override only the fields their PresetOverridePolicy
 * allows.
 *
 * ── Built-in presets ─────────────────────────────────────────────────────────
 *
 *   studio_clean_white    Universal clean studio look.  E-commerce safe.
 *   editorial_urban       Urban outdoor editorial.  Street / denim brands.
 *   lookbook_neutral      Neutral gray lookbook.  Premium / multi-category.
 *   flat_lay_minimal      Flat lay on white.  Accessories, shirts, hero shots.
 *   lifestyle_street      Golden-hour street lifestyle.  Casual / youth brands.
 *
 * Exports:
 *   PRESET_REGISTRY          — readonly map id → PhotoPreset
 *   ALL_PRESETS              — ordered array of all presets
 *   getPreset(id)            — lookup with type safety
 *   getPresetsForCategory(c) — returns applicable presets for a GarmentCategory
 */

import type { PhotoPreset, GarmentCategory } from "./types";

// ── Preset definitions ────────────────────────────────────────────────────────

const STUDIO_CLEAN_WHITE: PhotoPreset = {
  id:          "studio_clean_white",
  name:        "Estudio limpio — fondo blanco",
  description: "Fondo blanco infinito, iluminación de anillo, ángulos estándar e-commerce. " +
               "Universal para todas las categorías.",
  applicableTo: [],   // universal
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f5f5f5", "#fafafa"],
  },
  lighting: {
    setup:        "ring",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Cuerpo completo, posición neutra" },
    { angle: "back",          required: true,  frameHint: "Cuerpo completo de espalda" },
    { angle: "side_left",     required: false, frameHint: "Perfil izquierdo" },
    { angle: "three_quarter", required: false, frameHint: "Tres cuartos frontal" },
    { angle: "detail",        required: true,  frameHint: "Detalle de tejido, costuras o etiqueta" },
  ],
  style:              "ecommerce_clean",
  defaultModelGender: "women",
  aiPromptHint:       "clean white studio, professional fashion photography, neutral background",
  tags:               ["e-commerce", "universal", "clean", "white"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const EDITORIAL_URBAN: PhotoPreset = {
  id:          "editorial_urban",
  name:        "Editorial urbano",
  description: "Entorno urbano exterior con luz natural y ángulos editoriales. " +
               "Ideal para denim, streetwear y colecciones juveniles.",
  applicableTo: ["jeans", "pants", "shorts", "jacket", "outerwear", "activewear"],
  background: {
    type:  "outdoor",
    value: "urban street / wall / concrete",
    alternatives: ["brick wall", "graffiti backdrop", "city rooftop"],
  },
  lighting: {
    setup:        "natural",
    temperature:  "warm",
    shadowPolicy: "hard",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Postura dinámica, fondo urbano" },
    { angle: "three_quarter", required: true,  frameHint: "Tres cuartos — movimiento o andando" },
    { angle: "detail",        required: true,  frameHint: "Detalle de bordado, wash o hardware" },
    { angle: "back",          required: false, frameHint: "De espaldas, contexto urbano" },
  ],
  style:              "street",
  defaultModelGender: "men",
  aiPromptHint:       "urban editorial, street fashion photography, natural light, city background",
  tags:               ["editorial", "urban", "street", "denim", "youth"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

const LOOKBOOK_NEUTRAL: PhotoPreset = {
  id:          "lookbook_neutral",
  name:        "Lookbook neutral",
  description: "Fondo gris neutro con softbox difuso y ángulos editoriales múltiples. " +
               "Polivalente para marcas premium y catálogos de temporada.",
  applicableTo: [],   // universal
  background: {
    type:  "solid_color",
    value: "#e5e5e5",
    alternatives: ["#d1d5db", "#f3f4f6"],
  },
  lighting: {
    setup:        "softbox",
    temperature:  "neutral",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Cuerpo completo — posición de editorial" },
    { angle: "three_quarter", required: true,  frameHint: "Tres cuartos con mirada lateral" },
    { angle: "back",          required: true,  frameHint: "Cuerpo completo de espalda" },
    { angle: "detail",        required: true,  frameHint: "Detalle de acabado o tejido premium" },
    { angle: "side_right",    required: false, frameHint: "Perfil para silueta limpia" },
  ],
  style:              "lookbook",
  defaultModelGender: "women",
  aiPromptHint:       "minimalist lookbook, neutral grey studio, softbox lighting, fashion editorial",
  tags:               ["lookbook", "premium", "neutral", "seasonal"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      true,
    style:       false,
    modelGender: true,
  },
};

const FLAT_LAY_MINIMAL: PhotoPreset = {
  id:          "flat_lay_minimal",
  name:        "Flat lay minimalista",
  description: "Composición horizontal sobre fondo blanco con iluminación cenital. " +
               "Ideal para accesorios, camisas, prendas con detalle de estampado.",
  applicableTo: ["shirt", "blouse", "accessories", "footwear"],
  background: {
    type:  "solid_color",
    value: "#ffffff",
    alternatives: ["#f9fafb", "#f5f0eb"],
  },
  lighting: {
    setup:        "white_studio",
    temperature:  "neutral",
    shadowPolicy: "none",
  },
  angles: [
    { angle: "flat_lay",  required: true,  frameHint: "Vista aérea centrada, producto en foco" },
    { angle: "overhead",  required: true,  frameHint: "Plano cenital con composición limpia" },
    { angle: "detail",    required: false, frameHint: "Macro de tejido, bordado o estampado" },
  ],
  style:              "flat_lay",
  aiPromptHint:       "flat lay photography, overhead shot, white background, minimalist product",
  tags:               ["flat-lay", "overhead", "accessories", "minimal", "product"],
  overridePolicy: {
    background:  true,
    lighting:    false,
    angles:      false,
    style:       false,
    modelGender: false,
  },
};

const LIFESTYLE_STREET: PhotoPreset = {
  id:          "lifestyle_street",
  name:        "Lifestyle de calle",
  description: "Fotografía de estilo de vida en exterior dorado con ángulos dinámicos y candidatos. " +
               "Perfecta para marcas casuales y colecciones de temporada cálida.",
  applicableTo: ["jeans", "pants", "dress", "skirt", "shirt", "blouse", "activewear"],
  background: {
    type:  "outdoor",
    value: "golden hour street, park or plaza",
    alternatives: ["beachfront", "rooftop terrace", "botanical garden"],
  },
  lighting: {
    setup:        "golden_hour",
    temperature:  "warm",
    shadowPolicy: "soft",
  },
  angles: [
    { angle: "front",         required: true,  frameHint: "Sonriendo o en movimiento, hora dorada" },
    { angle: "three_quarter", required: true,  frameHint: "Perfil con fondo difuminado (bokeh)" },
    { angle: "detail",        required: false, frameHint: "Accesorio o detalle de prenda" },
    { angle: "back",          required: false, frameHint: "Caminando de espaldas hacia la luz" },
  ],
  style:              "lifestyle",
  defaultModelGender: "women",
  aiPromptHint:       "golden hour lifestyle photography, warm light, candid fashion, outdoor street",
  tags:               ["lifestyle", "golden-hour", "casual", "outdoor", "warm"],
  overridePolicy: {
    background:  true,
    lighting:    true,
    angles:      true,
    style:       true,
    modelGender: true,
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const ALL_PRESETS: readonly PhotoPreset[] = [
  STUDIO_CLEAN_WHITE,
  EDITORIAL_URBAN,
  LOOKBOOK_NEUTRAL,
  FLAT_LAY_MINIMAL,
  LIFESTYLE_STREET,
] as const;

export const PRESET_REGISTRY: ReadonlyMap<string, PhotoPreset> = new Map(
  ALL_PRESETS.map(p => [p.id, p]),
);

// ── Lookups ────────────────────────────────────────────────────────────────────

/**
 * Returns a preset by id, or null if not found.
 */
export function getPreset(id: string): PhotoPreset | null {
  return PRESET_REGISTRY.get(id) ?? null;
}

/**
 * Returns all presets applicable to a given GarmentCategory.
 * Universal presets (applicableTo = []) are always included.
 */
export function getPresetsForCategory(category: GarmentCategory): PhotoPreset[] {
  return ALL_PRESETS.filter(
    p => p.applicableTo.length === 0 || p.applicableTo.includes(category),
  );
}

/**
 * Returns presets that a tenant is allowed to use, ordered by registry position.
 */
export function getTenantPresets(allowedIds: string[]): PhotoPreset[] {
  const allowed = new Set(allowedIds);
  return ALL_PRESETS.filter(p => allowed.has(p.id));
}
