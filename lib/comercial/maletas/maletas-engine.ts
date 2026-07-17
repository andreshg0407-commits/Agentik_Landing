/**
 * lib/comercial/maletas/maletas-engine.ts
 *
 * Central operational engine for the Maletas commercial module.
 *
 * Takes normalized input (vendor registry, case rows, availability map, rules)
 * and produces a fully computed MaletasOperationalContext — serializable, deterministic,
 * prepared for Copilot/David consumption.
 *
 * No Prisma. No Excel. No side effects. No org-specific hardcoding.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

import type {
  MaletasEngineInput,
  MaletasOperationalContext,
  MaletasIntelligenceContext,
  SalesRep,
  CommercialCase,
  CaseItem,
  CaseAlert,
  ProductionRecommendation,
  RawCaseRow,
  CommercialCaseLine,
} from "./maletas-types";

import {
  computeItemStatus,
  computeRecommendedAction,
  computeAlertSeverity,
  computeAlertType,
  buildAlertReason,
  computeMultiVendorBoost,
  computeSuggestedProductionQty,
  computeProductionPriority,
  shouldAlertOnEnProceso,
} from "./maletas-rules";

import { sortAlerts, computeAggregatePressure } from "./maletas-priority";

// Intelligence layer imports
import { computeSalesIntelligence } from "./maletas-sales-intelligence";
import {
  buildCoverageSignals,
  computeAvgCoverageDays,
  buildCoverageEvolution,
} from "./maletas-coverage";
import { buildProductionSignals, computeProductionPressure } from "./maletas-production";
import { buildDemandPressureSignals } from "../demand/production-pressure";
import { detectDeadStock } from "./maletas-deadstock";
import { buildSalesRepProfiles } from "./maletas-salesrep-profile";
import { buildCopilotSignals } from "./maletas-copilot-signals";
import type {
  MaletasIntelligenceSummary,
  CoverageEvolution,
} from "./maletas-intelligence-types";

// ─── Main entry point ─────────────────────────────────────────────────────────

export function buildMaletasOperationalContext(
  input: MaletasEngineInput,
): MaletasOperationalContext {
  const { orgId, salesReps, ltRows, csRows, availability } = input;

  const allItems: CaseItem[] = [];
  const allAlerts: CaseAlert[] = [];

  // Process LT and CS rows
  const lineConfigs: Array<{ line: CommercialCaseLine; rows: RawCaseRow[] }> = [
    { line: "LT", rows: ltRows },
    { line: "CS", rows: csRows },
  ];

  for (const { line, rows } of lineConfigs) {
    for (const row of rows) {
      const availRecord = availability.get(row.ref.toUpperCase());
      // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 1:
      // Absence of availability record ≠ zero inventory.
      // Only use real values when data exists; otherwise mark as unknown.
      const hasAvailabilityData = availRecord !== undefined;
      const currentUnits = availRecord?.disponible ?? 0;
      const inventario = availRecord?.inventario ?? 0;
      const pedidos = availRecord?.pedidos ?? 0;

      // availableToReplenish: same as currentUnits from availability source
      // In V2, this may differ if we have a separate "DISPONIBLE PARA MALETA" query
      const availableToReplenish = Math.max(0, currentUnits);

      const productionInProcess = row.batches.length > 0;
      const productionBatchLabel =
        row.batches.length > 0 ? row.batches[row.batches.length - 1] : null;

      const minimumRequired = 1; // item-level minimum is always 1

      // When availability data is absent, force "ok" to prevent false alerts.
      // The zero currentUnits is still set (for display) but won't trigger actions.
      const status = hasAvailabilityData
        ? computeItemStatus(currentUnits, minimumRequired, productionInProcess)
        : "ok" as const;
      const recommendedAction = computeRecommendedAction(
        status,
        availableToReplenish,
        productionInProcess,
      );
      const missingUnits = Math.max(0, minimumRequired - currentUnits);

      const assignedToSalesReps = salesReps
        .filter((rep) => row.vendors[rep.name.toUpperCase()] === true)
        .map((rep) => rep.id);

      const item: CaseItem = {
        reference: row.ref,
        description: row.desc,
        line,
        assignedToSalesReps,
        currentUnits,
        minimumRequired,
        missingUnits,
        availableToReplenish,
        productionInProcess,
        productionBatchLabel,
        status,
        recommendedAction,
      };

      allItems.push(item);

      // Generate alerts for each assigned vendor
      if (status !== "ok") {
        for (const repId of assignedToSalesReps) {
          const rep = salesReps.find((r) => r.id === repId);
          if (!rep) continue;

          // For en_proceso, only alert if missing is severe
          if (
            status === "en_proceso" &&
            !shouldAlertOnEnProceso(missingUnits, minimumRequired)
          ) {
            continue;
          }

          const alertType = computeAlertType(status);
          if (!alertType) continue;

          const severity = computeAlertSeverity(status, missingUnits);

          const alert: CaseAlert = {
            id: `${repId}_${line}_${row.ref}`,
            type: alertType,
            severity,
            reference: row.ref,
            description: row.desc,
            salesRepId: repId,
            salesRepName: rep.name,
            line,
            reason: buildAlertReason(status, currentUnits, minimumRequired, productionBatchLabel),
            recommendedAction,
            currentUnits,
            minimumRequired,
            availableToReplenish,
          };

          allAlerts.push(alert);
        }
      }
    }
  }

  // ── Build CommercialCase summaries per salesRep × line ──────────────────────

  const cases: CommercialCase[] = [];
  const activeSalesReps = salesReps.filter((r) => r.active);

  for (const rep of activeSalesReps) {
    for (const { line } of lineConfigs) {
      const repItems = allItems.filter(
        (i) => i.line === line && i.assignedToSalesReps.includes(rep.id),
      );

      if (repItems.length === 0) continue;

      const repAlerts = allAlerts.filter(
        (a) => a.salesRepId === rep.id && a.line === line,
      );

      const criticalCount = repAlerts.filter((a) => a.severity === "urgente").length;
      const okCount = repItems.filter((i) => i.status === "ok").length;

      cases.push({
        id: `${rep.id}_${line}`,
        salesRepId: rep.id,
        salesRepName: rep.name,
        line,
        status: "active",
        itemCount: repItems.length,
        alertCount: repAlerts.length,
        criticalCount,
        okCount,
      });
    }
  }

  // ── Build ProductionRecommendations ─────────────────────────────────────────

  // Group items that need production (PRODUCIR action) by reference
  const productionMap = new Map<
    string,
    { item: CaseItem; affectedReps: string[] }
  >();

  for (const item of allItems) {
    if (item.recommendedAction !== "PRODUCIR") continue;

    const existing = productionMap.get(item.reference);
    if (existing) {
      // Merge affected reps
      for (const repId of item.assignedToSalesReps) {
        if (!existing.affectedReps.includes(repId)) {
          existing.affectedReps.push(repId);
        }
      }
    } else {
      productionMap.set(item.reference, {
        item,
        affectedReps: [...item.assignedToSalesReps],
      });
    }
  }

  const productionRecommendations: ProductionRecommendation[] = [];
  for (const [ref, { item, affectedReps }] of productionMap) {
    const totalMissing = affectedReps.length * item.missingUnits;
    const boost = computeMultiVendorBoost(affectedReps.length);
    const suggestedQty = computeSuggestedProductionQty(Math.ceil(totalMissing * boost));
    const priority = computeProductionPriority(
      affectedReps.length,
      totalMissing,
      item.availableToReplenish,
    );

    productionRecommendations.push({
      reference: ref,
      description: item.description,
      line: item.line,
      affectedSalesReps: affectedReps,
      totalMissing,
      availableToReplenish: item.availableToReplenish,
      suggestedProductionQty: suggestedQty,
      priority,
    });
  }

  // Sort production recommendations by priority (ascending = highest first)
  productionRecommendations.sort((a, b) => a.priority - b.priority);

  // ── Summary ─────────────────────────────────────────────────────────────────

  const sortedAlerts = sortAlerts(allAlerts);

  const criticalCases = cases.filter((c) => c.criticalCount > 0).length;
  const lowStockItems = allItems.filter(
    (i) => i.status === "bajo_minimo" || i.status === "sin_stock",
  ).length;
  const readyToReplenish = allItems.filter(
    (i) => i.recommendedAction === "REPONER_MALETA",
  ).length;

  // Deduplicate references across lines for totalReferences count
  const uniqueRefs = new Set(allItems.map((i) => i.reference));

  // ── Intelligence layer ───────────────────────────────────────────────────────

  const salesHints = input.salesHints ?? [];
  const coverageSnapshots = input.coverageSnapshots ?? [];

  // Velocity map (empty if no SAG hints — all refs get "sin_rotacion_conocida")
  const velocityMap = computeSalesIntelligence(
    salesHints,
    ltRows,
    csRows,
    salesReps,
  );

  // Pending orders map: from engine input (SAG PD source) or empty
  const pendingOrdersMap = input.pendingOrdersMap ?? new Map<string, number>();

  // Coverage signals for all items (with pending order pressure when available)
  const coverageSignals = buildCoverageSignals(allItems, velocityMap, pendingOrdersMap);

  // Production signals (enriched from alerts + coverage + PD demand pressure)
  const productionSignals = buildProductionSignals(
    allItems,
    sortedAlerts,
    coverageSignals,
    pendingOrdersMap.size > 0 ? pendingOrdersMap : undefined,
  );

  // PD demand pressure signals (only when pending orders exist)
  const pdDemandSignals =
    pendingOrdersMap.size > 0
      ? buildDemandPressureSignals(coverageSignals, pendingOrdersMap)
      : undefined;

  // Dead stock detection
  const deadStockSignals = detectDeadStock(allItems, velocityMap, coverageSignals);

  // Sales rep profiles per line
  const ltProfiles = buildSalesRepProfiles(
    activeSalesReps, allItems, sortedAlerts, coverageSignals, velocityMap, "LT",
  );
  const csProfiles = buildSalesRepProfiles(
    activeSalesReps, allItems, sortedAlerts, coverageSignals, velocityMap, "CS",
  );
  const allProfiles = [...ltProfiles, ...csProfiles];

  // Copilot signals (includes PD demand signals when pendingOrdersMap is populated)
  const copilotSignals = buildCopilotSignals(
    coverageSignals,
    productionSignals,
    deadStockSignals,
    allProfiles,
    velocityMap,
    pendingOrdersMap.size > 0 ? pendingOrdersMap : undefined,
  );

  // Temporal evolution from snapshots
  const trends: CoverageEvolution[] = [];
  if (coverageSnapshots.length > 0) {
    const byRef = new Map<string, typeof coverageSnapshots>();
    for (const snap of coverageSnapshots) {
      const key = snap.refCode.toUpperCase();
      if (!byRef.has(key)) byRef.set(key, []);
      byRef.get(key)!.push(snap);
    }
    for (const [refCode, snaps] of byRef) {
      const item = allItems.find((i) => i.reference.toUpperCase() === refCode);
      if (!item) continue;
      trends.push(
        buildCoverageEvolution(snaps, refCode, item.description, item.line),
      );
    }
  }

  // Intelligence summary
  const avgCovDays = computeAvgCoverageDays(coverageSignals);
  const coverageCritical = coverageSignals.filter(
    (cs) => cs.status === "ruptura_inminente" || cs.status === "sin_stock",
  ).length;
  const coverageLow = coverageSignals.filter(
    (cs) => cs.status === "cobertura_baja",
  ).length;
  const hotRefs = [...velocityMap.values()].filter(
    (v) => v.classification === "caliente",
  ).length;

  // Strongest demand line from velocity map
  const lineCounts = new Map<CommercialCaseLine, number>();
  for (const v of velocityMap.values()) {
    if (v.classification === "caliente" || v.classification === "activa") {
      lineCounts.set(v.line, (lineCounts.get(v.line) ?? 0) + 1);
    }
  }
  const strongestDemandLines = [...lineCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([line]) => line);

  // Weakest line (most dead stock)
  const deadByLine = new Map<CommercialCaseLine, number>();
  for (const d of deadStockSignals) {
    deadByLine.set(d.line, (deadByLine.get(d.line) ?? 0) + 1);
  }
  const weakestLine =
    deadByLine.size > 0
      ? ([...deadByLine.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
      : null;

  const intelligenceSummary: MaletasIntelligenceSummary = {
    coverageCritical,
    coverageLow,
    hotRefs,
    deadStockRefs: deadStockSignals.length,
    avgCoverageDays: avgCovDays !== null ? Math.round(avgCovDays) : null,
    strongestLine: strongestDemandLines[0] ?? null,
    weakestLine,
    operationalPressure: computeProductionPressure(productionSignals),
  };

  const intelligence: MaletasIntelligenceContext = {
    coverage: coverageSignals,
    productionSignals,
    deadStockSignals,
    salesRepProfiles: allProfiles,
    copilotSignals,
    intelligenceSummary,
    operationalPressure: intelligenceSummary.operationalPressure,
    strongestDemandLines,
    trends,
    ...(pdDemandSignals && { pdDemandSignals }),
  };

  return {
    orgId,
    generatedAt: new Date().toISOString(),
    summary: {
      totalReferences: uniqueRefs.size,
      activeSalesReps: activeSalesReps.length,
      criticalCases,
      lowStockItems,
      productionRecommendations: productionRecommendations.length,
      readyToReplenish,
    },
    salesReps: activeSalesReps,
    cases,
    items: allItems,
    alerts: sortedAlerts,
    productionRecommendations,
    intelligence,
  };
}
