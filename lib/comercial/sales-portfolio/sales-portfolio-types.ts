/**
 * lib/comercial/sales-portfolio/sales-portfolio-types.ts
 *
 * Generic Sales Portfolio domain types.
 *
 * Imports the canonical aliases from the Castillitos-era VendorBag layer.
 * New Agentik modules targeting multiple tenants should import from here,
 * not from lib/comercial/maletas/vendor-bag-types directly.
 *
 * Terminology:
 *   Sales Portfolio = portafolio comercial asignado a un vendedor.
 *   One portfolio → one sales rep → one season → N product references.
 *   References are consumed as orders arrive. Pressure is generated below minimums.
 *
 * ─── OPERATIONAL CONTRACT (AGENTIK-SAG-OPERATIONAL-CONTRACT-01) ────────────
 * Sales Portfolio consumes:
 *   - Operational Inventory (lib/operational-inventory/)
 *     NOT SAG disponible directly.
 *
 * Sales Portfolio DOES NOT:
 *   - Read SAG views directly
 *   - Compute fiscal availability from SAG
 *   - Issue documents to SAG
 *
 * Production suggestions:
 *   - Generated from Agentik's operational pressure engine
 *   - Not from SAG kardex
 *
 * Transfer suggestions:
 *   - Pure Agentik operational intelligence
 *   - Recommend internal stock reallocation before external production
 *
 * Inventory formula (owned by Agentik):
 *   operationalAvailableQty =
 *       physicalQty (from SAG snapshot)
 *     - salesAssignedQty (from this layer)
 *     - reservedQty (from order reservations)
 *     - pendingTransfersQty (from transfer engine)
 *
 * Sprint: AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01
 * ───────────────────────────────────────────────────────────────────────────
 */

export type {
  SalesPortfolio,
  SalesPortfolioItem,
  SalesPortfolioOrderLine,
  SalesPortfolioTransferSuggestion,
  ProductionSuggestionFromPortfolio,
  // Status types
  VendorBagStatus          as SalesPortfolioStatus,
  VendorBagItemStatus      as SalesPortfolioItemStatus,
  // Draft builder (UI only)
  DraftBagItem             as DraftPortfolioItem,
} from "@/lib/comercial/maletas/vendor-bag-types";
