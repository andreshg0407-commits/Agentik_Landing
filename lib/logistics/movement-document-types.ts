/**
 * movement-document-types.ts
 *
 * CASTILLITOS-LOGISTICS-SYNC-01 — Phase 5: Enterprise MovementDocument model.
 * Source-agnostic domain types. Not tied to SAG.
 *
 * A MovementDocument represents any inventory movement that changes stock
 * at one or more locations. It unifies production orders, transfers, sales,
 * purchases, and adjustments into a single queryable model.
 */

// ── Movement Classification ──────────────────────────────────────────────────

export type MovementCategory =
  | "PRODUCTION"        // OP — finished goods from production
  | "TRANSFER"          // TR — inter-warehouse movement
  | "SELLER_TRANSFER"   // TM — maleta/seller portfolio movement
  | "SALE"              // FV/FP — sale outflows
  | "PURCHASE"          // FC/FPC — purchase inflows
  | "ADJUSTMENT"        // AJ — inventory corrections
  | "RETURN"            // DV — customer returns
  | "IMPORT"            // Container → staging → warehouse
  | "OTHER";

export type MovementDirection =
  | "INBOUND"   // stock increases at destination
  | "OUTBOUND"  // stock decreases at origin
  | "NEUTRAL"   // stock moves between locations (transfer)
  | "UNKNOWN";

export type MovementStatus = "open" | "closed" | "unknown";

// ── Document ─────────────────────────────────────────────────────────────────

/** Enterprise-level movement document — source-agnostic. */
export interface MovementDocument {
  /** Internal ID */
  id: string;
  organizationId: string;
  /** Source system reference (e.g., SAG erpMovId) */
  externalId: string;
  /** Document number in source system */
  documentNumber: string;
  /** Classification */
  category: MovementCategory;
  direction: MovementDirection;
  status: MovementStatus;
  /** Business date */
  documentDate: Date;
  /** Source system identifier (e.g., "SAG", "SHOPIFY") */
  sourceSystem: string;
  /** Source-specific document type code (e.g., "TR", "TM", "OP") */
  sourceTypeCode: string;
  /** Origin location code */
  originLocationCode: string | null;
  originLocationName: string | null;
  /** Destination location code */
  destinationLocationCode: string | null;
  destinationLocationName: string | null;
  /** Aggregate line stats */
  lineCount: number;
  totalQuantity: number;
  totalValue: number | null;
}

// ── Transfer Route ───────────────────────────────────────────────────────────

/** A discovered route between two inventory locations. */
export interface TransferRoute {
  /** Origin location code */
  originCode: string;
  originName: string;
  /** Destination location code */
  destinationCode: string;
  destinationName: string;
  /** Route classification */
  routeType: TransferRouteType;
  /** Number of historical transfers on this route */
  transferCount: number;
  /** Total units moved on this route */
  totalUnits: number;
  /** Number of distinct products moved */
  distinctProducts: number;
  /** Last transfer date on this route */
  lastTransferDate: Date | null;
}

export type TransferRouteType =
  | "PRODUCTION_TO_WAREHOUSE"   // 04 → 01 (production output)
  | "WAREHOUSE_TO_STORE"        // 01 → 00/02/03/23/29
  | "WAREHOUSE_TO_SELLER"       // 01 → 35-40 (maleta assignment)
  | "SELLER_RETURN"             // 35-40 → 01 (maleta return)
  | "IMPORT_STAGING"            // Container → 24 → 01
  | "INTER_WAREHOUSE"           // Any other warehouse-to-warehouse
  | "UNKNOWN";

// ── Inventory Location ───────────────────────────────────────────────────────
// Formal model moved to inventory-location-types.ts (INVENTORY-LOCATION-MODEL-01)

export type {
  InventoryLocation,
  InventoryLocationType,
} from "./inventory-location-types";
