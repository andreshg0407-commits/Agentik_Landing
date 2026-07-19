/**
 * location-resolver.ts
 *
 * INVENTORY-LOCATION-MODEL-01 — Phase 8: Location Resolver.
 * Resolves location codes to enriched InventoryLocation objects.
 * Works with catalog and evidence — never queries SAG directly.
 *
 * Phase 9: Transfer integration helpers.
 * Connects InventoryTransfer.originWarehouseCode / destinationWarehouseCode
 * to InventoryLocation.code.
 */

import type {
  InventoryLocation,
  InventoryLocationType,
  InventoryLocationRole,
  InventoryLocationCapability,
  InventoryLocationRelationship,
  InventoryLocationRelationshipType,
} from "./inventory-location-types";
import type { TransferRouteType } from "./movement-document-types";

// ── Resolver ────────────────────────────────────────────────────────────────

/** Builds a resolver from a location catalog. */
export function buildLocationResolver(catalog: InventoryLocation[]) {
  const byCode = new Map<string, InventoryLocation>();
  for (const loc of catalog) {
    byCode.set(loc.code, loc);
  }

  return {
    /** Resolve a location by code. Returns undefined if not found. */
    resolveLocationByCode(code: string): InventoryLocation | undefined {
      return byCode.get(code);
    },

    /** Get the type for a location code. Returns UNKNOWN if not found. */
    resolveLocationType(code: string): InventoryLocationType {
      return byCode.get(code)?.locationType ?? "UNKNOWN";
    },

    /** Get the role for a location code. Returns UNKNOWN_ROLE if not found. */
    resolveLocationRole(code: string): InventoryLocationRole {
      return byCode.get(code)?.role ?? "UNKNOWN_ROLE";
    },

    /** Get capabilities for a location code. Returns empty array if not found. */
    resolveLocationCapabilities(code: string): InventoryLocationCapability[] {
      return byCode.get(code)?.capabilities ?? [];
    },

    /** Check if a location is a seller portfolio (maleta). */
    isPortfolioLocation(code: string): boolean {
      return byCode.get(code)?.locationType === "PORTFOLIO";
    },

    /** Check if a location is a store. */
    isStoreLocation(code: string): boolean {
      return byCode.get(code)?.locationType === "STORE";
    },

    /** Check if a location is a production area. */
    isProductionLocation(code: string): boolean {
      return byCode.get(code)?.locationType === "PRODUCTION";
    },

    /** Check if a location is the main warehouse / distribution hub. */
    isMainWarehouse(code: string): boolean {
      return byCode.get(code)?.locationType === "MAIN_WAREHOUSE";
    },

    /** Check if a location is a franchise. */
    isFranchiseLocation(code: string): boolean {
      return byCode.get(code)?.locationType === "FRANCHISE";
    },

    /** Check if a location is an import container or staging area. */
    isImportLocation(code: string): boolean {
      const t = byCode.get(code)?.locationType;
      return t === "IMPORT" || t === "STAGING";
    },

    /** Check if location can trigger production orders. */
    canTriggerProduction(code: string): boolean {
      return byCode.get(code)?.capabilities.includes("CAN_TRIGGER_PRODUCTION") ?? false;
    },

    /** Check if location can trigger portfolio replacement (maleta surtido). */
    canTriggerPortfolioReplacement(code: string): boolean {
      return byCode.get(code)?.capabilities.includes("CAN_TRIGGER_PORTFOLIO_REPLACEMENT") ?? false;
    },

    /** Check if location can trigger store replenishment. */
    canTriggerStoreReplenishment(code: string): boolean {
      return byCode.get(code)?.capabilities.includes("CAN_TRIGGER_STORE_REPLENISHMENT") ?? false;
    },

    /** Get all locations of a given type. */
    getLocationsByType(type: InventoryLocationType): InventoryLocation[] {
      return catalog.filter((loc) => loc.locationType === type);
    },

    /** Get all active locations. */
    getActiveLocations(): InventoryLocation[] {
      return catalog.filter((loc) => loc.status === "ACTIVE");
    },

    /** Get all location codes. */
    getAllCodes(): string[] {
      return catalog.map((loc) => loc.code);
    },

    /** Get total location count. */
    getLocationCount(): number {
      return catalog.length;
    },
  };
}

// ── Phase 9: Transfer Integration Helpers ───────────────────────────────────

/** A resolved transfer flow with enriched origin and destination. */
export interface TransferLocationFlow {
  originCode: string;
  originLocation: InventoryLocation | undefined;
  destinationCode: string;
  destinationLocation: InventoryLocation | undefined;
  routeType: TransferRouteType;
}

/** Resolve origin and destination locations for a transfer. */
export function transferToLocationFlow(
  originCode: string | null,
  destinationCode: string | null,
  resolver: ReturnType<typeof buildLocationResolver>,
): TransferLocationFlow {
  const origin = originCode ? resolver.resolveLocationByCode(originCode) : undefined;
  const destination = destinationCode ? resolver.resolveLocationByCode(destinationCode) : undefined;
  return {
    originCode: originCode ?? "",
    originLocation: origin,
    destinationCode: destinationCode ?? "",
    destinationLocation: destination,
    routeType: classifyTransferRoute(
      originCode,
      destinationCode,
      resolver,
    ),
  };
}

/** Get the resolved origin location for a transfer. */
export function getTransferOriginLocation(
  originCode: string | null,
  resolver: ReturnType<typeof buildLocationResolver>,
): InventoryLocation | undefined {
  return originCode ? resolver.resolveLocationByCode(originCode) : undefined;
}

/** Get the resolved destination location for a transfer. */
export function getTransferDestinationLocation(
  destinationCode: string | null,
  resolver: ReturnType<typeof buildLocationResolver>,
): InventoryLocation | undefined {
  return destinationCode ? resolver.resolveLocationByCode(destinationCode) : undefined;
}

/** Classify a transfer route based on origin and destination types. */
export function classifyTransferRoute(
  originCode: string | null,
  destinationCode: string | null,
  resolver: ReturnType<typeof buildLocationResolver>,
): TransferRouteType {
  if (!originCode || !destinationCode) return "UNKNOWN";

  const originType = resolver.resolveLocationType(originCode);
  const destType = resolver.resolveLocationType(destinationCode);

  // Production → Main warehouse
  if (originType === "PRODUCTION" && destType === "MAIN_WAREHOUSE") {
    return "PRODUCTION_TO_WAREHOUSE";
  }

  // Main warehouse → Store
  if (originType === "MAIN_WAREHOUSE" && destType === "STORE") {
    return "WAREHOUSE_TO_STORE";
  }

  // Main warehouse → Seller portfolio
  if (originType === "MAIN_WAREHOUSE" && destType === "PORTFOLIO") {
    return "WAREHOUSE_TO_SELLER";
  }

  // Seller → Main warehouse (return)
  if (originType === "PORTFOLIO" && destType === "MAIN_WAREHOUSE") {
    return "SELLER_RETURN";
  }

  // Import containers → Staging, or Staging → Main warehouse
  if (
    (originType === "IMPORT" && destType === "STAGING") ||
    (originType === "STAGING" && destType === "MAIN_WAREHOUSE") ||
    (originType === "IMPORT" && destType === "MAIN_WAREHOUSE")
  ) {
    return "IMPORT_STAGING";
  }

  return "INTER_WAREHOUSE";
}

/** Filter relationships by source location. */
export function resolveLocationRelationships(
  code: string,
  relationships: InventoryLocationRelationship[],
): InventoryLocationRelationship[] {
  return relationships.filter(
    (r) => r.sourceLocationCode === code || r.targetLocationCode === code,
  );
}

/** Get outbound relationships (where this location is the source). */
export function getOutboundRelationships(
  code: string,
  relationships: InventoryLocationRelationship[],
  type?: InventoryLocationRelationshipType,
): InventoryLocationRelationship[] {
  return relationships.filter(
    (r) => r.sourceLocationCode === code && (!type || r.relationshipType === type),
  );
}

/** Get inbound relationships (where this location is the target). */
export function getInboundRelationships(
  code: string,
  relationships: InventoryLocationRelationship[],
  type?: InventoryLocationRelationshipType,
): InventoryLocationRelationship[] {
  return relationships.filter(
    (r) => r.targetLocationCode === code && (!type || r.relationshipType === type),
  );
}
