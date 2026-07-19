/**
 * lib/comercial/maletas/maletas-runtime.ts
 *
 * Server-side runtime orchestrator for the Maletas module.
 * Calls Excel bootstrap → normalizes → runs intelligence engine.
 * Returns a fully computed, serializable MaletasOperationalContext.
 *
 * V1: Excel bootstrap (MALETAS_EXCEL_PATH + DISPONIBLE_EXCEL_PATH env vars).
 * V2: Replace loadMaletasExcelData() with Prisma queries — engine stays identical.
 *
 * NEVER import this in client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-RUNTIME-01
 */

import { loadMaletasExcelData } from "./maletas-excel-bootstrap";
import {
  getVendorRegistry,
  getDerroteroRules,
  buildAvailabilityMap,
  buildPendingOrdersMap,
} from "./maletas-normalizer";
import { buildMaletasOperationalContext } from "./maletas-engine";
import {
  readSagSnapshotFromPrisma,
  assembleEngineInput,
} from "./sag-prisma-reader";
import { readSagSnapshotFromSaleRecord } from "./sag-sale-record-reader";
import type {
  MaletasOperationalContext,
  MaletasEngineInput,
} from "./maletas-types";

// ─── Runtime result ───────────────────────────────────────────────────────────

export interface MaletasRuntimeResult {
  context: MaletasOperationalContext;
  source: "excel" | "prisma" | "empty";
  loadedAt: string;        // ISO timestamp
  excelAvailable: boolean;
  warnings: string[];
}

export interface MaletasRuntimeKpis {
  coverageAvgDays: number | null;
  coverageCritical: number;
  coverageLow: number;
  operationalPressure: number;
  productionRecommendations: number;
  readyToReplenish: number;
  totalReferences: number;
  activeSalesReps: number;
  hotRefs: number;
  deadStockRefs: number;
  strongestLine: string | null;
  weakestLine: string | null;
}

// ─── Main runtime builder ─────────────────────────────────────────────────────

/**
 * Build the full Maletas operational runtime for a given org.
 * Safe to call from any Server Component — gracefully degrades if Excel not found.
 */
export async function buildMaletasRuntime(
  orgId: string,
  opts: {
    maletasPath?: string;
    disponiblePath?: string;
  } = {},
): Promise<MaletasRuntimeResult> {
  const warnings: string[] = [];
  const loadedAt = new Date().toISOString();

  // ── Try Prisma SAG snapshot first (V2 path) ───────────────────────────────────
  // Reads CommercialCoverageSnapshot + CommercialCaseItem (latest per ref).
  // Falls through to Excel when no Prisma data exists for this org.
  const sagSnapshot = await readSagSnapshotFromPrisma(orgId);

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[maletas-runtime] fuente elegida:",
      sagSnapshot !== null ? "prisma" : "excel/empty",
      "| orgId:", orgId,
    );
  }

  if (sagSnapshot !== null) {
    const engineInput = assembleEngineInput(sagSnapshot, {
      orgId,
      salesReps: getVendorRegistry(orgId),
      rules:     getDerroteroRules(),
    });

    const context = buildMaletasOperationalContext(engineInput);

    return {
      context,
      source:         "prisma",
      loadedAt:       sagSnapshot.snapshotAt, // when the SAG snapshot was taken
      excelAvailable: false,
      warnings:       [],
    };
  }

  // ── Try SaleRecord-based adapter (V2b fallback — when Prisma snapshot empty) ──
  // Returns non-null only when SaleRecord has product-level data (productCode != null).
  // Currently null for castillitos: SAG import has financial headers only (no productCode).
  const saleRecordSnapshot = await readSagSnapshotFromSaleRecord(orgId);

  if (saleRecordSnapshot !== null) {
    const engineInput = assembleEngineInput(saleRecordSnapshot, {
      orgId,
      salesReps: getVendorRegistry(orgId),
      rules:     getDerroteroRules(),
    });

    const context = buildMaletasOperationalContext(engineInput);

    return {
      context,
      source:         "prisma", // SaleRecord is a Prisma source
      loadedAt:       saleRecordSnapshot.snapshotAt,
      excelAvailable: false,
      warnings:       ["Fuente: SaleRecord (productCode disponible). CommercialCoverageSnapshot no poblado."],
    };
  }

  // ── Load Excel data (V1 fallback) ────────────────────────────────────────────
  const excelData = await loadMaletasExcelData({
    maletasPath: opts.maletasPath,
    disponiblePath: opts.disponiblePath,
  });

  if (!excelData) {
    warnings.push(
      "Excel files not found. Set MALETAS_EXCEL_PATH and DISPONIBLE_EXCEL_PATH env vars.",
    );

    // Return empty context — engine runs with zero rows
    const emptyContext = buildMaletasOperationalContext({
      orgId,
      salesReps: getVendorRegistry(orgId),
      ltRows: [],
      csRows: [],
      availability: new Map(),
      rules: getDerroteroRules(),
    });

    return {
      context: emptyContext,
      source: "empty",
      loadedAt,
      excelAvailable: false,
      warnings,
    };
  }

  // ── Build engine input ───────────────────────────────────────────────────────
  const salesReps = getVendorRegistry(orgId);
  const rules = getDerroteroRules();
  const availMap = buildAvailabilityMap(excelData.availability);

  // Extract pending orders from availability (pedidos column = SAG PD reservas)
  const pendingOrdersMap = buildPendingOrdersMap(availMap);

  const engineInput: MaletasEngineInput = {
    orgId,
    salesReps,
    ltRows:          excelData.ltRows,
    csRows:          excelData.csRows,
    availability:    availMap,
    rules,
    pendingOrdersMap, // commercial demand pressure from SAG PD source
    // salesHints: [] — V2: load from SaleRecord Prisma query via maletas-sag-adapter
    // coverageSnapshots: [] — V2: load from CommercialInventorySnapshot history
  };

  // ── Run engine ───────────────────────────────────────────────────────────────
  const context = buildMaletasOperationalContext(engineInput);

  return {
    context,
    source: "excel",
    loadedAt,
    excelAvailable: true,
    warnings,
  };
}

// ─── KPI extractor ────────────────────────────────────────────────────────────

/**
 * Extract flat KPIs from the operational context for the page header.
 */
export function extractMaletasKpis(
  context: MaletasOperationalContext,
): MaletasRuntimeKpis {
  const intel = context.intelligence;

  return {
    totalReferences: context.summary.totalReferences,
    activeSalesReps: context.summary.activeSalesReps,
    coverageCritical: intel?.intelligenceSummary.coverageCritical ?? 0,
    coverageLow: intel?.intelligenceSummary.coverageLow ?? 0,
    operationalPressure: intel?.operationalPressure ?? 0,
    productionRecommendations: context.summary.productionRecommendations,
    readyToReplenish: context.summary.readyToReplenish,
    hotRefs: intel?.intelligenceSummary.hotRefs ?? 0,
    deadStockRefs: intel?.intelligenceSummary.deadStockRefs ?? 0,
    coverageAvgDays: intel?.intelligenceSummary.avgCoverageDays ?? null,
    strongestLine: intel?.intelligenceSummary.strongestLine ?? null,
    weakestLine: intel?.intelligenceSummary.weakestLine ?? null,
  };
}

// ─── Serialization helper ─────────────────────────────────────────────────────

/**
 * Convert MaletasOperationalContext to a fully JSON-safe plain object.
 * Required before passing through Next.js Server → Client boundary.
 * (The context is already serializable, but this function is explicit about it.)
 */
export function serializeMaletasContext(
  context: MaletasOperationalContext,
): MaletasOperationalContext {
  return JSON.parse(JSON.stringify(context)) as MaletasOperationalContext;
}
