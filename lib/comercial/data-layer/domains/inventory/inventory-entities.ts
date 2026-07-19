/**
 * domains/inventory/inventory-entities.ts
 *
 * Canonical entities for the Inventory Domain.
 *
 * Inventory is the dynamic physical state of products across the enterprise.
 * It answers: where is a product? how much is available? what is committed?
 *
 * This domain does NOT compute rotation, coverage, reposition, markdown,
 * or aging. Those belong to engines above. The domain only tells the truth
 * about inventory as observed.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";

// -- Position States --------------------------------------------------------

export type InventoryPositionState =
  | "AVAILABLE"
  | "RESERVED"
  | "COMMITTED"
  | "IN_TRANSIT"
  | "ON_STORE"
  | "ON_VENDOR"
  | "UNDER_PRODUCTION"
  | "UNKNOWN";

// -- Location Types ---------------------------------------------------------

export type InventoryLocationType =
  | "WAREHOUSE"
  | "PHYSICAL_ZONE"
  | "STORE"
  | "VENDOR_BAG"
  | "TRANSIT"
  | "IMPORT_WAREHOUSE"
  | "PRODUCTION";

// -- Location ---------------------------------------------------------------

export interface InventoryLocation {
  /** Location type */
  readonly type: InventoryLocationType;
  /** Location code (warehouse code, store code, vendor code, etc.) */
  readonly code: string;
  /** Human-readable label */
  readonly label: string | null;
  /** Parent location code (for hierarchy: zone -> warehouse) */
  readonly parentCode: string | null;
  /** Parent location type */
  readonly parentType: InventoryLocationType | null;
}

// -- Inventory Position (core entity) ---------------------------------------

export interface InventoryPosition {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Product reference code */
  readonly referenceCode: string;
  /** Product name */
  readonly productName: string;

  /** Variant detail (null for non-variant products) */
  readonly variant: InventoryVariantDetail | null;

  /** Where this inventory sits */
  readonly location: InventoryLocation;

  /** Position state */
  readonly state: InventoryPositionState;

  /** Quantities */
  readonly quantities: InventoryQuantities;

  /** Unit of measure */
  readonly unitOfMeasure: string;

  /** Classification (inherited from product, denormalized for query) */
  readonly classification: InventoryClassification;

  /** Position status derived from quantities and state */
  readonly positionStatus: InventoryPositionStatus;
}

// -- Variant Detail ---------------------------------------------------------

export interface InventoryVariantDetail {
  /** Size code */
  readonly sizeCode: string;
  /** Color code */
  readonly colorCode: string;
  /** Size display name */
  readonly sizeName: string | null;
  /** Color display name */
  readonly colorName: string | null;
  /** SKU (unique variant identifier) */
  readonly sku: string | null;
}

// -- Quantities -------------------------------------------------------------

export interface InventoryQuantities {
  /** Total physical quantity at this location */
  readonly physicalQty: number;
  /** Available for sale/dispatch (after reservations) */
  readonly availableQty: number;
  /** Reserved by pending orders */
  readonly reservedQty: number;
  /** Committed to confirmed orders not yet dispatched */
  readonly committedQty: number;
  /** In transit to this location */
  readonly inTransitQty: number;
  /** Quantity under quality hold or inspection */
  readonly blockedQty: number;
}

// -- Classification (denormalized from Product) -----------------------------

export interface InventoryClassification {
  /** Product group */
  readonly groupId: string;
  readonly groupName: string | null;
  /** Product sub-group */
  readonly subGroupId: string;
  readonly subGroupName: string | null;
  /** Product line */
  readonly lineId: string;
  readonly lineName: string | null;
}

// -- Position Status --------------------------------------------------------

export type InventoryPositionStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "OVERSTOCK"
  | "BLOCKED";

export function derivePositionStatus(quantities: InventoryQuantities): InventoryPositionStatus {
  if (quantities.blockedQty > 0 && quantities.availableQty <= 0) return "BLOCKED";
  if (quantities.physicalQty <= 0) return "OUT_OF_STOCK";
  if (quantities.availableQty <= 0) return "LOW_STOCK";
  return "IN_STOCK";
}

// -- Warehouse Profile (reference entity) -----------------------------------

export interface WarehouseProfile {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Warehouse code */
  readonly code: string;
  /** Human-readable name */
  readonly name: string;
  /** Location type classification */
  readonly locationType: InventoryLocationType;
  /** Whether this warehouse holds raw materials */
  readonly isRawMaterials: boolean;
  /** Whether this is a finished goods warehouse */
  readonly isFinishedGoods: boolean;
  /** Whether this is a WIP (work-in-process) warehouse */
  readonly isWIP: boolean;
  /** Whether this warehouse is active */
  readonly active: boolean;
  /** Parent warehouse code (for hierarchical topology) */
  readonly parentCode: string | null;
}
