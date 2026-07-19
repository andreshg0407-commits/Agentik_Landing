/**
 * lib/marketing-studio/library/intelligence/scoring.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Asset relevance scoring system.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   Every asset in the Biblioteca has an operational score.
 *   Score is NOT aesthetic quality — it is operational relevance:
 *     - How ready is this asset for use?
 *     - How frequently has it been used?
 *     - How fresh is it?
 *     - How complete is its metadata?
 *     - Is it compatible with the target channel?
 *
 * ── NO AI YET ─────────────────────────────────────────────────────────────────
 *
 *   This is rule-based scoring.
 *   AI quality scoring (CLIP, aesthetic score, engagement prediction)
 *   will be added in sprint MS-AI when the model pipeline is ready.
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   finalScore will incorporate:
 *     - AI aesthetic quality score (0–1)
 *     - Engagement performance from social platforms (CTR, saves, shares)
 *     - A/B test results from Pauta IA campaigns
 */

import type { AssetType, AssetStatus, AssetChannel } from "../types";
import type { RankingWeights }                        from "./queries";
import type { AssetDestination }                      from "../operations/destinations";

// ── Score dimensions ───────────────────────────────────────────────────────────

/**
 * AssetScore — the multi-dimensional operational score for a single asset.
 *
 * All dimension scores are 0–1.
 * finalScore is the weighted combination (0–1).
 */
export interface AssetScore {
  assetId:              string;

  /** Tag / text match closeness to the query. 0 if no query provided. */
  relevance:            number;
  /** How recently the asset was approved or updated. */
  freshness:            number;
  /** Completeness of metadata, relations, and variants. */
  completeness:         number;
  /** Compatibility with the target channel. */
  channelCompatibility: number;
  /** Usage frequency across channels and campaigns. */
  usageScore:           number;

  /** Weighted final score (0–1). */
  finalScore:           number;

  /** Human-readable reasons for this score (for debugging / UI). */
  reasons:              string[];
}

// ── Scoring input ──────────────────────────────────────────────────────────────

/**
 * ScoringInput — the minimal asset data needed to compute a score.
 *
 * Sourced from MarketingAsset fields — does not require full hydration.
 */
export interface ScoringInput {
  assetId:        string;
  status:         AssetStatus;
  assetType:      AssetType;
  channels:       AssetChannel[];
  tags?:          string[];
  name?:          string;
  sku?:           string;
  productName?:   string;
  createdAt:      string;
  approvedAt?:    string;
  updatedAt?:     string;
  usageCount?:    number;
  variantCount?:  number;
  relationCount?: number;
  hasUrl:         boolean;
  hasThumbnail:   boolean;
  metadataFields: string[];   // list of non-null metadata field names
  /** Whether this asset has been flagged as a near-duplicate. */
  isDuplicate?:   boolean;
}

// ── Scoring context ────────────────────────────────────────────────────────────

/**
 * ScoringContext — the query context that drives scoring weights.
 */
export interface ScoringContext {
  /** Query tokens to match against tags/name/sku. */
  queryTokens?:    string[];
  /** Target channel for compatibility scoring. */
  targetChannel?:  AssetChannel;
  /** Target destination for readiness scoring. */
  targetDest?:     AssetDestination;
  /** Ranking weights from the normalized query. */
  weights:         RankingWeights;
  /** Current time (ISO) — used for freshness calculation. */
  now:             string;
}

// ── Core scoring function ──────────────────────────────────────────────────────

/**
 * calculateAssetScore — computes the full AssetScore for a single asset.
 *
 * All scores are 0–1. Weights from ScoringContext.weights are applied
 * to compute finalScore.
 */
export function calculateAssetScore(
  asset:   ScoringInput,
  context: ScoringContext,
): AssetScore {
  const reasons: string[] = [];

  const relevance            = scoreRelevance(asset, context.queryTokens, reasons);
  const freshness            = scoreFreshness(asset, context.now, reasons);
  const completeness         = scoreCompleteness(asset, reasons);
  const channelCompatibility = scoreChannelCompatibility(asset, context.targetChannel, reasons);
  const usageScore           = scoreUsage(asset, reasons);

  const w = context.weights;
  const finalScore = clamp(
    relevance            * w.relevance   +
    freshness            * w.freshness   +
    completeness         * w.completeness +
    channelCompatibility * w.channel     +
    usageScore           * w.usage,
  );

  // Penalize duplicates
  if (asset.isDuplicate) {
    reasons.push("Asset marcado como posible duplicado — penalización aplicada.");
    return { assetId: asset.assetId, relevance, freshness, completeness, channelCompatibility, usageScore, finalScore: finalScore * 0.3, reasons };
  }

  return { assetId: asset.assetId, relevance, freshness, completeness, channelCompatibility, usageScore, finalScore, reasons };
}

// ── Dimension scorers ─────────────────────────────────────────────────────────

function scoreRelevance(
  asset:  ScoringInput,
  tokens: string[] | undefined,
  reasons: string[],
): number {
  if (!tokens || tokens.length === 0) return 0.5; // neutral when no query

  const searchable = [
    asset.name         ?? "",
    asset.sku          ?? "",
    asset.productName  ?? "",
    ...(asset.tags     ?? []),
  ].join(" ").toLowerCase();

  const matched = tokens.filter(t => searchable.includes(t)).length;
  const score   = matched / tokens.length;

  if (score > 0.7) reasons.push(`Alta relevancia para la búsqueda (${matched}/${tokens.length} tokens coincidentes).`);
  if (score === 0) reasons.push("Ningún token de búsqueda coincide.");

  return clamp(score);
}

function scoreFreshness(
  asset:   ScoringInput,
  now:     string,
  reasons: string[],
): number {
  const referenceDate = asset.approvedAt ?? asset.updatedAt ?? asset.createdAt;
  const ageMs  = Date.parse(now) - Date.parse(referenceDate);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  let score: number;
  if (ageDays <= 7)   { score = 1.0;  reasons.push("Asset muy reciente (≤ 7 días)."); }
  else if (ageDays <= 30)  { score = 0.8; }
  else if (ageDays <= 90)  { score = 0.6; }
  else if (ageDays <= 180) { score = 0.4; }
  else if (ageDays <= 365) { score = 0.2; reasons.push("Asset con más de 6 meses sin actualizar."); }
  else                     { score = 0.1; reasons.push("Asset antiguo (> 1 año) — posiblemente obsoleto."); }

  return score;
}

function scoreCompleteness(
  asset:   ScoringInput,
  reasons: string[],
): number {
  let score = 0;

  // Required: url, name, assetType, channels (25 pts each)
  if (asset.hasUrl)                   score += 0.25;
  if (asset.name && asset.name.length > 0) score += 0.25;
  if (asset.channels.length > 0)      score += 0.15;
  if (asset.hasThumbnail)             score += 0.1;

  // Bonus: rich metadata
  const richFields = asset.metadataFields.filter(f =>
    ["price", "size", "colors", "collection", "sku", "aiTags"].includes(f)
  ).length;
  score += Math.min(richFields * 0.05, 0.15);

  // Bonus: relations and variants
  if ((asset.relationCount ?? 0) > 0) score += 0.05;
  if ((asset.variantCount  ?? 0) > 0) { score += 0.05; reasons.push("Asset tiene variantes disponibles."); }

  if (score < 0.5)  reasons.push("Metadata incompleta — puede afectar publicación.");
  if (score >= 0.9) reasons.push("Asset con metadata completa.");

  return clamp(score);
}

function scoreChannelCompatibility(
  asset:         ScoringInput,
  targetChannel: AssetChannel | undefined,
  reasons:       string[],
): number {
  if (!targetChannel) return 0.5; // neutral when no target channel

  if (asset.channels.includes(targetChannel)) {
    reasons.push(`Asset habilitado para canal "${targetChannel}".`);
    return 1.0;
  }

  // Partial credit: compatible asset types per channel
  const compatibleTypes = CHANNEL_COMPATIBLE_TYPES[targetChannel] ?? [];
  if (compatibleTypes.includes(asset.assetType)) {
    reasons.push(`Tipo "${asset.assetType}" es compatible con canal "${targetChannel}" aunque no está asignado.`);
    return 0.5;
  }

  reasons.push(`Asset no está habilitado para canal "${targetChannel}".`);
  return 0.0;
}

function scoreUsage(
  asset:   ScoringInput,
  reasons: string[],
): number {
  const count = asset.usageCount ?? 0;

  if (count === 0) return 0.1;
  if (count <= 2)  return 0.3;
  if (count <= 5)  return 0.5;
  if (count <= 10) { reasons.push(`Asset usado ${count} veces — buen historial.`); return 0.7; }
  if (count <= 25) { reasons.push(`Asset de alto uso (${count} veces).`); return 0.85; }

  reasons.push(`Asset muy utilizado (${count} usos) — alta confianza operacional.`);
  return 1.0;
}

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * rankAssets — sorts a list of ScoringInputs by their computed finalScore.
 * Returns the scored list in descending order.
 */
export function rankAssets(
  assets:  ScoringInput[],
  context: ScoringContext,
): AssetScore[] {
  return assets
    .map(a => calculateAssetScore(a, context))
    .sort((a, b) => b.finalScore - a.finalScore);
}

// ── Channel-specific scorers ──────────────────────────────────────────────────

/**
 * scoreForChannel — computes a relevance score focused on a specific channel.
 * Useful for pre-filtering before full ranking.
 */
export function scoreForChannel(asset: ScoringInput, channel: AssetChannel): number {
  const compatible = asset.channels.includes(channel);
  const typeOk     = (CHANNEL_COMPATIBLE_TYPES[channel] ?? []).includes(asset.assetType);
  const approved   = asset.status === "approved" || asset.status === "published";

  if (!approved)                return 0.0;
  if (compatible)               return 1.0;
  if (typeOk)                   return 0.5;
  return 0.1;
}

/**
 * scoreForWhatsApp — strict scorer for WhatsApp catalog slots.
 * WhatsApp has hard constraints: file size, format, readability at small size.
 */
export function scoreForWhatsApp(asset: ScoringInput): number {
  const approved    = asset.status === "approved" || asset.status === "published";
  const compatible  = asset.channels.includes("whatsapp");
  const goodType    = ["product_photo", "whatsapp_asset", "banner"].includes(asset.assetType);
  const hasThumbnail = asset.hasThumbnail;
  const hasName     = (asset.name?.length ?? 0) > 0;

  let score = 0;
  if (approved)    score += 0.3;
  if (compatible)  score += 0.3;
  if (goodType)    score += 0.2;
  if (hasThumbnail) score += 0.1;
  if (hasName)     score += 0.1;

  return clamp(score);
}

/**
 * scoreForCatalog — scorer for print / digital catalog slots.
 * Prioritizes high-res, complete metadata, approved status.
 */
export function scoreForCatalog(asset: ScoringInput): number {
  const approved    = asset.status === "approved" || asset.status === "published";
  const compatible  = asset.channels.includes("catalog");
  const goodType    = ["product_photo", "lifestyle_photo", "catalog_page", "banner", "template"].includes(asset.assetType);
  const complete    = asset.metadataFields.length >= 4;
  const hasVariants = (asset.variantCount ?? 0) > 0;

  let score = 0;
  if (approved)    score += 0.3;
  if (compatible)  score += 0.25;
  if (goodType)    score += 0.2;
  if (complete)    score += 0.15;
  if (hasVariants) score += 0.1;

  return clamp(score);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_COMPATIBLE_TYPES: Partial<Record<AssetChannel, AssetType[]>> = {
  shopify:   ["product_photo", "lifestyle_photo", "banner", "hero", "template"],
  catalog:   ["product_photo", "catalog_page", "banner", "template", "lifestyle_photo"],
  instagram: ["product_photo", "lifestyle_photo", "short_video", "banner", "ad_creative"],
  facebook:  ["product_photo", "lifestyle_photo", "short_video", "banner", "ad_creative"],
  tiktok:    ["short_video", "product_photo", "ad_creative"],
  whatsapp:  ["product_photo", "whatsapp_asset", "banner"],
  ads:       ["ad_creative", "banner", "product_photo", "short_video"],
  crm:       ["product_photo", "lifestyle_photo", "banner", "template", "whatsapp_asset"],
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
