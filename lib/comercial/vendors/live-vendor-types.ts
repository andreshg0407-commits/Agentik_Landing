/**
 * live-vendor-types.ts
 *
 * LIVEVENDOR-FOUNDATION-01 — Domain types for LiveVendor logistics foundation.
 * Connects vendor → InventoryLocation → TM Transfers → Portfolio → Replacement Intelligence.
 *
 * These types EXTEND the existing LiveVendor (vendor-types.ts) with logistics awareness.
 * They do NOT replace vendor-types.ts — they add the supply chain dimension.
 *
 * No React. No Prisma. No SAG direct access.
 */

import type { InventoryLocation } from "@/lib/logistics/inventory-location-types";
import type { MaletaReplacementRule } from "@/lib/commercial-intelligence/availability-types";

// ── Phase 1: Core LiveVendor Logistics Model ────────────────────────────────

/** A vendor bound to their logistics location with portfolio state. */
export interface LiveVendorProfile {
  /** Vendor identity (matches VendorIdentity.id) */
  vendorId: string;
  /** Display name */
  vendorName: string;
  /** Location binding — the vendor's maleta warehouse */
  location: VendorLocationBinding;
  /** Current portfolio snapshot */
  portfolio: VendorPortfolioSnapshot;
  /** Transfer history summary */
  transferHistory: VendorTransferHistory;
  /** Coverage summary (health of the maleta) */
  coverage: VendorCoverageSummary;
  /** Data freshness */
  freshness: VendorDataFreshness;
  /** Operational state */
  operationalState: VendorOperationalState;
  /** When this profile was assembled */
  assembledAt: string;
}

// ── Phase 2: Vendor Location Binding ────────────────────────────────────────

/** Explicit binding between a vendor and their inventory location. */
export interface VendorLocationBinding {
  /** Location code (e.g., "35") */
  locationCode: string;
  /** Location name (e.g., "VEND ORLANDO") */
  locationName: string;
  /** Resolved InventoryLocation (null if location not found in catalog) */
  location: InventoryLocation | null;
  /** Whether this binding is confirmed */
  confirmed: boolean;
  /** Evidence for this binding */
  evidence: VendorEvidence[];
}

// ── Phase 3: Vendor Portfolio Snapshot ───────────────────────────────────────

/** Snapshot of a vendor's current maleta contents and availability. */
export interface VendorPortfolioSnapshot {
  vendorId: string;
  vendorName: string;
  locationCode: string;
  locationName: string;
  /** Total distinct references in portfolio */
  totalReferences: number;
  /** Total units across all references */
  totalUnits: number;
  /** Individual reference items */
  items: VendorInventoryItem[];
  /** Last TM transfer date to this vendor */
  lastTransferAt: string | null;
  /** Last TM transfer document number */
  lastTransferDocument: string | null;
  /** Data freshness */
  freshness: VendorDataFreshness;
  /** How confident we are in this snapshot */
  confidence: VendorConfidenceLevel;
}

/** A single reference within a vendor's portfolio. */
export interface VendorInventoryItem {
  referenceCode: string;
  description: string | null;
  subGrupo: string | null;
  subLinea: string | null;
  size: string | null;
  color: string | null;
  /** Quantity in vendor's portfolio location */
  quantityInPortfolio: number;
  /** Quantity available in main warehouse (Bodega 01) */
  quantityAvailableInMainWarehouse: number | null;
  /** Availability status based on main warehouse stock */
  commercialAvailabilityStatus: VendorItemAvailabilityStatus;
  /** Whether this reference requires replacement per CEO rules */
  replacementRequired: boolean;
  /** Evidence for the status determination */
  evidence: VendorEvidence[];
}

export type VendorItemAvailabilityStatus =
  | "available"          // Main warehouse has stock above threshold
  | "low_stock"          // Main warehouse stock below threshold but > 0
  | "out_of_stock"       // Main warehouse has zero stock
  | "unknown";           // No data available

// ── Phase 4: TM Transfer History ────────────────────────────────────────────

/** Summary of TM transfer history for a vendor. */
export interface VendorTransferHistory {
  vendorId: string;
  locationCode: string;
  /** Total TM transfers to this vendor */
  totalInboundTransfers: number;
  /** Total TM transfers from this vendor (returns) */
  totalOutboundTransfers: number;
  /** Total units received via TM */
  totalUnitsReceived: number;
  /** Total units returned via TM */
  totalUnitsReturned: number;
  /** Recent transfer records */
  recentTransfers: VendorTransferRecord[];
  /** Last inbound transfer date */
  lastInboundAt: string | null;
  /** Last outbound transfer date */
  lastOutboundAt: string | null;
}

/** A single transfer record related to a vendor's location. */
export interface VendorTransferRecord {
  /** InventoryTransfer ID */
  transferId: string;
  /** Document number */
  documentNumber: string;
  /** Direction relative to vendor */
  direction: "inbound" | "outbound";
  /** Transfer type (TM or TR) */
  transferType: "TM" | "TR";
  /** Origin location code */
  originCode: string;
  /** Destination location code */
  destinationCode: string;
  /** Business date */
  documentDate: string;
  /** Total quantity in this transfer */
  totalQuantity: number;
  /** Number of lines */
  lineCount: number;
  /** Whether the transfer is closed */
  isClosed: boolean;
}

// ── Phase 5: Portfolio Replacement Intelligence ─────────────────────────────

/** Replacement analysis result for a single vendor. */
export interface VendorReplacementAnalysis {
  vendorId: string;
  vendorName: string;
  locationCode: string;
  /** Items requiring replacement per CEO rules */
  itemsRequiringReplacement: VendorReplacementCandidate[];
  /** Total items analyzed */
  totalAnalyzed: number;
  /** Applied replacement rules */
  rulesApplied: MaletaReplacementRule[];
  /** When this analysis was computed */
  computedAt: string;
}

/** A reference in a vendor's portfolio that needs replacement. */
export interface VendorReplacementCandidate {
  /** Reference currently in portfolio */
  referenceCode: string;
  description: string | null;
  /** Current stock in Bodega 01 */
  existenciaBodega01: number;
  /** Commercial line */
  subLinea: string;
  /** Product type */
  subGrupo: string;
  /** Why replacement is needed */
  motivo: string;
  /** Urgency level */
  urgency: VendorReplacementUrgency;
  /** Replacement candidates from same SubGrupo (if available) */
  replacementCandidates: ReplacementOption[];
}

/** A potential replacement reference from the same SubGrupo. */
export interface ReplacementOption {
  referenceCode: string;
  description: string | null;
  subGrupo: string;
  subLinea: string;
  existenciaBodega01: number;
  /** Why this is a good replacement */
  reason: string;
}

export type VendorReplacementUrgency =
  | "critical"    // Zero stock in Bodega 01
  | "high"        // Stock well below threshold
  | "medium"      // Stock at or near threshold
  | "low";        // Stock slightly below threshold

// ── Phase 6: Vendor Coverage Summary ────────────────────────────────────────

/** Aggregate health summary of a vendor's portfolio. */
export interface VendorCoverageSummary {
  /** Total references in portfolio */
  totalReferences: number;
  /** References with stock below threshold */
  criticalReferences: number;
  /** References with zero stock in Bodega 01 */
  outOfStockReferences: number;
  /** References requiring replacement per CEO rules */
  replacementRequiredReferences: number;
  /** References with unknown availability */
  unknownReferences: number;
  /** Last replenishment (TM inbound transfer) date */
  lastReplenishmentAt: string | null;
  /** Days since last replenishment */
  daysSinceLastReplenishment: number | null;
  /** Overall portfolio health */
  health: VendorPortfolioHealth;
}

export type VendorPortfolioHealth =
  | "healthy"          // No critical references
  | "attention_needed" // Some critical references but manageable
  | "critical"         // Many critical references or long time since replenishment
  | "unknown";         // Insufficient data

// ── Supporting Types ────────────────────────────────────────────────────────

export type VendorOperationalState =
  | "active"           // Vendor is active and portfolio is monitored
  | "inactive"         // Vendor exists but is not currently active
  | "stale"            // Vendor active but data is outdated
  | "unsynced"         // Vendor exists but no logistics data
  | "unknown";

export interface VendorDataFreshness {
  /** When portfolio data was last updated */
  portfolioLastUpdated: string | null;
  /** When transfer history was last updated */
  transfersLastUpdated: string | null;
  /** When availability data was last updated */
  availabilityLastUpdated: string | null;
  /** Overall freshness assessment */
  overall: "fresh" | "stale" | "unknown";
}

export type VendorConfidenceLevel = "high" | "medium" | "low" | "unknown";

export interface VendorEvidence {
  type: VendorEvidenceType;
  description: string;
  source: string;
}

export type VendorEvidenceType =
  | "LOCATION_CATALOG"   // From InventoryLocation catalog
  | "TRANSFER_DATA"      // From InventoryTransfer records
  | "INVENTORY_DATA"     // From ProductInventoryLevel
  | "AVAILABILITY_DATA"  // From CommercialAvailabilityReport
  | "SELLER_REGISTRY"    // From CASTILLITOS_SELLER_WAREHOUSES
  | "MANUAL";            // Configured by operator

// ── Phase 7: Business Entity Snapshot Adapter ───────────────────────────────

/** Adapter output — maps LiveVendorProfile to business entity shape. */
export interface VendorBusinessEntitySnapshot {
  entityType: "vendor";
  entityId: string;
  entityName: string;
  health: VendorPortfolioHealth;
  operationalState: VendorOperationalState;
  metrics: VendorBusinessMetrics;
  alerts: VendorBusinessAlert[];
  recommendations: VendorBusinessRecommendation[];
  relations: VendorBusinessRelation[];
  assembledAt: string;
}

export interface VendorBusinessMetrics {
  totalReferences: number;
  totalUnits: number;
  criticalReferences: number;
  outOfStockReferences: number;
  daysSinceLastReplenishment: number | null;
  inboundTransfers30d: number;
}

export interface VendorBusinessAlert {
  type: VendorBusinessSignalType;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  referenceCode: string | null;
}

export interface VendorBusinessRecommendation {
  type: string;
  description: string;
  priority: number;
  suggestedOnly: true;
}

// ── Phase 8: Knowledge Graph Relations ──────────────────────────────────────

export interface VendorKnowledgeRelation {
  fromType: "Vendor" | "InventoryLocation" | "Product" | "Transfer";
  fromId: string;
  toType: "Vendor" | "InventoryLocation" | "Product" | "Transfer";
  toId: string;
  relationType: VendorKnowledgeRelationType;
}

export type VendorKnowledgeRelationType =
  | "assigned_to_location"     // Vendor → InventoryLocation
  | "carries_product"          // Vendor → Product
  | "received_transfer"        // Vendor → Transfer
  | "returned_transfer"        // Vendor → Transfer
  | "location_of_vendor"       // InventoryLocation → Vendor
  | "carried_by_vendor";       // Product → Vendor

// ── Phase 9: Business Signals ───────────────────────────────────────────────

export type VendorBusinessSignalType =
  | "VENDOR_PORTFOLIO_STALE"
  | "VENDOR_REFERENCE_OUT_OF_STOCK"
  | "VENDOR_REPLACEMENT_REQUIRED"
  | "VENDOR_REPLENISHMENT_NEEDED"
  | "VENDOR_TRANSFER_RECEIVED"
  | "VENDOR_TRANSFER_RETURNED";

export type VendorBusinessRelation = VendorKnowledgeRelation;
