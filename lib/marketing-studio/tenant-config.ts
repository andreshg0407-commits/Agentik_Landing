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
import { prisma }    from "@/lib/prisma";

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

  fotoEstudio: {
    defaultBrandLine:   "luxury",
    defaultGarmentType: "jean",
  },

  shopify: {
    vendor:       "Do Jeans",
    productType:  "Jeans",
    defaultTags:  ["jeans", "denim", "do-jeans", "moda-colombiana"],
    productBlurb: "Denim colombiano de alta calidad. Fabricado en Colombia con los mejores materiales.",
  },
};

// ── Tenant: Castillitos ───────────────────────────────────────────────────────
//
// Retail Kids + Toys + Growth Engine.
// Focused on kids fashion, toys, school supplies, and seasonal retail campaigns.
// Supports all business lines: Castillitos, Latin Kids, Importación, Pets.
// Channels: Empresa (B2B), Mayoristas, Tiendas, Web.

export const CASTILLITOS_CONFIG: TenantMarketingConfig = {
  tenantId:   "castillitos",
  tenantName: "Castillitos",
  tenantSlug: "castillitos",
  active:     true,

  brandVoice: {
    tones:      ["playful", "casual", "informative", "urgency"],
    adjectives: [
      "colorido", "divertido", "familiar", "colombiano",
      "seguro", "accesible", "infantil", "festivo",
    ],
    avoidWords: ["aburrido", "genérico", "básico", "ordinario"],
    signatureHashtags: [
      // Brand
      "#Castillitos", "#CastillitosKids",
      // Retail kids
      "#ModaInfantil", "#RopaParaNiños", "#JuguetesColombia",
      // Local
      "#HechoEnColombia", "#ModaColombia", "#TiendaInfantil",
      // Campaign rotating (managed per-preset/copilot)
      "#RegresoAClases", "#DiadelNiño", "#NavidadCastillitos",
    ],
    copySampleHints: [
      // Retail / products
      "Para los pequeños grandes aventureros.",
      "Colores que cuentan historias.",
      "Tu niño, su estilo.",
      // Seasonal
      "Regreso a clases listo con Castillitos.",
      "El regalo perfecto para este día especial.",
      "Esta temporada viste diferente.",
      // Promo
      "Calidad que los papás confían.",
      "Diversión garantizada desde el primer uso.",
    ],
  },

  defaultPresetId: "catalogo_fondo_blanco",
  allowedPresets:  [
    // Catálogo (core e-commerce)
    "catalogo_fondo_blanco",
    "catalogo_ecommerce",
    "catalogo_promo_producto",
    "catalogo_juguete",
    // Redes sociales
    "redes_reel_tiktok",
    "redes_promo_instagram",
    "redes_oferta_flash",
    "redes_combo_escolar",
    "redes_regreso_clases",
    "redes_dia_nino",
    "redes_navidad",
    // Campañas comerciales
    "campana_lanzamiento",
    "campana_outlet",
    "campana_mayoristas",
    "campana_tienda_fisica",
    "campana_web",
    "campana_activacion",
    // Legacy / utility
    "studio_clean_white",
    "lookbook_neutral",
    "flat_lay_minimal",
    "lifestyle_street",
  ],

  approvalRules: {
    requireApproval:    true,
    autoApprovePresets: [
      "catalogo_fondo_blanco",
      "flat_lay_minimal",
      "campana_mayoristas",   // B2B catalogue — low-risk auto-approve
    ],
  },

  luca: {
    clientId:         "castillitos",
    defaultPlatforms: ["tiktok", "instagram"],
    defaultObjective: "ventas",
    autoPublish:      false,
    promptMode:       "coach",
  },

  categoryAliases: {
    // Ropa infantil
    "ROPA NIÑOS":    "kids_clothing",
    "ROPA NIÑAS":    "kids_clothing",
    "ROPA INFANTIL": "kids_clothing",
    "CONJUNTO":      "kids_clothing",
    "UNIFORME":      "kids_clothing",
    "PIJAMA":        "kids_clothing",
    // Juguetes
    "JUGUETE":       "toy",
    "JUGUETES":      "toy",
    "MUÑECA":        "toy",
    "PELUCHE":       "toy",
    // Útiles escolares
    "UTILES":        "school_supplies",
    "ÚTILES":        "school_supplies",
    "MOCHILA":       "school_supplies",
    "PAPELERÍA":     "school_supplies",
    // Bebé
    "BEBE":          "baby",
    "BEBÉ":          "baby",
    "ROPA BEBE":     "baby",
    // Accesorios
    "ACCESORIO":     "accessories",
    "ACCESORIOS":    "accessories",
    "CALZADO":       "footwear",
    // Latin Kids brand (same categories, flagged by businessLine at source-rules level)
    "LATIN KIDS":    "kids_clothing",
    "LK":            "kids_clothing",
    // Generic fallbacks
    "OTROS":         "other",
    "VARIOS":        "other",
  },

  /**
   * Standard mode — editorial latitude allowed.
   * No detail locks required. AI can exercise creative freedom within preset.
   */
  fidelityMode: "standard",

  fotoEstudio: {
    defaultBrandLine:        "kids_fun",
    // Retail path — uses productCategory, not garmentType.
    defaultProductCategory:  "ropa_nino",
  },

  // shopify intentionally absent: Castillitos does not use Shopify publishing.
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const ALL_TENANT_CONFIGS: readonly TenantMarketingConfig[] = [
  DO_JEANS_CONFIG,
  CASTILLITOS_CONFIG,
] as const;

export const TENANT_CONFIG_MAP: ReadonlyMap<string, TenantMarketingConfig> = new Map(
  ALL_TENANT_CONFIGS.map(c => [c.tenantId, c]),
);

// ── Lookups (code-level fallback) ─────────────────────────────────────────────

/** Returns the code-level config for a tenant slug, or null if not found. */
export function getTenantConfig(tenantId: string): TenantMarketingConfig | null {
  return TENANT_CONFIG_MAP.get(tenantId) ?? null;
}

/** Returns only active tenant configs from the code-level registry. */
export function getActiveTenantConfigs(): TenantMarketingConfig[] {
  return ALL_TENANT_CONFIGS.filter(c => c.active);
}

// ── DB-backed lookups ──────────────────────────────────────────────────────────

/**
 * Returns the TenantMarketingConfig for an org from the DB.
 * Falls back to the code-level registry (keyed by orgSlug) for existing tenants
 * that predate the DB migration.
 *
 * Prefer this over getTenantConfig() for all new code paths.
 */
export async function getDBTenantConfig(
  organizationId: string,
  orgSlug?: string,
): Promise<TenantMarketingConfig | null> {
  const row = await (prisma as any).tenantMarketingConfig.findUnique({
    where: { organizationId },
    select: { configJson: true, active: true },
  });
  if (row) {
    return row.active ? (row.configJson as TenantMarketingConfig) : null;
  }
  // Fallback: code-level registry, keyed by slug
  if (orgSlug) return getTenantConfig(orgSlug);
  return null;
}

/**
 * Returns the promptEngine key for an org.
 * Used by the foto-estudio generate route to dispatch to the correct
 * prompt builder without hardcoding tenant slugs.
 *
 * Values: "kids_product" | "fashion_adult" | "generic"
 */
export async function getOrgPromptEngine(
  organizationId: string,
  orgSlug?: string,
): Promise<string> {
  const row = await (prisma as any).tenantMarketingConfig.findUnique({
    where: { organizationId },
    select: { promptEngine: true, active: true },
  });
  if (row?.active) return row.promptEngine as string;

  // Fallback: infer from code-level config (castillitos → kids_product)
  if (orgSlug) {
    const code = getTenantConfig(orgSlug);
    if (code) {
      if (orgSlug === "castillitos") return "kids_product";
      if (orgSlug === "do-jeans")   return "fashion_adult";
    }
  }
  return "generic";
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
