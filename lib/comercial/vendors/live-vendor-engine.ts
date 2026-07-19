/**
 * live-vendor-engine.ts
 *
 * LIVEVENDOR-FOUNDATION-01 — Core engine for assembling LiveVendor profiles.
 * Consumes InventoryLocation, InventoryTransfer, and Commercial Availability.
 * No SAG. No Prisma. No React. Pure domain logic.
 */

import type { InventoryLocation } from "@/lib/logistics/inventory-location-types";
import type { buildLocationResolver } from "@/lib/logistics/location-resolver";
import type { AvailabilityRow, MaletaReplacementRule } from "@/lib/commercial-intelligence/availability-types";
import { CASTILLITOS_REPLACEMENT_RULES } from "@/lib/commercial-intelligence/maleta-replacement-engine";

import type {
  LiveVendorProfile,
  VendorLocationBinding,
  VendorPortfolioSnapshot,
  VendorInventoryItem,
  VendorItemAvailabilityStatus,
  VendorTransferHistory,
  VendorTransferRecord,
  VendorCoverageSummary,
  VendorPortfolioHealth,
  VendorReplacementAnalysis,
  VendorReplacementCandidate,
  ReplacementOption,
  VendorReplacementUrgency,
  VendorDataFreshness,
  VendorOperationalState,
  VendorBusinessEntitySnapshot,
  VendorBusinessAlert,
  VendorBusinessSignalType,
} from "./live-vendor-types";

// ── Phase 2: Vendor Location Binding ────────────────────────────────────────

/** Bind a vendor to their InventoryLocation from the catalog. */
export function bindVendorToLocation(
  vendorId: string,
  locationCode: string,
  resolver: ReturnType<typeof buildLocationResolver>,
): VendorLocationBinding {
  const location = resolver.resolveLocationByCode(locationCode) ?? null;
  return {
    locationCode,
    locationName: location?.name ?? `UNKNOWN(${locationCode})`,
    location,
    confirmed: location !== null && location.sellerId === vendorId,
    evidence: location
      ? [{ type: "LOCATION_CATALOG", description: `Resolved from InventoryLocation catalog`, source: "castillitos-locations.ts" }]
      : [{ type: "MANUAL", description: `Location ${locationCode} not found in catalog`, source: "live-vendor-engine" }],
  };
}

// ── Phase 3: Portfolio Snapshot ──────────────────────────────────────────────

/** Inventory record from Prisma (shape expected by the engine). */
export interface PortfolioInventoryRecord {
  referenceCode: string;
  productName: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
}

/** Build a portfolio snapshot from inventory data and availability. */
export function buildPortfolioSnapshot(opts: {
  vendorId: string;
  vendorName: string;
  locationCode: string;
  locationName: string;
  inventoryRecords: PortfolioInventoryRecord[];
  availabilityRows: AvailabilityRow[];
  lastTransferAt: string | null;
  lastTransferDocument: string | null;
  rules?: MaletaReplacementRule[];
}): VendorPortfolioSnapshot {
  const rules = opts.rules ?? CASTILLITOS_REPLACEMENT_RULES;

  // Index availability by reference
  const availByRef = new Map<string, AvailabilityRow>();
  for (const row of opts.availabilityRows) {
    availByRef.set(row.reference, row);
  }

  const items: VendorInventoryItem[] = opts.inventoryRecords.map((rec) => {
    const avail = availByRef.get(rec.referenceCode);
    const existencia01 = avail?.existenciaBodega01 ?? null;
    const subLinea = avail?.subLinea ?? null;

    // Determine availability status
    let commercialAvailabilityStatus: VendorItemAvailabilityStatus = "unknown";
    if (existencia01 !== null) {
      if (existencia01 === 0) commercialAvailabilityStatus = "out_of_stock";
      else {
        const rule = subLinea ? rules.find((r) => subLinea.toUpperCase().includes(r.subLinea.toUpperCase())) : null;
        const threshold = rule?.threshold ?? 0;
        commercialAvailabilityStatus = existencia01 <= threshold ? "low_stock" : "available";
      }
    }

    // Check replacement required
    let replacementRequired = false;
    if (existencia01 !== null && subLinea) {
      const rule = rules.find((r) => subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
      if (rule && existencia01 <= rule.threshold) {
        replacementRequired = true;
      }
    }

    return {
      referenceCode: rec.referenceCode,
      description: rec.productName,
      subGrupo: avail?.subGrupo ?? null,
      subLinea,
      size: rec.size,
      color: rec.color,
      quantityInPortfolio: rec.quantity,
      quantityAvailableInMainWarehouse: existencia01,
      commercialAvailabilityStatus,
      replacementRequired,
      evidence: avail
        ? [{ type: "AVAILABILITY_DATA" as const, description: `Bodega 01: ${existencia01}`, source: "commercial-availability" }]
        : [{ type: "MANUAL" as const, description: "No availability data for this reference", source: "live-vendor-engine" }],
    };
  });

  const hasData = items.length > 0;
  return {
    vendorId: opts.vendorId,
    vendorName: opts.vendorName,
    locationCode: opts.locationCode,
    locationName: opts.locationName,
    totalReferences: new Set(items.map((i) => i.referenceCode)).size,
    totalUnits: items.reduce((sum, i) => sum + i.quantityInPortfolio, 0),
    items,
    lastTransferAt: opts.lastTransferAt,
    lastTransferDocument: opts.lastTransferDocument,
    freshness: {
      portfolioLastUpdated: new Date().toISOString(),
      transfersLastUpdated: opts.lastTransferAt,
      availabilityLastUpdated: opts.availabilityRows.length > 0 ? new Date().toISOString() : null,
      overall: hasData ? "fresh" : "unknown",
    },
    confidence: hasData ? "medium" : "unknown",
  };
}

// ── Phase 4: Transfer History ───────────────────────────────────────────────

/** Raw transfer record from Prisma (shape expected by the engine). */
export interface RawTransferRecord {
  id: string;
  documentNumber: string;
  transferType: string;
  originWarehouseCode: string | null;
  destinationWarehouseCode: string | null;
  documentDate: Date;
  isClosed: boolean;
  lineCount: number;
  totalQuantity: number;
}

/** Build transfer history from raw transfer records. */
export function buildTransferHistory(
  vendorId: string,
  locationCode: string,
  transfers: RawTransferRecord[],
): VendorTransferHistory {
  const records: VendorTransferRecord[] = transfers.map((t) => {
    const isInbound = t.destinationWarehouseCode === locationCode;
    return {
      transferId: t.id,
      documentNumber: t.documentNumber,
      direction: isInbound ? "inbound" : "outbound",
      transferType: (t.transferType === "TM" || t.transferType === "TR" ? t.transferType : "TR") as "TM" | "TR",
      originCode: t.originWarehouseCode ?? "",
      destinationCode: t.destinationWarehouseCode ?? "",
      documentDate: t.documentDate.toISOString(),
      totalQuantity: t.totalQuantity,
      lineCount: t.lineCount,
      isClosed: t.isClosed,
    };
  });

  const inbound = records.filter((r) => r.direction === "inbound");
  const outbound = records.filter((r) => r.direction === "outbound");

  // Sort by date desc for last dates
  const sortedInbound = [...inbound].sort((a, b) => b.documentDate.localeCompare(a.documentDate));
  const sortedOutbound = [...outbound].sort((a, b) => b.documentDate.localeCompare(a.documentDate));

  return {
    vendorId,
    locationCode,
    totalInboundTransfers: inbound.length,
    totalOutboundTransfers: outbound.length,
    totalUnitsReceived: inbound.reduce((sum, r) => sum + r.totalQuantity, 0),
    totalUnitsReturned: outbound.reduce((sum, r) => sum + r.totalQuantity, 0),
    recentTransfers: records.slice(0, 20), // Last 20 transfers
    lastInboundAt: sortedInbound[0]?.documentDate ?? null,
    lastOutboundAt: sortedOutbound[0]?.documentDate ?? null,
  };
}

// ── Phase 5: Replacement Intelligence ───────────────────────────────────────

/** Analyze vendor portfolio for replacement needs based on CEO rules. */
export function analyzeVendorReplacements(opts: {
  vendorId: string;
  vendorName: string;
  locationCode: string;
  portfolioItems: VendorInventoryItem[];
  availabilityRows: AvailabilityRow[];
  rules?: MaletaReplacementRule[];
}): VendorReplacementAnalysis {
  const rules = opts.rules ?? CASTILLITOS_REPLACEMENT_RULES;
  const candidates: VendorReplacementCandidate[] = [];

  // Index availability by reference for replacement candidate search
  const availByRef = new Map<string, AvailabilityRow>();
  for (const row of opts.availabilityRows) {
    availByRef.set(row.reference, row);
  }

  // Index availability by subGrupo for replacement search
  const availBySubGrupo = new Map<string, AvailabilityRow[]>();
  for (const row of opts.availabilityRows) {
    const group = row.subGrupo;
    if (!availBySubGrupo.has(group)) availBySubGrupo.set(group, []);
    availBySubGrupo.get(group)!.push(row);
  }

  for (const item of opts.portfolioItems) {
    if (!item.replacementRequired) continue;
    if (!item.subLinea || !item.subGrupo) continue;

    const existencia = item.quantityAvailableInMainWarehouse ?? 0;
    const rule = rules.find((r) => item.subLinea!.toUpperCase().includes(r.subLinea.toUpperCase()));
    if (!rule) continue;

    const urgency = deriveUrgency(existencia, rule.threshold);
    const motivo = existencia === 0
      ? `Sin existencia en Bodega 01 — ${item.subLinea} agotada`
      : `Existencia (${existencia}) por debajo del umbral ${item.subLinea} (${rule.threshold})`;

    // Find replacement candidates from same SubGrupo
    const replacements = findReplacementCandidatesSameSubGrupo(
      item.referenceCode,
      item.subGrupo,
      item.subLinea,
      rule.threshold,
      availBySubGrupo,
    );

    candidates.push({
      referenceCode: item.referenceCode,
      description: item.description,
      existenciaBodega01: existencia,
      subLinea: item.subLinea,
      subGrupo: item.subGrupo,
      motivo,
      urgency,
      replacementCandidates: replacements,
    });
  }

  return {
    vendorId: opts.vendorId,
    vendorName: opts.vendorName,
    locationCode: opts.locationCode,
    itemsRequiringReplacement: candidates,
    totalAnalyzed: opts.portfolioItems.length,
    rulesApplied: rules,
    computedAt: new Date().toISOString(),
  };
}

function deriveUrgency(existencia: number, threshold: number): VendorReplacementUrgency {
  if (existencia === 0) return "critical";
  if (existencia <= threshold * 0.3) return "high";
  if (existencia <= threshold * 0.7) return "medium";
  return "low";
}

/**
 * Find replacement candidates within the same SubGrupo.
 * Returns references that have sufficient stock in Bodega 01.
 */
export function findReplacementCandidatesSameSubGrupo(
  currentReference: string,
  subGrupo: string,
  subLinea: string,
  threshold: number,
  availBySubGrupo: Map<string, AvailabilityRow[]>,
): ReplacementOption[] {
  const sameGroup = availBySubGrupo.get(subGrupo) ?? [];

  return sameGroup
    .filter((row) =>
      row.reference !== currentReference &&
      row.existenciaBodega01 > threshold &&
      row.subLinea.toUpperCase().includes(subLinea.toUpperCase()),
    )
    .sort((a, b) => b.existenciaBodega01 - a.existenciaBodega01)
    .slice(0, 5)
    .map((row) => ({
      referenceCode: row.reference,
      description: row.description,
      subGrupo: row.subGrupo,
      subLinea: row.subLinea,
      existenciaBodega01: row.existenciaBodega01,
      reason: `Mismo SubGrupo (${subGrupo}) con existencia ${row.existenciaBodega01} > umbral ${threshold}`,
    }));
}

// ── Phase 6: Coverage Summary ───────────────────────────────────────────────

/** Compute coverage summary from portfolio snapshot. */
export function computeVendorCoverage(
  portfolio: VendorPortfolioSnapshot,
  transferHistory: VendorTransferHistory,
): VendorCoverageSummary {
  const items = portfolio.items;
  const totalReferences = portfolio.totalReferences;
  const criticalReferences = items.filter((i) => i.commercialAvailabilityStatus === "low_stock").length;
  const outOfStockReferences = items.filter((i) => i.commercialAvailabilityStatus === "out_of_stock").length;
  const replacementRequiredReferences = items.filter((i) => i.replacementRequired).length;
  const unknownReferences = items.filter((i) => i.commercialAvailabilityStatus === "unknown").length;

  const lastReplenishmentAt = transferHistory.lastInboundAt;
  let daysSinceLastReplenishment: number | null = null;
  if (lastReplenishmentAt) {
    const diff = Date.now() - new Date(lastReplenishmentAt).getTime();
    daysSinceLastReplenishment = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  const health = derivePortfolioHealth(
    totalReferences,
    criticalReferences,
    outOfStockReferences,
    unknownReferences,
    daysSinceLastReplenishment,
  );

  return {
    totalReferences,
    criticalReferences,
    outOfStockReferences,
    replacementRequiredReferences,
    unknownReferences,
    lastReplenishmentAt,
    daysSinceLastReplenishment,
    health,
  };
}

function derivePortfolioHealth(
  total: number,
  critical: number,
  outOfStock: number,
  unknown: number,
  daysSinceReplenishment: number | null,
): VendorPortfolioHealth {
  if (total === 0) return "unknown";
  if (unknown === total) return "unknown";

  const problemRate = (critical + outOfStock) / total;

  // Critical: >30% problem refs OR >14 days since replenishment
  if (problemRate > 0.3 || (daysSinceReplenishment !== null && daysSinceReplenishment > 14)) {
    return "critical";
  }

  // Attention needed: >10% problem refs OR >7 days since replenishment
  if (problemRate > 0.1 || (daysSinceReplenishment !== null && daysSinceReplenishment > 7)) {
    return "attention_needed";
  }

  return "healthy";
}

// ── Phase 7: Business Entity Snapshot Adapter ───────────────────────────────

/** Convert a LiveVendorProfile to a BusinessEntitySnapshot shape. */
export function liveVendorToBusinessEntitySnapshot(
  profile: LiveVendorProfile,
): VendorBusinessEntitySnapshot {
  const alerts: VendorBusinessAlert[] = [];

  // Generate alerts from coverage
  if (profile.coverage.outOfStockReferences > 0) {
    alerts.push({
      type: "VENDOR_REFERENCE_OUT_OF_STOCK",
      severity: profile.coverage.outOfStockReferences > 3 ? "critical" : "high",
      message: `${profile.coverage.outOfStockReferences} referencia(s) sin stock en Bodega 01`,
      referenceCode: null,
    });
  }

  if (profile.coverage.replacementRequiredReferences > 0) {
    alerts.push({
      type: "VENDOR_REPLACEMENT_REQUIRED",
      severity: "medium",
      message: `${profile.coverage.replacementRequiredReferences} referencia(s) requieren reemplazo`,
      referenceCode: null,
    });
  }

  if (profile.coverage.daysSinceLastReplenishment !== null && profile.coverage.daysSinceLastReplenishment > 14) {
    alerts.push({
      type: "VENDOR_PORTFOLIO_STALE",
      severity: profile.coverage.daysSinceLastReplenishment > 30 ? "critical" : "high",
      message: `${profile.coverage.daysSinceLastReplenishment} dias sin reposicion de maleta`,
      referenceCode: null,
    });
  }

  return {
    entityType: "vendor",
    entityId: profile.vendorId,
    entityName: profile.vendorName,
    health: profile.coverage.health,
    operationalState: profile.operationalState,
    metrics: {
      totalReferences: profile.portfolio.totalReferences,
      totalUnits: profile.portfolio.totalUnits,
      criticalReferences: profile.coverage.criticalReferences,
      outOfStockReferences: profile.coverage.outOfStockReferences,
      daysSinceLastReplenishment: profile.coverage.daysSinceLastReplenishment,
      inboundTransfers30d: profile.transferHistory.totalInboundTransfers,
    },
    alerts,
    recommendations: [],
    relations: [],
    assembledAt: profile.assembledAt,
  };
}

// ── Assemble Full Profile ───────────────────────────────────────────────────

/** Assemble a complete LiveVendorProfile from all data sources. */
export function assembleLiveVendorProfile(opts: {
  vendorId: string;
  vendorName: string;
  locationBinding: VendorLocationBinding;
  portfolio: VendorPortfolioSnapshot;
  transferHistory: VendorTransferHistory;
}): LiveVendorProfile {
  const coverage = computeVendorCoverage(opts.portfolio, opts.transferHistory);

  let operationalState: VendorOperationalState = "unknown";
  if (opts.portfolio.items.length > 0 && opts.transferHistory.totalInboundTransfers > 0) {
    operationalState = coverage.health === "unknown" ? "stale" : "active";
  } else if (opts.locationBinding.confirmed) {
    operationalState = "unsynced";
  }

  const freshness: VendorDataFreshness = {
    portfolioLastUpdated: opts.portfolio.freshness.portfolioLastUpdated,
    transfersLastUpdated: opts.transferHistory.lastInboundAt ?? opts.transferHistory.lastOutboundAt,
    availabilityLastUpdated: opts.portfolio.freshness.availabilityLastUpdated,
    overall: operationalState === "active" ? "fresh" : operationalState === "stale" ? "stale" : "unknown",
  };

  return {
    vendorId: opts.vendorId,
    vendorName: opts.vendorName,
    location: opts.locationBinding,
    portfolio: opts.portfolio,
    transferHistory: opts.transferHistory,
    coverage,
    freshness,
    operationalState,
    assembledAt: new Date().toISOString(),
  };
}
