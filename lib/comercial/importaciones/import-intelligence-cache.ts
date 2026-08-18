/**
 * lib/comercial/importaciones/import-intelligence-cache.ts
 *
 * Server-side two-layer cache for the canonical import intelligence result.
 *
 * SINGLE TRUTH RULE:
 *   Both Manager and Desktop consume the SAME result produced by
 *   buildImportSupplyIntelligence(). This cache ensures:
 *     - No parallel business rules
 *     - No repeated SOAP calls per navigation
 *     - Identical KPIs across all surfaces
 *     - Composite freshness from ALL participating sources
 *
 * L1: In-memory Map, 5-min TTL. Fast path for same-process requests.
 * L2: Postgres-backed JSON (import_intelligence_cache table), 30-min TTL.
 *     Shared across all Vercel function instances. Survives cold starts.
 *     /tmp is NOT shared on Vercel — file-based L2 was rejected.
 *
 * READ PATH (getCachedImportIntelligence — called by web requests):
 *   Web requests NEVER call buildImportSupplyIntelligence(). They only read:
 *   - L1 fresh → serve CERTIFIED
 *   - L1 miss + L2 fresh → promote to L1, serve CERTIFIED
 *   - L1 miss + L2 stale → promote to L1, serve STALE with freshness
 *   - No snapshot → SOURCE_UNAVAILABLE (never false zeros)
 *
 * WRITE PATH (prewarmImportCache — called by cron/admin only):
 *   Only prewarm forces a full recompute via buildImportSupplyIntelligence().
 *   Computes fresh FIRST, then atomically writes both layers (UPSERT).
 *   On failure, the prior snapshot is preserved — never deleted before success.
 *
 * FAIL-CLOSED CONTRACT:
 *   When SOURCE_UNAVAILABLE, result.kpis uses sentinel value totalRefs = -1
 *   to distinguish "no cache snapshot" from "prewarm ran, zero import refs."
 *   UI consumers MUST check: if kpis.totalRefs < 0, treat as unavailable
 *   and show em dashes instead of numeric zeros.
 *
 * Sprint: AGENTIK-MANAGER-RELEASE-GATE-01 + IMPORT-CACHE-PROD-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildImportSupplyIntelligence } from "./import-intelligence-service";
import type { ImportSupplyIntelligenceResult } from "./import-intelligence-service";
import type { ImportSupplyKpis } from "./import-types";

// ── Freshness contract ──────────────────────────────────────────────────────

export interface ImportSourceFreshness {
  /** Oldest syncedAt across ProductEntity records (updatedAt) */
  productEntityAsOf: string | null;
  /** MAX(ProductInventoryLevel.syncedAt) for import warehouse records */
  inventoryAsOf: string | null;
  /** MAX(CustomerOrderLine.syncedAt) for import reference codes */
  orderLinesAsOf: string | null;
  /** The oldest of the three — composite freshness ceiling */
  compositeAsOf: string | null;
}

export type CachedImportTruthState = "CERTIFIED" | "STALE" | "SOURCE_UNAVAILABLE";

export interface CachedImportIntelligence {
  result: ImportSupplyIntelligenceResult;
  freshness: ImportSourceFreshness;
  truthState: CachedImportTruthState;
  computedAt: string;
  /** When truthState is STALE, this explains why */
  staleCause: string | null;
}

// ── Manager KPI projection ──────────────────────────────────────────────────

export interface ImportManagerKpis {
  totalRefs: number;
  /** inventarioLento from canonical engine (daysSinceLastInbound > 240 + remaining > 0) */
  lowRotationCount: number;
  /** comprarAhora from canonical engine (recompraClassification === INMEDIATA) */
  recompraInmediataCount: number;
  /** Items with lastInboundSource === UNAVAILABLE and remaining > 0 */
  sinFechaCount: number;
}

// ── In-memory cache (L1) ────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: CachedImportIntelligence;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// ── Composite freshness loader ──────────────────────────────────────────────

async function loadSourceFreshness(
  organizationId: string,
  productIds: string[],
  referenceCodes: string[],
): Promise<ImportSourceFreshness> {
  const db = prisma as any;

  // All three queries in parallel
  const [productResult, inventoryResult, orderLineResult] = await Promise.all([
    // ProductEntity: MAX(updatedAt) for import products
    productIds.length > 0
      ? db.productEntity.findFirst({
          where: { id: { in: productIds } },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        })
      : null,

    // ProductInventoryLevel: MAX(syncedAt) for import warehouse records
    productIds.length > 0
      ? db.productInventoryLevel.findFirst({
          where: { organizationId, productId: { in: productIds } },
          orderBy: { syncedAt: "desc" },
          select: { syncedAt: true },
        })
      : null,

    // CustomerOrderLine: MAX(syncedAt) for import reference codes
    referenceCodes.length > 0
      ? db.customerOrderLine.findFirst({
          where: { organizationId, referenceCode: { in: referenceCodes } },
          orderBy: { syncedAt: "desc" },
          select: { syncedAt: true },
        })
      : null,
  ]);

  const productEntityAsOf = productResult?.updatedAt
    ? new Date(productResult.updatedAt).toISOString()
    : null;
  const inventoryAsOf = inventoryResult?.syncedAt
    ? new Date(inventoryResult.syncedAt).toISOString()
    : null;
  const orderLinesAsOf = orderLineResult?.syncedAt
    ? new Date(orderLineResult.syncedAt).toISOString()
    : null;

  // Composite = oldest of available sources (freshness ceiling)
  const dates = [productEntityAsOf, inventoryAsOf, orderLinesAsOf]
    .filter((d): d is string => d !== null)
    .map(d => new Date(d).getTime());

  const compositeAsOf = dates.length > 0
    ? new Date(Math.min(...dates)).toISOString()
    : null;

  return { productEntityAsOf, inventoryAsOf, orderLinesAsOf, compositeAsOf };
}

// ── L2: Postgres-backed persistent cache ────────────────────────────────────
// Shared across all Vercel function instances via Neon Postgres.
// Table: import_intelligence_cache — created by versioned migration
// (prisma/migrations/20260814000000_import_intelligence_cache/migration.sql).
// /tmp is NOT shared on Vercel — file-based L2 was rejected.

const L2_TTL_MS = 30 * 60 * 1000; // 30 minutes
const L2_SCHEMA_VERSION = 1;

async function readL2(organizationId: string): Promise<CachedImportIntelligence | null> {
  try {
    const rows: Array<{ payload: any; updated_at: Date }> = await (prisma as any).$queryRawUnsafe(
      `SELECT payload, updated_at FROM import_intelligence_cache
       WHERE organization_id = $1
         AND updated_at > NOW() - INTERVAL '30 minutes'
         AND schema_version = $2`,
      organizationId,
      L2_SCHEMA_VERSION,
    );
    if (!rows || rows.length === 0) return null;
    // Postgres JSONB returns parsed object directly
    return rows[0].payload as CachedImportIntelligence;
  } catch {
    return null;
  }
}

async function writeL2(organizationId: string, data: CachedImportIntelligence): Promise<void> {
  try {
    const sourceAsOf = data.freshness.compositeAsOf ?? null;
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO import_intelligence_cache
         (organization_id, schema_version, payload, computed_at, source_as_of, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET
         schema_version = $2,
         payload = $3::jsonb,
         computed_at = $4::timestamptz,
         source_as_of = $5::timestamptz,
         updated_at = NOW()`,
      organizationId,
      L2_SCHEMA_VERSION,
      JSON.stringify(data),
      data.computedAt,
      sourceAsOf,
    );
  } catch (err) {
    console.warn(`[IMPORT-CACHE-L2] write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readL2Stale(organizationId: string): Promise<CachedImportIntelligence | null> {
  // Read L2 even if expired — for failure fallback
  try {
    const rows: Array<{ payload: any }> = await (prisma as any).$queryRawUnsafe(
      `SELECT payload FROM import_intelligence_cache
       WHERE organization_id = $1 AND schema_version = $2`,
      organizationId,
      L2_SCHEMA_VERSION,
    );
    if (!rows || rows.length === 0) return null;
    return rows[0].payload as CachedImportIntelligence;
  } catch {
    return null;
  }
}

// ── Core: read-only cache lookup (web requests) ─────────────────────────────
// Web requests NEVER call buildImportSupplyIntelligence().
// They read L1 → L2 fresh → L2 stale → SOURCE_UNAVAILABLE.
// Computation is exclusively via prewarmImportCache (cron/admin).

export async function getCachedImportIntelligence(
  organizationId: string,
): Promise<CachedImportIntelligence> {
  const now = Date.now();
  const existing = cache.get(organizationId);

  // L1 hit — serve immediately
  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  // L1 miss — check L2 fresh (within 30-min TTL)
  const l2Data = await readL2(organizationId);
  if (l2Data) {
    // L2 fresh hit → promote to L1, serve CERTIFIED
    cache.set(organizationId, { data: l2Data, expiresAt: now + CACHE_TTL_MS });
    return l2Data;
  }

  // L1 expired — serve stale L1 if available
  if (existing) {
    const staleData: CachedImportIntelligence = {
      ...existing.data,
      truthState: "STALE",
      staleCause: "L1 expired, L2 expired or missing — serve stale until next prewarm",
    };
    // Extend L1 TTL by 1 minute to avoid repeated Postgres reads
    cache.set(organizationId, { data: staleData, expiresAt: now + 60_000 });
    return staleData;
  }

  // L1 miss + L2 expired — read L2 stale (any age) and serve immediately
  const l2Stale = await readL2Stale(organizationId);
  if (l2Stale) {
    const staleData: CachedImportIntelligence = {
      ...l2Stale,
      truthState: "STALE",
      staleCause: "L2 beyond 30-min TTL — serve stale until next prewarm",
    };
    cache.set(organizationId, { data: staleData, expiresAt: now + 60_000 });
    return staleData;
  }

  // No snapshot anywhere — SOURCE_UNAVAILABLE
  // FAIL-CLOSED: totalRefs = -1 sentinel so UI consumers can distinguish
  // "no cache" from "prewarm ran, genuinely zero refs."
  // UI MUST check kpis.totalRefs < 0 and render em dashes, not "0".
  return {
    result: { items: [], kpis: unavailableKpis(), salesCoverage: { salesAsOf: null, salesSourceMinDate: null, salesSourceMaxDate: null, freshnessLagDays: null, coverage6m: false, coverage8m: false, coverage12m: false } },
    freshness: {
      productEntityAsOf: null,
      inventoryAsOf: null,
      orderLinesAsOf: null,
      compositeAsOf: null,
    },
    truthState: "SOURCE_UNAVAILABLE",
    computedAt: new Date().toISOString(),
    staleCause: "No cached snapshot — run prewarm to compute initial intelligence",
  };
}

// ── Manager KPI projection ──────────────────────────────────────────────────

export function projectManagerKpis(
  cached: CachedImportIntelligence,
): ImportManagerKpis {
  const { result } = cached;
  const { kpis, items } = result;

  // sinFechaCount: items with no inbound date AND stock > 0
  const sinFechaCount = items.filter(
    i => i.lastInboundSource === "UNAVAILABLE" && i.remaining > 0,
  ).length;

  return {
    totalRefs: kpis.totalRefs,
    lowRotationCount: kpis.inventarioLento,
    recompraInmediataCount: kpis.comprarAhora,
    sinFechaCount,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sentinel KPIs for SOURCE_UNAVAILABLE state.
 * totalRefs = -1 signals "no data available" to UI consumers.
 * All other fields are -1 for consistency — UI should never display these.
 */
function unavailableKpis(): ImportSupplyKpis {
  return {
    comprarAhora: -1,
    revisarRecompra: -1,
    noRecomprar: -1,
    inventarioLento: -1,
    totalRefs: -1,
  };
}

/** Invalidate L1 + L2 cache for an org (e.g., after sync) */
export async function invalidateImportCache(organizationId: string): Promise<void> {
  cache.delete(organizationId);
  try {
    await (prisma as any).$executeRawUnsafe(
      `DELETE FROM import_intelligence_cache WHERE organization_id = $1`,
      organizationId,
    );
  } catch { /* best-effort L2 cleanup */ }
}

export interface PrewarmResult {
  ok: boolean;
  /** When ok=false and a prior snapshot was preserved */
  stalePreserved: boolean;
  /** Error message when ok=false */
  error: string | null;
}

/**
 * Prewarm: force-compute fresh import intelligence and write to L1 + L2.
 * This is the ONLY path that calls buildImportSupplyIntelligence().
 * Call via:
 *   - Vercel Cron GET /api/orgs/[orgSlug]/comercial/importaciones/prewarm
 *   - Admin POST to same route
 *   - Post-deploy hook
 *
 * ATOMIC: computes first, then writes. The prior snapshot is NEVER deleted
 * before the new one is ready. If computation fails, the prior snapshot
 * stays in L2 and web requests continue serving it as STALE.
 */
export async function prewarmImportCache(organizationId: string): Promise<PrewarmResult> {
  try {
    // Compute FIRST — do NOT invalidate before success
    const result = await buildImportSupplyIntelligence(organizationId);

    const productIds = result.items.map(i => i.productId);
    const referenceCodes = result.items.map(i => i.reference);
    const freshness = await loadSourceFreshness(organizationId, productIds, referenceCodes);

    const now = Date.now();
    const data: CachedImportIntelligence = {
      result,
      freshness,
      truthState: "CERTIFIED",
      computedAt: new Date().toISOString(),
      staleCause: null,
    };

    // Atomic replace: UPSERT in L2 (overwrites previous), then replace L1
    await writeL2(organizationId, data);
    cache.set(organizationId, { data, expiresAt: now + CACHE_TTL_MS });

    return { ok: true, stalePreserved: false, error: null };
  } catch (err) {
    // Computation failed — prior snapshot stays in L2 untouched
    const cause = err instanceof Error ? err.message : "Prewarm failed";
    console.error(`[IMPORT-CACHE] prewarmImportCache FAILED: ${cause}`);
    return { ok: false, stalePreserved: true, error: cause };
  }
}
