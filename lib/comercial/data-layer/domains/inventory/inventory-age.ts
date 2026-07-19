/**
 * domains/inventory/inventory-age.ts
 *
 * Inventory age: how long has inventory been sitting at a location
 * without movement. Pure temporal observation — not commercial aging
 * (which involves markdown/discount decisions and belongs to engines).
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

// -- Inventory Age ----------------------------------------------------------

export interface InventoryAge {
  /** Product reference code */
  readonly referenceCode: string;
  /** Location code */
  readonly locationCode: string;

  /** Variant (null for product-level) */
  readonly sizeCode: string | null;
  readonly colorCode: string | null;

  /** Date of last inbound movement at this location */
  readonly lastEntryAt: Date | null;
  /** Date of last outbound movement at this location */
  readonly lastExitAt: Date | null;
  /** Date of any last movement (max of entry/exit) */
  readonly lastMovementAt: Date | null;

  /** Days since last movement (null if no movement recorded) */
  readonly daysSinceLastMovement: number | null;
  /** Days since last entry */
  readonly daysSinceLastEntry: number | null;
  /** Days since last exit */
  readonly daysSinceLastExit: number | null;

  /** Current physical quantity */
  readonly currentQty: number;

  /** Age bracket for quick classification */
  readonly bracket: InventoryAgeBracket;

  /** Observation timestamp */
  readonly observedAt: Date;
}

// -- Age Bracket ------------------------------------------------------------

export type InventoryAgeBracket =
  | "FRESH"       // < 30 days
  | "NORMAL"      // 30-90 days
  | "AGING"       // 90-180 days
  | "OLD"         // 180-365 days
  | "STALE"       // > 365 days
  | "UNKNOWN";    // no movement data

export function deriveAgeBracket(daysSinceLastMovement: number | null): InventoryAgeBracket {
  if (daysSinceLastMovement == null) return "UNKNOWN";
  if (daysSinceLastMovement < 30) return "FRESH";
  if (daysSinceLastMovement < 90) return "NORMAL";
  if (daysSinceLastMovement < 180) return "AGING";
  if (daysSinceLastMovement < 365) return "OLD";
  return "STALE";
}

// -- Age Summary (for dashboard aggregation) --------------------------------

export interface InventoryAgeSummary {
  readonly tenantId: string;
  readonly locationCode: string | null;
  readonly observedAt: Date;

  /** Count of references per bracket */
  readonly distribution: Record<InventoryAgeBracket, number>;
  /** Total references measured */
  readonly totalReferences: number;
  /** Average days since last movement */
  readonly averageDaysSinceMovement: number | null;
}
