/**
 * domains/inventory/inventory-availability.ts
 *
 * Availability: the computed truth about what can be sold/dispatched.
 * Derived from positions, but a first-class concept because availability
 * is the most-queried dimension of inventory.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

// -- Availability -----------------------------------------------------------

export interface InventoryAvailability {
  /** Product reference code */
  readonly referenceCode: string;
  /** Product name */
  readonly productName: string;

  /** Variant detail (null if product-level aggregation) */
  readonly sizeCode: string | null;
  readonly colorCode: string | null;

  /** Location code (null if enterprise-wide aggregation) */
  readonly locationCode: string | null;

  /** Available for immediate sale */
  readonly availableUnits: number;
  /** Reserved by orders not yet dispatched */
  readonly reservedUnits: number;
  /** Committed to confirmed operations */
  readonly committedUnits: number;
  /** Total physical on hand */
  readonly physicalUnits: number;

  /** Net available = available - committed */
  readonly netAvailable: number;

  /** Whether this product is sellable right now */
  readonly isSellable: boolean;

  /** Availability status */
  readonly status: AvailabilityStatus;

  /** Timestamp of the data that produced this availability */
  readonly observedAt: Date;
}

// -- Availability Status ----------------------------------------------------

export type AvailabilityStatus =
  | "AVAILABLE"
  | "LIMITED"
  | "EXHAUSTED"
  | "BLOCKED";

export function deriveAvailabilityStatus(
  netAvailable: number,
  physicalUnits: number,
  blockedQty: number
): AvailabilityStatus {
  if (blockedQty > 0 && netAvailable <= 0) return "BLOCKED";
  if (physicalUnits <= 0) return "EXHAUSTED";
  if (netAvailable <= 0) return "LIMITED";
  return "AVAILABLE";
}

// -- Availability Query (for engines to request) ----------------------------

export interface AvailabilityQuery {
  readonly referenceCode?: string;
  readonly locationCode?: string;
  readonly sizeCode?: string;
  readonly colorCode?: string;
  readonly onlyAvailable?: boolean;
  readonly includeVariants?: boolean;
}
