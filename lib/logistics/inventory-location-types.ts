/**
 * inventory-location-types.ts
 *
 * INVENTORY-LOCATION-MODEL-01 — Formal enterprise model for inventory locations.
 * Source-agnostic. Not tied to SAG.
 *
 * An InventoryLocation is an abstraction that can represent a warehouse, store,
 * seller portfolio, production area, import container, franchise, or any other
 * physical or logical place where inventory can exist.
 */

// ── Phase 1: Core Domain Model ──────────────────────────────────────────────

/** An enterprise inventory location with full classification metadata. */
export interface InventoryLocation {
  /** Location code — unique within organization (e.g., "01", "35") */
  code: string;
  /** Human-readable name */
  name: string;
  /** What kind of physical/logical space this is */
  locationType: InventoryLocationType;
  /** What operational role this location plays */
  role: InventoryLocationRole;
  /** What this location can do */
  capabilities: InventoryLocationCapability[];
  /** Current operational status */
  status: InventoryLocationStatus;
  /** How confident we are in this classification */
  confidence: InventoryLocationConfidence;
  /** Where we learned about this location */
  source: InventoryLocationSource;
  /** Evidence supporting this classification */
  evidence: InventoryLocationEvidence[];

  // ── Optional associations ──
  /** Associated seller name (for PORTFOLIO type) */
  sellerName: string | null;
  /** Associated seller ID (for PORTFOLIO type) */
  sellerId: string | null;
  /** Associated store slug (for STORE type) */
  storeSlug: string | null;
  /** Parent location code (for hierarchical structures) */
  parentLocationCode: string | null;
}

// ── Phase 2: Location Types ─────────────────────────────────────────────────

export type InventoryLocationType =
  | "MAIN_WAREHOUSE"     // Central distribution hub
  | "PRODUCTION"         // Production / work-in-process area
  | "PORTFOLIO"          // Seller portfolio / maleta
  | "STORE"              // Retail point of sale
  | "FRANCHISE"          // Third-party franchise location
  | "IMPORT"             // Import container or customs hold
  | "STAGING"            // Staging / transit area
  | "RAW_MATERIAL"       // Raw material storage
  | "SERVICE"            // Service / repairs area
  | "EXTERNAL"           // External partner location
  | "TEMPORARY"          // Temporary / pop-up location
  | "UNKNOWN";           // Unclassified — requires investigation

// ── Phase 3: Location Roles ─────────────────────────────────────────────────

export type InventoryLocationRole =
  | "DISTRIBUTION_HUB"           // Central node that feeds other locations
  | "SELLING_LOCATION"           // Generates sales directly
  | "PORTFOLIO_LOCATION"         // Seller carries product for field sales
  | "PRODUCTION_STAGE"           // Part of production pipeline
  | "IMPORT_STAGING"             // Holds goods pending nationalization/release
  | "RAW_MATERIAL_STORAGE"       // Stores inputs for production
  | "RETURN_LOCATION"            // Receives returned or damaged goods
  | "TRANSFER_ORIGIN"            // Primarily dispatches stock outward
  | "TRANSFER_DESTINATION"       // Primarily receives stock inbound
  | "TEMPORARY_HOLD"             // Short-term holding (events, pop-ups)
  | "UNKNOWN_ROLE";              // Role not determined

// ── Phase 4: Location Capabilities ──────────────────────────────────────────

export type InventoryLocationCapability =
  | "HOLDS_SELLABLE_STOCK"
  | "HOLDS_PRODUCTION_STOCK"
  | "HOLDS_SAMPLES"
  | "HOLDS_RAW_MATERIAL"
  | "CAN_RECEIVE_TRANSFERS"
  | "CAN_DISPATCH_TRANSFERS"
  | "CAN_SELL"
  | "CAN_PRODUCE"
  | "CAN_REPLENISH"
  | "CAN_BE_REPLENISHED"
  | "CAN_TRIGGER_PRODUCTION"
  | "CAN_TRIGGER_PORTFOLIO_REPLACEMENT"
  | "CAN_TRIGGER_STORE_REPLENISHMENT";

// ── Status ──────────────────────────────────────────────────────────────────

export type InventoryLocationStatus =
  | "ACTIVE"        // In regular use
  | "INACTIVE"      // Exists but no recent activity
  | "HISTORICAL"    // Was active, now archived
  | "UNVERIFIED";   // Discovered but not confirmed

// ── Confidence ──────────────────────────────────────────────────────────────

export interface InventoryLocationConfidence {
  /** Overall confidence level */
  level: InventoryLocationConfidenceLevel;
  /** Why we have this confidence level */
  reason: string;
}

export type InventoryLocationConfidenceLevel =
  | "HIGH"     // Confirmed by master registry + data evidence
  | "MEDIUM"   // Inferred from naming patterns or partial data
  | "LOW"      // Guessed from code range or minimal evidence
  | "UNKNOWN"; // No evidence available

// ── Source ───────────────────────────────────────────────────────────────────

export interface InventoryLocationSource {
  /** Which system provided this location */
  system: string;
  /** Specific table or entity (e.g., "BODEGAS", "ProductInventoryLevel") */
  entity: string;
  /** When this was last confirmed */
  confirmedAt: string | null;
}

// ── Evidence ────────────────────────────────────────────────────────────────

export interface InventoryLocationEvidence {
  /** What type of evidence */
  type: InventoryLocationEvidenceType;
  /** Human-readable description */
  description: string;
  /** Where this evidence comes from */
  source: string;
}

export type InventoryLocationEvidenceType =
  | "MASTER_REGISTRY"     // Listed in SAG BODEGAS table
  | "INVENTORY_DATA"      // Has ProductInventoryLevel records
  | "TRANSFER_DATA"       // Appears in InventoryTransfer origin/destination
  | "SALE_DATA"           // Appears in SaleRecord
  | "PRODUCTION_DATA"     // Appears in ProductionOrder
  | "NAMING_PATTERN"      // Classified by name prefix/pattern
  | "CODE_RANGE"          // Classified by numeric code range
  | "MANUAL_OVERRIDE"     // Explicitly configured by operator
  | "DISCOVERY";          // Found during data discovery (forensic scripts)

// ── Phase 6: Location Relationships ─────────────────────────────────────────

export interface InventoryLocationRelationship {
  /** Source location code */
  sourceLocationCode: string;
  /** Target location code */
  targetLocationCode: string;
  /** Type of relationship */
  relationshipType: InventoryLocationRelationshipType;
  /** How confident we are */
  confidence: InventoryLocationConfidenceLevel;
  /** Evidence for this relationship */
  evidence: string;
}

export type InventoryLocationRelationshipType =
  | "SUPPLIES"                // Source regularly sends stock to target
  | "RECEIVES_FROM"           // Target regularly receives from source
  | "FEEDS"                   // Source feeds production/pipeline to target
  | "REPLENISHES"             // Source replenishes target's stock
  | "RETURNS_TO"              // Source returns goods to target
  | "TRANSFERS_TO"            // General transfer route
  | "BELONGS_TO_VENDOR"       // Location is assigned to a vendor
  | "BELONGS_TO_STORE"        // Location is a store's warehouse
  | "BELONGS_TO_PRODUCTION";  // Location is part of production pipeline

// ── Phase 7: Location Hierarchy ─────────────────────────────────────────────

export interface InventoryLocationHierarchy {
  /** Hierarchy group name */
  groupName: string;
  /** Group classification */
  groupType: InventoryLocationHierarchyGroupType;
  /** Location codes in this group */
  locationCodes: string[];
  /** Parent group (null for top-level) */
  parentGroup: string | null;
}

export type InventoryLocationHierarchyGroupType =
  | "HUB"          // Central distribution point
  | "PRODUCTION"   // Production pipeline locations
  | "SALES"        // All selling points (stores + franchises)
  | "PORTFOLIOS"   // Seller portfolio locations
  | "IMPORTS"      // Import/staging pipeline
  | "SUPPORT";     // Service, samples, returns, etc.

// ── Phase 11: Signal Types (preparation — not implemented) ──────────────────

export type InventoryLocationSignalType =
  | "LOCATION_STOCK_LOW"
  | "LOCATION_OUT_OF_STOCK"
  | "PORTFOLIO_LOCATION_NEEDS_REPLACEMENT"
  | "STORE_LOCATION_NEEDS_REPLENISHMENT"
  | "PRODUCTION_LOCATION_OVERLOADED"
  | "IMPORT_LOCATION_READY_FOR_DISTRIBUTION"
  | "TRANSFER_ROUTE_ACTIVE"
  | "TRANSFER_ROUTE_INACTIVE";

// ── Phase 10: Business Entity Mapping (preparation — not implemented) ───────

export interface InventoryLocationEntityMapping {
  /** Location code */
  locationCode: string;
  /** What kind of business entity this maps to */
  entityType: "Product" | "Vendor" | "Store" | "ProductionOrder" | "Transfer";
  /** How the location relates to the entity */
  relation: "holds_stock_for" | "assigned_to" | "produces_at" | "transfers_from" | "transfers_to";
}
