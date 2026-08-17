/**
 * lib/comercial/inventory/canonical-inventory-service.ts
 *
 * INVENTORY-CANONICAL-TRUTH-04A + ADDENDUM 04A1
 *
 * Computes the canonical inventory snapshot by querying SAG vw_agentik_inventario
 * and classifying results through warehouse profiles.
 *
 * Separates commercial (finished goods for sale) from supply chain
 * (raw materials, WIP, imports) inventory.
 *
 * Addendum corrections:
 *   B2: availableToPromise = max(existencia - reservado, 0) per row
 *   D2: Production CANTIDAD_PRODUCIDA is null for open orders — truthState=SOURCE_INCOMPLETE
 *   D3: Classify by state: Abierta→OPEN, Cerrada→CLOSED, Anulada→CANCELLED
 *   D5: Empty BODEGA_DESTINO → destinationVerified=false
 *   D6: Inverted aliases handled (PRODUCTO=code, CODIGO_PRODUCTO=description)
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
  CanonicalProductionSummary,
  CanonicalProductionOrder,
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

// Addendum D3: fetch ALL production orders (including Cerrada) for proper classification
const PRODUCTION_QUERY = [
  "SELECT",
  "  PRODUCTO AS codigo_producto,",  // INVERTED: PRODUCTO = code
  "  CODIGO_PRODUCTO AS nombre_producto,",  // INVERTED: CODIGO_PRODUCTO = description
  "  CANTIDAD_PROGRAMADA, CANTIDAD_PRODUCIDA,",
  "  ESTADO_PRODUCCION, BODEGA_DESTINO",
  "FROM vw_agentik_produccion",
].join(" ");

const PERIOD_QUERY = "SELECT MAX(k_sc_periodo) AS max_periodo FROM saldos_articulos";

// ── Production state mapping (Addendum D3) ──────────────────────────────────

function mapProductionState(estado: string): "OPEN" | "THEORETICAL" | "CLOSED" | "CANCELLED" {
  switch (estado) {
    case "Abierta": return "OPEN";
    case "Cerrada": return "CLOSED";
    case "Anulada": return "CANCELLED";
    case "Teorica": return "THEORETICAL";
    default: return "OPEN"; // fail-open: treat unknown as open for visibility
  }
}

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

  // ── Fetch production (Addendum D3: ALL states, classify properly) ──
  let openOrders = 0;
  let openScheduledUnits = 0;
  let closedOrders = 0;
  let closedProducedUnits = 0;
  let destVerified = 0;
  let destUnverified = 0;
  const prodByProduct = new Map<string, number>();

  try {
    const prodRows = await consultaSagJson(config, PRODUCTION_QUERY) as Record<string, unknown>[];
    if (Array.isArray(prodRows)) {
      for (const r of prodRows) {
        const code = String(r.codigo_producto ?? "").trim();
        const programada = Number(r.CANTIDAD_PROGRAMADA ?? 0);
        const producida = r.CANTIDAD_PRODUCIDA != null ? Number(r.CANTIDAD_PRODUCIDA) : null;
        const estado = String(r.ESTADO_PRODUCCION ?? "");
        const destino = String(r.BODEGA_DESTINO ?? "").trim();
        const state = mapProductionState(estado);

        // Addendum D3/D4: only count OPEN orders as active production
        if (state === "OPEN") {
          openOrders++;
          openScheduledUnits += programada;
          // Addendum D5: verify destination
          if (destino) destVerified++;
          else destUnverified++;
          // Track per-product for open orders only
          prodByProduct.set(code, (prodByProduct.get(code) ?? 0) + programada);
        } else if (state === "CLOSED") {
          closedOrders++;
          closedProducedUnits += producida ?? 0;
        }
        // CANCELLED and THEORETICAL: excluded from all counts
      }
    }
  } catch {
    // Non-fatal: production data is supplementary
  }

  // ── Classify inventory rows ──
  const productMap = new Map<string, {
    name: string;
    line: string;
    category: string;
    levels: CanonicalInventoryLevel[];
  }>();

  const commercialRefSet = new Set<string>();
  let commercialAvailable = 0;
  let commercialReserved = 0;
  const commercialOutOfStock = new Set<string>();
  const commercialCritical = new Set<string>();
  let commercialValue = 0;

  let rawMaterialUnits = 0;
  let wipUnits = 0;
  let importStagingUnits = 0;

  // Addendum B3: line breakdown
  const lineMap = new Map<string, { refs: Set<string>; existencia: number; reservado: number; disponible: number }>();

  for (const row of invRows) {
    const productCode = String(row.CODIGO_PRODUCTO ?? "").trim();
    const productName = String(row.PRODUCTO ?? "").trim();
    const bodega = String(row.BODEGA ?? "").trim();
    const existencia = Number(row.EXISTENCIA ?? 0);
    const reservado = Number(row.RESERVADO ?? 0);
    const disponible = Number(row.DISPONIBLE ?? 0);
    const costoPromedio = Number(row.COSTO_PROMEDIO ?? 0);
    const linea = String(row.LINEA ?? "").trim();
    const fechaUltimoMov = row.FECHA_ULTIMO_MOVIMIENTO
      ? String(row.FECHA_ULTIMO_MOVIMIENTO) : null;

    if (!productCode) continue;

    const profile = getWarehouseProfileByViewBodega(bodega);
    if (!profile) continue; // Unknown bodega — skip

    // Addendum B2: availableToPromise = max(existencia - reservado, 0)
    const signedAvailable = existencia - reservado;
    const availableToPromise = Math.max(signedAvailable, 0);

    const level: CanonicalInventoryLevel = {
      productCode,
      productName,
      warehouse: profile,
      physicalStock: existencia,
      reserved: reservado,
      available: disponible, // SAG view value preserved for audit
      truthState: "CERTIFIED",
      sagPeriod,
      lastMovementDate: fechaUltimoMov,
      costPromedio: costoPromedio,
    };

    // Aggregate by scope
    switch (profile.commercialScope) {
      case "COMMERCIAL":
        commercialRefSet.add(productCode);
        // Addendum B2: use availableToPromise, not raw DISPONIBLE
        commercialAvailable += availableToPromise;
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

    // Line breakdown (all rows, not just commercial)
    let lb = lineMap.get(linea);
    if (!lb) {
      lb = { refs: new Set(), existencia: 0, reservado: 0, disponible: 0 };
      lineMap.set(linea, lb);
    }
    lb.refs.add(productCode);
    lb.existencia += existencia;
    lb.reservado += reservado;
    lb.disponible += disponible;

    // Product-level aggregation
    if (includeProducts) {
      let prod = productMap.get(productCode);
      if (!prod) {
        prod = {
          name: productName,
          line: linea,
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
        commercialAvailable: commLevels.reduce((s, l) => s + Math.max(l.physicalStock - l.reserved, 0), 0),
        supplyChainPhysical: scLevels.reduce((s, l) => s + l.physicalStock, 0),
        levels: prod.levels,
        hasActiveProduction: prodByProduct.has(code),
        pendingProductionQty: prodByProduct.get(code) ?? 0,
      });
    }
  }

  // ── Production summary (Addendum D) ──
  const productionSummary: CanonicalProductionSummary = {
    openOrders,
    openScheduledUnits,
    // Addendum D4: open orders have null producida — truthState is SOURCE_INCOMPLETE
    openTruthState: openOrders > 0 ? "SOURCE_INCOMPLETE" : "CERTIFIED",
    closedOrders,
    closedProducedUnits,
    destinationVerifiedCount: destVerified,
    destinationUnverifiedCount: destUnverified,
  };

  // ── Line breakdown (Addendum B3) ──
  const lineBreakdown = Array.from(lineMap.entries())
    .map(([line, data]) => ({
      line: line || "(sin linea)",
      refCount: data.refs.size,
      existencia: data.existencia,
      reservado: data.reservado,
      disponible: data.disponible,
    }))
    .sort((a, b) => b.existencia - a.existencia);

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
    activeProductionOrders: openOrders,
    pendingProductionUnits: openScheduledUnits,
    productionSummary,
    lineBreakdown,
    warehouseProfiles,
    products,
  };
}
