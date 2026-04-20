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

export interface FotoEstudioSettings {
  frontImageUrl?:    string;
  backImageUrl?:     string;
  detail1Url?:       string;
  detail2Url?:       string;
  sku?:              string;
  selectedOutputs:   FotoOutputType[];
  visualStyle:       VisualStyle;
  background:        BackgroundType;
  aspectRatio:       AspectRatio;
  quantity:          number;   // variants per output type, 1–4
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
