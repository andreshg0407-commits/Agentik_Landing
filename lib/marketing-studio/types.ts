/**
 * lib/marketing-studio/types.ts
 *
 * Core type definitions for the Marketing Studio module.
 *
 * ── Separation of concerns ────────────────────────────────────────────────────
 *
 *   Super Admin (this lib):
 *     GarmentFingerprint, GarmentAttributes, PhotoPreset, IntakeRequest,
 *     LucaSubmitPayload — core logic, engine types, preset schema.
 *
 *   Tenant Config (TenantMarketingConfig):
 *     Branding, copy tone, allowed presets, approval rules, Luca channel config.
 *     Both Do Jeans and Castillitos share the same core types; only
 *     TenantMarketingConfig differs per client.
 *
 * ── Module boundary ───────────────────────────────────────────────────────────
 *
 *   Accessible by: SUPER_ADMIN, AGENTIK_ADMIN.
 *   NOT exposed to tenant dashboards directly — tenant-facing surfaces consume
 *   via the adapter in tenant-config.ts.
 */

// ── Garment taxonomy ──────────────────────────────────────────────────────────

export type GarmentCategory =
  | "jeans"
  | "pants"
  | "shorts"
  | "shirt"
  | "blouse"
  | "dress"
  | "skirt"
  | "jacket"
  | "outerwear"
  | "activewear"
  | "accessories"
  | "footwear"
  | "other";

export type GarmentGender   = "men" | "women" | "unisex" | "kids";
export type PriceSegment    = "economy" | "mid" | "premium" | "luxury";

export type FitType =
  | "slim" | "relaxed" | "oversized" | "regular"
  | "skinny" | "wide_leg" | "bootcut" | "straight" | "flared";

export type FabricType =
  | "denim" | "cotton" | "polyester" | "linen"
  | "wool" | "leather" | "synthetic_blend" | "other";

// ── Fidelity mode ─────────────────────────────────────────────────────────────

/**
 * Controls how strictly the AI generator must reproduce garment attributes.
 *   strict:   Non-negotiable detail locks are enforced. Used by Do Jeans.
 *   standard: Artistic latitude allowed. Used by Castillitos and editorial shots.
 */
export type FidelityMode = "strict" | "standard";

// ── Garment detail locks ───────────────────────────────────────────────────────

/**
 * Non-negotiable visual attributes that the AI generator must preserve exactly.
 * Currently modelled for jeans; other categories may add fields in future sprints.
 *
 * In strict mode, pocket + stitching + wash + rise are all required.
 * embellishments must be declared (at least ["none"]) in strict mode.
 *
 * Concrete allowed values are defined in detail-locks.ts so this interface
 * uses string / string[] to avoid a circular type dependency.
 */
export interface GarmentDetailLocks {
  /** e.g. "5-pocket" | "coin-pocket" | "patch" | "flap" | "welt" | "no-pocket" */
  pocket?:          string;
  /** e.g. "contrast-yellow" | "tonal" | "white" | "none" */
  stitching?:       string;
  /** e.g. "raw" | "light-wash" | "mid-wash" | "dark-wash" | "black" */
  wash?:            string;
  /** e.g. "low-rise" | "mid-rise" | "high-rise" | "ultra-high-rise" */
  rise?:            string;
  /** e.g. ["none"] | ["embroidery", "rhinestones"] */
  embellishments?:  string[];
  /**
   * Fastening / closure type.
   * e.g. "single-button" | "double-button" | "triple-button" | "zip-fly" | "hook-and-bar"
   * Structured so the same value can be reused across SKUs.
   */
  hardwareType?:    string;
  /**
   * Finish / material of hardware elements (buttons, rivets, zippers).
   * e.g. "gold" | "silver" | "antique-brass" | "black-nickel" | "copper"
   */
  hardwareFinish?:  string;
  /**
   * Free-text geometry / placement descriptor for embellishments.
   * Injected verbatim into the PRESERVE EXACTLY directive.
   * Use for tribal patterns, custom rhinestone shapes, bead layouts, etc.
   * e.g. "mirrored tribal chevron gold rhinestone motif on both back patch pockets
   *        with inverted triangle lower geometry and zigzag top border,
   *        dense warm-gold stone placement only on pocket surface"
   */
  embellishmentDetail?: string;
  /**
   * Free-text wash elaboration injected after the structured wash value.
   * Use when the structured DenimWash enum is insufficiently specific.
   * e.g. "very dark navy denim finish with deep indigo undertone"
   * When present, replaces the enum-derived wash phrase in the directive.
   */
  washDetail?: string;
  /**
   * Free-text descriptor for hardware placement, orientation, or construction detail.
   * Appended to the hardware phrase in the PRESERVE EXACTLY directive.
   * e.g. "vertical stacked closure at center front waistband"
   */
  hardwareDetail?: string;
}

// ── Garment semantic attributes ───────────────────────────────────────────────

export interface GarmentAttributes {
  category:       GarmentCategory;
  subCategory?:   string;
  /** Normalised colour names, e.g. ["indigo", "black"] */
  colors:         string[];
  /** "solid" | "stripe" | "floral" | "graphic" | "denim_wash" | ... */
  pattern?:       string;
  fabric?:        FabricType;
  fit?:           FitType;
  /** e.g. "A-line" | "straight" | "asymmetric" */
  silhouette?:    string;
  gender:         GarmentGender;
  ageGroup?:      string;
  priceSegment?:  PriceSegment;
  /** ["casual", "streetwear", "office", "evening"] */
  occasion?:      string[];
  /** ["spring", "summer", "fall", "winter"] */
  season?:        string[];
  /** Free-form product descriptors */
  tags?:          string[];
  /**
   * Non-negotiable garment details for strict fidelity mode.
   * Required fields depend on category — see category-requirements.ts.
   * Included in fingerprint hash (v2+) so variants get distinct IDs.
   */
  detailLocks?:   GarmentDetailLocks;
}

// ── Garment fingerprint ───────────────────────────────────────────────────────

/**
 * Deterministic semantic identifier for a garment.
 * The id (16-char hex) is derived from canonicalised attributes so identical
 * garments across tenants produce the same fingerprint core.
 */
export interface GarmentFingerprint {
  /** 16-char hex hash of canonical attributes */
  id:          string;
  tenantId:    string;
  sku?:        string;
  attributes:  GarmentAttributes;
  /** ISO date string */
  computedAt:  string;
  /** Fingerprint schema version — bump when algorithm changes */
  version:     number;
}

// ── Camera and shoot configuration ───────────────────────────────────────────

export type CameraAngle =
  | "front" | "back" | "side_left" | "side_right"
  | "three_quarter" | "detail" | "flat_lay" | "overhead";

export type ShootStyle =
  | "editorial"
  | "lookbook"
  | "ecommerce_clean"
  | "street"
  | "studio_clean"
  | "lifestyle"
  | "flat_lay"
  | "ghost_mannequin";

export interface CameraAngleConfig {
  angle:      CameraAngle;
  required:   boolean;
  /** e.g. "full body", "waist up", "close-up on pocket detail" */
  frameHint?: string;
}

export interface BackgroundConfig {
  type:          "solid_color" | "gradient" | "texture" | "outdoor" | "studio" | "lifestyle_set";
  /** Hex, CSS color name, texture slug, or location description */
  value?:        string;
  alternatives?: string[];
}

export interface LightingConfig {
  setup:         "natural" | "softbox" | "ring" | "dramatic" | "golden_hour" | "white_studio";
  temperature?:  "warm" | "neutral" | "cool";
  shadowPolicy?: "hard" | "soft" | "none";
}

// ── Presets ───────────────────────────────────────────────────────────────────

/**
 * Controls what a tenant is allowed to override within a preset.
 * false = tenant must use the preset default.
 */
export interface PresetOverridePolicy {
  background:  boolean;
  lighting:    boolean;
  angles:      boolean;
  style:       boolean;
  modelGender: boolean;
}

export interface PhotoPreset {
  id:           string;    // e.g. "studio_clean_white"
  name:         string;
  description:  string;
  /** GarmentCategory[] this preset is designed for — empty = universal */
  applicableTo: GarmentCategory[];
  background:   BackgroundConfig;
  lighting:     LightingConfig;
  angles:       CameraAngleConfig[];
  style:        ShootStyle;
  defaultModelGender?: GarmentGender;
  /** Seed language for the generative-AI image prompt */
  aiPromptHint?: string;
  tags:          string[];
  overridePolicy: PresetOverridePolicy;
}

// ── Intake schema ─────────────────────────────────────────────────────────────

export type SocialPlatform   = "tiktok" | "instagram" | "facebook" | "web";
export type ContentObjective = "ventas" | "seguidores" | "likes" | "brand_awareness" | "engagement";
export type ContentTone      = "casual" | "formal" | "playful" | "aspirational" | "informative" | "urgency";
export type IntakePriority   = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type IntakeSource     = "manual" | "bulk" | "api" | "ai_suggested";

/** Tenant-level overrides applied on top of the selected preset */
export interface SessionOverrides {
  /** Allowed only when preset.overridePolicy.background = true */
  background?:  string;
  lighting?:    LightingConfig;
  angles?:      CameraAngle[];
  style?:       ShootStyle;
  modelGender?: GarmentGender;
  props?:       string[];
}

export interface ContentConfig {
  generateCopy:     boolean;
  generateHashtags: boolean;
  targetPlatforms:  SocialPlatform[];
  objective?:       ContentObjective;
  tone?:            ContentTone;
  /** IETF language tag: "es-CO" | "es-MX" | "en-US" */
  locale:           string;
}

export interface PublishingConfig {
  autoPublish:      boolean;
  approvalRequired: boolean;
  /** ISO date string */
  scheduledAt?:     string;
  channels:         SocialPlatform[];
}

export interface IntakeMeta {
  source:      IntakeSource;
  operatorId?: string;
  notes?:      string;
  priority:    IntakePriority;
  /** ISO date string */
  createdAt:   string;
  /** Parent photo session ID when part of a batch */
  sessionId?:  string;
}

/**
 * Canonical intake request — the primary unit of work for Marketing Studio.
 * Created by operators, AI suggestion, or bulk upload.
 * Consumed by: photo pipeline, Luca publish hook, approval workflow.
 */
export interface IntakeRequest {
  requestId:     string;
  tenantId:      string;
  garment:       GarmentFingerprint;
  presetId:      string;
  overrides?:    SessionOverrides;
  content:       ContentConfig;
  publishing?:   PublishingConfig;
  meta:          IntakeMeta;
  /**
   * Per-request fidelity override. Falls back to TenantMarketingConfig.fidelityMode.
   * Only applies when explicitly set — undefined means use tenant default.
   */
  fidelityMode?: FidelityMode;
}

// ── Tenant configuration ──────────────────────────────────────────────────────

export interface BrandVoiceConfig {
  tones:             ContentTone[];
  /** e.g. ["bold", "urban", "youthful"] */
  adjectives:        string[];
  avoidWords:        string[];
  signatureHashtags: string[];
  /** Short example phrases that calibrate AI copy style */
  copySampleHints:   string[];
}

export interface ApprovalRuleConfig {
  requireApproval:    boolean;
  /** Preset IDs that bypass the approval queue */
  autoApprovePresets: string[];
}

export interface LucaIntegrationConfig {
  /** Matches client_id in /api/luca/submit — e.g. "do-jeans" */
  clientId:         string;
  defaultPlatforms: SocialPlatform[];
  defaultObjective: ContentObjective;
  autoPublish:      boolean;
  promptMode:       "coach" | "direct";
}

/**
 * Per-tenant marketing studio configuration.
 * Owned and edited by AGENTIK_ADMIN / SUPER_ADMIN only.
 * Tenant-facing surfaces consume a read-only projection of this.
 */
export interface TenantMarketingConfig {
  tenantId:    string;
  tenantName:  string;
  /** Routing slug — matches the org slug in the platform, e.g. "do-jeans" */
  tenantSlug:  string;
  active:      boolean;
  brandVoice:  BrandVoiceConfig;
  defaultPresetId:  string;
  /** Whitelist of preset IDs from the global registry */
  allowedPresets:   string[];
  approvalRules:    ApprovalRuleConfig;
  luca:             LucaIntegrationConfig;
  /** Maps tenant ERP category strings to canonical GarmentCategory */
  categoryAliases?: Record<string, GarmentCategory>;
  /**
   * Default fidelity mode for this tenant.
   * Do Jeans = "strict" (garment identity must be product-accurate).
   * Castillitos = "standard" (editorial latitude allowed).
   */
  fidelityMode:     FidelityMode;
}

// ── Luca bridge payload ───────────────────────────────────────────────────────

/**
 * Subset of the /api/luca/submit FormData fields.
 * Re-typed here so the Luca hook builder is statically checked against the API.
 */
export interface LucaSubmitPayload {
  post_type:        "video" | "image";
  objective:        ContentObjective;
  description:      string;
  optimize:         boolean;
  hashtags:         { mode: "auto" } | { mode: "custom"; values: string[] };
  copy:             { mode: "auto" } | { mode: "custom"; value: string };
  generation_type:  "text-to-video" | "image-to-video";
  aspect_ratio:     "9:16" | "16:9";
  duration_seconds: 8 | 12;
  prompt_mode:      "coach" | "direct";
  client_id?:       string;
}

// ── Validation result ─────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:   boolean;
  errors:  string[];
}
