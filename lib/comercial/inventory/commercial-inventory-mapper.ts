/**
 * lib/comercial/inventory/commercial-inventory-mapper.ts
 *
 * Maps OperationalInventoryItem to shapes used in the Commercial module UI.
 *
 * This is NOT a reverse-SAG mapper (that lives in sag-to-operational-mapper.ts).
 * This is a presentation-layer transformation — shapes the operational data
 * for Commercial-specific UI needs.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-BRIDGE-01
 */

import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";

// ─── Search result shape ──────────────────────────────────────────────────────

/**
 * Shape used in reference search within Sales Portfolio builder.
 * Uses operationalAvailableQty — never SAG's availableForCases.
 */
export interface CommercialInventorySearchResult {
  reference:               string;
  description:             string;
  line:                    string;
  category:                string;
  productType:             string;
  /** Agentik's operational availability — use this for assignment decisions */
  operationalAvailableQty: number;
  /** SAG physical qty — informational only */
  physicalQty:             number;
  /** SAG pending orders — informational only */
  sagPendingOrdersQty:     number;
}

/**
 * Searches operational inventory by reference code or description.
 * Returns up to 6 results matching the query (min 2 chars).
 */
export function searchOperationalInventory(
  items: OperationalInventoryItem[],
  query: string,
): CommercialInventorySearchResult[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  return items
    .filter(i =>
      i.reference.toUpperCase().includes(q) ||
      i.description.toUpperCase().includes(q),
    )
    .slice(0, 6)
    .map(i => ({
      reference:               i.reference,
      description:             i.description,
      line:                    i.line,
      category:                i.category,
      productType:             i.productType,
      operationalAvailableQty: i.operationalAvailableQty,
      physicalQty:             i.physicalQty,
      sagPendingOrdersQty:     i.sagPendingOrdersQty,
    }));
}

// ─── Available-to-assign computation ─────────────────────────────────────────

/**
 * How many units of a reference are available for assignment to a new bag.
 *
 * Uses operationalAvailableQty as the ceiling, then subtracts units already
 * committed in other active bags (Agentik's own assignment layer).
 *
 * @param reference       Reference code (case-insensitive)
 * @param excludeBagId    Bag being edited — its items are NOT subtracted
 * @param inventory       Full operational inventory snapshot
 * @param activeBagItems  All items from active bags
 * @param activeBagIds    IDs of currently active bags
 */
export function computeOperationalAvailableToAssign(
  reference:    string,
  excludeBagId: string | null,
  inventory:    OperationalInventoryItem[],
  activeBagItems: Array<{ bagId: string; reference: string; assignedQty: number }>,
  activeBagIds:   Set<string>,
): number {
  const refUpper = reference.toUpperCase();
  const inv = inventory.find(i => i.reference.toUpperCase() === refUpper);
  if (!inv) return 0;

  const alreadyAssigned = activeBagItems
    .filter(i =>
      activeBagIds.has(i.bagId) &&
      i.bagId !== (excludeBagId ?? "__none__") &&
      i.reference.toUpperCase() === refUpper,
    )
    .reduce((sum, i) => sum + i.assignedQty, 0);

  return Math.max(0, inv.operationalAvailableQty - alreadyAssigned);
}
