/**
 * lib/marketing-studio/tenant-config.ts
 *
 * Tenant profile adapter for Marketing Studio.
 *
 * ── What lives here ───────────────────────────────────────────────────────────
 *
 *   • Built-in TenantMarketingConfig objects for each onboarded tenant.
 *   • Registry map + lookup helpers.
 *   • A pure applyTenantOverrides() function that merges a preset with any
 *     tenant-level overrides respecting the preset's PresetOverridePolicy.
 *
 * ── What does NOT live here ───────────────────────────────────────────────────
 *
 *   • Client business data (sales, cartera, campaigns) — tenant modules only.
 *   • Authentication / RBAC — lib/auth.
 *   • Luca publish logic — lib/marketing-studio/luca-hooks.ts.
 *
 * ── Adding a new tenant ───────────────────────────────────────────────────────
 *
 *   1. Create a const TenantMarketingConfig below.
 *   2. Add it to ALL_TENANT_CONFIGS array.
 *   That's it — no migrations, no DB writes.
 */

import type {
  TenantMarketingConfig,
  PhotoPreset,
  SessionOverrides,
  GarmentCategory,
} from "./types";
import { getPreset } from "./preset-registry";

// ── Tenant: Do Jeans ──────────────────────────────────────────────────────────

export const DO_JEANS_CONFIG: TenantMarketingConfig = {
  tenantId:   "do-jeans",
  tenantName: "Do Jeans",
  tenantSlug: "do-jeans",
  active:     true,

  brandVoice: {
    tones:      ["playful", "casual", "aspirational"],
    adjectives: ["bold", "urban", "youthful", "auténtico", "irreverente"],
    avoidWords: ["lujoso", "exclusivo", "premium", "formal"],
    signatureHashtags: [
      "#DoJeans", "#DenimLife", "#StreetStyle", "#ColombianFashion",
      "#MadaInColombia", "#Denim", "#VaquerosColombia",
    ],
    copySampleHints: [
      "Tu estilo, sin reglas.",
      "Hecho para moverse contigo.",
      "Auténtico desde el primer wash.",
      "Denim que habla solo.",
    ],
  },

  defaultPresetId: "editorial_urban",
  allowedPresets:  ["editorial_urban", "studio_clean_white", "lifestyle_street"],

  approvalRules: {
    requireApproval:    false,
    autoApprovePresets: ["studio_clean_white"],
  },

  luca: {
    clientId:         "do-jeans",
    defaultPlatforms: ["tiktok", "instagram"],
    defaultObjective: "ventas",
    autoPublish:      false,
    promptMode:       "coach",
  },

  categoryAliases: {
    "VAQUERO":    "jeans",
    "JEAN":       "jeans",
    "PANTALON":   "pants",
    "CHAQUETA":   "jacket",
    "CAMISA":     "shirt",
    "BERMUDA":    "shorts",
  },

  /**
   * Strict mode — garment identity must be product-accurate.
   * Detail locks (pocket, stitching, wash, rise, embellishments) are
   * all required for jeans intakes. No artistic latitude on the garment itself.
   */
  fidelityMode: "strict",
};

// ── Tenant: Castillitos ───────────────────────────────────────────────────────

export const CASTILLITOS_CONFIG: TenantMarketingConfig = {
  tenantId:   "castillitos",
  tenantName: "Castillitos",
  tenantSlug: "castillitos",
  active:     true,

  brandVoice: {
    tones:      ["casual", "aspirational", "informative"],
    adjectives: ["elegante", "versátil", "colombiano", "moderno", "accesible"],
    avoidWords: ["barato", "económico"],
    signatureHashtags: [
      "#Castillitos", "#ModaColombia", "#EstiloPropio",
      "#ColombianStyle", "#MarcaLocal",
    ],
    copySampleHints: [
      "Elegancia que se siente desde adentro.",
      "Para cada momento, un estilo.",
      "Calidad colombiana que se nota.",
      "Diseñado para ti, hecho en Colombia.",
    ],
  },

  defaultPresetId: "studio_clean_white",
  allowedPresets:  [
    "studio_clean_white",
    "lookbook_neutral",
    "lifestyle_street",
    "flat_lay_minimal",
  ],

  approvalRules: {
    requireApproval:    true,
    autoApprovePresets: ["flat_lay_minimal"],
  },

  luca: {
    clientId:         "castillitos",
    defaultPlatforms: ["tiktok", "instagram"],
    defaultObjective: "brand_awareness",
    autoPublish:      false,
    promptMode:       "coach",
  },

  categoryAliases: {
    "BLUSA":     "blouse",
    "VESTIDO":   "dress",
    "FALDA":     "skirt",
    "PANTALON":  "pants",
    "CAMISA":    "shirt",
    "CHAQUETA":  "jacket",
    "ACCESORIO": "accessories",
  },

  /**
   * Standard mode — editorial latitude allowed.
   * AI generator may exercise artistic freedom with backgrounds and styling.
   * Detail locks not enforced.
   */
  fidelityMode: "standard",
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const ALL_TENANT_CONFIGS: readonly TenantMarketingConfig[] = [
  DO_JEANS_CONFIG,
  CASTILLITOS_CONFIG,
] as const;

export const TENANT_CONFIG_MAP: ReadonlyMap<string, TenantMarketingConfig> = new Map(
  ALL_TENANT_CONFIGS.map(c => [c.tenantId, c]),
);

// ── Lookups ────────────────────────────────────────────────────────────────────

/** Returns the config for a tenant, or null if not found. */
export function getTenantConfig(tenantId: string): TenantMarketingConfig | null {
  return TENANT_CONFIG_MAP.get(tenantId) ?? null;
}

/** Returns only active tenant configs. */
export function getActiveTenantConfigs(): TenantMarketingConfig[] {
  return ALL_TENANT_CONFIGS.filter(c => c.active);
}

// ── Preset resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the effective PhotoPreset for an intake request, applying any
 * tenant-level overrides permitted by the preset's PresetOverridePolicy.
 *
 * Returns null when the preset is not found or the tenant is not allowed
 * to use it.
 */
export function resolveEffectivePreset(
  presetId:  string,
  config:    TenantMarketingConfig,
  overrides?: SessionOverrides,
): PhotoPreset | null {
  if (!config.allowedPresets.includes(presetId)) return null;
  const preset = getPreset(presetId);
  if (!preset) return null;
  if (!overrides) return preset;

  // Deep-clone so the registry object is never mutated
  const effective: PhotoPreset = {
    ...preset,
    background: { ...preset.background },
    lighting:   { ...preset.lighting },
    angles:     [...preset.angles],
  };

  if (overrides.background && preset.overridePolicy.background) {
    effective.background = { ...preset.background, value: overrides.background };
  }
  if (overrides.lighting && preset.overridePolicy.lighting) {
    effective.lighting = { ...preset.lighting, ...overrides.lighting };
  }
  if (overrides.style && preset.overridePolicy.style) {
    effective.style = overrides.style;
  }
  if (overrides.modelGender && preset.overridePolicy.modelGender) {
    effective.defaultModelGender = overrides.modelGender;
  }
  if (overrides.angles && preset.overridePolicy.angles) {
    // Merge: keep required angles, replace optional with overrides
    const required = preset.angles.filter(a => a.required);
    const extras   = overrides.angles
      .filter(a => !required.some(r => r.angle === a))
      .map(a => ({ angle: a, required: false as const }));
    effective.angles = [...required, ...extras];
  }

  return effective;
}

// ── Category alias resolution ─────────────────────────────────────────────────

/**
 * Resolves a tenant-specific ERP category string to the canonical GarmentCategory.
 * Falls back to "other" when no alias matches.
 */
export function resolveCategory(
  erpCategory: string,
  config:      TenantMarketingConfig,
): GarmentCategory {
  const aliases = config.categoryAliases ?? {};
  const upper   = erpCategory.trim().toUpperCase();
  return (aliases[upper] ?? aliases[erpCategory] ?? "other") as GarmentCategory;
}
