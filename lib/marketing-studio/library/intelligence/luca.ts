/**
 * lib/marketing-studio/library/intelligence/luca.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Luca intelligence foundations — how Luca uses the Biblioteca.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   Luca is the content and creative AI agent.
 *   Before generating new assets, Luca should always check the Biblioteca:
 *     - "Does an approved version of this already exist?"
 *     - "Is there a variant I can reuse for this channel?"
 *     - "Have we already made this for a similar campaign?"
 *     - "What's missing — which formats don't we have for this product?"
 *
 *   Luca's job is to create only what doesn't already exist.
 *   The Biblioteca is Luca's creative memory.
 *
 * ── SIGNALS ───────────────────────────────────────────────────────────────────
 *
 *   Luca queries the Biblioteca for:
 *     REUSE      — similar approved assets for the same product/campaign
 *     GAP        — missing variants or channel formats
 *     DUPLICATE  — potential redundant generation
 *     CAMPAIGN   — assets from similar campaigns that could be adapted
 *     OBSOLETE   — assets that should be replaced (old season, low quality)
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   LucaRecommendation will be enriched with:
 *     - Visual similarity score (when image embeddings are available)
 *     - Campaign matching via semantic similarity of brief vs asset tags
 *     - Auto-generated production brief from Biblioteca context
 */

import type { AssetChannel } from "../types";
import type { ScoringInput } from "./scoring";
import type { AssetQuery }   from "./queries";

// ── Luca recommendation types ─────────────────────────────────────────────────

/**
 * LucaRecommendationType — what kind of intelligence signal Luca is receiving.
 */
export type LucaRecommendationType =
  | "reuse"            // a high-quality approved asset already exists — don't regenerate
  | "missing_variant"  // an approved asset exists but missing a required channel variant
  | "duplicate_risk"   // the planned generation looks very similar to an existing asset
  | "campaign_match"   // a previous campaign had similar assets — consider adapting
  | "channel_gap"      // product has no approved asset for a specific channel
  | "stale_asset"      // an asset for this product exists but is outdated — suggest refresh
  | "low_coverage";    // product category has fewer assets than other categories

/**
 * LucaRecommendation — a single recommendation from Luca's Biblioteca analysis.
 *
 * Used by the Luca agent to:
 *   - Warn the operator before triggering a new generation run
 *   - Surface reusable assets in the briefing step
 *   - Guide the generation toward filling real gaps
 */
export interface LucaRecommendation {
  type:        LucaRecommendationType;
  /** The asset ID this recommendation is about (if applicable). */
  assetId?:    string;
  /** Short title shown in the Luca briefing panel. */
  title:       string;
  /** Full description explaining the recommendation and its implication. */
  description: string;
  /** Confidence that this recommendation is accurate (0–1). */
  confidence:  number;
  /**
   * The channel that is affected by this recommendation.
   * Set for "channel_gap" and "missing_variant" types.
   */
  channel?:    AssetChannel;
  /**
   * Suggested action for the operator.
   * E.g. "Reutilizar asset existente", "Generar variante para WhatsApp".
   */
  suggestedAction?: string;
}

// ── Luca analysis request ─────────────────────────────────────────────────────

/**
 * LucaAnalysisRequest — the context Luca provides when analyzing the Biblioteca
 * before a new generation run.
 */
export interface LucaAnalysisRequest {
  tenantId:          string;
  /** Product or SKU the operator wants to generate content for. */
  productRef?:       string;
  sku?:              string;
  /** Channels the operator intends to generate content for. */
  targetChannels:    AssetChannel[];
  /** Tags / brief context from the wizard step. */
  tags?:             string[];
  /** The campaign context (if generating for a specific campaign). */
  campaignId?:       string;
  /** The session ID being planned (to exclude its own draft assets). */
  planningSessionId?: string;
}

/**
 * LucaAnalysisResult — full result of Luca's Biblioteca analysis.
 */
export interface LucaAnalysisResult {
  tenantId:        string;
  /** Whether Luca found existing assets that cover all target channels. */
  fullyConvered:   boolean;
  /** Channels with no approved asset. */
  missingChannels: AssetChannel[];
  /** Channels with an approved asset (reusable). */
  coveredChannels: AssetChannel[];
  /** All recommendations sorted by priority. */
  recommendations: LucaRecommendation[];
  /** Top reuse candidates (highest-scored existing assets). */
  reuseCandidates: ScoringInput[];
  /**
   * Suggested generation scope — what Luca recommends creating.
   * If empty, no new generation is needed (everything covered by Biblioteca).
   */
  suggestedGenerationScope: AssetChannel[];
}

// ── Intelligence functions ────────────────────────────────────────────────────

/**
 * analyzeBibliotecaForLuca — performs a full Biblioteca analysis for Luca.
 *
 * Given a set of candidate assets (pre-filtered by product/sku/tags)
 * and the desired target channels, produces a LucaAnalysisResult.
 */
export function analyzeBibliotecaForLuca(
  req:    LucaAnalysisRequest,
  assets: ScoringInput[],
): LucaAnalysisResult {
  const recommendations: LucaRecommendation[] = [];

  const approvedAssets = assets.filter(
    a => a.status === "approved" || a.status === "published"
  );

  // Detect which channels are covered
  const coveredChannels   = req.targetChannels.filter(ch =>
    approvedAssets.some(a => a.channels.includes(ch))
  );
  const missingChannels   = req.targetChannels.filter(ch => !coveredChannels.includes(ch));
  const fullyConvered     = missingChannels.length === 0;

  // REUSE recommendations
  for (const ch of coveredChannels) {
    const best = approvedAssets
      .filter(a => a.channels.includes(ch))
      .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))[0];

    if (best) {
      recommendations.push({
        type:            "reuse",
        assetId:         best.assetId,
        title:           `Asset aprobado disponible para ${ch}`,
        description:     `Existe un asset aprobado para el canal "${ch}" que puede reutilizarse. Nombre: "${best.name ?? best.assetId}".`,
        confidence:      0.85,
        channel:         ch,
        suggestedAction: "Reutilizar asset existente",
      });
    }
  }

  // CHANNEL GAP recommendations
  for (const ch of missingChannels) {
    recommendations.push({
      type:            "channel_gap",
      title:           `Sin cobertura para ${ch}`,
      description:     `No hay assets aprobados en la Biblioteca para el canal "${ch}" para este producto. Se recomienda generar.`,
      confidence:      1.0,
      channel:         ch,
      suggestedAction: `Generar asset para canal "${ch}"`,
    });
  }

  // MISSING VARIANT — assets exist but no cross-channel variants
  const noVariantAssets = approvedAssets.filter(a => (a.variantCount ?? 0) === 0);
  if (noVariantAssets.length > 0 && coveredChannels.length > 0) {
    recommendations.push({
      type:            "missing_variant",
      assetId:         noVariantAssets[0].assetId,
      title:           "Assets sin variantes de canal",
      description:     `${noVariantAssets.length} asset(s) aprobados no tienen variantes para otros canales. Considera crear variantes desde la Biblioteca.`,
      confidence:      0.7,
      suggestedAction: "Crear variantes de canal en Biblioteca",
    });
  }

  // STALE ASSET — assets older than 180 days
  const now     = Date.now();
  const stale   = approvedAssets.filter(a => {
    const age = now - Date.parse(a.approvedAt ?? a.createdAt);
    return age > 180 * 24 * 60 * 60 * 1000;
  });
  if (stale.length > 0) {
    recommendations.push({
      type:        "stale_asset",
      assetId:     stale[0].assetId,
      title:       "Assets con más de 6 meses",
      description: `${stale.length} asset(s) tienen más de 6 meses sin actualizar. Pueden no reflejar el producto actual o la temporada vigente.`,
      confidence:  0.6,
      suggestedAction: "Revisar y considerar regenerar con Foto Estudio",
    });
  }

  // Top reuse candidates
  const reuseCandidates = approvedAssets
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, 5);

  return {
    tenantId:                 req.tenantId,
    fullyConvered,
    missingChannels,
    coveredChannels,
    recommendations:          recommendations.sort((a, b) => b.confidence - a.confidence),
    reuseCandidates,
    suggestedGenerationScope: missingChannels,
  };
}

/**
 * buildLucaBriefingQuery — builds the AssetQuery Luca uses to pre-check the Biblioteca.
 *
 * Called before the generation briefing step to surface reuse opportunities.
 */
export function buildLucaBriefingQuery(req: LucaAnalysisRequest): AssetQuery {
  return {
    tenantId:   req.tenantId,
    intent:     "luca",
    sku:        req.sku,
    productId:  req.productRef,
    tags:       req.tags,
    channels:   req.targetChannels,
    statuses:   ["approved", "published"],
    campaignId: req.campaignId,
    limit:      20,
    sortBy:     "usage",
  };
}

/**
 * detectDuplicateRisk — checks if a planned generation is likely to duplicate existing assets.
 *
 * Simple rule-based check: if approved assets already exist for the same
 * product + channel combination with high usage, flag as duplicate risk.
 */
export function detectDuplicateRisk(
  req:    LucaAnalysisRequest,
  assets: ScoringInput[],
): LucaRecommendation | null {
  const highUsage = assets.filter(
    a =>
      (a.status === "approved" || a.status === "published") &&
      (a.usageCount ?? 0) >= 3 &&
      req.targetChannels.some(ch => a.channels.includes(ch))
  );

  if (highUsage.length === 0) return null;

  return {
    type:            "duplicate_risk",
    assetId:         highUsage[0].assetId,
    title:           "Posible generación duplicada",
    description:     `Existen ${highUsage.length} asset(s) aprobados con alto uso para este producto y canales. Considera reutilizar antes de generar nuevos.`,
    confidence:      Math.min(0.5 + highUsage.length * 0.1, 0.95),
    suggestedAction: "Revisar assets existentes antes de generar",
  };
}
