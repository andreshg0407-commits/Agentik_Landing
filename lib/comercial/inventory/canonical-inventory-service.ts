/**
 * lib/comercial/inventory/canonical-inventory-service.ts
 *
 * INVENTORY-CANONICAL-TRUTH-04A — Phase E: Canonical Inventory Service
 *
 * Computes the canonical inventory snapshot by querying SAG vw_agentik_inventario
 * and classifying results through warehouse profiles.
 *
 * Separates commercial (finished goods for sale) from supply chain
 * (raw materials, WIP, imports) inventory.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import type {
  CanonicalInventorySnapshot,
  CanonicalInventoryLevel,
  CanonicalProductInventory,
  WarehouseProfile,
} from "./canonical-inventory-types";
import {
  getWarehouseProfileByViewBodega,
  getAllWarehouseProfiles,
  getCommercialWarehouseProfiles,
} from "./castillitos-warehouse-profiles";

// ── SAG Query ───────────────────────────────────────────────────────────────

const INVENTORY_VIEW_QUERY = [
  "SELECT",
  "  CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA,",
  "  BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE,",
  "  COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO",
  "FROM vw_agentik_inventario",
].join(" ");

const PRODUCTION_QUERY = [
  "SELECT",
  "  PRODUCTO AS codigo_producto,",  // INVERTED: PRODUCTO = code
  "  CODIGO_PRODUCTO AS nombre_producto,",  // INVERTED: CODIGO_PRODUCTO = description
  "  CANTIDAD_PROGRAMADA, CANTIDAD_PRODUCIDA,",
  "  ESTADO_PRODUCCION, BODEGA_DESTINO",
  "FROM vw_agentik_produccion",
  "WHERE ESTADO_PRODUCCION != 'Cerrada'",
].join(" ");

const PERIOD_QUERY = "SELECT MAX(k_sc_periodo) AS max_periodo FROM saldos_articulos";

// ── Main Service ────────────────────────────────────────────────────────────

export interface CanonicalInventoryOptions {
  /** Include per-product detail (default: false for performance) */
  includeProducts?: boolean;
}

/**
 * Compute the canonical inventory snapshot from SAG.
 *
 * Read-only: no writes, no syncs, no mutations.
 * Fails gracefully: returns a snapshot with sourceDown=true if SAG is unreachable.
 */
export async function computeCanonicalInventorySnapshot(
  options: CanonicalInventoryOptions = {},
): Promise<CanonicalInventorySnapshot & { sourceDown: boolean }> {
  const { includeProducts = false } = options;
  const warehouseProfiles = getAllWarehouseProfiles();
  const commercialProfiles = getCommercialWarehouseProfiles();
  const now = new Date().toISOString();

  const empty: CanonicalInventorySnapshot & { sourceDown: boolean } = {
    sourceDown: true,
    sagPeriod: "",
    computedAt: now,
    commercialRefCount: 0,
    commercialAvailableUnits: 0,
    commercialReservedUnits: 0,
    commercialOutOfStockRefs: 0,
    commercialCriticalRefs: 0,
    commercialInventoryValue: 0,
    rawMaterialUnits: 0,
    wipUnits: 0,
    importStagingUnits: 0,
    activeProductionOrders: 0,
    pendingProductionUnits: 0,
    warehouseProfiles,
  };

  let config;
  try {
    config = getSagConnection("CURRENT");
  } catch {
    return empty;
  }

  // ── Fetch SAG period ──
  let sagPeriod = "";
  try {
    const periodRows = await consultaSagJson(config, PERIOD_QUERY) as Record<string, unknown>[];
    if (periodRows.length > 0) {
      sagPeriod = String(periodRows[0].max_periodo ?? "");
    }
  } catch {
    // Non-fatal: proceed without period
  }

  // ── Fetch inventory view ──
  let invRows: Record<string, unknown>[];
  try {
    invRows = await consultaSagJson(config, INVENTORY_VIEW_QUERY) as Record<string, unknown>[];
  } catch {
    return empty;
  }

  if (!Array.isArray(invRows)) return empty;

  // ── Fetch production ──
  let prodOrders = 0;
  let prodPendingUnits = 0;
  const prodByProduct = new Map<string, number>();
  try {
    const prodRows = await consultaSagJson(config, PRODUCTION_QUERY) as Record<string, unknown>[];
    if (Array.isArray(prodRows)) {
      for (const r of prodRows) {
        const code = String(r.codigo_producto ?? "").trim();
        const programada = Number(r.CANTIDAD_PROGRAMADA ?? 0);
        const producida = Number(r.CANTIDAD_PRODUCIDA ?? 0);
        const pending = Math.max(0, programada - producida);
        if (pending > 0) {
          prodOrders++;
          prodPendingUnits += pending;
          prodByProduct.set(code, (prodByProduct.get(code) ?? 0) + pending);
        }
      }
    }
  } catch {
    // Non-fatal: production data is supplementary
  }

  // ── Classify inventory rows ──
  // Track per-product aggregation
  const productMap = new Map<string, {
    name: string;
    line: string;
    category: string;
    levels: CanonicalInventoryLevel[];
  }>();

  let commercialRefSet = new Set<string>();
  let commercialAvailable = 0;
  let commercialReserved = 0;
  let commercialOutOfStock = new Set<string>();
  let commercialCritical = new Set<string>();
  let commercialValue = 0;

  let rawMaterialUnits = 0;
  let wipUnits = 0;
  let importStagingUnits = 0;

  for (const row of invRows) {
    const productCode = String(row.CODIGO_PRODUCTO ?? "").trim();
    const productName = String(row.PRODUCTO ?? "").trim();
    const bodega = String(row.BODEGA ?? "").trim();
    const existencia = Number(row.EXISTENCIA ?? 0);
    const reservado = Number(row.RESERVADO ?? 0);
    const disponible = Number(row.DISPONIBLE ?? 0);
    const costoPromedio = Number(row.COSTO_PROMEDIO ?? 0);
    const fechaUltimoMov = row.FECHA_ULTIMO_MOVIMIENTO
      ? String(row.FECHA_ULTIMO_MOVIMIENTO) : null;

    if (!productCode) continue;

    const profile = getWarehouseProfileByViewBodega(bodega);
    if (!profile) continue; // Unknown bodega — skip

    const level: CanonicalInventoryLevel = {
      productCode,
      productName,
      warehouse: profile,
      physicalStock: existencia,
      reserved: reservado,
      available: disponible,
      truthState: "CERTIFIED",
      sagPeriod,
      lastMovementDate: fechaUltimoMov,
      costPromedio: costoPromedio,
    };

    // Aggregate by scope
    switch (profile.commercialScope) {
      case "COMMERCIAL":
        commercialRefSet.add(productCode);
        commercialAvailable += disponible;
        commercialReserved += reservado;
        commercialValue += existencia * costoPromedio;
        if (disponible <= 0) commercialOutOfStock.add(productCode);
        else if (disponible <= 20) commercialCritical.add(productCode);
        break;

      case "SUPPLY_CHAIN":
        switch (profile.role) {
          case "RAW_MATERIAL": rawMaterialUnits += existencia; break;
          case "WIP": wipUnits += existencia; break;
          case "IMPORT_STAGING": importStagingUnits += existencia; break;
        }
        break;

      // EXCLUDED — not counted in any KPI
    }

    // Product-level aggregation
    if (includeProducts) {
      let prod = productMap.get(productCode);
      if (!prod) {
        prod = {
          name: productName,
          line: String(row.LINEA ?? ""),
          category: String(row.CATEGORIA ?? ""),
          levels: [],
        };
        productMap.set(productCode, prod);
      }
      prod.levels.push(level);
    }
  }

  // ── Build products array if requested ──
  let products: CanonicalProductInventory[] | undefined;
  if (includeProducts) {
    products = [];
    for (const [code, prod] of productMap) {
      const commLevels = prod.levels.filter(l => l.warehouse.commercialScope === "COMMERCIAL");
      const scLevels = prod.levels.filter(l => l.warehouse.commercialScope === "SUPPLY_CHAIN");

      products.push({
        productCode: code,
        productName: prod.name,
        line: prod.line,
        category: prod.category,
        commercialPhysical: commLevels.reduce((s, l) => s + l.physicalStock, 0),
        commercialReserved: commLevels.reduce((s, l) => s + l.reserved, 0),
        commercialAvailable: commLevels.reduce((s, l) => s + l.available, 0),
        supplyChainPhysical: scLevels.reduce((s, l) => s + l.physicalStock, 0),
        levels: prod.levels,
        hasActiveProduction: prodByProduct.has(code),
        pendingProductionQty: prodByProduct.get(code) ?? 0,
      });
    }
  }

  return {
    sourceDown: false,
    sagPeriod,
    computedAt: now,
    commercialRefCount: commercialRefSet.size,
    commercialAvailableUnits: commercialAvailable,
    commercialReservedUnits: commercialReserved,
    commercialOutOfStockRefs: commercialOutOfStock.size,
    commercialCriticalRefs: commercialCritical.size,
    commercialInventoryValue: commercialValue,
    rawMaterialUnits,
    wipUnits,
    importStagingUnits,
    activeProductionOrders: prodOrders,
    pendingProductionUnits: prodPendingUnits,
    warehouseProfiles,
    products,
  };
}
