/**
 * lib/operational-data/engines/commercial-demand-signals.ts
 *
 * Commercial Demand Signals Engine — fuses multiple data sources into a
 * unified, prioritized OperationalDemandSignal[] view.
 *
 * ─── INPUTS ──────────────────────────────────────────────────────────────────
 *   SAG inventory snapshot  → inventory_pressure signals
 *   CRM orders              → order_surge signals
 *   CRM opportunities       → opportunity_demand signals
 *   Velocity history        → seasonal_risk / dead_stock_risk signals
 *   CRM order lines (Ph.2)  → demand_from_crm_order / hot_reference /
 *                              multi_vendor_demand / warehouse_pressure_candidate
 *
 * ─── OUTPUTS ─────────────────────────────────────────────────────────────────
 *   OperationalDemandSignal[] — sorted by urgency (alta first), deduplicated
 *   by reference (one signal per reference, merged from all sources)
 *
 * ─── DESIGN ──────────────────────────────────────────────────────────────────
 * Pure function — no Prisma, no side effects.
 * Callers (API routes, server components) assemble inputs and call compute().
 *
 * Phase 2 signals (demand_from_crm_order, hot_reference, multi_vendor_demand,
 * warehouse_pressure_candidate) fire automatically when activeOrders carry real
 * .lines (populated by AGENTIK-CRM-QUOTE-LINES-INGESTION-01). If .lines is [],
 * Phase 2 signals are silently skipped — no disruption to Phase 1 output.
 *
 * Standalone Phase 2 entry point: computeCrmOrderLineSignals().
 *
 * Sprints: AGENTIK-OPERATIONAL-DATA-LAYER-01 · AGENTIK-CRM-QUOTE-LINES-INGESTION-01
 */

import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";
import type {
  OperationalOrder,
  OperationalOpportunity,
  OperationalDemandSignal,
} from "../operational-entities";
import { computePressureLevel } from "@/lib/operational-inventory/operational-inventory-status";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface CommercialDemandSignalInput {
  organizationId:  string;
  inventory:       OperationalInventoryItem[];
  /** Orders in active states (reserved, confirmed, sent_to_erp, processing) */
  activeOrders:    OperationalOrder[];
  /** Active opportunities (not closed/lost) */
  opportunities:   OperationalOpportunity[];
  /** Velocity window in days for surge detection */
  velocityWindowDays?: number;
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Computes OperationalDemandSignal[] from all available commercial data.
 *
 * Deduplicates by reference — one signal per ref, merged from all sources.
 * Sorted: alta → media → baja → ninguna.
 */
export function computeCommercialDemandSignals(
  input: CommercialDemandSignalInput,
): OperationalDemandSignal[] {
  const now = new Date().toISOString();
  const merged = new Map<string, OperationalDemandSignal>();

  // 1. Inventory pressure signals (from SAG operational layer)
  for (const item of input.inventory) {
    const pressure = computePressureLevel(item);
    if (pressure === "ninguna") continue;

    const signal = _buildInventoryPressureSignal(item, pressure, input.organizationId, now);
    _mergeSignal(merged, signal);
  }

  // 2. Order surge signals (from CRM/channel orders)
  const orderQtyByRef = _aggregateOrderQtyByRef(input.activeOrders);
  for (const [reference, orderedQty] of orderQtyByRef) {
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    if (!inv) continue;

    const coverageRatio = inv.operationalAvailableQty / (orderedQty + 0.01);
    if (coverageRatio >= 2) continue; // enough stock — no surge signal

    const signal = _buildOrderSurgeSignal(
      reference, inv, orderedQty, coverageRatio, input.organizationId, now,
    );
    _mergeSignal(merged, signal);
  }

  // 3. Opportunity demand signals (from CRM pipeline)
  const oppQtyByRef  = _aggregateOpportunityQtyByRef(input.opportunities);
  const oppCountByRef = _countOpportunitiesByRef(input.opportunities);
  for (const [reference, opportunityQty] of oppQtyByRef) {
    if (opportunityQty === 0) continue;
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    if (!inv) continue;

    const coverageRatio = inv.operationalAvailableQty / opportunityQty;
    if (coverageRatio >= 3) continue; // 3x coverage — no signal

    const signal = _buildOpportunityDemandSignal(
      reference, inv, opportunityQty, oppCountByRef.get(reference) ?? 0,
      input.organizationId, now,
    );
    _mergeSignal(merged, signal);
  }

  // 4. Dead stock risk signals
  for (const item of input.inventory) {
    if (!_isDeadStockCandidate(item)) continue;
    const signal = _buildDeadStockSignal(item, input.organizationId, now);
    _mergeSignal(merged, signal);
  }

  // ── Phase 2: CRM order line signals ────────────────────────────────────────
  // These signals fire only when activeOrders have real .lines
  // (populated by AGENTIK-CRM-QUOTE-LINES-INGESTION-01).
  // No production side effects — computed-only.
  const orderLineAggs = _aggregateOrderLinesByRef(input.activeOrders);

  // 5. demand_from_crm_order — any reference with active order demand
  for (const [reference, agg] of orderLineAggs) {
    if (agg.totalQty === 0) continue;
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    _mergeSignal(merged, _buildDemandFromCrmOrderSignal(agg, inv, input.organizationId, now));
  }

  // 6. hot_reference — reference in >= HOT_REFERENCE_ORDER_THRESHOLD distinct orders
  for (const [reference, agg] of orderLineAggs) {
    if (agg.orderIds.size < HOT_REFERENCE_ORDER_THRESHOLD) continue;
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    _mergeSignal(merged, _buildHotReferenceSignal(agg, inv, input.organizationId, now));
  }

  // 7. multi_vendor_demand — same reference from >= MULTI_VENDOR_SELLER_THRESHOLD sellers
  for (const [reference, agg] of orderLineAggs) {
    if (agg.sellerSlugs.size < MULTI_VENDOR_SELLER_THRESHOLD) continue;
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    _mergeSignal(merged, _buildMultiVendorDemandSignal(agg, inv, input.organizationId, now));
  }

  // 8. warehouse_pressure_candidate — >= WAREHOUSE_CONCENTRATION_RATIO of qty in one warehouse
  for (const [reference, agg] of orderLineAggs) {
    if (agg.totalQty === 0 || agg.warehouseQty.size === 0) continue;
    // Find the dominant warehouse (most qty)
    let topWarehouseId   = "";
    let topWarehouseName = "";
    let topQty           = 0;
    for (const [wId, { name, qty }] of agg.warehouseQty) {
      if (qty > topQty) { topQty = qty; topWarehouseId = wId; topWarehouseName = name; }
    }
    if (topQty / agg.totalQty < WAREHOUSE_CONCENTRATION_RATIO) continue;
    const inv = input.inventory.find(i => i.reference.toUpperCase() === reference);
    _mergeSignal(merged, _buildWarehousePressureCandidateSignal(
      agg, topWarehouseId, topWarehouseName, topQty, inv, input.organizationId, now,
    ));
  }

  // Sort: alta → media → baja → ninguna
  return [...merged.values()].sort((a, b) =>
    URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency],
  );
}

// ─── Signal builders ──────────────────────────────────────────────────────────

const URGENCY_ORDER: Record<OperationalDemandSignal["urgency"], number> = {
  alta: 0, media: 1, baja: 2, ninguna: 3,
};

function _buildInventoryPressureSignal(
  item:  OperationalInventoryItem,
  level: ReturnType<typeof computePressureLevel>,
  orgId: string,
  now:   string,
): OperationalDemandSignal {
  const urgency: OperationalDemandSignal["urgency"] =
    level === "alta" ? "alta" : level === "media" ? "media" : "baja";

  const qtyNeeded = Math.max(
    0,
    (item.productionPressureQty > 0 ? item.productionPressureQty : item.physicalQty * 0.5) - item.operationalAvailableQty,
  );

  return {
    organizationId:        orgId,
    reference:             item.reference,
    description:           item.description,
    line:                  item.line,
    signalType:            "inventory_pressure",
    urgency,
    qtyNeeded:             Math.ceil(qtyNeeded),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "sag", signalType: "inventory_pressure", weight: 0.85 }],
    affectedSalesReps:     [],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

function _buildOrderSurgeSignal(
  reference:     string,
  inv:           OperationalInventoryItem,
  orderedQty:    number,
  coverageRatio: number,
  orgId:         string,
  now:           string,
): OperationalDemandSignal {
  const urgency: OperationalDemandSignal["urgency"] =
    coverageRatio < 0.5 ? "alta" : coverageRatio < 1 ? "media" : "baja";

  return {
    organizationId:        orgId,
    reference:             inv.reference,
    description:           inv.description,
    line:                  inv.line,
    signalType:            "order_surge",
    urgency,
    qtyNeeded:             Math.max(0, orderedQty - inv.operationalAvailableQty),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "order_surge", weight: 0.80 }],
    affectedSalesReps:     [],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

function _buildOpportunityDemandSignal(
  reference:    string,
  inv:          OperationalInventoryItem,
  oppQty:       number,
  oppCount:     number,
  orgId:        string,
  now:          string,
): OperationalDemandSignal {
  return {
    organizationId:        orgId,
    reference:             inv.reference,
    description:           inv.description,
    line:                  inv.line,
    signalType:            "opportunity_demand",
    urgency:               "media",
    qtyNeeded:             Math.max(0, oppQty - inv.operationalAvailableQty),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "opportunity_demand", weight: 0.70 }],
    affectedSalesReps:     [],
    openOpportunityCount:  oppCount,
    computedAt:            now,
    escalatedToProduction: false,
  };
}

function _buildDeadStockSignal(
  item:  OperationalInventoryItem,
  orgId: string,
  now:   string,
): OperationalDemandSignal {
  return {
    organizationId:        orgId,
    reference:             item.reference,
    description:           item.description,
    line:                  item.line,
    signalType:            "dead_stock_risk",
    urgency:               "baja",
    qtyNeeded:             0,
    velocityPerDay:        0,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "agentik", signalType: "dead_stock_heuristic", weight: 0.60 }],
    affectedSalesReps:     [],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: false,
  };
}

// ─── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merges a new signal into the map for its reference.
 * If a signal already exists, takes the higher urgency and merges source pressures.
 */
function _mergeSignal(
  map:    Map<string, OperationalDemandSignal>,
  signal: OperationalDemandSignal,
): void {
  const existing = map.get(signal.reference);
  if (!existing) {
    map.set(signal.reference, signal);
    return;
  }
  // Keep higher urgency
  const mergedUrgency =
    URGENCY_ORDER[signal.urgency] < URGENCY_ORDER[existing.urgency]
      ? signal.urgency
      : existing.urgency;

  map.set(signal.reference, {
    ...existing,
    urgency:         mergedUrgency,
    qtyNeeded:       Math.max(existing.qtyNeeded, signal.qtyNeeded),
    sourcePressures: [...existing.sourcePressures, ...signal.sourcePressures],
    openOpportunityCount: existing.openOpportunityCount + signal.openOpportunityCount,
    escalatedToProduction: existing.escalatedToProduction || signal.escalatedToProduction,
  });
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function _aggregateOrderQtyByRef(orders: OperationalOrder[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      const ref = line.reference.toUpperCase();
      map.set(ref, (map.get(ref) ?? 0) + line.qtyOrdered);
    }
  }
  return map;
}

function _aggregateOpportunityQtyByRef(opps: OperationalOpportunity[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const opp of opps) {
    if (opp.stage === "perdido" || opp.stage === "ganado") continue;
    for (const line of opp.referenceLines ?? []) {
      const ref = line.reference.toUpperCase();
      const weighted = Math.ceil(line.qty * (opp.probability / 100));
      map.set(ref, (map.get(ref) ?? 0) + weighted);
    }
  }
  return map;
}

function _countOpportunitiesByRef(opps: OperationalOpportunity[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const opp of opps) {
    if (opp.stage === "perdido" || opp.stage === "ganado") continue;
    for (const line of opp.referenceLines ?? []) {
      const ref = line.reference.toUpperCase();
      map.set(ref, (map.get(ref) ?? 0) + 1);
    }
  }
  return map;
}

function _isDeadStockCandidate(item: OperationalInventoryItem): boolean {
  // Dead stock: high physical qty, zero operational pressure, no assigned portfolios
  return (
    item.physicalQty > 20 &&
    item.operationalAvailableQty === item.physicalQty &&
    item.portfoliosUnderPressure === 0 &&
    item.portfoliosDepleted === 0
  );
}

// ─── Phase 2: CRM Order Line Aggregation & Signal Builders ───────────────────
// Requires OperationalOrder.lines populated from CRMQuoteLine
// (sprint AGENTIK-CRM-QUOTE-LINES-INGESTION-01).
//
// Pure functions — no Prisma, no side effects.

const HOT_REFERENCE_ORDER_THRESHOLD  = 2;    // >= N distinct orders → hot reference
const MULTI_VENDOR_SELLER_THRESHOLD  = 2;    // >= N distinct sellers → multi-vendor demand
const WAREHOUSE_CONCENTRATION_RATIO  = 0.70; // >= 70% of total qty in one warehouse → candidate

interface OrderLineAggregation {
  reference:    string;
  totalQty:     number;
  /** Unique order sourceId values across all lines for this reference */
  orderIds:     Set<string>;
  /** Unique salesRepId values across all orders contributing lines */
  sellerSlugs:  Set<string>;
  /** warehouseId → { display name, total qty } */
  warehouseQty: Map<string, { name: string; qty: number }>;
}

/**
 * Aggregates all active order lines by product reference.
 * Reads metadata.warehouseId and metadata.bodega from CRM line metadata.
 */
function _aggregateOrderLinesByRef(
  orders: OperationalOrder[],
): Map<string, OrderLineAggregation> {
  const map = new Map<string, OrderLineAggregation>();

  for (const order of orders) {
    for (const line of order.lines) {
      const ref = line.reference.toUpperCase();

      const agg: OrderLineAggregation = map.get(ref) ?? {
        reference:    ref,
        totalQty:     0,
        orderIds:     new Set<string>(),
        sellerSlugs:  new Set<string>(),
        warehouseQty: new Map<string, { name: string; qty: number }>(),
      };

      agg.totalQty += line.qtyOrdered;
      agg.orderIds.add(order.sourceId);
      if (order.salesRepId) agg.sellerSlugs.add(order.salesRepId);

      // Warehouse demand concentration — from CRM line metadata
      const warehouseId   = line.metadata?.warehouseId as string | undefined;
      const warehouseName = (line.metadata?.bodega    as string | undefined) ?? warehouseId ?? "";
      if (warehouseId) {
        const prev = agg.warehouseQty.get(warehouseId);
        agg.warehouseQty.set(warehouseId, {
          name: warehouseName,
          qty:  (prev?.qty ?? 0) + line.qtyOrdered,
        });
      }

      map.set(ref, agg);
    }
  }

  return map;
}

// ── Phase 2 builders ──────────────────────────────────────────────────────────

function _buildDemandFromCrmOrderSignal(
  agg:   OrderLineAggregation,
  inv:   OperationalInventoryItem | undefined,
  orgId: string,
  now:   string,
): OperationalDemandSignal {
  const orderCount = agg.orderIds.size;
  const urgency: OperationalDemandSignal["urgency"] =
    orderCount >= 3 ? "alta" : orderCount >= 2 ? "media" : "baja";

  return {
    organizationId:        orgId,
    reference:             agg.reference,
    description:           inv?.description ?? agg.reference,
    line:                  inv?.line         ?? "—",
    signalType:            "demand_from_crm_order",
    urgency,
    qtyNeeded:             Math.max(0, agg.totalQty - (inv?.operationalAvailableQty ?? 0)),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "demand_from_crm_order", weight: 0.85 }],
    affectedSalesReps:     [...agg.sellerSlugs],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

function _buildHotReferenceSignal(
  agg:   OrderLineAggregation,
  inv:   OperationalInventoryItem | undefined,
  orgId: string,
  now:   string,
): OperationalDemandSignal {
  const orderCount = agg.orderIds.size;
  const urgency: OperationalDemandSignal["urgency"] =
    orderCount >= 5 ? "alta" : orderCount >= 3 ? "media" : "baja";

  return {
    organizationId:        orgId,
    reference:             agg.reference,
    description:           inv?.description ?? agg.reference,
    line:                  inv?.line         ?? "—",
    signalType:            "hot_reference",
    urgency,
    qtyNeeded:             Math.max(0, agg.totalQty - (inv?.operationalAvailableQty ?? 0)),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "hot_reference", weight: 0.90 }],
    affectedSalesReps:     [...agg.sellerSlugs],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

function _buildMultiVendorDemandSignal(
  agg:   OrderLineAggregation,
  inv:   OperationalInventoryItem | undefined,
  orgId: string,
  now:   string,
): OperationalDemandSignal {
  const sellerCount = agg.sellerSlugs.size;
  const urgency: OperationalDemandSignal["urgency"] =
    sellerCount >= 4 ? "alta" : sellerCount >= 3 ? "media" : "baja";

  return {
    organizationId:        orgId,
    reference:             agg.reference,
    description:           inv?.description ?? agg.reference,
    line:                  inv?.line         ?? "—",
    signalType:            "multi_vendor_demand",
    urgency,
    qtyNeeded:             Math.max(0, agg.totalQty - (inv?.operationalAvailableQty ?? 0)),
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "multi_vendor_demand", weight: 0.88 }],
    affectedSalesReps:     [...agg.sellerSlugs],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

function _buildWarehousePressureCandidateSignal(
  agg:             OrderLineAggregation,
  warehouseId:     string,
  warehouseName:   string,
  concentratedQty: number,
  inv:             OperationalInventoryItem | undefined,
  orgId:           string,
  now:             string,
): OperationalDemandSignal {
  const deficit  = Math.max(0, concentratedQty - (inv?.operationalAvailableQty ?? 0));
  const urgency: OperationalDemandSignal["urgency"] = deficit > 0 ? "alta" : "media";

  return {
    organizationId:        orgId,
    reference:             agg.reference,
    description:           inv?.description ?? agg.reference,
    line:                  inv?.line         ?? "—",
    signalType:            "warehouse_pressure_candidate",
    urgency,
    qtyNeeded:             deficit,
    velocityPerDay:        null,
    coverageDaysEstimate:  null,
    sourcePressures: [{ source: "crm", signalType: "warehouse_pressure_candidate", weight: 0.80 }],
    affectedSalesReps:     [...agg.sellerSlugs],
    openOpportunityCount:  0,
    computedAt:            now,
    escalatedToProduction: urgency === "alta",
  };
}

// ─── Standalone Phase 2 export ────────────────────────────────────────────────

/**
 * Compute only Phase 2 CRM order line signals (demand_from_crm_order, hot_reference,
 * multi_vendor_demand, warehouse_pressure_candidate) without Phase 1 inventory signals.
 *
 * Useful for incremental refresh after a quote lines sync, without re-running
 * the full demand engine. Returns merged, sorted signals.
 */
export function computeCrmOrderLineSignals(
  organizationId: string,
  activeOrders:   OperationalOrder[],
  inventory:      OperationalInventoryItem[],
): OperationalDemandSignal[] {
  const now    = new Date().toISOString();
  const merged = new Map<string, OperationalDemandSignal>();
  const aggs   = _aggregateOrderLinesByRef(activeOrders);

  for (const [reference, agg] of aggs) {
    const inv = inventory.find(i => i.reference.toUpperCase() === reference);

    if (agg.totalQty > 0) {
      _mergeSignal(merged, _buildDemandFromCrmOrderSignal(agg, inv, organizationId, now));
    }
    if (agg.orderIds.size >= HOT_REFERENCE_ORDER_THRESHOLD) {
      _mergeSignal(merged, _buildHotReferenceSignal(agg, inv, organizationId, now));
    }
    if (agg.sellerSlugs.size >= MULTI_VENDOR_SELLER_THRESHOLD) {
      _mergeSignal(merged, _buildMultiVendorDemandSignal(agg, inv, organizationId, now));
    }
    if (agg.warehouseQty.size > 0 && agg.totalQty > 0) {
      let topId   = "";
      let topName = "";
      let topQty  = 0;
      for (const [wId, { name, qty }] of agg.warehouseQty) {
        if (qty > topQty) { topQty = qty; topId = wId; topName = name; }
      }
      if (topQty / agg.totalQty >= WAREHOUSE_CONCENTRATION_RATIO) {
        _mergeSignal(merged, _buildWarehousePressureCandidateSignal(
          agg, topId, topName, topQty, inv, organizationId, now,
        ));
      }
    }
  }

  return [...merged.values()].sort((a, b) =>
    URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency],
  );
}
