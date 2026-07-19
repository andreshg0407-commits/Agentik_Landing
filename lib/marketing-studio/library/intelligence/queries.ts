/**
 * lib/marketing-studio/library/intelligence/queries.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Asset query system — how the Biblioteca finds assets.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   Queries are not just filters.
 *   A query carries operational INTENT — "I need this for WhatsApp",
 *   "I need this for the back-to-school catalog", "Mila needs a product photo".
 *
 *   Intent drives:
 *     - scoring weight (freshness vs relevance vs performance)
 *     - channel compatibility filtering
 *     - lifecycle state thresholds
 *     - tenant taxonomy constraints
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   When embeddings are available, AssetQuery.query will become a semantic
 *   search vector — the same interface, richer execution.
 */

import type { AssetType, AssetStatus, AssetChannel } from "../types";
import type { ProductCategory, GarmentType }          from "../../foto-estudio-types";
import type { AssetDestination }                       from "../operations/destinations";

// ── Query intent ───────────────────────────────────────────────────────────────

/**
 * QueryIntent — the operational purpose behind this query.
 *
 * The same set of assets can be ranked differently depending on intent:
 *   "catalog" → prioritize high-resolution, print-quality assets
 *   "whatsapp" → prioritize small files, portrait format, product clarity
 *   "ads"      → prioritize strong visual contrast, minimal text
 *   "social"   → prioritize lifestyle / editorial feel
 *   "shopify"  → prioritize clean white-background product shots
 *   "crm"      → prioritize recognizable product + clear pricing context
 */
export type QueryIntent =
  | "catalog"
  | "shopify"
  | "social"
  | "ads"
  | "crm"
  | "whatsapp"
  | "luca"      // Luca agent — creative reuse and campaign matching
  | "mila"      // Mila agent — customer-facing retrieval
  | "review"    // approval queue view
  | "explore";  // operator browsing without specific intent

// ── Sort strategy ──────────────────────────────────────────────────────────────

/**
 * QuerySortBy — how results should be ordered.
 */
export type QuerySortBy =
  | "recent"      // newest first (createdAt DESC)
  | "usage"       // most used across channels
  | "relevance"   // keyword / tag match score
  | "performance" // high-engagement assets first (future: analytics)
  | "freshness"   // recently approved or updated
  | "alphabetical"; // name ASC

// ── Core query ─────────────────────────────────────────────────────────────────

/**
 * AssetQuery — the canonical query object for Biblioteca asset retrieval.
 *
 * Used by:
 *   - Biblioteca search UI (operator browsing)
 *   - Mila agent (customer intent → product photo)
 *   - Luca agent (campaign briefs → reusable assets)
 *   - Catalog compiler (auto-populate catalog sections)
 *   - Shopify export pipeline (select which assets to push)
 */
export interface AssetQuery {
  /** Tenant isolation — required. */
  tenantId:         string;

  // ── Text search ────────────────────────────────────────────────────────────

  /**
   * Free-text search string.
   * Currently matched against: name, tags, sku, productName, caption.
   * Future: semantic vector search (embeddings).
   */
  query?:           string;

  // ── Taxonomy filters ───────────────────────────────────────────────────────

  /** Filter by retail product category (Castillitos, retail tenants). */
  categories?:      ProductCategory[];
  /** Filter by fashion garment type (Do Jeans, fashion tenants). */
  garmentTypes?:    GarmentType[];
  /** Filter by asset type. */
  assetTypes?:      AssetType[];
  /** Filter by declared channel readiness. */
  channels?:        AssetChannel[];
  /** Filter by lifecycle status. */
  statuses?:        AssetStatus[];
  /** Match any of these tags. */
  tags?:            string[];
  /** Exact SKU match. */
  sku?:             string;
  /** Season label (e.g. "temporada_escolar_2026"). */
  season?:          string;
  /** Business line filter (e.g. "kids", "premium", "basics"). */
  businessLine?:    string;
  /** Free-text taxonomy (e.g. "ropa niño", "juguetes", "calzado"). */
  taxonomy?:        string[];

  // ── Relation filters ───────────────────────────────────────────────────────

  /** Filter by linked product ID. */
  productId?:       string;
  /** Filter by linked campaign ID. */
  campaignId?:      string;
  /** Filter by session ID (assets from a specific Foto Estudio run). */
  sessionId?:       string;
  /** Filter by batch job ID. */
  batchJobId?:      string;

  // ── Date filters ───────────────────────────────────────────────────────────

  /** Include only assets created after this ISO date. */
  createdAfter?:    string;
  /** Include only assets created before this ISO date. */
  createdBefore?:   string;
  /** Include only assets approved after this ISO date. */
  approvedAfter?:   string;

  // ── Quality / readiness filters ────────────────────────────────────────────

  /** Only assets with all required destination readiness flags set. */
  destinationReady?: AssetDestination;
  /** Only assets that have at least one variant. */
  hasVariants?:     boolean;
  /** Exclude assets flagged as near-duplicates. */
  excludeDuplicates?: boolean;
  /** Only assets with a usage count above this threshold. */
  minUsageCount?:   number;

  // ── Pagination ─────────────────────────────────────────────────────────────

  /** Max results to return. Default: 20. */
  limit?:           number;
  /** Offset for pagination. */
  offset?:          number;

  // ── Ranking ────────────────────────────────────────────────────────────────

  sortBy?:          QuerySortBy;

  /**
   * Operational intent — drives scoring and ranking strategy.
   * If not provided, defaults to "explore" (neutral sorting by recent).
   */
  intent?:          QueryIntent;
}

// ── Query tokens ───────────────────────────────────────────────────────────────

/**
 * QueryToken — a parsed token from the free-text query string.
 *
 * Used by the token-based matcher before semantic search is available.
 */
export interface QueryToken {
  raw:       string;
  normalized: string;
  /** Whether this token looks like a SKU (alphanumeric, short). */
  isSku:     boolean;
  /** Whether this token is a known tag keyword. */
  isTag:     boolean;
  /** Whether this token is a product category label. */
  isCategory: boolean;
}

// ── Normalized query ───────────────────────────────────────────────────────────

/**
 * NormalizedQuery — the parsed and enriched form of an AssetQuery.
 *
 * Produced by normalizeQuery(). Used internally by the query executor.
 * Carries resolved tokens, inferred channels, and ranking weights.
 */
export interface NormalizedQuery extends AssetQuery {
  /** Parsed tokens from the query string. */
  tokens:           QueryToken[];
  /** Channels inferred from intent (e.g. "whatsapp" intent → ["whatsapp"]). */
  inferredChannels: AssetChannel[];
  /** Inferred statuses from intent (e.g. "catalog" intent → ["approved"]). */
  inferredStatuses: AssetStatus[];
  /** Ranking weight profile derived from intent. */
  rankingWeights:   RankingWeights;
}

/**
 * RankingWeights — the scoring weights applied to asset scoring for a query.
 *
 * All weights sum to 1.0.
 */
export interface RankingWeights {
  relevance:   number;   // tag/text match closeness
  freshness:   number;   // how recently approved / updated
  usage:       number;   // publication history / usage count
  completeness: number;  // metadata + variants + relations filled
  channel:     number;   // compatibility with target channel
}

// ── Query normalization ────────────────────────────────────────────────────────

/**
 * normalizeQuery — enriches a raw AssetQuery with inferred context.
 *
 * - Parses free-text into QueryTokens
 * - Infers channels from intent
 * - Infers status filters from intent
 * - Builds ranking weight profile
 */
export function normalizeQuery(q: AssetQuery): NormalizedQuery {
  const tokens          = buildQueryTokens(q.query);
  const inferredChannels = inferChannelsFromIntent(q.intent);
  const inferredStatuses = inferStatusesFromIntent(q.intent);
  const rankingWeights   = buildRankingWeights(q.intent ?? "explore");

  return {
    ...q,
    tokens,
    inferredChannels,
    inferredStatuses,
    rankingWeights,
    // Merge inferred statuses with explicit ones
    statuses: q.statuses?.length
      ? q.statuses
      : inferredStatuses,
    // Merge inferred channels with explicit ones
    channels: q.channels?.length
      ? q.channels
      : inferredChannels.length ? inferredChannels : q.channels,
    limit:  q.limit  ?? 20,
    offset: q.offset ?? 0,
    sortBy: q.sortBy ?? defaultSortForIntent(q.intent ?? "explore"),
  };
}

/**
 * buildQueryTokens — parses a free-text query into structured tokens.
 */
export function buildQueryTokens(query?: string): QueryToken[] {
  if (!query || query.trim().length === 0) return [];

  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .map(raw => {
      const normalized = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")  // strip accents
        .replace(/[^a-z0-9-_]/g, "");     // keep only word chars

      return {
        raw,
        normalized,
        isSku:      /^[a-z0-9]{3,12}$/.test(normalized) && /\d/.test(normalized),
        isTag:      normalized.length >= 3,
        isCategory: false,  // future: lookup against ProductCategory labels
      };
    })
    .filter(t => t.normalized.length >= 2);
}

// ── Intent inference ───────────────────────────────────────────────────────────

function inferChannelsFromIntent(intent?: QueryIntent): AssetChannel[] {
  switch (intent) {
    case "whatsapp": return ["whatsapp"];
    case "shopify":  return ["shopify"];
    case "social":   return ["instagram", "facebook", "tiktok"];
    case "ads":      return ["ads"];
    case "crm":      return ["crm", "whatsapp"];
    case "catalog":  return ["catalog"];
    default:         return [];
  }
}

function inferStatusesFromIntent(intent?: QueryIntent): AssetStatus[] {
  switch (intent) {
    case "review":   return ["generated", "review_pending"];
    case "explore":  return [];  // show all for operator browsing
    default:         return ["approved", "published"];
  }
}

function defaultSortForIntent(intent: QueryIntent): QuerySortBy {
  switch (intent) {
    case "whatsapp":
    case "mila":    return "usage";
    case "luca":    return "relevance";
    case "review":  return "recent";
    case "ads":
    case "social":  return "performance";
    default:        return "recent";
  }
}

function buildRankingWeights(intent: QueryIntent): RankingWeights {
  switch (intent) {
    case "whatsapp":
    case "mila":
      return { relevance: 0.3, freshness: 0.1, usage: 0.4, completeness: 0.1, channel: 0.1 };
    case "catalog":
      return { relevance: 0.2, freshness: 0.2, usage: 0.2, completeness: 0.3, channel: 0.1 };
    case "shopify":
      return { relevance: 0.3, freshness: 0.2, usage: 0.2, completeness: 0.2, channel: 0.1 };
    case "ads":
    case "social":
      return { relevance: 0.2, freshness: 0.3, usage: 0.3, completeness: 0.1, channel: 0.1 };
    case "luca":
      return { relevance: 0.4, freshness: 0.2, usage: 0.2, completeness: 0.1, channel: 0.1 };
    default:
      return { relevance: 0.3, freshness: 0.2, usage: 0.2, completeness: 0.2, channel: 0.1 };
  }
}

// ── Query builders ─────────────────────────────────────────────────────────────

/**
 * buildCatalogQuery — pre-built query for catalog compilation.
 *
 * Returns only approved assets cleared for the catalog channel.
 */
export function buildCatalogQuery(tenantId: string, opts?: {
  season?:       string;
  businessLine?: string;
  categories?:   ProductCategory[];
  limit?:        number;
}): AssetQuery {
  return {
    tenantId,
    intent:       "catalog",
    statuses:     ["approved"],
    channels:     ["catalog"],
    season:       opts?.season,
    businessLine: opts?.businessLine,
    categories:   opts?.categories,
    limit:        opts?.limit ?? 100,
    sortBy:       "relevance",
  };
}

/**
 * buildChannelQuery — pre-built query for a specific destination channel.
 */
export function buildChannelQuery(
  tenantId: string,
  channel:  AssetChannel,
  opts?: { limit?: number; tags?: string[] },
): AssetQuery {
  const intentMap: Partial<Record<AssetChannel, QueryIntent>> = {
    whatsapp:  "whatsapp",
    shopify:   "shopify",
    instagram: "social",
    facebook:  "social",
    ads:       "ads",
    catalog:   "catalog",
    crm:       "crm",
  };

  return {
    tenantId,
    intent:   intentMap[channel] ?? "explore",
    channels: [channel],
    statuses: ["approved"],
    tags:     opts?.tags,
    limit:    opts?.limit ?? 30,
    sortBy:   "usage",
  };
}

/**
 * buildCategoryQuery — pre-built query for a specific product category.
 */
export function buildCategoryQuery(
  tenantId:  string,
  category:  ProductCategory,
  opts?: { intent?: QueryIntent; limit?: number },
): AssetQuery {
  return {
    tenantId,
    intent:     opts?.intent ?? "explore",
    categories: [category],
    statuses:   ["approved"],
    limit:      opts?.limit ?? 40,
    sortBy:     "recent",
  };
}

/**
 * buildSkuQuery — exact-match query for a specific product SKU.
 */
export function buildSkuQuery(
  tenantId: string,
  sku:      string,
  intent?:  QueryIntent,
): AssetQuery {
  return {
    tenantId,
    sku,
    intent:   intent ?? "explore",
    statuses: ["approved", "published"],
    limit:    20,
    sortBy:   "recent",
  };
}
