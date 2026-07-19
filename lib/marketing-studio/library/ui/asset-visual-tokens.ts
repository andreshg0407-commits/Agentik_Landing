/**
 * lib/marketing-studio/library/ui/asset-visual-tokens.ts
 *
 * MS-04A.1 — Biblioteca Asset Visual Language System
 *
 * Single source of truth for every visual decision in the Biblioteca.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - All colors reference C.* from lib/ui/tokens (no raw hex)
 *   - No JSX, no React imports — pure TypeScript constants + helpers
 *   - Consumed by: asset-card.tsx, channel-badge.tsx, any future asset views
 *
 * ── SEMANTICS ─────────────────────────────────────────────────────────────────
 *   Score       — operational relevance (excellent / strong / medium / weak)
 *   Status      — lifecycle state (approved / review_pending / generated / archived / rejected)
 *   Channel     — destination readiness (shopify / whatsapp / instagram / ...)
 *   Thumbnail   — aspect ratio per asset type
 *   Card States — operational context overlays (stale / high_performer / duplicate_risk)
 */

import { C } from "@/lib/ui/tokens";

// ── Score tiers ────────────────────────────────────────────────────────────────

export type AssetScoreTier = "excellent" | "strong" | "medium" | "weak";

export interface ScoreTierConfig {
  tier:    AssetScoreTier;
  label:   string;
  /** Inclusive lower bound (0–1). */
  min:     number;
  color:   string;
  surface: string;
  border:  string;
  /** Dot color for inline score indicators. */
  dot:     string;
}

/**
 * ASSET_SCORE_TIERS — semantic score classification.
 *
 * excellent: ≥ 0.80  — ready for primary channel use
 * strong:    ≥ 0.60  — solid, minor gaps possible
 * medium:    ≥ 0.40  — acceptable but needs improvement
 * weak:      < 0.40  — incomplete metadata or low usage
 */
export const ASSET_SCORE_TIERS: Record<AssetScoreTier, ScoreTierConfig> = {
  excellent: {
    tier:    "excellent",
    label:   "Excelente",
    min:     0.80,
    color:   C.green,
    surface: C.greenLight,
    border:  C.greenBorder,
    dot:     C.green,
  },
  strong: {
    tier:    "strong",
    label:   "Sólido",
    min:     0.60,
    color:   C.blueDark,
    surface: C.blueLight,
    border:  C.blueBorder,
    dot:     C.blueDark,
  },
  medium: {
    tier:    "medium",
    label:   "Aceptable",
    min:     0.40,
    color:   C.amberMid,
    surface: C.amberLight,
    border:  C.amberBorder,
    dot:     C.amber,
  },
  weak: {
    tier:    "weak",
    label:   "Bajo",
    min:     0.00,
    color:   C.inkFaint,
    surface: C.surface,
    border:  C.line,
    dot:     C.inkGhost,
  },
};

/**
 * resolveScoreTier — returns the ScoreTierConfig for a given 0–1 score.
 */
export function resolveScoreTier(score: number): ScoreTierConfig {
  if (score >= ASSET_SCORE_TIERS.excellent.min) return ASSET_SCORE_TIERS.excellent;
  if (score >= ASSET_SCORE_TIERS.strong.min)   return ASSET_SCORE_TIERS.strong;
  if (score >= ASSET_SCORE_TIERS.medium.min)   return ASSET_SCORE_TIERS.medium;
  return ASSET_SCORE_TIERS.weak;
}

/**
 * formatScore — formats a 0–1 score as a 0–100 integer string.
 * e.g. 0.74 → "74"
 */
export function formatScore(score: number): string {
  return Math.round(score * 100).toString();
}

// ── Asset status ───────────────────────────────────────────────────────────────

/**
 * AssetLifecycleStatus — canonical status values for a Biblioteca asset.
 * Maps to the MarketingAsset.status field (future Prisma enum).
 */
export type AssetLifecycleStatus =
  | "approved"
  | "review_pending"
  | "generated"
  | "archived"
  | "rejected";

export type StatusChipVariant = "ok" | "pending" | "warning" | "critical" | "info";

export interface StatusConfig {
  label:       string;
  color:       string;
  surface:     string;
  border:      string;
  /** Maps to StatusChip variant prop from operational-primitives. */
  chipVariant: StatusChipVariant;
  /** CSS class modifier for ag-asset-card state styling. */
  cardClass?:  string;
}

export const ASSET_STATUS_CONFIG: Record<AssetLifecycleStatus, StatusConfig> = {
  approved: {
    label:       "Aprobado",
    color:       C.green,
    surface:     C.greenLight,
    border:      C.greenBorder,
    chipVariant: "ok",
  },
  review_pending: {
    label:       "En revisión",
    color:       C.amber,
    surface:     C.amberLight,
    border:      C.amberBorder,
    chipVariant: "pending",
    cardClass:   "ag-asset-card--review-pending",
  },
  generated: {
    label:       "Generado",
    color:       C.blue,
    surface:     C.blueLight,
    border:      C.blueBorder,
    chipVariant: "info",
  },
  archived: {
    label:       "Archivado",
    color:       C.inkFaint,
    surface:     C.surface,
    border:      C.line,
    chipVariant: "info",
  },
  rejected: {
    label:       "Rechazado",
    color:       C.red,
    surface:     C.redLight,
    border:      C.redBorder,
    chipVariant: "critical",
  },
};

/**
 * resolveStatusConfig — returns the StatusConfig for a status string.
 * Falls back to "generated" for unknown values.
 */
export function resolveStatusConfig(status: string): StatusConfig {
  return (
    ASSET_STATUS_CONFIG[status as AssetLifecycleStatus] ??
    ASSET_STATUS_CONFIG.generated
  );
}

// ── Channel config ─────────────────────────────────────────────────────────────

/**
 * ChannelId — known distribution channels for Biblioteca assets.
 */
export type ChannelId =
  | "shopify"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "ads"
  | "catalog"
  | "crm";

export interface ChannelConfig {
  id:      ChannelId;
  label:   string;
  /** 2–3 character abbreviation for compact badge display. */
  abbr:    string;
  color:   string;
  surface: string;
  border:  string;
}

export const CHANNEL_CONFIG: Record<ChannelId, ChannelConfig> = {
  shopify: {
    id:      "shopify",
    label:   "Shopify",
    abbr:    "SHO",
    color:   C.greenDark,
    surface: C.greenLight,
    border:  C.greenBorder,
  },
  whatsapp: {
    id:      "whatsapp",
    label:   "WhatsApp",
    abbr:    "WA",
    color:   C.green,
    surface: C.greenLight,
    border:  C.greenBorder,
  },
  instagram: {
    id:      "instagram",
    label:   "Instagram",
    abbr:    "IG",
    color:   C.brand,
    surface: C.brandLight,
    border:  C.brandBorder,
  },
  facebook: {
    id:      "facebook",
    label:   "Facebook",
    abbr:    "FB",
    color:   C.blue,
    surface: C.blueLight,
    border:  C.blueBorder,
  },
  tiktok: {
    id:      "tiktok",
    label:   "TikTok",
    abbr:    "TT",
    color:   C.inkMid,
    surface: C.surfaceAlt,
    border:  C.line,
  },
  ads: {
    id:      "ads",
    label:   "Ads",
    abbr:    "ADS",
    color:   C.amberMid,
    surface: C.amberLight,
    border:  C.amberBorder,
  },
  catalog: {
    id:      "catalog",
    label:   "Catálogo",
    abbr:    "CAT",
    color:   C.blueDark,
    surface: C.blueLight,
    border:  C.blueBorder,
  },
  crm: {
    id:      "crm",
    label:   "CRM",
    abbr:    "CRM",
    color:   C.brandDark,
    surface: C.brandLight,
    border:  C.brandBorder,
  },
};

/**
 * resolveChannelConfig — returns the ChannelConfig for a channel string.
 * Falls back to a neutral config for unknown channels.
 */
export function resolveChannelConfig(channel: string): ChannelConfig {
  return (
    CHANNEL_CONFIG[channel as ChannelId] ?? {
      id:      channel as ChannelId,
      label:   channel,
      abbr:    channel.slice(0, 3).toUpperCase(),
      color:   C.inkLight,
      surface: C.surface,
      border:  C.line,
    }
  );
}

// ── Thumbnail ratios ───────────────────────────────────────────────────────────

export type ThumbnailClass =
  | "ag-thumb--portrait"
  | "ag-thumb--landscape"
  | "ag-thumb--reel"
  | "ag-thumb--square"
  | "ag-thumb--banner";

export interface ThumbnailProfile {
  /** CSS aspect-ratio string (e.g. "4/5"). */
  ratio:       string;
  /** Human-readable format label. */
  label:       string;
  /** CSS class that applies the aspect-ratio from design-system.css. */
  cssClass:    ThumbnailClass;
  /**
   * Whether the image should use objectFit: "contain" instead of "cover".
   * Use for banner/hero types where cropping would lose key content.
   */
  contain?:    boolean;
}

export const THUMBNAIL_PROFILES: Record<string, ThumbnailProfile> = {
  product_photo: {
    ratio:    "4/5",
    label:    "Retrato",
    cssClass: "ag-thumb--portrait",
  },
  lifestyle_photo: {
    ratio:    "16/9",
    label:    "Paisaje",
    cssClass: "ag-thumb--landscape",
  },
  short_video: {
    ratio:    "9/16",
    label:    "Reel",
    cssClass: "ag-thumb--reel",
  },
  ad_creative: {
    ratio:    "1/1",
    label:    "Cuadrado",
    cssClass: "ag-thumb--square",
  },
  banner: {
    ratio:    "4/1",
    label:    "Banner",
    cssClass: "ag-thumb--banner",
    contain:  true,
  },
  hero: {
    ratio:    "16/9",
    label:    "Hero",
    cssClass: "ag-thumb--landscape",
    contain:  true,
  },
  catalog_page: {
    ratio:    "3/4",
    label:    "Página",
    cssClass: "ag-thumb--portrait",
  },
  template: {
    ratio:    "1/1",
    label:    "Plantilla",
    cssClass: "ag-thumb--square",
  },
  whatsapp_asset: {
    ratio:    "1/1",
    label:    "WhatsApp",
    cssClass: "ag-thumb--square",
  },
};

const FALLBACK_THUMBNAIL: ThumbnailProfile = {
  ratio:    "1/1",
  label:    "Asset",
  cssClass: "ag-thumb--square",
};

/**
 * getThumbnailProfile — returns the ThumbnailProfile for a given asset type.
 * Falls back to square for unknown types.
 */
export function getThumbnailProfile(assetType: string): ThumbnailProfile {
  return THUMBNAIL_PROFILES[assetType] ?? FALLBACK_THUMBNAIL;
}

// ── Card operational states ────────────────────────────────────────────────────

/**
 * CardOperationalState — visual modifier states for an asset card.
 *
 * These are overlaid on top of the base card and status.
 * Multiple states can be active simultaneously.
 */
export interface CardOperationalState {
  stale?:         boolean;  // > 90 days without use — gray overlay
  highPerformer?: boolean;  // 10+ uses or 5+ channels — green left accent
  duplicateRisk?: boolean;  // near-duplicate detected — amber left accent
  isSelected?:    boolean;  // user selected for bulk action — blue ring
  isLoading?:     boolean;  // asset data is being fetched — skeleton
}

/**
 * buildCardClasses — composes the CSS class string for an asset card.
 */
export function buildCardClasses(
  status: string,
  state:  CardOperationalState,
): string {
  const classes = ["ag-asset-card"];

  const statusCfg = resolveStatusConfig(status);
  if (statusCfg.cardClass) classes.push(statusCfg.cardClass);

  if (state.isSelected)    classes.push("ag-asset-card--selected");
  if (state.stale)         classes.push("ag-asset-card--stale");
  if (state.highPerformer) classes.push("ag-asset-card--high-performer");
  if (state.duplicateRisk) classes.push("ag-asset-card--duplicate-risk");
  if (state.isLoading)     classes.push("ag-asset-skeleton");

  return classes.join(" ");
}

// ── Empty state messages ───────────────────────────────────────────────────────

export interface EmptyStateConfig {
  message: string;
  detail:  string;
}

/**
 * BIBLIOTECA_EMPTY_STATES — contextual empty state messages per preset/context.
 */
export const BIBLIOTECA_EMPTY_STATES: Record<string, EmptyStateConfig> = {
  default: {
    message: "Biblioteca vacía",
    detail:  "Los assets aprobados en Foto Estudio aparecerán aquí. Cada asset es clasificado, puntuado y preparado para canales.",
  },
  whatsapp_ready: {
    message: "Sin assets listos para WhatsApp",
    detail:  "No hay assets aprobados con canal WhatsApp habilitado. Aprueba assets desde el flujo de revisión.",
  },
  shopify_ready: {
    message: "Sin assets listos para Shopify",
    detail:  "No hay assets aprobados con canal Shopify habilitado. Verifica la configuración de destinos.",
  },
  catalog_ready: {
    message: "Sin assets para catálogo",
    detail:  "No hay assets aprobados disponibles para compilación de catálogo.",
  },
  pending_review: {
    message: "Sin assets pendientes de revisión",
    detail:  "Todos los assets generados han sido procesados. La cola de revisión está vacía.",
  },
  high_performers: {
    message: "Sin assets de alto rendimiento aún",
    detail:  "Los assets con 10+ publicaciones o 5+ canales activos aparecerán aquí.",
  },
  missing_variants: {
    message: "Todos los assets tienen variantes",
    detail:  "No hay assets aprobados sin variantes de canal. El sistema de variantes está completo.",
  },
  search: {
    message: "Sin resultados para esta búsqueda",
    detail:  "Intenta con otro SKU, categoría o etiqueta. La búsqueda por embeddings estará disponible próximamente.",
  },
};
