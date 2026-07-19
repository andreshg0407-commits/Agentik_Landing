/**
 * domains/inventory/inventory-movement.ts
 *
 * Inventory movements: how inventory got to where it is.
 * Separate from Position (where it IS) by design.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";
import type { InventoryLocationType } from "./inventory-entities";

// -- Movement Type ----------------------------------------------------------

export type InventoryMovementType =
  | "ENTRY"
  | "EXIT"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "RETURN"
  | "PRODUCTION_ENTRY"
  | "PRODUCTION_CONSUMPTION"
  | "DISPATCH"
  | "RECEIPT";

// -- Movement Direction -----------------------------------------------------

export type InventoryMovementDirection = "IN" | "OUT";

// -- Movement ---------------------------------------------------------------

export interface InventoryMovement {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Movement type */
  readonly movementType: InventoryMovementType;
  /** Direction relative to the location */
  readonly direction: InventoryMovementDirection;

  /** When the movement occurred in the source system */
  readonly occurredAt: Date;

  /** Product reference code */
  readonly referenceCode: string;
  /** Product name */
  readonly productName: string;

  /** Variant (optional) */
  readonly sizeCode: string | null;
  readonly colorCode: string | null;

  /** Quantity moved (always positive; direction indicates sign) */
  readonly quantity: number;
  /** Unit of measure */
  readonly unitOfMeasure: string;

  /** Source document that originated this movement */
  readonly sourceDocument: MovementSourceDocument;

  /** Origin location (null for entries from outside the system) */
  readonly originLocation: MovementLocation | null;
  /** Destination location (null for exits from the system) */
  readonly destinationLocation: MovementLocation | null;

  /** Cost at time of movement (for inventory valuation) */
  readonly unitCost: number | null;
  /** Currency */
  readonly currency: string | null;

  /** Sign applied to inventory: +1 or -1 */
  readonly inventorySign: 1 | -1;
}

// -- Movement Source Document -----------------------------------------------

export interface MovementSourceDocument {
  /** Document type code (SAG FUENTE code once mapped) */
  readonly documentType: string;
  /** Document number */
  readonly documentNumber: string;
  /** Document family (OFFICIAL_INVOICE, CREDIT_NOTE, TRANSFER, etc.) */
  readonly documentFamily: string | null;
}

// -- Movement Location (lightweight, not full InventoryLocation) ------------

export interface MovementLocation {
  readonly type: InventoryLocationType;
  readonly code: string;
  readonly label: string | null;
}
