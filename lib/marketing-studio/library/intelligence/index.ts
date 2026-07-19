/**
 * lib/marketing-studio/library/intelligence/index.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Barrel export for the Biblioteca intelligence layer.
 *
 * ── MODULES ───────────────────────────────────────────────────────────────────
 *
 *   queries              — asset query system (AssetQuery, normalizeQuery, builders)
 *   scoring              — asset scoring and ranking (AssetScore, calculateAssetScore)
 *   catalog-intelligence — catalog selection, gap detection, readiness validation
 *   mila                 — Mila agent retrieval (MilaAssetRequest, resolveMilaQuery)
 *   luca                 — Luca agent intelligence (LucaRecommendation, analysis)
 *   duplicates           — duplicate detection and classification
 *   usage                — usage insights, staleness, high performers
 *   presets              — named search presets for Biblioteca UI
 */

// ── Queries ───────────────────────────────────────────────────────────────────

export type {
  QueryIntent,
  QuerySortBy,
  AssetQuery,
  QueryToken,
  NormalizedQuery,
  RankingWeights,
} from "./queries";
export {
  normalizeQuery,
  buildQueryTokens,
  buildCatalogQuery,
  buildChannelQuery,
  buildCategoryQuery,
  buildSkuQuery,
} from "./queries";

// ── Scoring ───────────────────────────────────────────────────────────────────

export type {
  AssetScore,
  ScoringInput,
  ScoringContext,
} from "./scoring";
export {
  calculateAssetScore,
  rankAssets,
  scoreForChannel,
  scoreForWhatsApp,
  scoreForCatalog,
} from "./scoring";

// ── Catalog intelligence ──────────────────────────────────────────────────────

export type {
  CatalogRecommendation,
  CatalogGap,
  CatalogReadinessReport,
  CatalogSelectionStrategy,
} from "./catalog-intelligence";
export {
  CATALOG_SELECTION_STRATEGIES,
  selectCatalogAssets,
  detectCatalogGaps,
  validateCatalogReadiness,
} from "./catalog-intelligence";

// ── Mila ──────────────────────────────────────────────────────────────────────

export type {
  MilaAssetRequest,
  MilaAssetResult,
  MilaRetrievalResult,
  WhatsAppCatalogBundle,
  WhatsAppCatalogItem,
} from "./mila";
export {
  resolveMilaQuery,
  rankForCustomerIntent,
  getBestWhatsAppAssets,
  buildWhatsAppCatalog,
} from "./mila";

// ── Luca ──────────────────────────────────────────────────────────────────────

export type {
  LucaRecommendationType,
  LucaRecommendation,
  LucaAnalysisRequest,
  LucaAnalysisResult,
} from "./luca";
export {
  analyzeBibliotecaForLuca,
  buildLucaBriefingQuery,
  detectDuplicateRisk,
} from "./luca";

// ── Duplicates ────────────────────────────────────────────────────────────────

export type {
  SimilarityMethod,
  DuplicateType,
  DuplicateResolution,
  AssetSimilarityResult,
  LibraryDuplicateRecord,
  BatchDeduplicationContext,
  DeduplicationReport,
} from "./duplicates";
export {
  DUPLICATE_THRESHOLDS,
  classifyDuplicate,
  buildSimilarityExplanation,
  pHashDistanceToScore,
  isLikelyDuplicate,
  isConfirmedDuplicate,
} from "./duplicates";

// ── Usage ─────────────────────────────────────────────────────────────────────

export type {
  AssetUsageInsight,
  AssetUsageEvent,
  UsageEventType,
  UsageMetricsSnapshot,
  AssetUsageAggregate,
  AssetStalenessLevel,
  TenantUsageSummary,
} from "./usage";
export {
  computeUsageInsight,
  classifyStaleness,
  findUnderusedAssets,
  findStaleAssets,
  findHighPerformers,
  rankByUsage,
} from "./usage";

// ── Presets ───────────────────────────────────────────────────────────────────

export type {
  SearchPresetId,
  SearchPreset,
} from "./presets";
export {
  SEARCH_PRESETS,
  buildPresetQuery,
  getActivePresets,
  getPresetsByAccent,
} from "./presets";
