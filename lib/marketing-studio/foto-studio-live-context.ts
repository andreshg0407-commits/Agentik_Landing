/**
 * lib/marketing-studio/foto-studio-live-context.ts
 *
 * Types for the live reactive context emitted by FotoEstudioWizard.
 * Consumed by: FotoEstudioWizard (onContextUpdate — for future global Copilot wiring).
 *
 * Sprint: AGENTIK-MARKETING-FOTOESTUDIO-COPILOT-LIVE-01
 */

export type WizardStepId =
  | "intent"
  | "source"
  | "configuration"
  | "generation";

export type GenerationIntentId =
  | "product_photo"
  | "social_photo"
  | "social_video"
  | "creative_template";

/**
 * Snapshot of wizard state emitted on every relevant change.
 * Used by the Luca live panel to compute contextual intelligence.
 */
export interface FotoStudioLiveState {
  // Navigation
  currentStep:      WizardStepId;
  tenantId:         string;

  // Intent
  intent:           GenerationIntentId | null;

  // Product identity
  productCategory:  string;   // ProductCategory enum value
  brandLine:        string;   // BrandLine enum value
  sku:              string;

  // Visual settings
  background:       string;   // BackgroundType enum value
  aspectRatio:      string;   // AspectRatio enum value
  visualStyle:      string;   // VisualStyle enum value

  // Kids profile (Castillitos)
  kidsModelType:    string;   // KidsModelType enum value
  kidsAgeRange:     string;   // KidsAgeRange enum value
  kidsVisualStyle:  string;   // KidsVisualStyle enum value

  // Social photo
  socialChannel:    string;
  socialPubType:    string;

  // Video
  videoType:        string;
  videoDuration:    string;

  // Templates
  pieceType:        string;

  // AI direction
  freePrompt:       string;

  // Upload state
  imageCount:       number;   // 0–4: how many angles have been uploaded
}

/** Default/initial state — represents a fresh session. */
export const FOTO_STUDIO_INITIAL_STATE: FotoStudioLiveState = {
  currentStep:     "intent",
  tenantId:        "",
  intent:          null,
  productCategory: "ropa_nino",
  brandLine:       "casual",
  sku:             "",
  background:      "white",
  aspectRatio:     "1:1",
  visualStyle:     "clean_studio",
  kidsModelType:   "sin_modelo",
  kidsAgeRange:    "4_6",
  kidsVisualStyle: "catalogo_comercial",
  socialChannel:   "",
  socialPubType:   "",
  videoType:       "",
  videoDuration:   "",
  pieceType:       "",
  freePrompt:      "",
  imageCount:      0,
};
