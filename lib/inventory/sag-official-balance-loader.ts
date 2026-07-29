/**
 * lib/inventory/sag-official-balance-loader.ts
 *
 * AGENTIK-INVENTORY-COMMERCIAL-SAG-OFFICIAL-BALANCE-MIGRATION-01 — SEGUNDO
 *
 * Server-only loader for official SAG inventory balances from vw_agentik_inventario.
 * Certified 210/210 against SAG base tables.
 *
 * This is the ONLY authorized source for commercial inventory totals.
 * PIL (ProductInventoryLevel) must NOT govern totals — only variant detail.
 *
 * Uses the PYA SOAP connector (consultaSagJson) with env-based config.
 * Results are cached in-memory with a configurable TTL.
 *
 * server-only — never import from client components.
 */

import "server-only";

import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  type SagInventoryViewRow,
  type CanonicalWarehouseBalance,
  mapViewRowToBalance,
  parseViewBodega,
} from "./sag-inventory-balance-types";
import { resolveWarehouseByBusinessCode } from "./warehouse-master";

// ── SAG Config ───────────────────────────────────────────────────────────────

function getSagConfig() {
  return {
    token: process.env.PYA_SOAP_TOKEN ?? "",
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database: process.env.PYA_SAG_BD ?? "",
  };
}

function isSagConfigured(): boolean {
  const c = getSagConfig();
  return !!(c.token && c.database);
}

// ── Warehouse PK Resolver ────────────────────────────────────────────────────

function resolveWarehousePk(code: string): string | null {
  const wh = resolveWarehouseByBusinessCode(code);
  return wh?.kaNlBodega ?? null;
}

// ── Source Status ─────────────────────────────────────────────────────────────

export type SourceStatus = "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | "DEGRADED";

export interface SagOfficialBalanceResult {
  balances: CanonicalWarehouseBalance[];
  snapshotAt: string;
  sourcePeriod: string | null;
  sourceLag: number;
  sourceStatus: SourceStatus;
  qualityMetrics: {
    totalRows: number;
    distinctRefs: number;
    distinctWarehouses: number;
    refsMappedToWarehousePk: number;
    refsUnmapped: number;
    fetchDurationMs: number;
  };
}

// ── Freshness thresholds (provisional, documented) ───────────────────────────
// FRESH: cache <= 30 min
// AGING: cache > 30 min, <= 4 hours
// STALE: cache > 4 hours
// UNAVAILABLE: SAG unreachable

const FRESH_TTL_MS = 30 * 60 * 1000;    // 30 min
const AGING_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function resolveSourceStatus(cacheAgeMs: number): SourceStatus {
  if (cacheAgeMs <= FRESH_TTL_MS) return "FRESH";
  if (cacheAgeMs <= AGING_TTL_MS) return "AGING";
  return "STALE";
}

// ── In-memory cache (per-tenant, keyed by organizationId) ────────────────────

interface TenantBalanceCache {
  balances: CanonicalWarehouseBalance[];
  cachedAt: number;
  period: string | null;
}

const balanceCacheByOrg = new Map<string, TenantBalanceCache>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min
const STALE_UPPER_BOUND_MS = 60 * 60 * 1000; // 1 hour — max age for error fallback

// ── Feature Flag ─────────────────────────────────────────────────────────────

export type InventoryBalanceSource = "SAG_OFFICIAL" | "PIL_LEGACY";

/**
 * Resolve the active inventory balance source.
 *
 * Default: PIL_LEGACY — safe for production deployment.
 * SAG_OFFICIAL requires EXPLICIT opt-in via env var:
 *   INVENTORY_BALANCE_SOURCE=SAG_OFFICIAL
 *
 * Credential presence alone does NOT activate SAG_OFFICIAL.
 * This ensures the commit never silently changes production behavior.
 */
export function getInventoryBalanceSource(): InventoryBalanceSource {
  const override = process.env.INVENTORY_BALANCE_SOURCE;
  if (override === "SAG_OFFICIAL") return "SAG_OFFICIAL";
  // Default: always PIL_LEGACY — SAG_OFFICIAL requires explicit activation
  return "PIL_LEGACY";
}

// ── Main Loader ──────────────────────────────────────────────────────────────

/**
 * Load official SAG inventory balances from vw_agentik_inventario.
 *
 * Accepts optional filters:
 * - referenceCodes: only these refs (SQL IN clause)
 * - warehouseCodes: only these warehouse ss_codigo values
 * - includeZero: include rows where EXISTENCIA = 0 (default false — view already filters > 0)
 *
 * Returns cached result if within TTL.
 */
export async function loadSagOfficialInventoryBalances(opts: {
  organizationId: string;
  referenceCodes?: string[];
  warehouseCodes?: string[];
  includeZero?: boolean;
  forceRefresh?: boolean;
}): Promise<SagOfficialBalanceResult> {
  const { organizationId, referenceCodes, warehouseCodes, forceRefresh } = opts;

  // Check feature flag
  if (getInventoryBalanceSource() === "PIL_LEGACY") {
    return {
      balances: [],
      snapshotAt: new Date().toISOString(),
      sourcePeriod: null,
      sourceLag: 0,
      sourceStatus: "UNAVAILABLE",
      qualityMetrics: {
        totalRows: 0, distinctRefs: 0, distinctWarehouses: 0,
        refsMappedToWarehousePk: 0, refsUnmapped: 0, fetchDurationMs: 0,
      },
    };
  }

  // Return cache if valid and no specific filters requested (per-tenant)
  const noFilters = !referenceCodes && !warehouseCodes;
  const tenantCache = balanceCacheByOrg.get(organizationId);
  if (!forceRefresh && noFilters && tenantCache && Date.now() - tenantCache.cachedAt < CACHE_TTL) {
    const cacheAge = Date.now() - tenantCache.cachedAt;
    return buildResult(tenantCache.balances, tenantCache.cachedAt, tenantCache.period, 0, cacheAge);
  }

  // Fetch from SAG
  const config = getSagConfig();
  if (!config.token || !config.database) {
    return {
      balances: [],
      snapshotAt: new Date().toISOString(),
      sourcePeriod: null,
      sourceLag: 0,
      sourceStatus: "UNAVAILABLE",
      qualityMetrics: {
        totalRows: 0, distinctRefs: 0, distinctWarehouses: 0,
        refsMappedToWarehousePk: 0, refsUnmapped: 0, fetchDurationMs: 0,
      },
    };
  }

  const start = Date.now();

  try {
    let sql = `SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA, MARCA,
           SUCURSAL, BODEGA, EXISTENCIA, RESERVADO, TRANSITO,
           DISPONIBLE, COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO
    FROM vw_agentik_inventario`;

    const conditions: string[] = [];

    if (referenceCodes && referenceCodes.length > 0) {
      const escaped = referenceCodes.map(r => `'${r.replace(/'/g, "''")}'`).join(",");
      conditions.push(`CODIGO_PRODUCTO IN (${escaped})`);
    }

    if (warehouseCodes && warehouseCodes.length > 0) {
      const whConditions = warehouseCodes.map(c => `BODEGA LIKE '${c} - %'`).join(" OR ");
      conditions.push(`(${whConditions})`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const rows = await consultaSagJson(config, sql) as unknown as SagInventoryViewRow[];
    const fetchMs = Date.now() - start;

    // Map to canonical balances
    const balances: CanonicalWarehouseBalance[] = [];
    let mapped = 0;
    let unmapped = 0;

    for (const row of rows) {
      const balance = mapViewRowToBalance(row, resolveWarehousePk);
      if (balance) {
        balances.push(balance);
        if (balance.warehousePk) mapped++;
        else unmapped++;
      }
    }

    // Detect period from current date (view uses MAX period <= YYYYMM)
    const now = new Date();
    const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Cache full results per tenant (only when no filters)
    if (noFilters) {
      balanceCacheByOrg.set(organizationId, {
        balances,
        cachedAt: Date.now(),
        period,
      });
    }

    return buildResult(balances, Date.now(), period, fetchMs, 0);
  } catch (err) {
    console.error("[sag-official-balance-loader] SAG query failed:", (err as any)?.message);
    // Return stale cache if available for THIS tenant, bounded by STALE_UPPER_BOUND
    const staleCache = balanceCacheByOrg.get(organizationId);
    if (staleCache && Date.now() - staleCache.cachedAt < STALE_UPPER_BOUND_MS) {
      const cacheAge = Date.now() - staleCache.cachedAt;
      const result = buildResult(staleCache.balances, staleCache.cachedAt, staleCache.period, 0, cacheAge);
      // Mark as DEGRADED — stale data served after SAG error
      result.sourceStatus = "DEGRADED";
      return result;
    }
    return {
      balances: [],
      snapshotAt: new Date().toISOString(),
      sourcePeriod: null,
      sourceLag: 0,
      sourceStatus: "UNAVAILABLE",
      qualityMetrics: {
        totalRows: 0, distinctRefs: 0, distinctWarehouses: 0,
        refsMappedToWarehousePk: 0, refsUnmapped: 0, fetchDurationMs: 0,
      },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildResult(
  balances: CanonicalWarehouseBalance[],
  fetchedAt: number,
  period: string | null,
  fetchMs: number,
  cacheAgeMs: number,
): SagOfficialBalanceResult {
  const refs = new Set(balances.map(b => b.referenceCode));
  const whs = new Set(balances.map(b => b.warehouseCode));
  const mapped = balances.filter(b => b.warehousePk !== null).length;
  const unmapped = balances.length - mapped;

  return {
    balances,
    snapshotAt: new Date(fetchedAt).toISOString(),
    sourcePeriod: period,
    sourceLag: cacheAgeMs,
    sourceStatus: cacheAgeMs > 0 ? resolveSourceStatus(cacheAgeMs) : "FRESH",
    qualityMetrics: {
      totalRows: balances.length,
      distinctRefs: refs.size,
      distinctWarehouses: whs.size,
      refsMappedToWarehousePk: mapped,
      refsUnmapped: unmapped,
      fetchDurationMs: fetchMs,
    },
  };
}

// ── Convenience: Build lookup maps from balances ─────────────────────────────

/**
 * Build a Map<referenceCode, existencia> for a specific warehouse code.
 * Used by inventory-control-service to replace PIL lookups.
 */
export function buildWarehouseStockMap(
  balances: CanonicalWarehouseBalance[],
  warehouseCode: string,
): Map<string, { existencia: number; reservado: number; disponible: number; costoPromedio: number }> {
  const map = new Map<string, { existencia: number; reservado: number; disponible: number; costoPromedio: number }>();
  for (const b of balances) {
    if (b.warehouseCode === warehouseCode) {
      map.set(b.referenceCode, {
        existencia: b.existencia,
        reservado: b.reservado,
        disponible: b.disponible,
        costoPromedio: b.costoPromedio,
      });
    }
  }
  return map;
}

/**
 * Build a Map<referenceCode, totalExistencia> across ALL warehouses.
 */
export function buildTotalStockMap(
  balances: CanonicalWarehouseBalance[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of balances) {
    map.set(b.referenceCode, (map.get(b.referenceCode) ?? 0) + b.existencia);
  }
  return map;
}
