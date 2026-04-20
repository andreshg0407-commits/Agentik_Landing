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

/** Type of garment being photographed */
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
 * Brand line — determines model aesthetic and mood.
 * luxury: curvy latina, levanta cola silhouette, sensual elegance.
 * casual: urban, relaxed, approachable.
 */
export type BrandLine = "luxury" | "casual";

/** For social_photo — drives framing, composition, aspect ratio and pose */
export type SocialPublicationType = "feed" | "reel" | "story";

export interface FotoEstudioSettings {
  frontImageUrl?:         string;
  backImageUrl?:          string;
  detail1Url?:            string;
  detail2Url?:            string;
  referenceImageUrl?:     string;   // for custom_template — style reference
  sku?:                   string;
  selectedOutputs:        FotoOutputType[];
  visualStyle:            VisualStyle;
  background:             BackgroundType;
  aspectRatio:            AspectRatio;
  quantity:               number;   // variants per output type, 1–4
  garmentType:            GarmentType;
  brandLine:              BrandLine;
  socialPublicationType?: SocialPublicationType;  // only for social_photo
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

export const BRAND_LINE_LABELS: Record<BrandLine, string> = {
  luxury: "Luxury",
  casual: "Casual",
};

export const BRAND_LINE_DESCRIPTIONS: Record<BrandLine, string> = {
  luxury: "Modelo voluptuosa, estética latina premium, levanta cola.",
  casual: "Modelo urbana, look relajado y cotidiano.",
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

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "1:1":  "Cuadrado 1:1",
  "9:16": "Vertical 9:16",
  "4:5":  "Retrato 4:5",
  "4:3":  "Horizontal 4:3",
  "16:9": "Panorámico 16:9",
};
