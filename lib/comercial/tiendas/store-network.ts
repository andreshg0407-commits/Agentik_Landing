/**
 * lib/comercial/tiendas/store-network.ts
 *
 * AGENTIK-STORES-SAG-OFFICIAL-BALANCE-MIGRATION-01 — TERCERO/CUARTO/SÉPTIMO
 *
 * Builds the Store Network graph from warehouse-master.
 * Pure domain — no Prisma, no React, no server-only, no SOAP.
 *
 * The Store Network is the official logistic infrastructure model.
 * Every module that needs to understand warehouse topology MUST
 * consume this — never hardcode warehouse relationships.
 *
 * Future consumers:
 *   Cobertura, Necesidades, Descuentos, Maletas,
 *   Transferencias, Importaciones, Rule 36, IA Comercial
 */

import {
  getAllWarehouses,
  type WarehouseEntry,
  type WarehouseBusinessType,
} from "../../inventory/warehouse-master";
import type {
  StoreNetwork,
  StoreNetworkNode,
  StoreNetworkEdge,
  StoreNetworkNodeRole,
} from "./store-network-types";

// ── Node Role Resolution (CUARTO) ──────────────────────────────────────────

/**
 * Resolve the network role from warehouse business type.
 * Explicit mapping — no inference, no heuristics.
 */
export function resolveNetworkRole(businessType: WarehouseBusinessType): StoreNetworkNodeRole {
  switch (businessType) {
    case "COMMERCIAL_TEXTILE":
      return "COMMERCIAL_HUB";
    case "COMMERCIAL_AVAILABLE_IMPORT":
      return "IMPORT_HUB";
    case "STORE":
      return "STORE";
    case "PRODUCTION_ONLY":
      return "PRODUCTION";
    case "VENDOR":
      return "VENDOR";
    case "IMPORT_STAGING":
    case "IMPORT_CONTAINER":
    case "EXCLUDED":
    case "UNKNOWN":
      return "SUPPORT";
  }
}

// ── Node Capabilities (CUARTO) ──────────────────────────────────────────────

function resolveCapabilities(role: StoreNetworkNodeRole): {
  allowCommercialSales: boolean;
  allowCoverage: boolean;
  allowReplenishment: boolean;
  allowTransfers: boolean;
  allowProduction: boolean;
} {
  switch (role) {
    case "COMMERCIAL_HUB":
      return {
        allowCommercialSales: true,
        allowCoverage: true,
        allowReplenishment: true,
        allowTransfers: true,
        allowProduction: false,
      };
    case "IMPORT_HUB":
      return {
        allowCommercialSales: false,
        allowCoverage: false,
        allowReplenishment: false,  // Never supplies stores directly
        allowTransfers: true,       // Can transfer to COMMERCIAL_HUB
        allowProduction: false,
      };
    case "STORE":
      return {
        allowCommercialSales: true,
        allowCoverage: true,
        allowReplenishment: true,
        allowTransfers: true,
        allowProduction: false,
      };
    case "PRODUCTION":
      return {
        allowCommercialSales: false,
        allowCoverage: false,
        allowReplenishment: false,
        allowTransfers: false,
        allowProduction: true,
      };
    case "VENDOR":
      return {
        allowCommercialSales: false,
        allowCoverage: false,
        allowReplenishment: false,
        allowTransfers: false,
        allowProduction: false,
      };
    case "SUPPORT":
      return {
        allowCommercialSales: false,
        allowCoverage: false,
        allowReplenishment: false,
        allowTransfers: false,
        allowProduction: false,
      };
  }
}

// ── Parent Resolution (SÉPTIMO) ─────────────────────────────────────────────

/**
 * Resolve the parent node for a given role.
 * The graph structure:
 *   IMPORT_HUB → COMMERCIAL_HUB → STORE → Client
 *   PRODUCTION → COMMERCIAL_HUB
 *
 * Returns kaNlBodega of parent, or null for root nodes.
 */
function resolveParentNode(
  role: StoreNetworkNodeRole,
  commercialHubId: string | null,
): string | null {
  switch (role) {
    case "IMPORT_HUB":
      return null; // Root node — feeds into commercial hub
    case "COMMERCIAL_HUB":
      return null; // Root distribution node
    case "STORE":
      return commercialHubId; // Supplied by commercial hub
    case "PRODUCTION":
      return commercialHubId; // Produces for commercial hub
    case "VENDOR":
      return null;
    case "SUPPORT":
      return null;
  }
}

// ── Edge Builder (SÉPTIMO) ──────────────────────────────────────────────────

function buildEdges(nodes: StoreNetworkNode[]): StoreNetworkEdge[] {
  const edges: StoreNetworkEdge[] = [];

  const commercialHub = nodes.find(n => n.networkRole === "COMMERCIAL_HUB");
  const importHub = nodes.find(n => n.networkRole === "IMPORT_HUB");

  if (!commercialHub) return edges;

  // IMPORT_HUB → COMMERCIAL_HUB
  if (importHub) {
    edges.push({
      from: importHub.id,
      to: commercialHub.id,
      relationship: "FEEDS",
    });
  }

  // PRODUCTION → COMMERCIAL_HUB
  for (const node of nodes) {
    if (node.networkRole === "PRODUCTION") {
      edges.push({
        from: node.id,
        to: commercialHub.id,
        relationship: "PRODUCES_FOR",
      });
    }
  }

  // COMMERCIAL_HUB → STORE
  for (const node of nodes) {
    if (node.networkRole === "STORE") {
      edges.push({
        from: commercialHub.id,
        to: node.id,
        relationship: "SUPPLIES",
      });
    }
  }

  return edges;
}

// ── Network Builder (TERCERO) ───────────────────────────────────────────────

function warehouseToNode(
  wh: WarehouseEntry,
  commercialHubId: string | null,
): StoreNetworkNode {
  const role = resolveNetworkRole(wh.businessType);
  const caps = resolveCapabilities(role);
  const parentNode = resolveParentNode(role, commercialHubId);

  return {
    id: wh.kaNlBodega,
    warehouseId: wh.kaNlBodega,
    warehouseCode: wh.ssCodigo,
    warehouseName: wh.ssNombre,
    warehouseType: wh.businessType,
    networkRole: role,
    parentNode,
    ...caps,
    inventorySource: (role === "SUPPORT" || role === "VENDOR")
      ? "NONE"
      : "SAG_OFFICIAL",
  };
}

/**
 * Build the Store Network from warehouse-master configuration.
 *
 * Pure function — no DB, no SOAP, no side effects.
 * Called once at service startup, cached indefinitely (warehouse config is static).
 */
export function buildStoreNetwork(): StoreNetwork {
  const warehouses = getAllWarehouses();

  // Find commercial hub first (needed for parent resolution)
  const commercialHubWh = warehouses.find(w => w.businessType === "COMMERCIAL_TEXTILE");
  const commercialHubId = commercialHubWh?.kaNlBodega ?? null;

  const nodes = warehouses.map(wh => warehouseToNode(wh, commercialHubId));
  const edges = buildEdges(nodes);

  return {
    nodes,
    edges,
    hubs: nodes.filter(n =>
      n.networkRole === "COMMERCIAL_HUB" || n.networkRole === "IMPORT_HUB"
    ),
    stores: nodes.filter(n => n.networkRole === "STORE"),
    productionNodes: nodes.filter(n => n.networkRole === "PRODUCTION"),
    supportNodes: nodes.filter(n =>
      n.networkRole === "SUPPORT" || n.networkRole === "VENDOR"
    ),
    builtAt: new Date().toISOString(),
  };
}

// ── Convenience Accessors ───────────────────────────────────────────────────

/** Get a node by warehouse code (ssCodigo) */
export function getNodeByWarehouseCode(
  network: StoreNetwork,
  warehouseCode: string,
): StoreNetworkNode | undefined {
  return network.nodes.find(n => n.warehouseCode === warehouseCode);
}

/** Get a node by node ID (kaNlBodega) */
export function getNodeById(
  network: StoreNetwork,
  nodeId: string,
): StoreNetworkNode | undefined {
  return network.nodes.find(n => n.id === nodeId);
}

/** Get all children of a node */
export function getChildNodes(
  network: StoreNetwork,
  parentId: string,
): StoreNetworkNode[] {
  const childIds = network.edges
    .filter(e => e.from === parentId)
    .map(e => e.to);
  return network.nodes.filter(n => childIds.includes(n.id));
}

/** Get the parent node */
export function getParentNode(
  network: StoreNetwork,
  childId: string,
): StoreNetworkNode | undefined {
  const edge = network.edges.find(e => e.to === childId);
  if (!edge) return undefined;
  return network.nodes.find(n => n.id === edge.from);
}

/** Get nodes that allow commercial sales */
export function getCommercialNodes(network: StoreNetwork): StoreNetworkNode[] {
  return network.nodes.filter(n => n.allowCommercialSales);
}

/** Get nodes that participate in coverage */
export function getCoverageNodes(network: StoreNetwork): StoreNetworkNode[] {
  return network.nodes.filter(n => n.allowCoverage);
}
