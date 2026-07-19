/**
 * lib/marketing-studio/library/operations/destinations.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Destination routing system — the Biblioteca decides where assets go.
 *
 * ── RULE ──────────────────────────────────────────────────────────────────────
 *
 *   "Foto Estudio does not publish. Foto Estudio generates.
 *    La Biblioteca decides where assets go."
 *
 *   This file defines:
 *     - What a destination is (AssetDestination)
 *     - What each destination requires from an asset (DestinationRequirements)
 *     - Which asset types are compatible with each destination
 *     - Eligibility checks (isEligibleForDestination)
 *     - Destination capability map per asset
 *
 * ── TENANT OVERRIDE ───────────────────────────────────────────────────────────
 *
 *   The base requirements are defined here.
 *   TenantMarketingConfig may restrict which destinations are enabled per tenant
 *   (e.g. Castillitos has no Shopify → shopify destination disabled).
 *   Tenant-level enforcement is done in the API layer, not here.
 */

import type { AssetType, AssetChannel } from "../types";

// ── Destination types ──────────────────────────────────────────────────────────

/**
 * AssetDestination — the six primary publishing destinations.
 *
 * Each maps to one or more AssetChannels:
 *   "shopify"   → channel: "shopify"
 *   "catalog"   → channel: "catalog"
 *   "social"    → channel: "instagram" | "facebook" | "tiktok" | "youtube"
 *   "ads"       → channel: "ads"
 *   "crm"       → channel: "crm"
 *   "whatsapp"  → channel: "whatsapp"
 */
export type AssetDestination =
  | "shopify"
  | "catalog"
  | "social"
  | "ads"
  | "crm"
  | "whatsapp";

/** Maps each destination to its corresponding AssetChannel(s). */
export const DESTINATION_TO_CHANNELS: Record<AssetDestination, AssetChannel[]> = {
  shopify:   ["shopify"],
  catalog:   ["catalog"],
  social:    ["instagram", "facebook", "tiktok", "youtube"],
  ads:       ["ads"],
  crm:       ["crm"],
  whatsapp:  ["whatsapp"],
};

// ── Destination requirements ───────────────────────────────────────────────────

/**
 * FormatConstraint — dimension / format requirements for a destination.
 */
export interface FormatConstraint {
  /** Minimum width in pixels. */
  minWidth?:      number;
  /** Minimum height in pixels. */
  minHeight?:     number;
  /** Required aspect ratio, e.g. "1:1", "9:16", "16:9", "4:5" */
  aspectRatio?:   string;
  /** Allowed MIME types. */
  allowedFormats: string[];
  /** Maximum file size in bytes. */
  maxSizeBytes?:  number;
  /** Human-readable format description for UI guidance. */
  description:    string;
}

/**
 * DestinationRequirements — what an asset needs to be eligible for a destination.
 */
export interface DestinationRequirements {
  destination:        AssetDestination;
  /** Display label for the destination. */
  label:              string;
  /** Asset types that are accepted by this destination. */
  allowedAssetTypes:  AssetType[];
  /**
   * Required metadata field names from AssetMinimalMetadata + AssetContextualMetadata.
   * Asset must have these populated to be marked ready for this destination.
   */
  requiredMetadata:   string[];
  /** Format constraints — asset must meet at least one constraint set. */
  formatConstraints?: FormatConstraint[];
  /**
   * Whether this destination requires explicit approval before publishing.
   * (Always true — the approval system handles this. Listed here for documentation.)
   */
  requiresApproval:   boolean;
  /** Human-readable notes for operators. */
  notes?:             string;
}

// ── Destination registry ───────────────────────────────────────────────────────

/**
 * DESTINATION_REQUIREMENTS — the canonical requirements for each destination.
 *
 * Used by:
 *   - isEligibleForDestination() guard
 *   - Biblioteca UI destination readiness indicators
 *   - Approval validation (destinationReadiness flags)
 *   - Future: automated channel-export pipelines
 */
export const DESTINATION_REQUIREMENTS: Record<AssetDestination, DestinationRequirements> = {

  shopify: {
    destination:       "shopify",
    label:             "Shopify",
    allowedAssetTypes: ["product_photo", "lifestyle_photo", "banner", "hero", "template"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "Shopify product image",
        allowedFormats: ["image/jpeg", "image/png", "image/webp"],
        minWidth:       800,
        minHeight:      800,
        maxSizeBytes:   20 * 1024 * 1024,   // 20 MB
      },
      {
        description:    "Shopify hero / banner",
        allowedFormats: ["image/jpeg", "image/png", "image/webp"],
        aspectRatio:    "16:9",
        minWidth:       1200,
        maxSizeBytes:   20 * 1024 * 1024,
      },
    ],
    requiresApproval:  true,
    notes:             "Hero images must be horizontal (16:9). Product images should be square (1:1) or portrait (4:5) at minimum 800x800px.",
  },

  catalog: {
    destination:       "catalog",
    label:             "Catálogo",
    allowedAssetTypes: ["product_photo", "catalog_page", "banner", "template"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "Catálogo print-ready",
        allowedFormats: ["image/jpeg", "image/png"],
        minWidth:       1200,
        maxSizeBytes:   50 * 1024 * 1024,   // 50 MB — print quality
      },
    ],
    requiresApproval:  true,
    notes:             "Catálogos impresos requieren resolución mínima 300dpi / 1200px. Formato JPEG o PNG.",
  },

  social: {
    destination:       "social",
    label:             "Redes sociales",
    allowedAssetTypes: ["product_photo", "lifestyle_photo", "short_video", "banner", "ad_creative"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "Feed cuadrado",
        allowedFormats: ["image/jpeg", "image/png", "image/webp"],
        aspectRatio:    "1:1",
        minWidth:       1080,
        maxSizeBytes:   8 * 1024 * 1024,
      },
      {
        description:    "Reel / TikTok vertical",
        allowedFormats: ["video/mp4"],
        aspectRatio:    "9:16",
        minWidth:       1080,
        maxSizeBytes:   100 * 1024 * 1024,
      },
      {
        description:    "Portrait feed",
        allowedFormats: ["image/jpeg", "image/png", "image/webp"],
        aspectRatio:    "4:5",
        minWidth:       1080,
        maxSizeBytes:   8 * 1024 * 1024,
      },
    ],
    requiresApproval:  true,
    notes:             "Videos para Reels/TikTok deben ser 9:16 MP4. Imágenes feed: cuadrado (1:1) o portrait (4:5).",
  },

  ads: {
    destination:       "ads",
    label:             "Pauta digital (Ads)",
    allowedAssetTypes: ["ad_creative", "banner", "short_video", "product_photo"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "Meta Ads — cuadrado",
        allowedFormats: ["image/jpeg", "image/png"],
        aspectRatio:    "1:1",
        minWidth:       1080,
        maxSizeBytes:   30 * 1024 * 1024,
      },
      {
        description:    "Meta Ads — panorámico",
        allowedFormats: ["image/jpeg", "image/png"],
        aspectRatio:    "1.91:1",
        minWidth:       1200,
        maxSizeBytes:   30 * 1024 * 1024,
      },
      {
        description:    "Video ads",
        allowedFormats: ["video/mp4"],
        minWidth:       1080,
        maxSizeBytes:   200 * 1024 * 1024,
      },
    ],
    requiresApproval:  true,
    notes:             "Ads creativos deben cumplir especificaciones de Meta Ads / TikTok Ads. Texto ≤ 20% del área de la imagen.",
  },

  crm: {
    destination:       "crm",
    label:             "CRM / Mila",
    allowedAssetTypes: ["product_photo", "lifestyle_photo", "whatsapp_asset", "banner", "template"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "CRM / email visual",
        allowedFormats: ["image/jpeg", "image/png", "image/webp"],
        minWidth:       600,
        maxSizeBytes:   5 * 1024 * 1024,
      },
    ],
    requiresApproval:  true,
    notes:             "Imágenes para CRM deben ser livianas (< 5 MB). Usadas en Mila, WhatsApp y campañas de email.",
  },

  whatsapp: {
    destination:       "whatsapp",
    label:             "WhatsApp / Mila",
    allowedAssetTypes: ["whatsapp_asset", "product_photo", "banner"],
    requiredMetadata:  ["name", "assetType", "clearedChannels"],
    formatConstraints: [
      {
        description:    "WhatsApp estado / imagen",
        allowedFormats: ["image/jpeg", "image/png"],
        aspectRatio:    "9:16",
        maxSizeBytes:   5 * 1024 * 1024,    // WhatsApp limit
      },
    ],
    requiresApproval:  true,
    notes:             "WhatsApp tiene límite de 5 MB. Formato 9:16 recomendado para estados. Evitar texto pesado sobre imagen.",
  },

};

// ── Eligibility check ──────────────────────────────────────────────────────────

export interface DestinationEligibilityResult {
  eligible:    boolean;
  destination: AssetDestination;
  blockers:    string[];
  warnings:    string[];
}

/**
 * isEligibleForDestination — checks if an asset can be routed to a destination.
 *
 * Validates:
 *   1. Asset type is in the destination's allowed list
 *   2. Required metadata is present
 *   3. Asset is approved (lifecycle check)
 *
 * Does NOT validate file format dimensions — that requires the actual file (API layer).
 */
export function isEligibleForDestination(
  asset: {
    assetType?: string;
    status?:    string;
    channels?:  AssetChannel[];
    metadata?:  Record<string, unknown>;
  },
  destination: AssetDestination,
): DestinationEligibilityResult {
  const reqs     = DESTINATION_REQUIREMENTS[destination];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (asset.status !== "approved" && asset.status !== "published") {
    blockers.push(`El asset debe estar aprobado para publicar a ${reqs.label}.`);
  }
  if (asset.assetType && !reqs.allowedAssetTypes.includes(asset.assetType as AssetType)) {
    blockers.push(
      `Tipo "${asset.assetType}" no es compatible con ${reqs.label}. ` +
      `Tipos permitidos: ${reqs.allowedAssetTypes.join(", ")}.`,
    );
  }
  for (const field of reqs.requiredMetadata) {
    if (!asset.metadata?.[field]) {
      blockers.push(`Campo requerido faltante: "${field}".`);
    }
  }
  const destChannels  = DESTINATION_TO_CHANNELS[destination];
  const assetChannels = asset.channels ?? [];
  const hasChannel    = destChannels.some(c => assetChannels.includes(c));
  if (!hasChannel) {
    warnings.push(
      `El asset no tiene habilitado el canal ${reqs.label}. ` +
      `Canales requeridos: ${destChannels.join(", ")}.`,
    );
  }

  return {
    eligible:    blockers.length === 0,
    destination,
    blockers,
    warnings,
  };
}

/**
 * getAssetDestinationCapabilities — returns the eligibility status for every destination.
 * Used to render the "publish to" buttons in the Biblioteca asset detail panel.
 */
export function getAssetDestinationCapabilities(
  asset: Parameters<typeof isEligibleForDestination>[0],
): DestinationEligibilityResult[] {
  return (Object.keys(DESTINATION_REQUIREMENTS) as AssetDestination[])
    .map(dest => isEligibleForDestination(asset, dest));
}
