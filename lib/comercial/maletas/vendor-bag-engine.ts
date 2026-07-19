/**
 * lib/comercial/maletas/vendor-bag-engine.ts
 *
 * Vendor Bag Engine — functional portfolio logic for Block 1.
 *
 * Computes:
 *   - availableToAssign per reference (warehouse minus already assigned to OTHER active bags)
 *   - item status from business rules
 *   - transfer suggestions (idle stock → depleted vendor, before production)
 *   - production suggestions (multi-vendor depletion signal)
 *   - bag-level pressure summary
 *
 * Does NOT modify: Prisma schema, SAG adapter, case-status-engine, live-bag-engine.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-FUNCTIONAL-PORTFOLIO-01
 */

import type { SagInventoryItem }       from "./sag-inventory-adapter";
import type {
  VendorCommercialBag,
  VendorBagItem,
  VendorBagTransferSuggestion,
  ProductionSuggestionFromBags,
  VendorBagItemStatus,
} from "./vendor-bag-types";

// ─── Available-to-assign computation ────────────────────────────────────────────

/**
 * How many units of a reference are still available to assign to a new/updated bag.
 * Subtracts units already committed in OTHER active bags (same reference).
 *
 * @param reference   SAG reference code (UPPERCASE)
 * @param excludeBagId  The bag being edited — its items are excluded from "already assigned"
 * @param activeBags  All active VendorCommercialBag records
 * @param activeBagItems  All VendorBagItem records for active bags
 * @param sagInventory  Current SAG snapshot
 */
export function computeAvailableToAssign(
  reference:      string,
  excludeBagId:   string | null,
  activeBags:     VendorCommercialBag[],
  activeBagItems: VendorBagItem[],
  sagInventory:   SagInventoryItem[],
): number {
  const inv = sagInventory.find(i => i.reference.toUpperCase() === reference.toUpperCase());
  if (!inv) return 0;

  const activeBagIds = new Set(
    activeBags
      .filter(b => b.status === "activa" && b.id !== excludeBagId)
      .map(b => b.id),
  );

  const alreadyAssigned = activeBagItems
    .filter(i => activeBagIds.has(i.bagId) && i.reference.toUpperCase() === reference.toUpperCase())
    .reduce((sum, i) => sum + i.assignedQty, 0);

  return Math.max(0, inv.availableForCases - alreadyAssigned);
}

// ─── Item status derivation ──────────────────────────────────────────────────────

/**
 * Derive VendorBagItemStatus from item fields.
 *
 * Priority:
 *   excede_inventario > agotado > bajo_minimo > pausado > ok
 */
export function computeBagItemStatus(
  item: Pick<VendorBagItem, "assignedQty" | "soldQty" | "availableToSellQty" | "minQty" | "inventoryAvailableAtAssign" | "status">,
): VendorBagItemStatus {
  if (item.status === "pausado") return "pausado";
  if (item.assignedQty > item.inventoryAvailableAtAssign) return "excede_inventario";
  if (item.availableToSellQty === 0) return "agotado";
  if (item.minQty > 0 && item.availableToSellQty <= item.minQty) return "bajo_minimo";
  return "ok";
}

// ─── Transfer suggestion engine ──────────────────────────────────────────────────

/**
 * Suggest internal stock transfers from idle vendors to depleted ones.
 *
 * A transfer is suggested when:
 *   - Vendor A has availableToSellQty > 1.5 × minQty for a reference (idle stock)
 *   - Vendor B has availableToSellQty <= minQty (depleted or below minimum)
 *   - Both bags are "activa"
 *
 * Decision order (per sprint spec):
 *   1. Reasignar desde otra maleta si hay stock quieto.
 *   2. Si no hay stock interno suficiente → sugerir producción.
 *
 * @param bags        All VendorCommercialBag records (active)
 * @param items       All VendorBagItem records (from active bags)
 * @param salesRepNames  Map of salesRepId → display name
 */
export function computeTransferSuggestions(
  bags:          VendorCommercialBag[],
  items:         VendorBagItem[],
  salesRepNames: Record<string, string>,
): VendorBagTransferSuggestion[] {
  const activeBagIds = new Set(
    bags.filter(b => b.status === "activa").map(b => b.id),
  );
  const activeItems = items.filter(i => activeBagIds.has(i.bagId));

  // Group items by reference
  const byRef = new Map<string, VendorBagItem[]>();
  for (const item of activeItems) {
    const key = item.reference.toUpperCase();
    if (!byRef.has(key)) byRef.set(key, []);
    byRef.get(key)!.push(item);
  }

  const suggestions: VendorBagTransferSuggestion[] = [];

  for (const [, refItems] of byRef) {
    const idle     = refItems.filter(i => i.minQty > 0 && i.availableToSellQty > i.minQty * 1.5);
    const depleted = refItems.filter(i => i.minQty > 0 && i.availableToSellQty <= i.minQty);

    for (const dest of depleted) {
      for (const src of idle) {
        if (src.bagId === dest.bagId) continue;

        const srcBag  = bags.find(b => b.id === src.bagId);
        const destBag = bags.find(b => b.id === dest.bagId);
        if (!srcBag || !destBag) continue;

        // How many units can be transferred without pushing src below minQty
        const transferable = src.availableToSellQty - src.minQty;
        const needed       = dest.minQty - dest.availableToSellQty;
        const qty          = Math.min(transferable, Math.max(needed, 1));
        if (qty <= 0) continue;

        const urgency: "alta" | "media" | "baja" =
          dest.availableToSellQty === 0 ? "alta"
          : dest.availableToSellQty < dest.minQty * 0.5 ? "media"
          : "baja";

        // Confidence: how idle is the source (higher = more confident)
        const idleRatio  = src.minQty > 0 ? src.availableToSellQty / src.minQty : 1;
        const confidence = Math.min(1, Math.round((idleRatio - 1) * 50) / 100 + 0.5);

        suggestions.push({
          reference:        src.reference,
          description:      src.description,
          fromSalesRepId:   srcBag.salesRepId,
          fromSalesRepName: salesRepNames[srcBag.salesRepId] ?? srcBag.salesRepId,
          toSalesRepId:     destBag.salesRepId,
          toSalesRepName:   salesRepNames[destBag.salesRepId] ?? destBag.salesRepId,
          qtySuggested:     qty,
          reason:           `${salesRepNames[srcBag.salesRepId] ?? srcBag.salesRepId} tiene stock quieto — reasignar antes de producir`,
          urgency,
          confidence,
          status:           "pendiente",
        });
      }
    }
  }

  // Sort: alta → media → baja, then by confidence desc
  const urgencyOrder = { alta: 0, media: 1, baja: 2 };
  return suggestions.sort(
    (a, b) =>
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
      b.confidence - a.confidence,
  );
}

// ─── Production suggestion engine ───────────────────────────────────────────────

/**
 * Suggest production when multiple vendors are running low on the same reference
 * and there is insufficient idle stock to cover via transfers.
 *
 * Triggered when 2+ active bags have availableToSellQty <= minQty for the same ref.
 */
export function computeProductionSuggestions(
  bags:  VendorCommercialBag[],
  items: VendorBagItem[],
): ProductionSuggestionFromBags[] {
  const activeBagIds = new Set(bags.filter(b => b.status === "activa").map(b => b.id));
  const activeItems  = items.filter(i => activeBagIds.has(i.bagId));

  // Group by reference
  const byRef = new Map<string, VendorBagItem[]>();
  for (const item of activeItems) {
    const key = item.reference.toUpperCase();
    if (!byRef.has(key)) byRef.set(key, []);
    byRef.get(key)!.push(item);
  }

  const suggestions: ProductionSuggestionFromBags[] = [];

  for (const [, refItems] of byRef) {
    const lowItems = refItems.filter(
      i => i.minQty > 0 && i.availableToSellQty <= i.minQty,
    );

    // Only suggest production when 2+ vendors are low
    if (lowItems.length < 2) continue;

    const totalDemand = lowItems.reduce(
      (sum, i) => sum + Math.max(0, i.idealQty - i.availableToSellQty),
      0,
    );

    // Sold velocity heuristic: if multiple vendors depleted → alta
    const depletedCount = lowItems.filter(i => i.availableToSellQty === 0).length;
    const soldVelocity: "alta" | "media" | "baja" =
      depletedCount >= 2 ? "alta"
      : depletedCount === 1 ? "media"
      : "baja";

    const affectedBagIds     = [...new Set(lowItems.map(i => i.bagId))];
    const affectedSalesRepIds = affectedBagIds
      .map(bid => bags.find(b => b.id === bid)?.salesRepId)
      .filter((id): id is string => Boolean(id));
    const affectedSalesRepNames = affectedBagIds
      .map(bid => {
        const bag = bags.find(b => b.id === bid);
        return bag ? bag.salesRepId : null;  // name resolved by caller via salesRepNames map
      })
      .filter((n): n is string => Boolean(n));

    const urgency: "alta" | "media" | "baja" =
      soldVelocity === "alta" ? "alta"
      : soldVelocity === "media" ? "media"
      : "baja";

    const firstItem = lowItems[0];
    suggestions.push({
      reference:              firstItem.reference,
      description:            firstItem.description,
      totalDemandQty:         totalDemand,
      soldVelocity,
      affectedSalesRepIds,
      affectedSalesRepNames,
      suggestedProductionQty: Math.max(totalDemand, firstItem.idealQty),
      reason:                 `${lowItems.length} vendedores bajo mínimo — stock insuficiente para reasignación interna`,
      urgency,
      source:                 "bag_pressure",
    });
  }

  const urgencyOrder = { alta: 0, media: 1, baja: 2 };
  return suggestions.sort(
    (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency],
  );
}

// ─── Bag pressure summary ────────────────────────────────────────────────────────

export interface BagPressureSummary {
  bagId:                  string;
  totalItems:             number;
  okItems:                number;
  lowItems:               number;   // bajo_minimo
  depletedItems:          number;   // agotado
  errorItems:             number;   // excede_inventario
  pressureScore:          number;   // 0–100
  suggestedProductionQty: number;
}

/**
 * Aggregate pressure for a single bag.
 * pressureScore = (depleted × 2 + low × 1) / (total × 2) × 100
 */
export function computeBagPressure(
  bag:   VendorCommercialBag,
  items: VendorBagItem[],
): BagPressureSummary {
  const bagItems = items.filter(i => i.bagId === bag.id);
  if (bagItems.length === 0) {
    return { bagId: bag.id, totalItems: 0, okItems: 0, lowItems: 0, depletedItems: 0, errorItems: 0, pressureScore: 0, suggestedProductionQty: 0 };
  }

  const depleted = bagItems.filter(i => i.status === "agotado").length;
  const low      = bagItems.filter(i => i.status === "bajo_minimo").length;
  const errors   = bagItems.filter(i => i.status === "excede_inventario").length;
  const ok       = bagItems.length - depleted - low - errors;

  const pressureScore = bagItems.length > 0
    ? Math.round((depleted * 2 + low * 1) / (bagItems.length * 2) * 100)
    : 0;

  const suggestedProductionQty = bagItems
    .filter(i => i.status === "agotado" || i.status === "bajo_minimo")
    .reduce((sum, i) => sum + Math.max(0, i.idealQty - i.availableToSellQty), 0);

  return {
    bagId:                  bag.id,
    totalItems:             bagItems.length,
    okItems:                ok,
    lowItems:               low,
    depletedItems:          depleted,
    errorItems:             errors,
    pressureScore,
    suggestedProductionQty,
  };
}
