/**
 * lib/operational-intelligence/operational-intelligence-engine.ts
 *
 * Operational Intelligence Engine — pure function, no Prisma, no side effects.
 *
 * ─── EXPLAINABILITY PRINCIPLE ─────────────────────────────────────────────────
 * Every status is explained in plain language.
 * Every suggestion is derived from real signals, not heuristics.
 * "Why" messages are built from actual data, not templates.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import type { OperationalInventoryItem }        from "@/lib/operational-inventory/operational-inventory-types";
import type { OperationalReservation }           from "@/lib/operational-inventory/operational-reservation-types";
import type { OperationalOrder, OperationalDemandSignal }
                                                 from "@/lib/operational-data/operational-entities";
import type { VendorBagItem }                    from "@/lib/comercial/maletas/vendor-bag-types";
import type { VendorBagTransferSuggestion,
              ProductionSuggestionFromBags }      from "@/lib/comercial/maletas/vendor-bag-types";
import type { OperationalReconciliationReport }  from "@/lib/operational-inventory/operational-reconciliation-types";
import type {
  OperationalIntelligenceSnapshot,
  OperationalIntelligenceReference,
  OperationalIntelligenceAlert,
  OperationalIntelligenceSuggestion,
  OperationalConflict,
  OperationalHotReference,
  OperationalVendorImpact,
  OperationalWarehousePressure,
  OperationalImpact,
  OperationalReferenceSuggestion,
  OperationalReferenceStatus,
  OperationalPressureSummary,
  OperationalIntelligenceHealth,
}                                                from "./operational-intelligence-types";

// ─── Engine input ─────────────────────────────────────────────────────────────

export interface IntelligenceEngineInput {
  organizationId:       string;
  inventory:            OperationalInventoryItem[];
  reservations:         OperationalReservation[];
  activeOrders?:        OperationalOrder[];
  demandSignals?:       OperationalDemandSignal[];
  reconciliationReport?: OperationalReconciliationReport;
  portfolioItems?:      VendorBagItem[];
  transferSuggestions?: VendorBagTransferSuggestion[];
  productionSuggestions?: ProductionSuggestionFromBags[];
  generatedAt?:         string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MAX_REFERENCES_IN_SNAPSHOT = 50;    // top-N by urgency
const HOT_REF_ORDER_THRESHOLD    = 2;     // N+ distinct orders = hot
const DEAD_STOCK_QTY_THRESHOLD   = 20;    // physical > N + zero demand = dead

// ─── Main engine ──────────────────────────────────────────────────────────────

export function buildOperationalIntelligenceSnapshot(
  input: IntelligenceEngineInput,
): OperationalIntelligenceSnapshot {
  const now = input.generatedAt ?? new Date().toISOString();
  const { organizationId } = input;

  const orders       = input.activeOrders    ?? [];
  const signals      = input.demandSignals   ?? [];
  const reservations = input.reservations;
  const activeRes    = reservations.filter(r => r.status === "active");
  const recon        = input.reconciliationReport;

  // ── Index data for O(1) lookups ──────────────────────────────────────────
  const invByRef       = _indexBy(input.inventory,   i => i.reference.toUpperCase());
  const resByRef       = _groupBy(activeRes,          r => r.reference.toUpperCase());
  const ordersByRef    = _groupByMulti(orders,        o => o.lines.map(l => l.reference.toUpperCase()));
  const signalsByRef   = _groupBy(signals,            s => s.reference.toUpperCase());
  const ordersBySource = _indexBy(orders,             o => o.sourceId);

  // ── Identify all references to analyze ──────────────────────────────────
  const allRefs = new Set<string>([
    ...input.inventory.map(i => i.reference.toUpperCase()),
    ...activeRes.map(r => r.reference.toUpperCase()),
    ...signals.map(s => s.reference.toUpperCase()),
  ]);

  // ── Build per-reference intelligence ────────────────────────────────────
  const references: OperationalIntelligenceReference[] = [];
  for (const ref of allRefs) {
    const intel = _buildReferenceIntelligence(
      ref, invByRef, resByRef, ordersByRef, signalsByRef, input, now,
    );
    if (intel) references.push(intel);
  }

  // Sort: critical → pressure → warning → stable → dead_stock
  references.sort((a, b) => STATUS_SORT[a.status] - STATUS_SORT[b.status]);

  // ── Hot references ────────────────────────────────────────────────────────
  const hotReferences = _buildHotReferences(references, ordersByRef, invByRef);

  // ── Vendor impact ─────────────────────────────────────────────────────────
  const vendorImpact = _buildVendorImpact(orders, activeRes, references);

  // ── Warehouse pressure ────────────────────────────────────────────────────
  const warehousePressure = _buildWarehousePressure(signals);

  // ── Global alerts ─────────────────────────────────────────────────────────
  const alerts = _buildAlerts(references, recon, now);

  // ── Global suggestions ────────────────────────────────────────────────────
  const suggestions = _buildSuggestions(
    references, signals, input.transferSuggestions, input.productionSuggestions, now,
  );

  // ── Conflicts from reconciliation ─────────────────────────────────────────
  const conflicts = _buildConflicts(recon);

  // ── Pressure summary ──────────────────────────────────────────────────────
  const pressureSummary = _buildPressureSummary(references, recon);

  // ── Health ────────────────────────────────────────────────────────────────
  const health = _buildHealth(references, recon, alerts);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalQtyReserved = activeRes.reduce(
    (s, r) => s + (r.qtyReserved - r.qtyReleased - r.qtyConsumed), 0,
  );

  return {
    organizationId,
    generatedAt:   now,
    health,
    pressureSummary,
    references:    references.slice(0, MAX_REFERENCES_IN_SNAPSHOT),
    hotReferences,
    alerts,
    suggestions,
    conflicts,
    vendorImpact,
    warehousePressure,
    reconciliationSummary: recon
      ? {
          totalIssues:  recon.summary.totalIssues,
          critical:     recon.summary.critical,
          warnings:     recon.summary.warnings,
          info:         recon.summary.info,
          isHealthy:    recon.summary.isHealthy,
          healthScore:  recon.summary.healthScore,
        }
      : { totalIssues: 0, critical: 0, warnings: 0, info: 0, isHealthy: true, healthScore: 100 },
    totals: {
      activeReservations: activeRes.length,
      activeOrders:       orders.length,
      totalQtyReserved:   Math.round(totalQtyReserved),
      refsMonitored:      allRefs.size,
    },
  };
}

// ─── Reference intelligence builder (Phase 3 explainability) ─────────────────

const STATUS_SORT: Record<OperationalReferenceStatus, number> = {
  critical:   0,
  pressure:   1,
  warning:    2,
  stable:     4,
  dead_stock: 3,
};

function _buildReferenceIntelligence(
  ref:         string,
  invByRef:    Map<string, OperationalInventoryItem>,
  resByRef:    Map<string, OperationalReservation[]>,
  ordersByRef: Map<string, OperationalOrder[]>,
  signalsByRef: Map<string, OperationalDemandSignal[]>,
  input:       IntelligenceEngineInput,
  now:         string,
): OperationalIntelligenceReference | null {
  const inv    = invByRef.get(ref);
  const res    = resByRef.get(ref)  ?? [];
  const orders = ordersByRef.get(ref) ?? [];
  const sigs   = signalsByRef.get(ref) ?? [];

  // Skip if no data
  if (!inv && res.length === 0 && sigs.length === 0) return null;

  const physicalQty             = inv?.physicalQty             ?? 0;
  const reservedQty             = res.reduce((s, r) => s + (r.qtyReserved - r.qtyReleased - r.qtyConsumed), 0);
  const salesAssignedQty        = inv?.salesAssignedQty        ?? 0;
  const operationalAvailableQty = inv?.operationalAvailableQty ?? Math.max(0, physicalQty - reservedQty - salesAssignedQty);

  // Unique vendors from orders + reservations
  const vendorSet = new Set<string>();
  for (const o of orders) { if (o.salesRepId) vendorSet.add(o.salesRepId); }
  for (const r of res)    { if (r.salesRepId) vendorSet.add(r.salesRepId); }

  // ── Determine status ───────────────────────────────────────────────────
  let status: OperationalReferenceStatus;
  let urgency: OperationalIntelligenceReference["urgency"];

  if (operationalAvailableQty < 0 || (res.length > 0 && reservedQty > physicalQty)) {
    status = "critical"; urgency = "alta";
  } else if (operationalAvailableQty === 0 && (reservedQty > 0 || orders.length > 0)) {
    status = "critical"; urgency = "alta";
  } else if (sigs.some(s => s.urgency === "alta")) {
    status = "pressure"; urgency = "alta";
  } else if (operationalAvailableQty <= reservedQty * 0.5 && reservedQty > 0) {
    status = "pressure"; urgency = "media";
  } else if (sigs.some(s => s.urgency === "media") || orders.length > 0) {
    status = "warning"; urgency = "media";
  } else if (physicalQty > DEAD_STOCK_QTY_THRESHOLD && reservedQty === 0 && orders.length === 0 && sigs.length === 0) {
    status = "dead_stock"; urgency = "baja";
  } else if (sigs.length > 0) {
    status = "warning"; urgency = "baja";
  } else {
    status = "stable"; urgency = "ninguna";
  }

  // ── Build why[] — human explainability ────────────────────────────────
  const why: string[] = [];

  if (operationalAvailableQty < 0) {
    why.push(`Disponibilidad operacional negativa (${operationalAvailableQty} unidades)`);
  }
  if (reservedQty > 0) {
    why.push(`${Math.round(reservedQty)} unidades reservadas en ${res.length} reserva${res.length !== 1 ? "s" : ""} activa${res.length !== 1 ? "s" : ""}`);
  }
  if (orders.length > 0) {
    why.push(`${orders.length} pedido${orders.length !== 1 ? "s" : ""} activo${orders.length !== 1 ? "s" : ""} demandando esta referencia`);
  }
  if (vendorSet.size > 1) {
    why.push(`${vendorSet.size} vendedores consumiendo stock simultáneamente`);
  }
  if (salesAssignedQty > 0) {
    why.push(`${salesAssignedQty} unidades asignadas a portafolios comerciales`);
  }
  for (const sig of sigs) {
    if (sig.signalType === "hot_reference") {
      why.push(`Referencia caliente: aparece en ${sig.sourcePressures.length} fuentes de demanda`);
    } else if (sig.signalType === "warehouse_pressure_candidate") {
      why.push(`Demanda concentrada en una bodega específica`);
    } else if (sig.signalType === "multi_vendor_demand") {
      why.push(`Demanda multi-vendedor detectada`);
    } else if (sig.signalType === "inventory_pressure") {
      why.push(`Presión de inventario SAG detectada`);
    }
  }
  if (status === "dead_stock") {
    why.push(`Sin demanda activa con ${physicalQty} unidades físicas — posible stock muerto`);
  }

  // ── Build impacts[] ────────────────────────────────────────────────────
  const impacts: OperationalImpact[] = [];

  for (const o of orders.slice(0, 4)) {
    impacts.push({
      type:        "order",
      id:          o.sourceId,
      name:        o.reference,
      description: `Pedido ${o.status} — ${o.lines.filter(l => l.reference.toUpperCase() === ref).reduce((s, l) => s + l.qtyOrdered, 0)} uds`,
    });
  }
  for (const [vendor] of vendorSet) {
    const vendorOrders = orders.filter(o => o.salesRepId === vendor);
    impacts.push({
      type:        "vendor",
      id:          vendor,
      name:        vendorOrders[0]?.salesRepId ?? vendor,
      description: `${vendorOrders.length} pedido${vendorOrders.length !== 1 ? "s" : ""}`,
    });
  }

  const highSignal = sigs.find(s => s.urgency === "alta");
  if (highSignal?.qtyNeeded && highSignal.qtyNeeded > 0) {
    impacts.push({
      type:        "production",
      name:        "Producción sugerida",
      description: `+${highSignal.qtyNeeded} unidades necesarias`,
    });
  }

  // ── Build suggestions[] ────────────────────────────────────────────────
  const suggestions: OperationalReferenceSuggestion[] = [];

  if (input.productionSuggestions) {
    const ps = input.productionSuggestions.find(s => s.reference.toUpperCase() === ref);
    if (ps) {
      suggestions.push({
        type:       "production",
        label:      `Producir ${ps.suggestedProductionQty} unidades`,
        urgency:    ps.urgency,
        qtyImpact:  ps.suggestedProductionQty,
        reason:     ps.reason,
      });
    }
  }
  if (input.transferSuggestions) {
    const ts = input.transferSuggestions.filter(s => s.reference.toUpperCase() === ref);
    for (const t of ts.slice(0, 2)) {
      suggestions.push({
        type:       "transfer",
        label:      `Trasladar ${t.qtySuggested} uds desde ${t.fromSalesRepName}`,
        urgency:    t.urgency,
        qtyImpact:  t.qtySuggested,
        reason:     t.reason,
      });
    }
  }

  // Missing reservation signal → suggest sync
  const hasOrders = orders.some(o => ["reserved", "confirmed"].includes(o.status));
  const hasRes    = res.length > 0;
  if (hasOrders && !hasRes) {
    suggestions.push({
      type:    "reserve",
      label:   "Crear reservas para pedidos activos",
      urgency: "media",
      reason:  "Pedidos activos sin reserva operacional — disponibilidad no deducida",
    });
  }

  return {
    reference:               ref,
    description:             inv?.description ?? ref,
    line:                    inv?.line ?? "—",
    physicalQty,
    reservedQty:             Math.round(reservedQty),
    salesAssignedQty,
    operationalAvailableQty,
    status,
    urgency,
    why,
    impacts,
    suggestions,
    relatedOrders:       orders.map(o => o.sourceId),
    relatedVendors:      [...vendorSet],
    relatedReservations: res.map(r => r.id),
    activeOrderCount:    orders.length,
    activeReservationCount: res.length,
    signalTypes:         [...new Set(sigs.map(s => s.signalType))],
  };
}

// ─── Hot references ───────────────────────────────────────────────────────────

function _buildHotReferences(
  references:  OperationalIntelligenceReference[],
  ordersByRef: Map<string, OperationalOrder[]>,
  invByRef:    Map<string, OperationalInventoryItem>,
): OperationalHotReference[] {
  return references
    .filter(r => r.activeOrderCount >= HOT_REF_ORDER_THRESHOLD || r.relatedVendors.length >= 2)
    .slice(0, 15)
    .map(r => ({
      reference:      r.reference,
      description:    r.description,
      line:           r.line,
      orderCount:     r.activeOrderCount,
      vendorCount:    r.relatedVendors.length,
      totalDemandQty: (ordersByRef.get(r.reference) ?? []).reduce(
        (s, o) => s + o.lines
          .filter(l => l.reference.toUpperCase() === r.reference)
          .reduce((ls, l) => ls + l.qtyOrdered, 0),
        0,
      ),
      availableQty:   r.operationalAvailableQty,
      urgency:        r.urgency === "ninguna" ? "baja" : r.urgency,
    }));
}

// ─── Vendor impact ────────────────────────────────────────────────────────────

function _buildVendorImpact(
  orders:      OperationalOrder[],
  activeRes:   OperationalReservation[],
  references:  OperationalIntelligenceReference[],
): OperationalVendorImpact[] {
  const vendors = new Map<string, OperationalVendorImpact>();

  // Index references by vendor
  for (const ref of references) {
    for (const vendor of ref.relatedVendors) {
      const v = vendors.get(vendor) ?? {
        salesRepId:         vendor,
        salesRepName:       vendor,
        depletedRefs:       0,
        pressureRefs:       0,
        activeOrders:       0,
        activeReservations: 0,
        totalQtyReserved:   0,
        commercialRisk:     "bajo" as const,
      };
      if (ref.status === "critical")        v.depletedRefs++;
      else if (ref.status === "pressure")   v.pressureRefs++;
      vendors.set(vendor, v);
    }
  }

  // Add order counts
  for (const order of orders) {
    if (!order.salesRepId) continue;
    const v = vendors.get(order.salesRepId);
    if (v) v.activeOrders++;
  }

  // Add reservation counts
  for (const r of activeRes) {
    if (!r.salesRepId) continue;
    const v = vendors.get(r.salesRepId);
    if (v) {
      v.activeReservations++;
      v.totalQtyReserved += r.qtyReserved - r.qtyReleased - r.qtyConsumed;
    }
  }

  // Compute commercial risk
  for (const [, v] of vendors) {
    v.commercialRisk =
      v.depletedRefs >= 3 || (v.depletedRefs >= 1 && v.pressureRefs >= 2) ? "alto" :
      v.depletedRefs >= 1 || v.pressureRefs >= 3 ? "medio" : "bajo";
  }

  return [...vendors.values()]
    .filter(v => v.depletedRefs > 0 || v.pressureRefs > 0 || v.activeOrders > 0)
    .sort((a, b) => (b.depletedRefs * 3 + b.pressureRefs) - (a.depletedRefs * 3 + a.pressureRefs))
    .slice(0, 20);
}

// ─── Warehouse pressure ───────────────────────────────────────────────────────

function _buildWarehousePressure(
  signals: OperationalDemandSignal[],
): OperationalWarehousePressure[] {
  const wh = new Map<string, OperationalWarehousePressure>();

  for (const sig of signals) {
    if (sig.signalType !== "warehouse_pressure_candidate") continue;
    // Warehouse info lives in signal metadata (set by the demand engine)
    const whId   = (sig as unknown as Record<string, unknown>)?.metadata
      ? ((sig as unknown as Record<string, unknown>).metadata as Record<string, unknown>)?.warehouseId as string ?? "unknown"
      : "unknown";
    const whName = whId;

    const entry = wh.get(whId) ?? {
      warehouseId:      whId,
      warehouseName:    whName,
      refs:             0,
      totalQtyDemanded: 0,
      urgency:          "baja" as const,
    };
    entry.refs++;
    entry.totalQtyDemanded += sig.qtyNeeded ?? 0;
    if (sig.urgency === "alta") entry.urgency = "alta";
    else if (sig.urgency === "media" && entry.urgency !== "alta") entry.urgency = "media";
    wh.set(whId, entry);
  }

  return [...wh.values()].sort((a, b) => b.refs - a.refs).slice(0, 10);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

let _alertSeq = 0;

function _buildAlerts(
  references: OperationalIntelligenceReference[],
  recon:      OperationalReconciliationReport | undefined,
  now:        string,
): OperationalIntelligenceAlert[] {
  const alerts: OperationalIntelligenceAlert[] = [];

  const criticals  = references.filter(r => r.status === "critical").slice(0, 5);
  const negatives  = criticals.filter(r => r.operationalAvailableQty < 0);
  const pressures  = references.filter(r => r.status === "pressure").slice(0, 3);

  if (negatives.length > 0) {
    alerts.push({
      id:       `alert_${++_alertSeq}`,
      severity: "critical",
      title:    `${negatives.length} referencia${negatives.length !== 1 ? "s" : ""} con disponibilidad negativa`,
      body:     `${negatives.map(r => r.reference).join(", ")} tienen disponibilidad operacional negativa. Revisión urgente requerida.`,
      createdAt: now,
    });
  }
  if (criticals.length > negatives.length) {
    const nonNeg = criticals.filter(r => r.operationalAvailableQty >= 0);
    alerts.push({
      id:       `alert_${++_alertSeq}`,
      severity: "critical",
      title:    `${nonNeg.length} referencia${nonNeg.length !== 1 ? "s" : ""} en estado crítico`,
      body:     `${nonNeg.map(r => r.reference).join(", ")} — stock agotado o sobre-reservado.`,
      createdAt: now,
    });
  }
  if (pressures.length > 0) {
    alerts.push({
      id:       `alert_${++_alertSeq}`,
      severity: "warning",
      title:    `${pressures.length} referencia${pressures.length !== 1 ? "s" : ""} bajo presión alta`,
      body:     `${pressures.map(r => r.reference).join(", ")} tienen demanda activa superando disponibilidad.`,
      createdAt: now,
    });
  }
  if (recon && recon.summary.critical > 0) {
    alerts.push({
      id:       `alert_${++_alertSeq}`,
      severity: "critical",
      title:    `${recon.summary.critical} inconsistencia${recon.summary.critical !== 1 ? "s" : ""} crítica${recon.summary.critical !== 1 ? "s" : ""} en inventario`,
      body:     "El motor de reconciliación detectó inconsistencias que pueden afectar la confiabilidad de señales de presión y portafolios.",
      createdAt: now,
    });
  }

  return alerts.slice(0, 8);
}

// ─── Global suggestions ───────────────────────────────────────────────────────

let _sugSeq = 0;

function _buildSuggestions(
  references:    OperationalIntelligenceReference[],
  signals:       OperationalDemandSignal[],
  transfers?:    VendorBagTransferSuggestion[],
  productions?:  ProductionSuggestionFromBags[],
  _now?:         string,
): OperationalIntelligenceSuggestion[] {
  const sugg: OperationalIntelligenceSuggestion[] = [];

  // Transfer suggestions from portfolio engine
  if (transfers) {
    for (const t of transfers.slice(0, 5)) {
      sugg.push({
        id:              `sugg_${++_sugSeq}`,
        type:            "transfer",
        urgency:         t.urgency,
        title:           `Trasladar ${t.qtySuggested} uds de ${t.reference} — ${t.fromSalesRepName} → ${t.toSalesRepName}`,
        reason:          t.reason,
        refs:            [t.reference],
        affectedVendors: [t.fromSalesRepId, t.toSalesRepId],
        qtyImpact:       t.qtySuggested,
      });
    }
  }

  // Production suggestions from portfolio engine
  if (productions) {
    for (const p of productions.slice(0, 5)) {
      sugg.push({
        id:              `sugg_${++_sugSeq}`,
        type:            "production",
        urgency:         p.urgency,
        title:           `Producir ${p.suggestedProductionQty} uds de ${p.reference}`,
        reason:          p.reason,
        refs:            [p.reference],
        affectedVendors: p.affectedSalesRepIds,
        qtyImpact:       p.suggestedProductionQty,
      });
    }
  }

  // Fallback: derive production suggestions from demand signals
  if (!productions || productions.length === 0) {
    const productionSignals = signals
      .filter(s => s.urgency === "alta" && s.qtyNeeded > 0)
      .slice(0, 5);
    for (const sig of productionSignals) {
      sugg.push({
        id:              `sugg_${++_sugSeq}`,
        type:            "production",
        urgency:         sig.urgency === "ninguna" ? "baja" : sig.urgency,
        title:           `Producir ${sig.qtyNeeded} uds de ${sig.reference}`,
        reason:          `Demanda activa supera disponibilidad operacional`,
        refs:            [sig.reference],
        affectedVendors: sig.affectedSalesReps,
        qtyImpact:       sig.qtyNeeded,
      });
    }
  }

  // Missing reservations
  const missingRes = references.filter(
    r => r.activeOrderCount > 0 && r.activeReservationCount === 0 &&
         ["pressure", "warning"].includes(r.status),
  ).slice(0, 3);
  if (missingRes.length > 0) {
    sugg.push({
      id:              `sugg_${++_sugSeq}`,
      type:            "sync",
      urgency:         "media",
      title:           `Sincronizar reservas para ${missingRes.length} referencia${missingRes.length !== 1 ? "s" : ""} con pedidos activos`,
      reason:          "Pedidos activos sin reserva operacional — disponibilidad operacional incorrecta",
      refs:            missingRes.map(r => r.reference),
      affectedVendors: [...new Set(missingRes.flatMap(r => r.relatedVendors))],
    });
  }

  return sugg.sort((a, b) => URGENCY_SORT[a.urgency] - URGENCY_SORT[b.urgency]);
}

const URGENCY_SORT: Record<string, number> = { alta: 0, media: 1, baja: 2, ninguna: 3 };

// ─── Conflicts ────────────────────────────────────────────────────────────────

function _buildConflicts(recon?: OperationalReconciliationReport): OperationalConflict[] {
  if (!recon) return [];
  return recon.issues
    .filter(i => i.severity === "critical" || i.severity === "warning")
    .slice(0, 15)
    .map(i => ({
      id:        i.id,
      type:      i.type,
      severity:  i.severity,
      reference: i.reference,
      message:   i.message,
      fixLabel:  i.suggestedFix.reason.slice(0, 80),
    }));
}

// ─── Pressure summary ─────────────────────────────────────────────────────────

function _buildPressureSummary(
  references: OperationalIntelligenceReference[],
  recon?:     OperationalReconciliationReport,
): OperationalPressureSummary {
  return {
    refsUnderPressure:          references.filter(r => r.status === "pressure" || r.status === "critical").length,
    refsDepleted:               references.filter(r => r.operationalAvailableQty <= 0).length,
    refsOverReserved:           recon?.issues.filter(i => i.type === "over_reserved_reference").length ?? 0,
    refsWithDeadStock:          references.filter(r => r.status === "dead_stock").length,
    refsWithMissingReservation: references.filter(r => r.activeOrderCount > 0 && r.activeReservationCount === 0).length,
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────

function _buildHealth(
  references: OperationalIntelligenceReference[],
  recon?:     OperationalReconciliationReport,
  alerts?:    OperationalIntelligenceAlert[],
): OperationalIntelligenceHealth {
  const criticals = references.filter(r => r.status === "critical").length;
  const pressures = references.filter(r => r.status === "pressure").length;
  const critAlerts = alerts?.filter(a => a.severity === "critical").length ?? 0;

  let score = 100;
  score -= criticals * 10;
  score -= pressures * 4;
  score -= critAlerts * 5;
  if (recon) score = Math.min(score, recon.summary.healthScore + 10);
  score = Math.max(0, Math.min(100, score));

  const isHealthy = criticals === 0 && critAlerts === 0 && (recon?.summary.critical ?? 0) === 0;
  const label =
    score >= 90 ? "Operación estable" :
    score >= 70 ? "Presión operacional moderada" :
    score >= 50 ? "Presión operacional alta" :
    score >= 30 ? "Situación crítica — acción requerida" :
                  "Colapso operacional — intervención urgente";

  return {
    score,
    label,
    isHealthy,
    criticalCount: (alerts ?? []).filter(a => a.severity === "critical").length,
    warningCount:  (alerts ?? []).filter(a => a.severity === "warning").length,
    infoCount:     (alerts ?? []).filter(a => a.severity === "info").length,
  };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function _indexBy<T>(arr: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of arr) map.set(key(item), item);
  return map;
}

function _groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const g = map.get(k) ?? [];
    g.push(item);
    map.set(k, g);
  }
  return map;
}

function _groupByMulti<T>(arr: T[], keys: (item: T) => string[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    for (const k of keys(item)) {
      const g = map.get(k) ?? [];
      g.push(item);
      map.set(k, g);
    }
  }
  return map;
}
