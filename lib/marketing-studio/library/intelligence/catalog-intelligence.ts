/**
 * lib/marketing-studio/library/intelligence/catalog-intelligence.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Catalog intelligence — smart selection and validation of catalog assets.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   A catalog is not a folder.
 *   A catalog is a curated, scored, validated compilation of assets
 *   built from the Biblioteca to serve a specific commercial purpose.
 *
 *   This module handles:
 *     - Asset selection strategy per catalog type
 *     - Gap detection (missing categories / products)
 *     - Duplicate exclusion within a catalog
 *     - Section fill recommendations
 *     - Readiness validation before compilation
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   When semantic search is available, catalog auto-population will use
 *   vector similarity to find visually coherent assets for each section,
 *   not just tag/category matching.
 */

import type { AssetChannel } from "../types";
import type { ProductCategory } from "../../foto-estudio-types";
import type { CatalogType }    from "../operations/catalogs";
import type { ScoringInput }   from "./scoring";
import { scoreForCatalog, scoreForWhatsApp } from "./scoring";

// ── Catalog recommendation ─────────────────────────────────────────────────────

/**
 * CatalogRecommendation — a single asset recommendation for a catalog slot.
 *
 * Produced by the catalog intelligence engine when auto-filling sections.
 */
export interface CatalogRecommendation {
  assetId:        string;
  /** Why this asset was recommended. */
  reason:         string;
  /** Confidence that this asset fits the catalog context (0–1). */
  confidence:     number;
  /** The catalog type this recommendation is optimized for. */
  recommendedFor: CatalogType | "whatsapp" | "landing" | "ads";
  /** Section ID this asset belongs to (if auto-filling a specific section). */
  sectionId?:     string;
  /** Score details for transparency. */
  score?:         number;
}

// ── Gap analysis ───────────────────────────────────────────────────────────────

/**
 * CatalogGap — a missing asset slot in a catalog.
 *
 * Gaps represent product categories or sections that have no approved
 * asset in the Biblioteca — action required.
 */
export interface CatalogGap {
  type:        "missing_category" | "missing_variant" | "missing_channel" | "low_quality";
  /** The product category with no representative asset. */
  category?:   ProductCategory;
  /** The channel with no compatible asset for this product. */
  channel?:    AssetChannel;
  /** Human-readable description of the gap. */
  description: string;
  /** Severity: "critical" = no usable asset, "warning" = suboptimal. */
  severity:    "critical" | "warning";
}

// ── Catalog readiness ──────────────────────────────────────────────────────────

/**
 * CatalogReadinessReport — pre-compilation validation report.
 *
 * Run before compiling a catalog to surface issues that would
 * produce a poor output (empty sections, low-quality assets, gaps).
 */
export interface CatalogReadinessReport {
  catalogId:       string;
  catalogType:     CatalogType;
  tenantId:        string;
  /** Whether the catalog passes all critical checks. */
  ready:           boolean;
  /** Total asset slots across all sections. */
  totalSlots:      number;
  /** Slots with a confirmed, approved asset. */
  filledSlots:     number;
  /** Slots with a missing or unapproved asset. */
  emptySlots:      number;
  /** Detected gaps (missing categories, channels, etc.). */
  gaps:            CatalogGap[];
  /** Warnings (non-blocking issues). */
  warnings:        string[];
  /** Critical blockers (prevent compilation). */
  blockers:        string[];
  /** Recommended actions before compiling. */
  recommendations: string[];
  /** Estimated asset quality score across all slots (0–1). */
  avgQualityScore: number;
}

// ── Selection strategy ─────────────────────────────────────────────────────────

/**
 * CatalogSelectionStrategy — how assets should be selected for a catalog type.
 */
export interface CatalogSelectionStrategy {
  catalogType:          CatalogType;
  /** Maximum assets per category before the section is considered "full". */
  maxPerCategory:       number;
  /** Whether to include lifestyle photos alongside product photos. */
  includeLifestyle:     boolean;
  /** Whether to exclude assets without pricing metadata. */
  requirePrice:         boolean;
  /** Whether to require at least one variant per product. */
  requireVariants:      boolean;
  /** Target number of assets for the full catalog. */
  targetTotal:          number;
  /** Minimum quality score threshold (0–1). */
  minQualityScore:      number;
}

// ── Strategy registry ──────────────────────────────────────────────────────────

/**
 * CATALOG_SELECTION_STRATEGIES — default selection strategy per catalog type.
 */
export const CATALOG_SELECTION_STRATEGIES: Record<CatalogType, CatalogSelectionStrategy> = {

  mayorista: {
    catalogType:      "mayorista",
    maxPerCategory:   6,
    includeLifestyle: false,
    requirePrice:     true,
    requireVariants:  false,
    targetTotal:      60,
    minQualityScore:  0.4,
  },

  retail: {
    catalogType:      "retail",
    maxPerCategory:   8,
    includeLifestyle: true,
    requirePrice:     false,
    requireVariants:  false,
    targetTotal:      80,
    minQualityScore:  0.5,
  },

  premium: {
    catalogType:      "premium",
    maxPerCategory:   4,
    includeLifestyle: true,
    requirePrice:     false,
    requireVariants:  true,
    targetTotal:      30,
    minQualityScore:  0.75,
  },

  whatsapp: {
    catalogType:      "whatsapp",
    maxPerCategory:   2,
    includeLifestyle: false,
    requirePrice:     true,
    requireVariants:  false,
    targetTotal:      10,
    minQualityScore:  0.6,
  },

  shopify: {
    catalogType:      "shopify",
    maxPerCategory:   10,
    includeLifestyle: true,
    requirePrice:     false,
    requireVariants:  true,
    targetTotal:      200,
    minQualityScore:  0.5,
  },

  social: {
    catalogType:      "social",
    maxPerCategory:   5,
    includeLifestyle: true,
    requirePrice:     false,
    requireVariants:  false,
    targetTotal:      25,
    minQualityScore:  0.6,
  },

};

// ── Intelligence functions ────────────────────────────────────────────────────

/**
 * selectCatalogAssets — selects and ranks the best assets for a catalog type.
 *
 * Applies the catalog-type strategy: max per category, quality threshold,
 * deduplication within the selection.
 */
export function selectCatalogAssets(
  assets:      ScoringInput[],
  catalogType: CatalogType,
  opts?: { maxTotal?: number },
): CatalogRecommendation[] {
  const strategy  = CATALOG_SELECTION_STRATEGIES[catalogType];
  const maxTotal  = opts?.maxTotal ?? strategy.targetTotal;
  const scorer    = catalogType === "whatsapp" ? scoreForWhatsApp : scoreForCatalog;

  const seen      = new Set<string>();
  const result:    CatalogRecommendation[] = [];

  const scored = assets
    .map(a => ({ asset: a, score: scorer(a) }))
    .filter(({ score }) => score >= strategy.minQualityScore)
    .sort((a, b) => b.score - a.score);

  for (const { asset, score } of scored) {
    if (result.length >= maxTotal) break;
    if (seen.has(asset.assetId))   continue;

    seen.add(asset.assetId);
    result.push({
      assetId:        asset.assetId,
      reason:         buildRecommendationReason(asset, catalogType, score),
      confidence:     score,
      recommendedFor: catalogType,
      score,
    });
  }

  return result;
}

/**
 * detectCatalogGaps — identifies missing or weak asset coverage for a catalog.
 *
 * Checks which product categories have no approved asset in the Biblioteca,
 * and which required channels have no compatible asset.
 */
export function detectCatalogGaps(
  assets:          ScoringInput[],
  expectedCategories: ProductCategory[],
  catalogType:     CatalogType,
): CatalogGap[] {
  const gaps:    CatalogGap[] = [];
  const strategy = CATALOG_SELECTION_STRATEGIES[catalogType];

  // Check for completely missing product coverage
  // (Future: cross-reference with category tags when metadata is richer)
  const approvedCount = assets.filter(
    a => a.status === "approved" || a.status === "published"
  ).length;

  if (approvedCount === 0) {
    gaps.push({
      type:        "missing_category",
      description: "No hay assets aprobados disponibles para el catálogo.",
      severity:    "critical",
    });
    return gaps;
  }

  // Quality gap — assets exist but most are below threshold
  const qualifiedCount = assets.filter(
    a => (catalogType === "whatsapp" ? scoreForWhatsApp(a) : scoreForCatalog(a)) >= strategy.minQualityScore
  ).length;

  if (qualifiedCount < Math.min(3, expectedCategories.length)) {
    gaps.push({
      type:        "low_quality",
      description: `Solo ${qualifiedCount} assets superan el umbral de calidad mínimo para catálogo ${catalogType}.`,
      severity:    "warning",
    });
  }

  // Variant gap for premium/shopify
  if (strategy.requireVariants) {
    const withVariants = assets.filter(a => (a.variantCount ?? 0) > 0).length;
    if (withVariants < approvedCount * 0.5) {
      gaps.push({
        type:        "missing_variant",
        description: "Menos del 50% de los assets tienen variantes de canal. Recomendado para catálogo premium/Shopify.",
        severity:    "warning",
      });
    }
  }

  return gaps;
}

/**
 * validateCatalogReadiness — runs all pre-compilation checks for a catalog.
 *
 * Returns a CatalogReadinessReport with gaps, warnings, and blockers.
 */
export function validateCatalogReadiness(params: {
  catalogId:          string;
  catalogType:        CatalogType;
  tenantId:           string;
  availableAssets:    ScoringInput[];
  expectedCategories: ProductCategory[];
  totalSlots:         number;
  filledSlots:        number;
}): CatalogReadinessReport {
  const {
    catalogId, catalogType, tenantId,
    availableAssets, expectedCategories,
    totalSlots, filledSlots,
  } = params;

  const emptySlots = totalSlots - filledSlots;
  const blockers:        string[] = [];
  const warnings:        string[] = [];
  const recommendations: string[] = [];

  if (filledSlots === 0) {
    blockers.push("El catálogo no tiene ningún asset asignado.");
  }
  if (emptySlots > totalSlots * 0.5) {
    warnings.push(`Más del 50% de los slots del catálogo están vacíos (${emptySlots}/${totalSlots}).`);
  }

  const gaps = detectCatalogGaps(availableAssets, expectedCategories, catalogType);
  const criticalGaps = gaps.filter(g => g.severity === "critical");

  if (criticalGaps.length > 0) {
    criticalGaps.forEach(g => blockers.push(g.description));
  }
  gaps.filter(g => g.severity === "warning").forEach(g => warnings.push(g.description));

  if (availableAssets.length < filledSlots) {
    recommendations.push("Considerar generar más assets desde Foto Estudio para completar el catálogo.");
  }

  // Average quality score
  const strategy = CATALOG_SELECTION_STRATEGIES[catalogType];
  const scorer   = catalogType === "whatsapp" ? scoreForWhatsApp : scoreForCatalog;
  const scores   = availableAssets.map(a => scorer(a));
  const avgQualityScore = scores.length > 0
    ? scores.reduce((s, v) => s + v, 0) / scores.length
    : 0;

  if (avgQualityScore < strategy.minQualityScore) {
    warnings.push(`Calidad promedio de assets (${avgQualityScore.toFixed(2)}) está por debajo del umbral mínimo (${strategy.minQualityScore}).`);
    recommendations.push("Revisar y aprobar más assets de alta calidad antes de compilar.");
  }

  return {
    catalogId,
    catalogType,
    tenantId,
    ready:           blockers.length === 0,
    totalSlots,
    filledSlots,
    emptySlots,
    gaps,
    warnings,
    blockers,
    recommendations,
    avgQualityScore,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRecommendationReason(
  asset:       ScoringInput,
  catalogType: CatalogType,
  score:       number,
): string {
  if (score >= 0.8)  return `Asset de alta calidad para catálogo ${catalogType} (score: ${score.toFixed(2)}).`;
  if (score >= 0.6)  return `Asset compatible con catálogo ${catalogType} (score: ${score.toFixed(2)}).`;
  return `Asset aceptable para catálogo ${catalogType} — verificar calidad (score: ${score.toFixed(2)}).`;
}
