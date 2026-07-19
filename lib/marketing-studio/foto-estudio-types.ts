/**
 * lib/marketing-studio/foto-estudio-types.ts
 *
 * Domain types for the Foto Estudio module.
 * UI labels in Spanish are in the wizard. These are code-internal English identifiers.
 */

export type FotoOutputType =
  | "catalog_photo"      // Foto frontal — clean front, e-commerce ready
  | "back_photo"         // Foto trasera — clean back shot
  | "social_photo"       // Foto para redes — styled, social format
  | "short_video"        // Video corto — 8s vertical clip
  | "custom_template";   // Plantilla personalizada

export type VisualStyle =
  | "clean_studio"       // Estudio limpio
  | "editorial"          // Editorial
  | "urban"              // Urbano
  | "lifestyle"          // Lifestyle
  | "luxury"             // Lujo
  | "minimal";           // Minimalista

export type BackgroundType =
  | "white"              // Blanco
  | "light_gray"         // Gris claro
  | "black"              // Negro
  | "gradient"           // Gradiente
  | "outdoor_scene"      // Escena exterior
  | "indoor_scene"       // Escena interior
  | "transparent";       // Transparente

export type AspectRatio = "1:1" | "9:16" | "4:5" | "4:3" | "16:9";

/**
 * Type of product being photographed.
 *
 * Fashion (legacy — Do Jeans): jean, short, falda, body, top, chaqueta, vestido
 * Kids retail (Castillitos):   ropa_nino, ropa_nina, conjunto, pijama,
 *                               uniforme, juguete, juego_mesa, utiles,
 *                               mochila, calzado_nino, accesorio_nino, bebe
 */
/**
 * GarmentType — true clothing subtypes for fashion tenants (Do Jeans).
 * Use for prenda-level identification, prompt construction, and detail locks.
 *
 * Retail tenants (Castillitos) should use ProductCategory instead.
 */
export type GarmentType =
  | "jean"
  | "short"
  | "falda"
  | "body"
  | "top"
  | "chaqueta"
  | "vestido"
  | "otro";

/**
 * ProductCategory — business-level commercial categories for retail tenants (Castillitos).
 *
 * Represents what the product IS commercially (toy, kids outfit, school supplies),
 * NOT the specific garment subtype. Used for:
 *   - Foto Estudio wizard product selector (retail path)
 *   - Biblioteca filtering by product line
 *   - Campaign routing and seasonal preset resolution
 *   - ERP alias mapping via categoryAliases
 *
 * Fashion tenants (Do Jeans) use GarmentType instead.
 */
export type ProductCategory =
  | "ropa_nino"        // ropa infantil niño
  | "ropa_nina"        // ropa infantil niña
  | "conjunto"         // conjunto / set infantil
  | "pijama"           // pijama infantil
  | "uniforme"         // uniforme escolar
  | "juguete"          // juguete
  | "juego_mesa"       // juego de mesa / puzzle
  | "utiles"           // útiles escolares / papelería
  | "mochila"          // mochila escolar
  | "calzado_nino"     // calzado infantil
  | "accesorio_nino"   // accesorio infantil (cinturón, gorro, etc.)
  | "bebe"             // artículo bebé (0–2 años)
  | "accesorio_bebe"   // accesorios de bebé (chupetes, baberos, etc.)
  | "transporte"       // carritos, coches, sillas de bebé
  | "aseo"             // bañeras, bacinillas, sets de aseo
  | "kids_clothing"    // legacy alias — maps from GarmentCategory (ERP compat)
  | "otro";

/**
 * Brand line / retail line — determines model aesthetic and campaign mood.
 *
 * luxury:       curvy latina, levanta cola, sensual elegance (Do Jeans)
 * casual:       urban, relaxed, approachable (Do Jeans / generic)
 * kids_fun:     colorful, playful, children's lifestyle (Castillitos)
 * latin_kids:   Latin Kids brand — slightly more aspirational kids aesthetic
 * institutional: uniforms, B2B school supplies — clean and professional
 * importacion:  Importación line — general merchandise, toys, accessories
 * otros:        FISCAL / CONTABLE ONLY — bolsas de empaque obligatorias (Colombia).
 *               NOT a commercial line. No campaigns, no hero content.
 *               Prompt: neutral/minimal product shot only.
 */
export type BrandLine =
  | "luxury"
  | "casual"
  | "kids_fun"
  | "latin_kids"
  | "institutional"
  | "importacion"
  | "otros";

/** For social_photo — drives framing, composition, aspect ratio and pose */
export type SocialPublicationType = "feed" | "reel" | "story";

/** Model ethnicity / look profile */
export type ModelType =
  | "latina_rubia"         // Latina rubia
  | "latina_morena"        // Latina morena
  | "europea_rubia"        // Europea rubia
  | "morena_editorial"     // Morena editorial
  | "luxury_curvy"         // Luxury curvy
  | "casual_urbana"        // Casual urbana
  | "fitness"              // Fitness
  | "premium_catalogo"     // Premium catálogo
  | "personalizada";       // Personalizada (use modelReferenceUrl)

/** Model body shape */
export type BodyType =
  | "slim"                 // Slim / Delgada
  | "curvy"                // Curvy / Reloj de arena
  | "voluptuosa"           // Voluptuosa
  | "atletica"             // Atlética
  | "plus_size"            // Plus size
  | "petite"               // Petite
  | "personalizada";       // Personalizada

/** Output resolution / visual quality tier */
export type VisualQuality =
  | "standard_hd"          // Standard HD
  | "full_hd"              // Full HD (1080)
  | "2k_editorial"         // 2K Editorial
  | "4k_premium";          // 4K Premium Campaign

/** Shot framing / camera angle */
export type FramingType =
  | "frontal_catalogo"     // Frontal recto catálogo
  | "americano"            // Americano
  | "full_body_editorial"  // Full body editorial
  | "close_up_producto"    // Close-up producto
  | "back_view"            // Back view
  | "side_view"            // Side view
  | "tres_cuartos"         // 3/4 pose
  | "movimiento_lifestyle"; // Movimiento lifestyle

// ── Kids visual profile (Castillitos) ────────────────────────────────────────
// Replaces the adult model profile for children's retail tenants.
// Fields are optional in FotoEstudioSettings and only shown for castillitos.

/** Who / what is presenting the product. */
export type KidsModelType =
  | "nino"               // Niño
  | "nina"               // Niña
  | "bebe_nino"          // Bebé niño
  | "bebe_nina"          // Bebé niña
  | "unisex_infantil"    // Unisex infantil
  | "sin_modelo"         // Sin modelo (producto solo)
  | "flat_lay"           // Flat lay
  | "maniqui"            // Maniquí infantil
  | "producto_ambientado"; // Producto ambientado

/** Approximate age range of the child model. */
export type KidsAgeRange =
  | "0_12m"   // 0-12 meses
  | "1_3"     // 1-3 años
  | "4_6"     // 4-6 años
  | "7_9"     // 7-9 años
  | "10_12"   // 10-12 años
  | "teen";   // Teen infantil

/** Ethnicity / visual trait of the child model. */
export type KidsVisualTrait =
  | "latino"
  | "afro"
  | "rubio"
  | "moreno"
  | "mixto_internacional"
  | "personalizado";

/** Visual style / presentation mood for kids retail. */
export type KidsVisualStyle =
  | "catalogo_comercial"  // Catálogo comercial
  | "lifestyle_infantil"  // Lifestyle infantil
  | "escolar"             // Escolar
  | "jugueton"            // Juguetón
  | "premium_retail"      // Premium retail
  | "marketplace";        // Marketplace

/** Expression / pose mood. */
export type KidsExpression =
  | "sonriente"       // Sonriente
  | "natural"         // Natural
  | "activo"          // Activo
  | "formal_escolar"  // Formal escolar
  | "neutro_catalogo"; // Neutro catálogo

export interface FotoEstudioSettings {
  frontImageUrl?:         string;
  backImageUrl?:          string;
  detail1Url?:            string;
  detail2Url?:            string;
  referenceImageUrl?:     string;   // for custom_template — style reference
  modelReferenceUrl?:     string;   // optional model reference photo
  sku?:                   string;
  selectedOutputs:        FotoOutputType[];
  visualStyle:            VisualStyle;
  background:             BackgroundType;
  aspectRatio:            AspectRatio;
  quantity:               number;   // variants per output type, 1–4
  // TODO(marketing-studio): garmentType legacy path.
  // Retail tenants should migrate to productCategory.
  // Kept for backwards compatibility with the generation pipeline (reads garmentType from inputsJson).
  garmentType?:           GarmentType;
  /** Retail tenants (Castillitos): canonical product category. Preferred over garmentType. */
  productCategory?:       ProductCategory;
  brandLine:              BrandLine;
  socialPublicationType?: SocialPublicationType;  // only for social_photo
  // Adult model profile (Do Jeans / default tenants)
  modelType:              ModelType;
  bodyType:               BodyType;
  visualQuality:          VisualQuality;
  framingType:            FramingType;
  // Kids visual profile (Castillitos) — optional, ignored by non-kids tenants
  kidsModelType?:         KidsModelType;
  kidsAgeRange?:          KidsAgeRange;
  kidsVisualTrait?:       KidsVisualTrait;
  kidsVisualStyle?:       KidsVisualStyle;
  kidsExpression?:        KidsExpression;
  /** Creative direction text from the "Dirección creativa IA" field.
   *  Injected directly into the prompt — influences scene, mood, atmosphere. */
  freePrompt?:            string;
  /**
   * Visual canvas format for catalog generation.
   * Only populated for retail tenants (Castillitos).
   * Non-retail tenants use aspectRatio instead.
   */
  visualFormat?:          import("./visual-format-types").VisualFormat;
}

/** Maps a FotoOutputType to the asset type strings used in GeneratedAsset */
export function mapOutputToAssetTypes(output: FotoOutputType): string[] {
  switch (output) {
    case "catalog_photo":
      return ["front_clean"];
    case "back_photo":
      return ["back_clean"];
    case "social_photo":
      return ["social_image"];
    case "short_video":
      return ["social_video"];
    case "custom_template":
      return ["product_photo"];
  }
}

/** Labels for fashion garment subtypes — Do Jeans / fashion tenants. */
export const GARMENT_TYPE_LABELS: Record<GarmentType, string> = {
  jean:     "Jean",
  short:    "Short",
  falda:    "Falda",
  body:     "Body",
  top:      "Top",
  chaqueta: "Chaqueta",
  vestido:  "Vestido",
  otro:     "Otro",
};

/** Labels for retail product categories — Castillitos / kids retail tenants. */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  ropa_nino:      "Ropa niño",
  ropa_nina:      "Ropa niña",
  conjunto:       "Conjunto / Set",
  pijama:         "Pijama",
  uniforme:       "Uniforme escolar",
  juguete:        "Juguete",
  juego_mesa:     "Juego de mesa",
  utiles:         "Útiles escolares",
  mochila:        "Mochila",
  calzado_nino:   "Calzado infantil",
  accesorio_nino: "Accesorio infantil",
  bebe:           "Bebé",
  accesorio_bebe: "Accesorios de bebé",
  transporte:     "Transporte",
  aseo:           "Aseo",
  kids_clothing:  "Ropa infantil",
  otro:           "Otro",
};

export const BRAND_LINE_LABELS: Record<BrandLine, string> = {
  luxury:        "Luxury",
  casual:        "Casual",
  kids_fun:      "Castillitos Kids",
  latin_kids:    "Latin Kids",
  institutional: "Institucional / Uniforme",
  importacion:   "Importación",
  otros:         "Otros",
};

export const BRAND_LINE_DESCRIPTIONS: Record<BrandLine, string> = {
  luxury:        "Modelo voluptuosa, estética latina premium, levanta cola.",
  casual:        "Modelo urbana, look relajado y cotidiano.",
  kids_fun:      "Niños coloridos y alegres, ambiente lúdico y familiar. Castillitos.",
  latin_kids:    "Estética Latin Kids — infantil con personalidad. Colores vibrantes.",
  institutional: "Catálogo limpio y profesional — uniformes, útiles, B2B escolar.",
  importacion:   "Producto de importación — mercancía variada, juguetes, accesorios.",
  otros:         "Línea contable/facturación para bolsas de empaque obligatorias. No representa una línea comercial principal.",
};

export const SOCIAL_PUBLICATION_LABELS: Record<SocialPublicationType, string> = {
  feed:  "Feed",
  reel:  "Reel / TikTok",
  story: "Story",
};

export const SOCIAL_PUBLICATION_DESCRIPTIONS: Record<SocialPublicationType, string> = {
  feed:  "Cuadrado o 4:5 — composición balanceada, colores vibrantes.",
  reel:  "9:16 vertical — pose dinámica, sugestión de movimiento.",
  story: "9:16 vertical — encuadre cercano, espacio para texto.",
};

export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  latina_rubia:      "Latina rubia",
  latina_morena:     "Latina morena",
  europea_rubia:     "Europea rubia",
  morena_editorial:  "Morena editorial",
  luxury_curvy:      "Luxury curvy",
  casual_urbana:     "Casual urbana",
  fitness:           "Fitness",
  premium_catalogo:  "Premium catálogo",
  personalizada:     "Personalizada",
};

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  slim:         "Slim / Delgada",
  curvy:        "Curvy / Reloj de arena",
  voluptuosa:   "Voluptuosa",
  atletica:     "Atlética",
  plus_size:    "Plus size",
  petite:       "Petite",
  personalizada: "Personalizada",
};

export const VISUAL_QUALITY_LABELS: Record<VisualQuality, string> = {
  standard_hd:  "Standard HD",
  full_hd:      "Full HD (1080)",
  "2k_editorial": "2K Editorial",
  "4k_premium": "4K Premium Campaign",
};

export const FRAMING_TYPE_LABELS: Record<FramingType, string> = {
  frontal_catalogo:    "Frontal recto catálogo",
  americano:           "Americano",
  full_body_editorial: "Full body editorial",
  close_up_producto:   "Close-up producto",
  back_view:           "Back view",
  side_view:           "Side view",
  tres_cuartos:        "3/4 pose",
  movimiento_lifestyle: "Movimiento lifestyle",
};

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  clean_studio: "Estudio limpio",
  editorial:    "Editorial",
  urban:        "Urbano",
  lifestyle:    "Lifestyle",
  luxury:       "Lujo",
  minimal:      "Minimalista",
};

export const BACKGROUND_LABELS: Record<BackgroundType, string> = {
  white:         "Blanco",
  light_gray:    "Gris claro",
  black:         "Negro",
  gradient:      "Gradiente",
  outdoor_scene: "Escena exterior",
  indoor_scene:  "Escena interior",
  transparent:   "Transparente",
};

// ── Kids visual profile labels ────────────────────────────────────────────────

export const KIDS_MODEL_TYPE_LABELS: Record<KidsModelType, string> = {
  nino:                "Niño",
  nina:                "Niña",
  bebe_nino:           "Bebé niño",
  bebe_nina:           "Bebé niña",
  unisex_infantil:     "Unisex infantil",
  sin_modelo:          "Sin modelo",
  flat_lay:            "Flat lay",
  maniqui:             "Maniquí",
  producto_ambientado: "Producto ambientado",
};

export const KIDS_AGE_RANGE_LABELS: Record<KidsAgeRange, string> = {
  "0_12m": "0-12 meses",
  "1_3":   "1-3 años",
  "4_6":   "4-6 años",
  "7_9":   "7-9 años",
  "10_12": "10-12 años",
  teen:    "Teen infantil",
};

export const KIDS_VISUAL_TRAIT_LABELS: Record<KidsVisualTrait, string> = {
  latino:               "Latino",
  afro:                 "Afro",
  rubio:                "Rubio",
  moreno:               "Moreno",
  mixto_internacional:  "Mixto internacional",
  personalizado:        "Personalizado",
};

export const KIDS_VISUAL_STYLE_LABELS: Record<KidsVisualStyle, string> = {
  catalogo_comercial: "Catálogo comercial",
  lifestyle_infantil: "Lifestyle infantil",
  escolar:            "Escolar",
  jugueton:           "Juguetón",
  premium_retail:     "Premium retail",
  marketplace:        "Marketplace",
};

export const KIDS_EXPRESSION_LABELS: Record<KidsExpression, string> = {
  sonriente:      "Sonriente",
  natural:        "Natural",
  activo:         "Activo",
  formal_escolar: "Formal escolar",
  neutro_catalogo: "Neutro catálogo",
};

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "1:1":  "Cuadrado 1:1",
  "9:16": "Vertical 9:16",
  "4:5":  "Retrato 4:5",
  "4:3":  "Horizontal 4:3",
  "16:9": "Panorámico 16:9",
};
