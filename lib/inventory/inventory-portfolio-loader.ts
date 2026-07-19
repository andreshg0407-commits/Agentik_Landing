/**
 * lib/inventory/inventory-portfolio-loader.ts
 *
 * Returns active canonical inventory filtered for sales portfolio eligibility.
 *
 * Maletas, Pedidos, and other commercial consumers call this function
 * to get the complete, enriched InventoryItem[] ready for selection.
 *
 * This module does NOT call SAG SOAP.
 * Prices (PV3/PV4) are available on-demand via loadProductDetail() in the drawer.
 *
 * Sprint: COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01
 *
 * server-only — uses buildInventoryControlSnapshot (Prisma).
 */

import "server-only";

import { buildInventoryControlSnapshot } from "./inventory-control-service";
import { isEligibleForSalesPortfolio } from "./inventory-control-types";
import type { InventoryItem, InventoryDataQuality } from "./inventory-control-types";

export interface SalesPortfolioInventory {
  /** Only items eligible for sales portfolio (ACTIVE + resolved line + available > 0). */
  items: InventoryItem[];
  /** Data quality from the underlying inventory snapshot. */
  dataQuality: InventoryDataQuality;
  /** When the snapshot was computed. */
  computedAt: string;
  /** Total items before eligibility filter (for diagnostics). */
  totalBeforeFilter: number;
}

/**
 * Returns all inventory items eligible for inclusion in a sales portfolio.
 *
 * Filters:
 *   - inventoryVisibility === "ACTIVE"
 *   - disponibleReal > 0
 *   - canonicalLine !== "SIN_CLASIFICAR"
 *
 * Does NOT include: OUT_OF_STOCK, NO_DATA, SIN_CLASIFICAR.
 */
export async function getActiveInventoryForSalesPortfolio(
  organizationId: string,
  orgSlug: string,
): Promise<SalesPortfolioInventory> {
  const snapshot = await buildInventoryControlSnapshot(organizationId, orgSlug);

  const eligible = snapshot.items.filter(isEligibleForSalesPortfolio);

  return {
    items: eligible,
    dataQuality: snapshot.dataQuality,
    computedAt: snapshot.computedAt,
    totalBeforeFilter: snapshot.items.length,
  };
}
