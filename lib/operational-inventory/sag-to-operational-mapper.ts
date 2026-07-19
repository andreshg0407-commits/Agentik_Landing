/**
 * lib/operational-inventory/sag-to-operational-mapper.ts
 *
 * Maps SagInventoryItem[] → OperationalInventoryItem[].
 *
 * ─── V1 MAPPING NOTES ───────────────────────────────────────────────────────
 * In V1 (sag_excel_import), all physical and reservation data comes from SAG.
 * Agentik's own reservation/assignment layer is not yet wired to this boundary.
 *
 * V1 derivation:
 *   physicalQty             = initialWarehouseQty  (bodega total)
 *   sagReportedAvailableQty = availableForCases     (SAG disponible — informational)
 *   sagPendingOrdersQty     = pendingPDQty          (SAG PD reservas — informational)
 *   reservedQty             = sagItem.reservedQty   (SAG PD reservations used as proxy)
 *   salesAssignedQty        = 0  (V2+: loaded from VendorBagItem DB)
 *   pendingTransfersQty     = 0  (V2+: from transfer engine)
 *   operationalAvailableQty = physicalQty - reservedQty = availableForCases
 *
 * V2 will replace reservedQty with Agentik's own operational reservations.
 *
 * Also provides mapOperationalToSagItem() for legacy engines that still consume
 * SagInventoryItem[]. This is a thin read-only bridge — not a real integration.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-BRIDGE-01
 */

import type { SagInventoryItem } from "@/lib/comercial/maletas/sag-inventory-adapter";
import type {
  OperationalInventoryItem,
  OperationalInventorySource,
} from "./operational-inventory-types";

// ─── SAG → Operational ───────────────────────────────────────────────────────

/**
 * Maps a single SagInventoryItem to an OperationalInventoryItem.
 * V1: SAG PD reservations used as proxy for Agentik reservedQty.
 */
export function mapSagItemToOperational(
  item:   SagInventoryItem,
  source: OperationalInventorySource,
  snapshotAt: string,
): OperationalInventoryItem {
  // V1 formula: operationalAvailableQty = physicalQty - reservedQty
  // = initialWarehouseQty - sagItem.reservedQty = availableForCases
  const operationalAvailableQty = Math.max(
    0,
    item.initialWarehouseQty - item.reservedQty,
  );

  return {
    reference:               item.reference.toUpperCase(),
    description:             item.description,
    line:                    item.line,
    category:                item.category,
    productType:             item.productType,

    // Physical layer
    physicalQty:             item.initialWarehouseQty,
    sagReportedAvailableQty: item.availableForCases,
    sagPendingOrdersQty:     item.pendingPDQty,

    // Agentik operational layer (V1: SAG PD as proxy for reservedQty)
    salesAssignedQty:        0,   // V2+: from VendorBagItem DB
    reservedQty:             item.reservedQty,
    pendingTransfersQty:     0,   // V2+: from transfer engine

    // Computed
    operationalAvailableQty,

    // Pressure (V1: not yet computed from bag state)
    productionPressureQty:   0,
    portfoliosUnderPressure: 0,
    portfoliosDepleted:      0,

    // Metadata
    physicalSource:    source,
    physicalSnapshotAt: snapshotAt,
  };
}

/**
 * Maps a full SagInventoryItem[] to OperationalInventoryItem[].
 */
export function mapSagInventoryToOperational(
  items:      SagInventoryItem[],
  source:     OperationalInventorySource = "sag_excel_import",
  snapshotAt: string = new Date().toISOString(),
): OperationalInventoryItem[] {
  return items.map(item => mapSagItemToOperational(item, source, snapshotAt));
}

// ─── Operational → SAG (reverse bridge for legacy engines) ──────────────────

/**
 * Maps an OperationalInventoryItem back to a SagInventoryItem shape.
 *
 * This is a THIN BRIDGE for legacy engines (buildProductionAlertsFromRules,
 * buildSalesRepCaseStatus, buildLiveBagPressure) that still consume
 * SagInventoryItem[]. It is NOT a real SAG data record.
 *
 * Use this ONLY when calling a legacy engine that cannot be updated in the
 * current sprint. New code should always consume OperationalInventoryItem.
 */
export function mapOperationalToSagItem(
  item: OperationalInventoryItem,
): SagInventoryItem {
  return {
    reference:            item.reference,
    description:          item.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line:                 item.line as any, // CommercialCaseLine — legacy engine type
    category:             item.category,
    productType:          item.productType,
    initialWarehouseQty:  item.physicalQty,
    reservedQty:          item.reservedQty,
    // Legacy engines use availableForCases for pressure and status computation.
    // We map operationalAvailableQty here — same value for V1.
    availableForCases:    item.operationalAvailableQty,
    pendingPDQty:         item.sagPendingOrdersQty,
    apCleanupQty:         0, // AP excluded upstream — not tracked in operational layer
  };
}

/**
 * Maps OperationalInventoryItem[] → SagInventoryItem[] for legacy engines.
 */
export function mapOperationalToSagItems(
  items: OperationalInventoryItem[],
): SagInventoryItem[] {
  return items.map(mapOperationalToSagItem);
}
