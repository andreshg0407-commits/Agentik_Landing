/**
 * lib/comercial/maletas/vendor-bag-types.ts
 *
 * Vendor Commercial Bag — domain model for the functional portfolio constructor.
 *
 * A VendorCommercialBag represents real inventory assigned to a sales rep for
 * a season. Units are consumed as orders come in. When a reference falls below
 * its minimum, operational pressure is generated.
 *
 * Flow:
 *   inventario disponible
 *   → asignar unidades a vendedor (VendorBagItem.assignedQty)
 *   → vendedor vende / pedido entra (soldQty ++)
 *   → availableToSellQty = assignedQty - soldQty
 *   → si availableToSellQty <= minQty → presión operacional
 *   → si availableToSellQty = 0 → agotado para vendedor
 *
 * V1: local state — no Prisma persistence yet.
 * V2: Prisma VendorCommercialBag + VendorBagItem models (persisted).
 *
 * Terminology note (AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01):
 *   VendorBag names remain as the DB compatibility layer for the Castillitos-era migration.
 *   New Agentik domain code should prefer SalesPortfolio terminology.
 *   Generic aliases are exported at the bottom of this file and re-exported from
 *   lib/comercial/sales-portfolio/sales-portfolio-types.ts.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-FUNCTIONAL-PORTFOLIO-01
 */

// ─── Status enumerations ────────────────────────────────────────────────────────

export type VendorBagStatus =
  | "borrador"    // being configured — inventory not yet committed
  | "activa"      // live — units committed from warehouse
  | "pausada"     // temporarily suspended
  | "archivada";  // closed season

export type VendorBagItemStatus =
  | "ok"                  // availableToSellQty > minQty
  | "bajo_minimo"         // 0 < availableToSellQty <= minQty → generates pressure
  | "agotado"             // availableToSellQty === 0 → vendor cannot sell this ref
  | "pausado"             // manually paused by coordinator
  | "excede_inventario";  // assignedQty > inventoryAvailableAtAssign (validation error)

// ─── Core entities ──────────────────────────────────────────────────────────────

/**
 * A commercial bag for one sales rep in one season.
 * Represents real inventory committed for that person to sell.
 */
export interface VendorCommercialBag {
  id:         string;
  orgId:      string;
  salesRepId: string;
  season:     string;
  startDate:  string | null;
  endDate:    string | null;
  status:     VendorBagStatus;
  createdAt:  string;
  updatedAt:  string;
}

/**
 * A single reference within a vendor's commercial bag.
 *
 * Key invariants:
 *   availableToSellQty = assignedQty - soldQty
 *   assignedQty        ≤ inventoryAvailableAtAssign (enforced at assignment time)
 *
 * V2: soldQty updated by order ingestion hook.
 * V1: soldQty = 0 (no order integration yet).
 */
export interface VendorBagItem {
  id:                        string;
  bagId:                     string;
  reference:                 string;
  description:               string;
  line:                      string;    // "LT" | "CS"
  category:                  string;
  productType:               string;
  /** Units committed from warehouse for this vendor/season */
  assignedQty:               number;
  /** Units sold / consumed via orders — V2 integration point */
  soldQty:                   number;
  /** assignedQty - soldQty */
  availableToSellQty:        number;
  /** Minimum qty below which pressure is generated */
  minQty:                    number;
  /** Ideal qty (from rule or manual target) */
  idealQty:                  number;
  /** Snapshot of warehouse available when item was assigned */
  inventoryAvailableAtAssign: number;
  status:                    VendorBagItemStatus;
  /** 1 = highest priority within the bag */
  priority:                  number;
}

// ─── Transfer suggestion ────────────────────────────────────────────────────────

/**
 * A David-driven suggestion to move stock from a vendor with idle inventory
 * to one who is running low — before triggering production.
 *
 * Decision order:
 *   1. Reasignar desde otra maleta si hay stock quieto.
 *   2. Si no hay stock interno suficiente → sugerir producción.
 *   3. Si todos venden rápido → escalar a producción.
 *   4. Si referencia no se mueve → sugerir pausa/reemplazo.
 */
export interface VendorBagTransferSuggestion {
  reference:          string;
  description:        string;
  fromSalesRepId:     string;
  fromSalesRepName:   string;
  toSalesRepId:       string;
  toSalesRepName:     string;
  qtySuggested:       number;
  reason:             string;
  urgency:            "alta" | "media" | "baja";
  /** 0–1: confidence in this suggestion */
  confidence:         number;
  status:             "pendiente" | "aceptada" | "rechazada";
}

// ─── Production suggestion from bag pressure ────────────────────────────────────

/**
 * When multiple vendors are running low on the same reference,
 * David should suggest production — not just transfer.
 *
 * Future integration: converts into an ActionTask approved via Approval Center.
 */
export interface ProductionSuggestionFromBags {
  reference:              string;
  description:            string;
  totalDemandQty:         number;
  /** Simplified velocity: "alta" | "media" | "baja" */
  soldVelocity:           "alta" | "media" | "baja";
  affectedSalesRepIds:    string[];
  affectedSalesRepNames:  string[];
  suggestedProductionQty: number;
  reason:                 string;
  urgency:                "alta" | "media" | "baja";
  /** Always "bag_pressure" — distinguishes from rule-only suggestions */
  source:                 "bag_pressure";
}

// ─── Draft builder item (UI only — not persisted) ──────────────────────────────

/**
 * Represents a reference being configured inside the BagPortfolioBuilder UI.
 * Converted to VendorBagItem when the bag is saved/activated.
 */
export interface DraftBagItem {
  reference:          string;
  description:        string;
  line:               string;
  category:           string;
  productType:        string;
  /** Current warehouse available (from SAG inventory) */
  inventoryAvailable: number;
  /** inventory available minus already assigned to OTHER active bags */
  availableToAssign:  number;
  /** User-configured assignment quantity */
  assignedQty:        number;
  minQty:             number;
  idealQty:           number;
  /** Validation state for the current assignedQty */
  status:             VendorBagItemStatus;
}

// ─── Maleta Selection (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ─
//     (COMERCIAL-MALETAS-DOMAIN-NORMALIZATION-01)
//
// Minimal operational contract — stores ONLY the FK to InventoryItem + assignment data.
// InventoryItem is the single source of truth for ALL product data:
//   reference, description, line, grupo, subgrupo, sizes, colors, prices, availability.
// This contract NEVER duplicates master data.
// Display always resolves at render time from InventoryItem.
// Designed for downstream conversion to Pedido (same InventoryItem, different operational state).

/** Status of a maleta selection (matches Phase 9 lifecycle). */
export type MaletaSelectionStatus =
  | "draft"         // Editable — not yet validated
  | "active"        // Validated against inventory — available for vendor
  | "expired"       // Vigencia terminada — read-only
  | "deactivated";  // Cerrada manualmente — read-only

/**
 * A single reference selected for inclusion in a maleta.
 *
 * Stores ONLY the FK to InventoryItem and assignment-specific operational data.
 * Does NOT store: reference code, description, line, grupo, subgrupo, sizes,
 * colors, prices, availability, photos, or any other master data.
 * All of that belongs exclusively to InventoryItem.
 *
 * When rendering, resolve master data via InventoryItem using inventoryItemId.
 * When reopening a saved maleta, rebuild display from current InventoryItem state.
 */
export interface MaletaSelectionItem {
  /** FK to InventoryItem (= InventoryItem.reference). */
  inventoryItemId: string;
  /** Optional variant FK (when selecting specific talla/color). */
  variantId?: string | null;
  /** Quantity assigned by coordinator. */
  assignedQty: number;
  /** When this item was added to the selection (audit trail). */
  snapshotAt: string;
}

/**
 * Complete maleta selection — ready for downstream conversion to Pedido.
 *
 * Contains enough context for Pedidos to:
 *   - create header (salesRepId, season, dates)
 *   - create lines (resolve via InventoryItem using inventoryItemId)
 *   - validate stock (from current InventoryItem.disponibleReal, NOT a cached snapshot)
 *   - assign prices (from InventoryItem or SAG at assignment time, NOT stored here)
 *
 * Pedidos will consume exactly this contract + InventoryItem.
 * Pedidos will NOT create a new product model — it will add its own operational state
 * (order status, invoice, dispatch) on top of the same InventoryItem.
 */
export interface MaletaSelection {
  /** Sales rep / vendor this maleta is for. */
  salesRepId: string;
  /** Season identifier (e.g. "2026-Q3"). */
  season: string;
  /** Validity start. */
  startDate: string | null;
  /** Validity end. */
  endDate: string | null;
  /** Lifecycle state. */
  status: MaletaSelectionStatus;
  /** Selected items — minimal FKs to InventoryItem. */
  items: MaletaSelectionItem[];
  /** When the selection was created. */
  createdAt: string;
}

// ─── Generic domain aliases ──────────────────────────────────────────────────
//
// VendorBag* names stay as the DB/API compatibility layer.
// New Agentik domain code should import these aliases instead.
// They are re-exported from lib/comercial/sales-portfolio/sales-portfolio-types.ts.

/** Generic alias: a commercial portfolio assigned to one sales rep for one season. */
export type SalesPortfolio                  = VendorCommercialBag;
/** Generic alias: one product/reference line within a sales portfolio. */
export type SalesPortfolioItem              = VendorBagItem;
/** Generic alias: audit record of an order deduction from a portfolio item. */
export type SalesPortfolioOrderLine         = { reference: string; qtySold: number; soldAt: string };
/** Generic alias: suggestion to move stock from an idle portfolio to a depleted one. */
export type SalesPortfolioTransferSuggestion = VendorBagTransferSuggestion;
/** Generic alias: multi-vendor production demand signal from portfolio pressure. */
export type ProductionSuggestionFromPortfolio = ProductionSuggestionFromBags;
