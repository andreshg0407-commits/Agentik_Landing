/**
 * lib/marketing-studio/library/index.ts
 *
 * Barrel export for the Biblioteca / Asset Hub library layer.
 *
 * Import from here in application code:
 *   import type { MarketingAsset, LibrarySearchFilter } from "@/lib/marketing-studio/library";
 *   import { validateTransition, STATUS_DISPLAY }       from "@/lib/marketing-studio/library";
 *   import { validateMinimalMetadata, buildMetadata }   from "@/lib/marketing-studio/library";
 *   import { normalizeQuery, resolveMilaQuery }         from "@/lib/marketing-studio/library";
 *   import { calculateAssetScore, SEARCH_PRESETS }      from "@/lib/marketing-studio/library";
 */

// Core types
export type {
  AssetType,
  AssetStatus,
  AssetOrigin,
  AssetChannel,
  AssetRelation,
  AssetVariant,
  MarketingAsset,
  BatchJobItem,
  BatchJobStatus,
  BatchGenerationJob,
  CatalogQuery,
  LibrarySearchFilter,
  LibrarySearchResult,
  DuplicateRelationType,
  AssetDuplicateRecord,
  AssetStorageSlot,
  AssetStorageProfile,
} from "./types";

// Lifecycle
export {
  VALID_TRANSITIONS,
  TRANSITION_META,
  STATUS_DISPLAY,
  canTransition,
  validateTransition,
  isTerminalStatus,
  isPublishable,
  isReviewable,
  isActive,
  resolveInitialStatus,
} from "./lifecycle";

export type { StatusDisplayConfig, StatusTransitionMeta } from "./lifecycle";

// Metadata
export {
  validateMinimalMetadata,
  buildMetadata,
  extractMinimalMetadata,
  extractContextualMetadata,
  buildAssetDisplayName,
} from "./metadata";

export type {
  AssetMinimalMetadata,
  AssetContextualMetadata,
  MetadataValidationResult,
} from "./metadata";

// Intelligence layer (MS-03)
export type {
  QueryIntent,
  QuerySortBy,
  AssetQuery,
  QueryToken,
  NormalizedQuery,
  RankingWeights,
  AssetScore,
  ScoringInput,
  ScoringContext,
  CatalogRecommendation,
  CatalogGap,
  CatalogReadinessReport,
  CatalogSelectionStrategy,
  MilaAssetRequest,
  MilaAssetResult,
  MilaRetrievalResult,
  WhatsAppCatalogBundle,
  WhatsAppCatalogItem,
  LucaRecommendationType,
  LucaRecommendation,
  LucaAnalysisRequest,
  LucaAnalysisResult,
  SimilarityMethod,
  DuplicateType,
  DuplicateResolution,
  AssetSimilarityResult,
  LibraryDuplicateRecord,
  BatchDeduplicationContext,
  DeduplicationReport,
  AssetUsageInsight,
  AssetUsageEvent,
  UsageEventType,
  UsageMetricsSnapshot,
  AssetUsageAggregate,
  AssetStalenessLevel,
  TenantUsageSummary,
  SearchPresetId,
  SearchPreset,
} from "./intelligence";

export {
  // Queries
  normalizeQuery,
  buildQueryTokens,
  buildCatalogQuery,
  buildChannelQuery,
  buildCategoryQuery,
  buildSkuQuery,
  // Scoring
  calculateAssetScore,
  rankAssets,
  scoreForChannel,
  scoreForWhatsApp,
  scoreForCatalog,
  // Catalog intelligence
  CATALOG_SELECTION_STRATEGIES,
  selectCatalogAssets,
  detectCatalogGaps,
  validateCatalogReadiness,
  // Mila
  resolveMilaQuery,
  rankForCustomerIntent,
  getBestWhatsAppAssets,
  buildWhatsAppCatalog,
  // Luca
  analyzeBibliotecaForLuca,
  buildLucaBriefingQuery,
  detectDuplicateRisk,
  // Duplicates
  DUPLICATE_THRESHOLDS,
  classifyDuplicate,
  buildSimilarityExplanation,
  pHashDistanceToScore,
  isLikelyDuplicate,
  isConfirmedDuplicate,
  // Usage
  computeUsageInsight,
  classifyStaleness,
  findUnderusedAssets,
  findStaleAssets,
  findHighPerformers,
  rankByUsage,
  // Presets
  SEARCH_PRESETS,
  buildPresetQuery,
  getActivePresets,
  getPresetsByAccent,
} from "./intelligence";
