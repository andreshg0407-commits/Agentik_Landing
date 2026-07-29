/**
 * lib/comercial/tiendas/store-network-types.ts
 *
 * AGENTIK-STORES-SAG-OFFICIAL-BALANCE-MIGRATION-01 — TERCERO/CUARTO/QUINTO
 *
 * Store Network: the official logistic infrastructure model for Agentik.
 * Every warehouse is a node. Every supply relationship is an edge.
 * Classification is explicit — no hidden rules in code.
 *
 * Pure types — no Prisma, no React, no server-only.
 *
 * Future consumers:
 *   Cobertura, Necesidades, Descuentos, Maletas,
 *   Transferencias, Importaciones, Rule 36, IA Comercial
 */

import type { WarehouseBusinessType } from "../../inventory/warehouse-master";
import type { InventoryBalanceSourceLabel } from "../../inventory/inventory-control-types";

// ── Node Role (CUARTO) ──────────────────────────────────────────────────────

/**
 * Network role — the logistic function of this node.
 *
 * COMMERCIAL_HUB:  Central distribution warehouse (B01 Principal).
 *                  Supplies stores and commercial sales.
 * IMPORT_HUB:      Import receiving warehouse (B24 Importación).
 *                  Supplies COMMERCIAL_HUB. Never supplies stores directly.
 * STORE:           Retail point of sale (Centro, San Diego, Gran Plaza, Caldas).
 *                  Sells to end customers.
 * PRODUCTION:      Manufacturing process (B04, Muestras, Arreglos, Segundas).
 *                  Never participates in commercial availability or KPIs.
 * SUPPORT:         Non-commercial (staging, containers, excluded warehouses).
 *                  No commercial availability, no coverage, no surtido.
 * VENDOR:          External vendor sample warehouses.
 *                  Tracked independently — not part of commercial flow.
 */
export type StoreNetworkNodeRole =
  | "COMMERCIAL_HUB"
  | "IMPORT_HUB"
  | "STORE"
  | "PRODUCTION"
  | "SUPPORT"
  | "VENDOR";

// ── Network Node (TERCERO) ──────────────────────────────────────────────────

export interface StoreNetworkNode {
  /** Unique node ID = warehouse kaNlBodega */
  id: string;
  /** SAG internal PK (= kaNlBodega from warehouse-master) */
  warehouseId: string;
  /** SAG business code (= ssCodigo from warehouse-master) */
  warehouseCode: string;
  /** Human-readable warehouse name */
  warehouseName: string;
  /** Warehouse business type from warehouse-master */
  warehouseType: WarehouseBusinessType;
  /** Logistic role in the network */
  networkRole: StoreNetworkNodeRole;
  /** Parent node ID (null for root nodes like IMPORT_HUB) */
  parentNode: string | null;

  // ── Capabilities ──
  /** Can sell to end customers */
  allowCommercialSales: boolean;
  /** Participates in coverage calculations */
  allowCoverage: boolean;
  /** Can receive replenishment from hub */
  allowReplenishment: boolean;
  /** Can initiate or receive transfers */
  allowTransfers: boolean;
  /** Is a production facility */
  allowProduction: boolean;

  // ── Inventory source config ──
  /** Source of official inventory data */
  inventorySource: "SAG_OFFICIAL" | "PIL_LEGACY" | "NONE";
}

// ── Network Edge (SÉPTIMO) ──────────────────────────────────────────────────

export type StoreNetworkEdgeType =
  | "SUPPLIES"        // Hub → Store (replenishment)
  | "FEEDS"           // Import Hub → Commercial Hub
  | "PRODUCES_FOR";   // Production → Commercial Hub

export interface StoreNetworkEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Relationship type */
  relationship: StoreNetworkEdgeType;
}

// ── Store Network (SÉPTIMO) ──────────────────────────────────────────────────

export interface StoreNetwork {
  /** All nodes in the network */
  nodes: StoreNetworkNode[];
  /** All supply edges */
  edges: StoreNetworkEdge[];
  /** Convenience: COMMERCIAL_HUB + IMPORT_HUB nodes */
  hubs: StoreNetworkNode[];
  /** Convenience: STORE nodes only */
  stores: StoreNetworkNode[];
  /** Convenience: PRODUCTION nodes only */
  productionNodes: StoreNetworkNode[];
  /** Convenience: SUPPORT + VENDOR nodes */
  supportNodes: StoreNetworkNode[];
  /** Timestamp when the network was built */
  builtAt: string;
}

// ── Source Status (DÉCIMO) ──────────────────────────────────────────────────

export type StoreNodeSourceStatus =
  | "FRESH"
  | "AGING"
  | "STALE"
  | "UNAVAILABLE"
  | "DEGRADED";

// ── Store Node Product (QUINTO/SEXTO) ───────────────────────────────────────

export interface StoreNodeProduct {
  referenceCode: string;
  productName: string;
  line: string;
  category: string;
  brand: string;

  /** SAG EXISTENCIA (on-hand) */
  officialOnHand: number;
  /** SAG RESERVADO (committed orders) */
  officialReserved: number;
  /** SAG DISPONIBLE (= existencia - reservado, can be negative) */
  officialAvailable: number;
  /** SAG cost (n_costo_promedio) */
  costoPromedio: number;
  /** Most recent inventory-affecting movement */
  lastMovement: Date | null;

  /** Alert classification for this product at this node */
  alertState: StoreProductAlertState;
  /** Provenance of this balance */
  balanceSource: InventoryBalanceSourceLabel;
}

// ── Alert States (NOVENO) ───────────────────────────────────────────────────

/**
 * Deterministic product alert state — no AI, no inference.
 *
 * OUT_OF_STOCK:        existencia = 0 AND disponible <= 0
 * LOW_STOCK:           disponible > 0 AND disponible <= 5
 * ONLY_RESERVED:       existencia > 0 AND disponible <= 0
 * OVERSTOCK:           Future — requires configured thresholds
 * NEGATIVE_STOCK:      disponible < 0
 * STALE_SOURCE:        sourceStatus is STALE or DEGRADED
 * OFFICIAL_NOT_FOUND:  balanceSource = SAG_OFFICIAL_NOT_FOUND
 * HEALTHY:             none of the above
 */
export type StoreProductAlertState =
  | "OUT_OF_STOCK"
  | "LOW_STOCK"
  | "ONLY_RESERVED"
  | "OVERSTOCK"
  | "NEGATIVE_STOCK"
  | "STALE_SOURCE"
  | "OFFICIAL_NOT_FOUND"
  | "HEALTHY";

// ── Store Node KPIs (OCTAVO) ────────────────────────────────────────────────

export interface StoreNodeKpis {
  /** Total distinct references at this node */
  totalReferences: number;
  /** Total on-hand units (SUM EXISTENCIA) */
  totalOnHand: number;
  /** Total reserved units (SUM RESERVADO) */
  totalReserved: number;
  /** Total available units (SUM DISPONIBLE) */
  totalAvailable: number;
  /** References with stock (disponible > 0) */
  referencesWithStock: number;
  /** References out of stock (existencia = 0, disponible <= 0) */
  referencesOutOfStock: number;
  /** References critical (disponible > 0 AND disponible <= 5) */
  referencesCritical: number;
  /** References with reserved units (reservado > 0) */
  referencesReserved: number;
  /** References with negative disponible */
  referencesNegative: number;
  /** References not found in SAG view */
  referencesNotFound: number;
}

// ── Store Node Inventory (QUINTO) ───────────────────────────────────────────

export interface StoreNodeInventory {
  /** Node ID (= warehouse kaNlBodega) */
  nodeId: string;
  /** Human-readable name */
  nodeName: string;
  /** Logistic role */
  nodeRole: StoreNetworkNodeRole;
  /** SAG internal PK */
  warehouseId: string;
  /** SAG business code */
  warehouseCode: string;

  // ── Official aggregates ──
  /** Total on-hand across all products at this node */
  officialOnHand: number;
  /** Total reserved across all products */
  officialReserved: number;
  /** Total available across all products */
  officialAvailable: number;

  // ── Observability (DÉCIMO) ──
  /** When this data was fetched */
  snapshotAt: string;
  /** Most recent movement across all products */
  lastMovement: Date | null;
  /** Source freshness status */
  sourceStatus: StoreNodeSourceStatus;
  /** Provenance label */
  balanceSource: InventoryBalanceSourceLabel;
  /** Whether data is considered reliable */
  healthy: boolean;
  /** Milliseconds since snapshot */
  sourceAge: number;

  // ── Products ──
  /** Per-reference inventory at this node */
  products: StoreNodeProduct[];

  // ── KPIs (OCTAVO) ──
  kpis: StoreNodeKpis;
}

// ── Store Network Snapshot ──────────────────────────────────────────────────

export interface StoreNetworkSnapshot {
  /** The network graph */
  network: StoreNetwork;
  /** Per-node inventory */
  nodeInventories: StoreNodeInventory[];
  /** Aggregate KPIs across all stores */
  storeKpis: StoreNodeKpis;
  /** Aggregate KPIs across all hubs */
  hubKpis: StoreNodeKpis;
  /** When this snapshot was built */
  computedAt: string;
  /** Organization ID */
  organizationId: string;
  /** Data quality summary */
  dataQuality: StoreNetworkDataQuality;
}

// ── Data Quality ────────────────────────────────────────────────────────────

export interface StoreNetworkDataQuality {
  /** Total nodes with SAG_OFFICIAL data */
  nodesWithOfficialData: number;
  /** Total nodes with SAG_OFFICIAL_NOT_FOUND */
  nodesWithNoData: number;
  /** Total nodes with UNAVAILABLE */
  nodesUnavailable: number;
  /** Total products with negative disponible */
  productsNegative: number;
  /** SAG source status */
  sagSourceStatus: StoreNodeSourceStatus;
  /** SAG fetch duration */
  sagFetchDurationMs: number;
  /** Balance source mode */
  balanceSourceMode: "SAG_OFFICIAL" | "PIL_LEGACY";
}
