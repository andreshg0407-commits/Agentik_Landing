/**
 * lib/comercial/tiendas/store-network-inventory.ts
 *
 * AGENTIK-STORES-SAG-OFFICIAL-BALANCE-MIGRATION-01 — SEGUNDO/QUINTO/SEXTO/OCTAVO/DÉCIMO
 *
 * Builds per-node inventory from the certified SAG snapshot.
 *
 * ONLY authorized source: loadSagOfficialInventoryBalances()
 * PROHIBITED: new SOAP queries, new adapters, new snapshots, PIL for totals.
 *
 * Performance targets (DECIMOSEGUNDO):
 *   Initial load:    <700ms (single SAG snapshot, no per-store queries)
 *   Store switch:    <200ms (in-memory filter from cached snapshot)
 *   Filters:         <150ms (pure JS filter/sort)
 *   Drawer:          <200ms (pre-computed, slice from snapshot)
 *
 * server-only — never import from client components.
 */

import "server-only";

import {
  loadSagOfficialInventoryBalances,
  getInventoryBalanceSource,
  type SagOfficialBalanceResult,
} from "../../inventory/sag-official-balance-loader";
import type { CanonicalWarehouseBalance } from "../../inventory/sag-inventory-balance-types";
import type { InventoryBalanceSourceLabel } from "../../inventory/inventory-control-types";
import { buildStoreNetwork, getNodeByWarehouseCode } from "./store-network";
import { resolveProductAlertState } from "./store-network-alerts";
import type {
  StoreNetwork,
  StoreNetworkNode,
  StoreNodeInventory,
  StoreNodeProduct,
  StoreNodeKpis,
  StoreNodeSourceStatus,
  StoreNetworkSnapshot,
  StoreNetworkDataQuality,
} from "./store-network-types";

// ── Cached network per tenant (warehouse config is static per org) ───────────

const _networkCache = new Map<string, StoreNetwork>();

function getNetwork(organizationId: string): StoreNetwork {
  let network = _networkCache.get(organizationId);
  if (!network) {
    network = buildStoreNetwork();
    _networkCache.set(organizationId, network);
  }
  return network;
}

// ── Source Status Mapping ───────────────────────────────────────────────────

function mapSourceStatus(
  sagStatus: SagOfficialBalanceResult["sourceStatus"],
): StoreNodeSourceStatus {
  switch (sagStatus) {
    case "FRESH": return "FRESH";
    case "AGING": return "AGING";
    case "STALE": return "STALE";
    case "DEGRADED": return "DEGRADED";
    case "UNAVAILABLE": return "UNAVAILABLE";
  }
}

function isHealthy(status: StoreNodeSourceStatus): boolean {
  return status === "FRESH" || status === "AGING";
}

// ── Balance Source Resolution ───────────────────────────────────────────────

function resolveBalanceSource(
  sagStatus: StoreNodeSourceStatus,
  hasData: boolean,
): InventoryBalanceSourceLabel {
  if (!hasData) {
    return sagStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "SAG_OFFICIAL_NOT_FOUND";
  }
  if (sagStatus === "DEGRADED") return "SAG_OFFICIAL_CACHE";
  return "SAG_OFFICIAL";
}

// ── KPI Builder ─────────────────────────────────────────────────────────────

function buildKpis(products: StoreNodeProduct[]): StoreNodeKpis {
  return {
    totalReferences: products.length,
    totalOnHand: products.reduce((s, p) => s + p.officialOnHand, 0),
    totalReserved: products.reduce((s, p) => s + p.officialReserved, 0),
    totalAvailable: products.reduce((s, p) => s + p.officialAvailable, 0),
    referencesWithStock: products.filter(p => p.officialAvailable > 0).length,
    referencesOutOfStock: products.filter(p =>
      p.officialOnHand <= 0 && p.officialAvailable <= 0
    ).length,
    referencesCritical: products.filter(p =>
      p.officialAvailable > 0 && p.officialAvailable <= 5
    ).length,
    referencesReserved: products.filter(p => p.officialReserved > 0).length,
    referencesNegative: products.filter(p => p.officialAvailable < 0).length,
    referencesNotFound: products.filter(p =>
      p.balanceSource === "SAG_OFFICIAL_NOT_FOUND" || p.balanceSource === "UNAVAILABLE"
    ).length,
  };
}

function mergeKpis(kpisList: StoreNodeKpis[]): StoreNodeKpis {
  const merged: StoreNodeKpis = {
    totalReferences: 0, totalOnHand: 0, totalReserved: 0, totalAvailable: 0,
    referencesWithStock: 0, referencesOutOfStock: 0, referencesCritical: 0,
    referencesReserved: 0, referencesNegative: 0, referencesNotFound: 0,
  };
  for (const k of kpisList) {
    merged.totalReferences += k.totalReferences;
    merged.totalOnHand += k.totalOnHand;
    merged.totalReserved += k.totalReserved;
    merged.totalAvailable += k.totalAvailable;
    merged.referencesWithStock += k.referencesWithStock;
    merged.referencesOutOfStock += k.referencesOutOfStock;
    merged.referencesCritical += k.referencesCritical;
    merged.referencesReserved += k.referencesReserved;
    merged.referencesNegative += k.referencesNegative;
    merged.referencesNotFound += k.referencesNotFound;
  }
  return merged;
}

// ── Node Inventory Builder ──────────────────────────────────────────────────

function buildNodeInventory(
  node: StoreNetworkNode,
  balances: CanonicalWarehouseBalance[],
  sourceStatus: StoreNodeSourceStatus,
  snapshotAt: string,
  sourceLag: number,
): StoreNodeInventory {
  // Filter balances for this warehouse code
  const nodeBalances = balances.filter(b => b.warehouseCode === node.warehouseCode);
  const hasData = nodeBalances.length > 0;
  const nodeBalanceSource = resolveBalanceSource(sourceStatus, hasData);

  // Build products
  const products: StoreNodeProduct[] = nodeBalances.map(b => {
    const productSource = resolveBalanceSource(sourceStatus, true);
    return {
      referenceCode: b.referenceCode,
      productName: b.productName ?? "",
      line: b.line ?? "",
      category: b.category ?? "",
      brand: "",
      officialOnHand: b.existencia,
      officialReserved: b.reservado,
      officialAvailable: b.disponible,
      costoPromedio: b.costoPromedio,
      lastMovement: b.lastMovementAt,
      alertState: resolveProductAlertState({
        officialOnHand: b.existencia,
        officialReserved: b.reservado,
        officialAvailable: b.disponible,
        balanceSource: productSource,
        sourceStatus,
      }),
      balanceSource: productSource,
    };
  });

  // Find latest movement across all products
  let latestMovement: Date | null = null;
  for (const p of products) {
    if (p.lastMovement && (!latestMovement || p.lastMovement > latestMovement)) {
      latestMovement = p.lastMovement;
    }
  }

  const kpis = buildKpis(products);

  return {
    nodeId: node.id,
    nodeName: node.warehouseName,
    nodeRole: node.networkRole,
    warehouseId: node.warehouseId,
    warehouseCode: node.warehouseCode,
    officialOnHand: kpis.totalOnHand,
    officialReserved: kpis.totalReserved,
    officialAvailable: kpis.totalAvailable,
    snapshotAt,
    lastMovement: latestMovement,
    sourceStatus,
    balanceSource: nodeBalanceSource,
    healthy: isHealthy(sourceStatus) && hasData,
    sourceAge: sourceLag,
    products,
    kpis,
  };
}

// ── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Build a complete Store Network Snapshot.
 *
 * Loads a single SAG snapshot via loadSagOfficialInventoryBalances() and
 * distributes the balances across all network nodes.
 *
 * NO per-store SOAP queries. NO per-reference queries.
 * Everything from the single certified snapshot.
 */
export async function buildStoreNetworkSnapshot(
  organizationId: string,
): Promise<StoreNetworkSnapshot> {
  const network = getNetwork(organizationId);
  const balanceSource = getInventoryBalanceSource();

  // Single SAG query for ALL warehouses (SEGUNDO — no per-store queries)
  const sagResult = await loadSagOfficialInventoryBalances({ organizationId });

  const sourceStatus = mapSourceStatus(sagResult.sourceStatus);
  const snapshotAt = sagResult.snapshotAt;
  const sourceLag = sagResult.sourceLag;

  // Build inventory for every node that has SAG_OFFICIAL source
  const nodeInventories: StoreNodeInventory[] = [];

  for (const node of network.nodes) {
    if (node.inventorySource === "NONE") continue;

    const inv = buildNodeInventory(
      node,
      sagResult.balances,
      sourceStatus,
      snapshotAt,
      sourceLag,
    );
    nodeInventories.push(inv);
  }

  // Aggregate KPIs by role
  const storeInvs = nodeInventories.filter(i => i.nodeRole === "STORE");
  const hubInvs = nodeInventories.filter(i =>
    i.nodeRole === "COMMERCIAL_HUB" || i.nodeRole === "IMPORT_HUB"
  );

  const storeKpis = mergeKpis(storeInvs.map(i => i.kpis));
  const hubKpis = mergeKpis(hubInvs.map(i => i.kpis));

  // Data quality
  const dataQuality: StoreNetworkDataQuality = {
    nodesWithOfficialData: nodeInventories.filter(i =>
      i.balanceSource === "SAG_OFFICIAL" || i.balanceSource === "SAG_OFFICIAL_CACHE"
    ).length,
    nodesWithNoData: nodeInventories.filter(i =>
      i.balanceSource === "SAG_OFFICIAL_NOT_FOUND"
    ).length,
    nodesUnavailable: nodeInventories.filter(i =>
      i.balanceSource === "UNAVAILABLE"
    ).length,
    productsNegative: nodeInventories.reduce(
      (s, i) => s + i.kpis.referencesNegative, 0
    ),
    sagSourceStatus: sourceStatus,
    sagFetchDurationMs: sagResult.qualityMetrics.fetchDurationMs,
    balanceSourceMode: balanceSource,
  };

  return {
    network,
    nodeInventories,
    storeKpis,
    hubKpis,
    computedAt: new Date().toISOString(),
    organizationId,
    dataQuality,
  };
}

// ── Convenience: Get inventory for a single node ────────────────────────────

/**
 * Extract inventory for a single store by warehouse code.
 * Operates on a pre-built snapshot — no additional queries.
 */
export function getNodeInventoryByWarehouseCode(
  snapshot: StoreNetworkSnapshot,
  warehouseCode: string,
): StoreNodeInventory | undefined {
  return snapshot.nodeInventories.find(
    i => i.warehouseCode === warehouseCode,
  );
}

/**
 * Extract inventory for a single store by node ID (kaNlBodega).
 */
export function getNodeInventoryById(
  snapshot: StoreNetworkSnapshot,
  nodeId: string,
): StoreNodeInventory | undefined {
  return snapshot.nodeInventories.find(i => i.nodeId === nodeId);
}

/**
 * Get all store inventories (STORE role only).
 */
export function getStoreInventories(
  snapshot: StoreNetworkSnapshot,
): StoreNodeInventory[] {
  return snapshot.nodeInventories.filter(i => i.nodeRole === "STORE");
}

/**
 * Get hub inventories (COMMERCIAL_HUB + IMPORT_HUB).
 */
export function getHubInventories(
  snapshot: StoreNetworkSnapshot,
): StoreNodeInventory[] {
  return snapshot.nodeInventories.filter(i =>
    i.nodeRole === "COMMERCIAL_HUB" || i.nodeRole === "IMPORT_HUB"
  );
}

/**
 * Search products across all nodes by reference code.
 * Returns array of { nodeId, nodeName, product } for cross-network visibility.
 */
export function searchProductAcrossNetwork(
  snapshot: StoreNetworkSnapshot,
  referenceCode: string,
): Array<{ nodeId: string; nodeName: string; nodeRole: string; product: StoreNodeProduct }> {
  const results: Array<{
    nodeId: string; nodeName: string; nodeRole: string; product: StoreNodeProduct;
  }> = [];

  for (const inv of snapshot.nodeInventories) {
    for (const product of inv.products) {
      if (product.referenceCode === referenceCode) {
        results.push({
          nodeId: inv.nodeId,
          nodeName: inv.nodeName,
          nodeRole: inv.nodeRole,
          product,
        });
      }
    }
  }

  return results;
}
