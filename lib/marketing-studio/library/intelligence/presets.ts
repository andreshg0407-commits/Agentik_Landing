/**
 * lib/marketing-studio/library/intelligence/presets.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Search / filter presets — named, reusable intelligent filters for the Biblioteca.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   Operators don't think in technical query parameters.
 *   They think in operational questions:
 *
 *     "Show me what's ready for WhatsApp"
 *     "Show me what's approved but never been used"
 *     "Show me what needs review"
 *     "Show me new arrivals from this week"
 *     "Show me the catalog-ready assets"
 *     "Show me high-performing assets for Instagram"
 *
 *   Presets translate these intentions into AssetQuery objects.
 *   They are the primary discovery mechanism for operators in the Biblioteca UI.
 *
 * ── MULTI-TENANT ─────────────────────────────────────────────────────────────
 *
 *   Some presets are universal (all tenants).
 *   Some are tenant-specific (e.g. "Shopify Ready" only for Shopify-enabled tenants).
 *   The TenantMarketingConfig controls which presets are active per tenant.
 */

import type { AssetChannel } from "../types";
import type { AssetQuery, QueryIntent } from "./queries";

// ── Preset identity ────────────────────────────────────────────────────────────

/**
 * SearchPresetId — the canonical identifier for each preset.
 */
export type SearchPresetId =
  | "whatsapp_ready"
  | "shopify_ready"
  | "ads_ready"
  | "catalog_ready"
  | "social_ready"
  | "recently_approved"
  | "new_arrivals"
  | "pending_review"
  | "never_used"
  | "missing_variants"
  | "high_performers"
  | "stale_assets"
  | "all_approved"
  | "all_generated"
  | "for_luca"
  | "for_mila";

// ── Preset definition ─────────────────────────────────────────────────────────

/**
 * SearchPreset — a named, reusable query preset for the Biblioteca.
 *
 * Displayed in the Biblioteca filter rail and quick-access toolbar.
 */
export interface SearchPreset {
  id:          SearchPresetId;
  /** Display label. Short — fits in a pill/chip. */
  label:       string;
  /** Longer description for tooltip / onboarding. */
  description: string;
  /**
   * Icon name (from the design system icon set).
   * Corresponds to icons in components/shell/primitives.tsx or Lucide.
   */
  icon?:       string;
  /**
   * Visual accent color class (ag-* token-based).
   * Used to tint the preset chip in the UI.
   */
  accent?:     "blue" | "green" | "amber" | "red" | "purple" | "gray";
  /**
   * Whether this preset is gated to a specific tenant capability.
   * If set, the Biblioteca checks TenantMarketingConfig before showing it.
   */
  requiredCapability?: "shopify" | "whatsapp" | "ads" | "catalogs";
  /**
   * Whether this preset is always shown regardless of tenant config.
   * Universal presets: pending_review, recently_approved, new_arrivals, etc.
   */
  universal:   boolean;
}

// ── Preset registry ────────────────────────────────────────────────────────────

/**
 * SEARCH_PRESETS — the complete registry of Biblioteca search presets.
 */
export const SEARCH_PRESETS: Record<SearchPresetId, SearchPreset> = {

  whatsapp_ready: {
    id:                  "whatsapp_ready",
    label:               "Listos para WhatsApp",
    description:         "Assets aprobados, habilitados para WhatsApp y con metadata completa.",
    icon:                "MessageCircle",
    accent:              "green",
    requiredCapability:  "whatsapp",
    universal:           false,
  },

  shopify_ready: {
    id:                  "shopify_ready",
    label:               "Listos para Shopify",
    description:         "Assets aprobados, habilitados para Shopify, con imagen de alta resolución.",
    icon:                "ShoppingBag",
    accent:              "green",
    requiredCapability:  "shopify",
    universal:           false,
  },

  ads_ready: {
    id:                  "ads_ready",
    label:               "Listos para Ads",
    description:         "Assets aprobados, formato compatible con Meta Ads / TikTok Ads.",
    icon:                "Megaphone",
    accent:              "purple",
    requiredCapability:  "ads",
    universal:           false,
  },

  catalog_ready: {
    id:                  "catalog_ready",
    label:               "Listos para Catálogo",
    description:         "Assets aprobados, alta resolución, habilitados para catálogo.",
    icon:                "BookOpen",
    accent:              "blue",
    requiredCapability:  "catalogs",
    universal:           false,
  },

  social_ready: {
    id:                  "social_ready",
    label:               "Listos para Redes",
    description:         "Assets aprobados, formato compatible con feed de Instagram / TikTok.",
    icon:                "Instagram",
    accent:              "purple",
    universal:           true,
  },

  recently_approved: {
    id:          "recently_approved",
    label:       "Recién Aprobados",
    description: "Assets aprobados en los últimos 7 días.",
    icon:        "CheckCircle",
    accent:      "green",
    universal:   true,
  },

  new_arrivals: {
    id:          "new_arrivals",
    label:       "Nuevos Ingresos",
    description: "Assets generados o subidos en los últimos 3 días.",
    icon:        "Sparkles",
    accent:      "blue",
    universal:   true,
  },

  pending_review: {
    id:          "pending_review",
    label:       "Pendientes de Revisión",
    description: "Assets generados o enviados a revisión que necesitan aprobación.",
    icon:        "Clock",
    accent:      "amber",
    universal:   true,
  },

  never_used: {
    id:          "never_used",
    label:       "Sin Usar",
    description: "Assets aprobados que nunca han sido publicados en ningún canal.",
    icon:        "Archive",
    accent:      "gray",
    universal:   true,
  },

  missing_variants: {
    id:          "missing_variants",
    label:       "Sin Variantes",
    description: "Assets aprobados que no tienen variantes de canal creadas.",
    icon:        "Layers",
    accent:      "amber",
    universal:   true,
  },

  high_performers: {
    id:          "high_performers",
    label:       "Alto Rendimiento",
    description: "Assets con 10+ usos o publicados en 5+ canales.",
    icon:        "TrendingUp",
    accent:      "green",
    universal:   true,
  },

  stale_assets: {
    id:          "stale_assets",
    label:       "Activos Obsoletos",
    description: "Assets aprobados que no han sido usados en más de 90 días.",
    icon:        "AlertTriangle",
    accent:      "amber",
    universal:   true,
  },

  all_approved: {
    id:          "all_approved",
    label:       "Todos Aprobados",
    description: "Vista completa de todos los assets aprobados y publicados.",
    icon:        "Grid",
    accent:      "blue",
    universal:   true,
  },

  all_generated: {
    id:          "all_generated",
    label:       "Generados",
    description: "Assets generados pendientes de revisión o proceso.",
    icon:        "Zap",
    accent:      "gray",
    universal:   true,
  },

  for_luca: {
    id:          "for_luca",
    label:       "Vista de Luca",
    description: "Vista de assets reutilizables para el agente Luca — aprobados con alto uso.",
    icon:        "Bot",
    accent:      "purple",
    universal:   true,
  },

  for_mila: {
    id:          "for_mila",
    label:       "Vista de Mila",
    description: "Vista de assets que Mila puede enviar a clientes — WhatsApp + aprobados.",
    icon:        "MessageSquare",
    accent:      "green",
    universal:   true,
  },

};

// ── Query builders ─────────────────────────────────────────────────────────────

/**
 * buildPresetQuery — translates a SearchPresetId into an AssetQuery.
 *
 * Called by the Biblioteca UI when the operator selects a preset chip.
 */
export function buildPresetQuery(
  presetId: SearchPresetId,
  tenantId: string,
  opts?: { limit?: number },
): AssetQuery {
  const limit = opts?.limit ?? 40;
  const now   = new Date().toISOString();

  switch (presetId) {

    case "whatsapp_ready":
      return {
        tenantId, limit,
        intent:    "whatsapp",
        statuses:  ["approved", "published"],
        channels:  ["whatsapp"],
        sortBy:    "usage",
      };

    case "shopify_ready":
      return {
        tenantId, limit,
        intent:    "shopify",
        statuses:  ["approved", "published"],
        channels:  ["shopify"],
        sortBy:    "recent",
      };

    case "ads_ready":
      return {
        tenantId, limit,
        intent:    "ads",
        statuses:  ["approved", "published"],
        channels:  ["ads"],
        sortBy:    "performance",
      };

    case "catalog_ready":
      return {
        tenantId, limit,
        intent:    "catalog",
        statuses:  ["approved"],
        channels:  ["catalog"],
        sortBy:    "relevance",
      };

    case "social_ready":
      return {
        tenantId, limit,
        intent:    "social",
        statuses:  ["approved", "published"],
        channels:  ["instagram", "facebook", "tiktok"] as AssetChannel[],
        sortBy:    "usage",
      };

    case "recently_approved":
      return {
        tenantId, limit,
        statuses:      ["approved"],
        approvedAfter: sevenDaysAgo(now),
        sortBy:        "recent",
        intent:        "explore",
      };

    case "new_arrivals":
      return {
        tenantId, limit,
        createdAfter: threeDaysAgo(now),
        sortBy:       "recent",
        intent:       "explore",
      };

    case "pending_review":
      return {
        tenantId, limit,
        intent:   "review",
        statuses: ["generated", "review_pending"],
        sortBy:   "recent",
      };

    case "never_used":
      return {
        tenantId, limit,
        statuses:      ["approved"],
        minUsageCount: 0,
        sortBy:        "freshness",
        intent:        "explore",
      };

    case "missing_variants":
      return {
        tenantId, limit,
        statuses:    ["approved"],
        hasVariants: false,
        sortBy:      "recent",
        intent:      "explore",
      };

    case "high_performers":
      return {
        tenantId, limit,
        statuses:      ["approved", "published"],
        minUsageCount: 10,
        sortBy:        "usage",
        intent:        "explore",
      };

    case "stale_assets":
      return {
        tenantId, limit,
        statuses: ["approved"],
        sortBy:   "freshness",
        intent:   "explore",
        // Note: stale detection happens post-query from usage insights
      };

    case "all_approved":
      return {
        tenantId, limit,
        statuses: ["approved", "published"],
        sortBy:   "recent",
        intent:   "explore",
      };

    case "all_generated":
      return {
        tenantId, limit,
        statuses: ["generated"],
        sortBy:   "recent",
        intent:   "explore",
      };

    case "for_luca":
      return {
        tenantId, limit,
        intent:        "luca",
        statuses:      ["approved", "published"],
        minUsageCount: 2,
        sortBy:        "usage",
      };

    case "for_mila":
      return {
        tenantId, limit,
        intent:   "mila",
        statuses: ["approved", "published"],
        channels: ["whatsapp"],
        sortBy:   "usage",
      };

    default:
      return {
        tenantId, limit,
        statuses: ["approved"],
        sortBy:   "recent",
        intent:   "explore",
      };
  }
}

/**
 * getActivePresets — returns the presets available for a tenant.
 *
 * Filters out capability-gated presets based on the tenant's active capabilities.
 */
export function getActivePresets(
  capabilities: Array<"shopify" | "whatsapp" | "ads" | "catalogs">,
): SearchPreset[] {
  return (Object.values(SEARCH_PRESETS) as SearchPreset[]).filter(p => {
    if (p.universal) return true;
    if (!p.requiredCapability) return true;
    return capabilities.includes(p.requiredCapability);
  });
}

/**
 * getPresetsByAccent — returns all presets of a specific accent color.
 * Useful for grouping presets in the UI (green = ready, amber = needs attention).
 */
export function getPresetsByAccent(
  accent: SearchPreset["accent"],
): SearchPreset[] {
  return (Object.values(SEARCH_PRESETS) as SearchPreset[]).filter(p => p.accent === accent);
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function sevenDaysAgo(now: string): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function threeDaysAgo(now: string): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 3);
  return d.toISOString();
}
