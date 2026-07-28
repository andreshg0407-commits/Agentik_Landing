/**
 * lib/inventory/sag-inventory-balance-adapter.ts
 *
 * AGENTIK-INVENTORY-SAG-VIEW-CERTIFICATION-AND-SHADOW-INTEGRATION-01
 *
 * Shadow adapter for reading vw_agentik_inventario via SAG SOAP.
 * Used ONLY for comparison scripts and diagnostics — NOT for production reads.
 *
 * This adapter:
 * - Queries the SAG view via consultaSagJson
 * - Maps raw rows to CanonicalWarehouseBalance
 * - Resolves warehouse identity via warehouse-master.ts
 * - Builds per-reference totals
 *
 * Does NOT:
 * - Replace ProductInventoryLevel (PIL)
 * - Modify any consumer module
 * - Write to any database
 * - Connect to production systems
 *
 * No Prisma. No React. No server-only (pure adapter).
 */

import {
  type SagInventoryViewRow,
  type CanonicalWarehouseBalance,
  type CanonicalReferenceTotal,
  type ShadowComparisonRecord,
  type ShadowComparisonResult,
  mapViewRowToBalance,
  buildReferenceTotals,
  computeComparisonVerdict,
} from "./sag-inventory-balance-types";
import { resolveWarehouseByBusinessCode } from "./warehouse-master";

// ── SAG Client Interface ─────────────────────────────────────────────────

export interface SagConfig {
  token: string;
  database: string;
  endpointUrl: string;
}

export type SagQueryFn = (config: SagConfig, sql: string) => Promise<any[]>;

// ── Warehouse PK Resolver ────────────────────────────────────────────────

function resolveWarehousePkFromCode(code: string): string | null {
  const wh = resolveWarehouseByBusinessCode(code);
  return wh?.kaNlBodega ?? null;
}

// ── Load from SAG View ───────────────────────────────────────────────────

/**
 * Load all inventory balances from vw_agentik_inventario.
 * Returns mapped CanonicalWarehouseBalance[].
 */
export async function loadSagInventoryBalances(
  config: SagConfig,
  querySag: SagQueryFn,
): Promise<CanonicalWarehouseBalance[]> {
  const rows: SagInventoryViewRow[] = await querySag(config, `
    SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA, MARCA,
           SUCURSAL, BODEGA, EXISTENCIA, RESERVADO, TRANSITO,
           DISPONIBLE, COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO
    FROM vw_agentik_inventario
  `);

  const balances: CanonicalWarehouseBalance[] = [];
  for (const row of rows) {
    const balance = mapViewRowToBalance(row, resolveWarehousePkFromCode);
    if (balance) balances.push(balance);
  }

  return balances;
}

/**
 * Load inventory for specific references.
 */
export async function loadSagInventoryForReferences(
  config: SagConfig,
  querySag: SagQueryFn,
  references: string[],
): Promise<CanonicalWarehouseBalance[]> {
  if (references.length === 0) return [];

  const escaped = references.map(r => `'${r.replace(/'/g, "''")}'`).join(",");
  const rows: SagInventoryViewRow[] = await querySag(config, `
    SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA, MARCA,
           SUCURSAL, BODEGA, EXISTENCIA, RESERVADO, TRANSITO,
           DISPONIBLE, COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO
    FROM vw_agentik_inventario
    WHERE CODIGO_PRODUCTO IN (${escaped})
  `);

  const balances: CanonicalWarehouseBalance[] = [];
  for (const row of rows) {
    const balance = mapViewRowToBalance(row, resolveWarehousePkFromCode);
    if (balance) balances.push(balance);
  }

  return balances;
}

/**
 * Load inventory for a specific warehouse.
 */
export async function loadSagInventoryForWarehouse(
  config: SagConfig,
  querySag: SagQueryFn,
  warehouseCode: string,
): Promise<CanonicalWarehouseBalance[]> {
  const rows: SagInventoryViewRow[] = await querySag(config, `
    SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA, MARCA,
           SUCURSAL, BODEGA, EXISTENCIA, RESERVADO, TRANSITO,
           DISPONIBLE, COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO
    FROM vw_agentik_inventario
    WHERE BODEGA LIKE '${warehouseCode} - %'
  `);

  const balances: CanonicalWarehouseBalance[] = [];
  for (const row of rows) {
    const balance = mapViewRowToBalance(row, resolveWarehousePkFromCode);
    if (balance) balances.push(balance);
  }

  return balances;
}

// ── Reference Totals ─────────────────────────────────────────────────────

/**
 * Load all balances and aggregate per reference.
 */
export async function loadSagReferenceTotals(
  config: SagConfig,
  querySag: SagQueryFn,
): Promise<CanonicalReferenceTotal[]> {
  const balances = await loadSagInventoryBalances(config, querySag);
  return buildReferenceTotals(balances);
}

// ── Shadow Comparison ────────────────────────────────────────────────────

export interface PilRecord {
  referenceCode: string;
  warehousePk: string;
  positiveOnly: number;
  net: number;
}

/**
 * Build a shadow comparison between SAG view and PIL data.
 * Takes pre-loaded data from both sources.
 */
export function buildShadowComparison(
  viewBalances: CanonicalWarehouseBalance[],
  pilRecords: PilRecord[],
  organizationId: string,
  viewPeriod: string | null = null,
): ShadowComparisonResult {
  // Index PIL by warehousePk + referenceCode
  const pilIndex = new Map<string, PilRecord>();
  for (const p of pilRecords) {
    pilIndex.set(`${p.warehousePk}::${p.referenceCode}`, p);
  }

  // Index view by warehousePk + referenceCode
  const viewIndex = new Map<string, CanonicalWarehouseBalance>();
  for (const v of viewBalances) {
    if (v.warehousePk) {
      viewIndex.set(`${v.warehousePk}::${v.referenceCode}`, v);
    }
  }

  const allKeys = new Set([...pilIndex.keys(), ...viewIndex.keys()]);
  const records: ShadowComparisonRecord[] = [];

  let matches = 0, mismatches = 0, viewOnly = 0, pilOnly = 0, bothZero = 0;

  for (const key of allKeys) {
    const [whPk, refCode] = key.split("::");
    const view = viewIndex.get(key);
    const pil = pilIndex.get(key);

    const viewExist = view?.existencia ?? 0;
    const viewRes = view?.reservado ?? 0;
    const viewDisp = view?.disponible ?? 0;
    const pilPos = pil?.positiveOnly ?? 0;
    const pilNet = pil?.net ?? 0;

    const verdict = computeComparisonVerdict(viewExist, pilPos);

    records.push({
      referenceCode: refCode,
      warehouseCode: view?.warehouseCode ?? "",
      warehousePk: whPk,
      viewExistencia: viewExist,
      viewReservado: viewRes,
      viewDisponible: viewDisp,
      pilPositiveOnly: pilPos,
      pilNet: pilNet,
      diffExistencia: viewExist - pilPos,
      diffNet: viewExist - pilNet,
      verdict,
    });

    switch (verdict) {
      case "MATCH": matches++; break;
      case "MISMATCH_QUANTITY": mismatches++; break;
      case "VIEW_ONLY": viewOnly++; break;
      case "PIL_ONLY": pilOnly++; break;
      case "BOTH_ZERO": bothZero++; break;
    }
  }

  return {
    organizationId,
    computedAt: new Date().toISOString(),
    viewPeriod,
    records,
    stats: {
      totalRecords: records.length,
      matches,
      mismatches,
      viewOnly,
      pilOnly,
      bothZero,
    },
  };
}
