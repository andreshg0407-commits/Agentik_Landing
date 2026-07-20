/**
 * vendor-sample-loader.ts
 *
 * VENDOR-SAMPLE-REPLACEMENT-INTELLIGENCE-01
 * VENDOR-SAMPLE-SUBGROUP-REPLACEMENT-ENGINE-01
 * VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01
 *
 * 2-state model: SALUDABLE (disponible > minimo) | REEMPLAZAR (disponible <= minimo)
 * Subgrupo SAG is the primary unit of replacement decision.
 * Multi-option replacement engine: up to 10 candidates per ref.
 * Priority: same subgrupo SAG > same line (fallback when subgrupoId null).
 * "Sugerir produccion" only for LT/CS when no bodega+OP options exist.
 *
 * IMPORT/ACCESSORY scarcity (IMPORT-SCARCITY-ENGINE-01):
 *   productLine=5 refs use B36+B37 availability, threshold=10.
 *   IMPORT refs are EXCLUDED from the replacement engine and production suggestions.
 *   Scarcity-only: escasez → DEJAR_DE_VENDER.
 *
 * RECOMPRA NO SE IMPLEMENTA en este sprint.
 *   La lógica de recompra automática (detección de agotamiento import → generación
 *   de orden de compra al proveedor internacional) queda fuera de alcance.
 *   Futuro sprint: ACCESSORY-REPLENISHMENT-INTELLIGENCE-01.
 */

import { prisma } from "@/lib/prisma";
import { LINE_TO_BRAND, SAG_LINE_FK_MAP } from "@/lib/comercial/line-map";
import { loadSagTestEnv } from "@/lib/sag/env";
import {
  fetchAllVendorPresence,
  fetchSubgruposLookup,
  fetchSubgrupoToGrupoLookup,
  VENDOR_BODEGA_CONFIGS,
} from "./vendor-sample-presence-engine";
import type { VendorPresenceResult } from "./vendor-sample-presence-engine";
import type {
  VendorSampleSnapshot,
  VendorSampleRef,
  VendorReplacementOption,
  VendorOpReplacementOption,
  VendorHealth,
  SampleState,
  SampleCommercialHealth,
  MaletasExecutiveSummary,
  CoverageGapRef,
  ProductionSuggestion,
  SupplyActionType,
} from "./vendor-sample-types";
import {
  isEligibleForProductionSuggestion,
  getMinimumForLine,
  IMPORT_SCARCITY_MINIMUM,
  IMPORT_SOURCE_WAREHOUSES,
  DEFAULT_SUBGROUP_MINIMUM_REFS,
} from "./vendor-sample-types";
import type { AccessoryScarcityState, AccessorySummary } from "./vendor-sample-types";
import { loadEffectiveMinimumRefsMap, loadVendorActivationOverrides } from "./vendor-bag-ideal-route-service";
import { buildCommercialIntelligence } from "./maletas-commercial-intelligence";
import type { MaletasCommercialIntelligenceResult } from "./maletas-commercial-intelligence-types";
import { applyActivationOverrides } from "./vendor-sample-presence-engine";
import {
  evaluateVendorAssortment,
  evaluateProductionThresholds,
  evaluateImportRefs,
  findBusinessCoverageOpportunities,
  idealOverrideKey,
  productionStockKey,
} from "./maletas-functional-evaluation";
import {
  getCanonicalMainWarehouseAvailability,
  buildStockBySubgrupoFromCanonical,
} from "./canonical-warehouse-availability";
import type {
  VendorAssortmentResult,
  SubgroupProductionEval,
  ImportEvaluationResult,
  OpCoverageCandidate,
  IdealOverrideMap,
  BusinessCoverageResult,
} from "./maletas-functional-evaluation";

// Bodega ka_nl → human-readable name (for sourceWarehouse display)
const BODEGA_NAMES: Record<number, string> = {
  10: "PRINCIPAL",
  1: "PRODUCCION",
  4: "DESPACHOS",
};

// ── RIESGO_AGOTAMIENTO_BUFFER: refs within this range above minimum are flagged
const RIESGO_BUFFER = 10;

// ── Loader result ────────────────────────────────────────────────────────────

export interface VendorSampleLoadResult {
  vendors: VendorSampleSnapshot[];
  summary: MaletasExecutiveSummary;
  coverageGaps: CoverageGapRef[];
  productionSuggestions: ProductionSuggestion[];
  intelligence: MaletasCommercialIntelligenceResult;
  accessorySummary: AccessorySummary;
  source: "sag" | "empty";
  loadedAt: string;
  totalRefs: number;
  // MALLETS-FUNCTIONAL-RECOVERY-01
  assortmentEvaluations: VendorAssortmentResult[];
  productionThresholds: SubgroupProductionEval[];
  importEvaluation: ImportEvaluationResult;
  coverageResult: BusinessCoverageResult;
}

// ── Main loader ──────────────────────────────────────────────────────────────

export async function loadVendorSampleData(
  organizationId: string,
): Promise<VendorSampleLoadResult> {
  const db = prisma as any;
  const loadedAt = new Date().toISOString();

  // ── 0. Apply persisted vendor activation state ────────────────────
  try {
    const activationOverrides = await loadVendorActivationOverrides(organizationId);
    if (activationOverrides.size > 0) {
      applyActivationOverrides(activationOverrides);
    }
  } catch {
    // Non-fatal — fall back to hardcoded defaults
  }

  // ── 1. Load vendor presence from SAG SOAP (F34 transfers) ──────────
  let presenceResults: VendorPresenceResult[] = [];
  let subgrupoLookup = new Map<number, string>();
  let subgrupoToGrupoLookup = new Map<number, string>();
  try {
    const sagConfig = loadSagTestEnv();
    // Fetch presence + subgrupos + grupos in sequence (SAG rate limits)
    presenceResults = await fetchAllVendorPresence(sagConfig);
    subgrupoLookup = await fetchSubgruposLookup(sagConfig);
    subgrupoToGrupoLookup = await fetchSubgrupoToGrupoLookup(sagConfig);
  } catch (err) {
    console.error("[MALETAS] Failed to fetch vendor presence from SAG:", err);
    const emptyVendors = VENDOR_BODEGA_CONFIGS.map((v) => emptyVendor(v.id, v.name, v.bodegaKaNl));
    return {
      vendors: emptyVendors,
      summary: emptySummary(),
      coverageGaps: [],
      productionSuggestions: [],
      intelligence: buildCommercialIntelligence(emptyVendors, []),
      accessorySummary: { totalRefs: 0, availableRefs: 0, scarcityRefs: 0, healthyRefs: 0, zeroStockRefs: 0 },
      source: "empty",
      loadedAt,
      totalRefs: 0,
      assortmentEvaluations: [],
      productionThresholds: [],
      importEvaluation: { evaluations: [], diagnostic: { evaluadas: 0, sinFechaIngreso: 0, sinVentas: 0, sinTamano: 0, sinInventario: 0, watch: 0, doNotRebuy: 0, rebuy: 0, lowRotation: 0 } },
      coverageResult: { textileCoverage: [], importCoverage: [], urgentProductionNeeds: [] },
    };
  }

  // ── 2. Canonical main-warehouse availability (single source of truth) ──
  // Uses live SAG lookups for subgrupo/grupo name resolution — never stale CCS values.
  // Sprint: MALETAS-INVENTARIO-PRODUCCION-SINGLE-SOURCE-OF-TRUTH-01 (Phase 4)
  const canonical = await getCanonicalMainWarehouseAvailability(
    db,
    organizationId,
    subgrupoLookup,
    subgrupoToGrupoLookup,
  );
  // Backward-compatible types derived from canonical (no separate CCS query)
  type CoverageRow = {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    snapshotAt: Date | null;
  };
  const coverageRows: CoverageRow[] = canonical.refs.map((r) => ({
    refCode: r.reference,
    description: r.description,
    line: r.line,
    disponible: r.available,
    subgrupoId: r.subgrupoId,
    subgrupoSag: r.subgrupoSag,
    snapshotAt: r.sourceUpdatedAt,
  }));
  const coverageMap = new Map(coverageRows.map((r) => [r.refCode, r]));

  // ── 2b. Load open OP data for OP linking ────────────────────────────
  const opOptionsBySubgrupoId = await loadOpBySubgrupo(db, organizationId);

  // ── 2c. Load import availability from PIL (B36+B37) ────────────────
  const importAvailMap = await loadImportAvailability(db, organizationId);

  // ── 2d. Load import ref identification (productLine=5) ─────────────
  const importRefSet = await loadImportRefSet(db, organizationId);

  // ── 2e. Load product enrichment (group, brand, sizeClass) from ProductEntity ──
  const productEnrichmentMap = await loadProductEnrichment(db, organizationId);

  // ── 3. Build per-vendor snapshots ──────────────────────────────────
  const allVendorRefs = new Set<string>();
  const vendors: VendorSampleSnapshot[] = [];
  for (const pr of presenceResults) {
    // Resolve vendor activation state for snapshot
    const vendorConfig = VENDOR_BODEGA_CONFIGS.find((v) => v.id === pr.vendorId);
    const vendorIsActive = vendorConfig?.active ?? true;

    if (pr.items.length === 0) {
      vendors.push(emptyVendor(pr.vendorId, pr.vendorName, pr.bodegaKaNl, vendorIsActive));
      continue;
    }

    const refs: VendorSampleRef[] = pr.items.map((item) => {
      allVendorRefs.add(item.reference);
      const coverage = coverageMap.get(item.reference);
      const isAccessory = importRefSet.has(item.reference);
      const line = isAccessory ? "IMPORT" : (coverage?.line ?? "OTRO");
      const enrichment = productEnrichmentMap.get(item.reference);
      const minimum = getMinimumForLine(line);
      const importAvailability = isAccessory ? importAvailMap.get(item.reference) : undefined;
      const hasCentralAvailability = isAccessory
        ? importAvailability !== undefined
        : coverage != null;
      const centralAvailable = isAccessory
        ? (importAvailability ?? 0)
        : (coverage?.disponible ?? 0);
      const rawState = deriveState(centralAvailable, minimum, hasCentralAvailability);
      const state: SampleState = rawState;
      const commercialHealth = deriveCommercialHealth(centralAvailable, minimum, hasCentralAvailability);
      const riesgoAgotamiento = state === "saludable" && centralAvailable <= minimum + RIESGO_BUFFER;
      const sourceLabel = item.sourceWarehouse
        ? (BODEGA_NAMES[item.sourceWarehouse] ?? `B${item.sourceWarehouse}`)
        : null;

      const subgrupoName = item.subgrupoId != null
        ? (subgrupoLookup.get(item.subgrupoId) ?? coverage?.subgrupoSag ?? "OTRO")
        : (coverage?.subgrupoSag ?? "OTRO");
      const resolvedSubgrupoId = item.subgrupoId ?? coverage?.subgrupoId ?? null;
      const resolvedGrupoSag = resolvedSubgrupoId != null
        ? (subgrupoToGrupoLookup.get(resolvedSubgrupoId) ?? null)
        : null;

      let availableB24: number | null = null;
      let accessoryScarcityState: AccessoryScarcityState | null = null;
      let accessorySuggestedAction: "DEJAR_DE_VENDER" | null = null;
      if (isAccessory) {
        const rawImportAvail = importAvailMap.get(item.reference);
        // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 1:
        // Only derive scarcity state when PIL data exists.
        // Absent PIL record ≠ zero stock.
        if (rawImportAvail !== undefined) {
          availableB24 = rawImportAvail;
          accessoryScarcityState = availableB24 > IMPORT_SCARCITY_MINIMUM ? "saludable" : "escasez";
          accessorySuggestedAction = accessoryScarcityState === "escasez" ? "DEJAR_DE_VENDER" : null;
        } else {
          availableB24 = null;
          accessoryScarcityState = null;
          accessorySuggestedAction = null;
        }
      }

      return {
        reference: item.reference,
        description: coverage?.description ?? item.description,
        line,
        subgrupoSag: subgrupoName,
        subgrupoId: resolvedSubgrupoId,
        grupoSag: resolvedGrupoSag,
        group: enrichment?.group ?? null,
        brand: enrichment?.brand ?? null,
        sizeClass: enrichment?.sizeClass ?? null,
        imageUrl: enrichment?.imageUrl ?? null,
        present: true,
        centralAvailable,
        minimumRequired: minimum,
        state,
        commercialHealth,
        riesgoAgotamiento,
        suggestedAction: isAccessory && accessorySuggestedAction === "DEJAR_DE_VENDER"
          ? "Dejar de vender"
          : (state === "reemplazar" ? "Retirar del mostrario" : null),
        replacementRef: null,
        replacementDesc: null,
        replacementAvailable: null,
        replacementSource: null,
        replacementOptions: [],
        opReplacementOptions: [],
        requiresProductionSuggestion: false,
        supplyAction: null, // set by applyReplacements (Motor 2)
        lastTransferDate: item.lastTransferDate,
        sourceWarehouse: sourceLabel,
        isAccessory,
        availableB24,
        accessoryScarcityState,
        accessorySuggestedAction,
      };
    });

    // Load manual derrotero rules for this vendor (GO-LIVE-MALETAS-DERROTERO-CONFIG-01)
    const derroteroMap = await loadEffectiveMinimumRefsMap(organizationId, pr.vendorId);

    // Apply replacement intelligence (bodega + OP) — textil only
    applyReplacements(refs, coverageRows, subgrupoLookup, opOptionsBySubgrupoId, derroteroMap);

    vendors.push(buildVendorSnapshot(pr.vendorId, pr.vendorName, pr.bodegaKaNl, refs, vendorIsActive));
  }

  // ── 4. Coverage gaps ───────────────────────────────────────────────
  const coverageGaps: CoverageGapRef[] = coverageRows
    .filter((r) => r.disponible >= 20 && !allVendorRefs.has(r.refCode))
    .sort((a, b) => b.disponible - a.disponible)
    .slice(0, 30)
    .map((r): CoverageGapRef => ({
      reference: r.refCode,
      description: r.description,
      line: r.line,
      subgrupoId: r.subgrupoId ?? null,
      subgrupoSag: r.subgrupoSag ?? null,
      centralAvailable: r.disponible,
      vendorPresence: 0,
      suggestedAction: "Agregar a maletas",
    }));

  // ── 5. Production suggestions — grouped by line + subgrupoSag ────────
  const subgroupProdMap = new Map<string, {
    line: string;
    subgrupoSag: string;
    totalCentralAvailable: number;
    totalMinRequired: number;
    affectedVendorSet: Set<string>;
    evidenceRefs: Map<string, { reference: string; description: string; available: number }>;
    reasonType: ProductionSuggestion["reasonType"];
  }>();

  for (const vendor of vendors) {
    for (const ref of vendor.refs) {
      if (!isEligibleForProductionSuggestion(ref)) continue;
      const sg = ref.subgrupoSag || "SIN_SUBGRUPO_SAG";
      const key = `${ref.line}|${sg}`;
      const existing = subgroupProdMap.get(key);
      if (existing) {
        existing.affectedVendorSet.add(vendor.vendorName);
        if (!existing.evidenceRefs.has(ref.reference)) {
          existing.evidenceRefs.set(ref.reference, {
            reference: ref.reference,
            description: ref.description,
            available: ref.centralAvailable,
          });
        }
        existing.totalMinRequired += ref.minimumRequired;
      } else {
        subgroupProdMap.set(key, {
          line: ref.line,
          subgrupoSag: sg,
          totalCentralAvailable: ref.centralAvailable,
          totalMinRequired: ref.minimumRequired,
          affectedVendorSet: new Set([vendor.vendorName]),
          evidenceRefs: new Map([[ref.reference, {
            reference: ref.reference,
            description: ref.description,
            available: ref.centralAvailable,
          }]]),
          reasonType: ref.centralAvailable <= 0
            ? "central_stock_insufficient"
            : ref.replacementOptions.length === 0
              ? "no_replacement_available"
              : "subgroup_shortage",
        });
      }
    }
  }

  // Resolve central available per subgroup (sum all refs in same subgroup)
  // Use the already-collected evidence refs for central availability
  for (const entry of subgroupProdMap.values()) {
    let totalAvail = 0;
    for (const ev of entry.evidenceRefs.values()) {
      totalAvail += Math.max(ev.available, 0);
    }
    entry.totalCentralAvailable = totalAvail;
  }

  const productionSuggestions: ProductionSuggestion[] = [...subgroupProdMap.values()]
    .map((d): ProductionSuggestion | null => {
      const shortfall = Math.max(d.totalMinRequired - d.totalCentralAvailable, 0);
      if (shortfall <= 0) return null;
      const affectedCount = d.affectedVendorSet.size;
      const urgency: "alta" | "media" | "baja" =
        shortfall >= 50 || affectedCount >= 3 ? "alta"
        : shortfall >= 20 || affectedCount >= 2 ? "media"
        : "baja";
      const suggestedQty = shortfall;
      const evidenceArr = [...d.evidenceRefs.values()].slice(0, 10);
      return {
        subgrupoSag: d.subgrupoSag,
        line: d.line,
        centralAvailable: d.totalCentralAvailable,
        minimumRequired: d.totalMinRequired,
        shortfall,
        suggestedQty,
        urgency,
        affectedVendors: [...d.affectedVendorSet],
        vendorsWithPresence: d.affectedVendorSet.size,
        evidenceRefs: evidenceArr,
        reasonType: d.reasonType,
        // Backward compat: first evidence ref
        reference: evidenceArr[0]?.reference ?? d.subgrupoSag,
        description: evidenceArr[0]?.description ?? d.subgrupoSag,
      };
    })
    .filter((s): s is ProductionSuggestion => s !== null)
    .sort((a, b) => b.shortfall - a.shortfall || b.affectedVendors.length - a.affectedVendors.length)
    .slice(0, 30);

  // ── 6. Executive summary ───────────────────────────────────────────
  const activeVendorsWithRefs = vendors.filter((v) => v.isActive && v.totalRefs > 0);
  const summary: MaletasExecutiveSummary = {
    activeVendors: activeVendorsWithRefs.length,
    totalDistributedRefs: vendors.reduce((s, v) => s + v.totalRefs, 0),
    replaceRefs: vendors.reduce((s, v) => s + v.replaceRefs, 0),
    riesgoAgotamientoRefs: vendors.reduce((s, v) => s + v.riesgoAgotamientoRefs, 0),
    coverageGapRefs: coverageGaps.length,
    totalDistributedUnits: vendors.reduce((s, v) => s + v.totalUnits, 0),
    estimatedTotalValue: 0,
    accessoryRefs: vendors.reduce((s, v) => s + v.accessoryRefs, 0),
    accessoryScarcityRefs: vendors.reduce((s, v) => s + v.accessoryScarcityRefs, 0),
  };

  // ── 7. Commercial intelligence ──────────────────────────────────────
  const intelligence = buildCommercialIntelligence(vendors, coverageGaps);

  // ── 8. Accessory summary (MALETAS-ACCESSORY-LINE-INTELLIGENCE-FIX-01)
  // Accessories appear in F34 vendor presence. Central availability from B36+B37.
  const accessorySummary = buildAccessorySummary(importRefSet, importAvailMap);

  // ── 9. MALLETS-FUNCTIONAL-RECOVERY-01: Evaluation pipeline ────────────────

  // 9a. Load ideal overrides (MALETAS-DERROTERO-IDEALES-EDITABLES-01)
  const idealOverrides: IdealOverrideMap = new Map();
  try {
    const overrideRows: Array<{ catalogId: string; groupCode: string; subgroupCode: string; idealUnits: number }> =
      await db.assortmentIdealOverride.findMany({
        where: { organizationId },
        select: { catalogId: true, groupCode: true, subgroupCode: true, idealUnits: true },
      });
    for (const row of overrideRows) {
      idealOverrides.set(idealOverrideKey(row.catalogId, row.groupCode, row.subgroupCode), row.idealUnits);
    }
  } catch {
    // Table may not exist yet — proceed with empty overrides
  }

  // 9b. Assortment evaluations per vendor
  const assortmentEvaluations: VendorAssortmentResult[] = vendors
    .filter((v) => v.isActive)
    .map((v) => evaluateVendorAssortment(v, idealOverrides));

  // 9b. Build central stock map from canonical availability (single source of truth)
  // Names already resolved via live SAG lookup in canonical function.
  // Sprint: MALETAS-INVENTARIO-PRODUCCION-SINGLE-SOURCE-OF-TRUTH-01 (Phase 4)
  const centralStockBySubgrupo = buildStockBySubgrupoFromCanonical(canonical, productionStockKey);

  // 9c. Build OP active set by grupo+subgrupo (CS) or subgrupo only (LT)
  const LINE_TO_BRAND_OP = LINE_TO_BRAND;
  const opActiveBySubgrupo = new Set<string>();
  for (const [subgrupoId, options] of opOptionsBySubgrupoId) {
    if (options.length === 0) continue;
    // Resolve subgrupoSag via live SAG lookup (same as canonical)
    const sg = subgrupoLookup.get(subgrupoId) ?? options[0].subgrupoSag;
    if (!sg) continue;
    const grupoSag = subgrupoToGrupoLookup.get(subgrupoId) ?? null;
    const line = options[0].line;
    const brand = LINE_TO_BRAND_OP[line] ?? line;
    opActiveBySubgrupo.add(productionStockKey(brand, grupoSag, sg));
  }

  // 9d. Production threshold evaluation (uses canonical freshness)
  const productionThresholds = evaluateProductionThresholds(
    vendors,
    centralStockBySubgrupo,
    opActiveBySubgrupo,
    canonical.isStale,
  );

  // 9e. Import evaluation (recompra + baja rotación)
  const importEvaluation = evaluateImportRefs(vendors);

  // 9f. Coverage opportunities from derrotero faltantes
  const vendorRefSets = new Map<string, Set<string>>();
  for (const v of vendors) {
    vendorRefSets.set(v.vendorId, new Set(v.refs.map((r) => r.reference)));
  }
  const allCentralRefs = canonical.refs.map((cr) => ({
    reference: cr.reference,
    description: cr.description,
    line: cr.line,
    grupoSag: cr.grupoSag,
    subgrupoSag: cr.subgrupoSag,
    sizeClass: productEnrichmentMap.get(cr.reference)?.sizeClass ?? null,
    disponible: cr.available,
  }));

  // Build flat OP candidate list for unified coverage engine
  const opCovCandidates: OpCoverageCandidate[] = [];
  for (const [subgrupoId, options] of opOptionsBySubgrupoId) {
    const sg = subgrupoLookup.get(subgrupoId) ?? options[0]?.subgrupoSag;
    const grupoSag = subgrupoToGrupoLookup.get(subgrupoId) ?? null;
    if (!sg) continue;
    for (const opt of options) {
      opCovCandidates.push({
        reference: opt.reference,
        description: opt.description,
        line: opt.line,
        subgrupoSag: sg,
        grupoSag,
        pendingQty: opt.pendingQty,
        opNumber: opt.opNumber,
        createdAt: opt.createdAt,
        lastEventDate: opt.lastEventDate,
      });
    }
  }

  const coverageResult = findBusinessCoverageOpportunities(
    assortmentEvaluations,
    allCentralRefs,
    opCovCandidates,
    vendorRefSets,
  );

  return {
    vendors,
    summary,
    coverageGaps,
    productionSuggestions,
    intelligence,
    accessorySummary,
    source: "sag",
    loadedAt,
    totalRefs: allVendorRefs.size,
    assortmentEvaluations,
    productionThresholds,
    importEvaluation,
    coverageResult,
  };
}

// ── State derivation (2-state model) ─────────────────────────────────────────

function deriveState(
  centralAvailable: number,
  minimum: number,
  hasCoverageData: boolean,
): SampleState {
  // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 1:
  // Absence of a coverage record does NOT mean zero inventory.
  // Only derive state when data actually exists.
  if (!hasCoverageData) return "sin_datos";
  // STRICT greater-than: disponible > minimo → saludable
  if (centralAvailable > minimum) return "saludable";
  return "reemplazar";
}

// ── Commercial health (MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01) ───────────────
// Independent assessment of MAIN warehouse stock for a reference.
// Does NOT affect vendor mallet presence — presence is determined by SAG F34.

function deriveCommercialHealth(
  centralAvailable: number,
  minimum: number,
  hasCoverageData: boolean,
): SampleCommercialHealth {
  if (!hasCoverageData) return "INSUFFICIENT_DATA";
  if (centralAvailable <= 0) return "OUT_OF_STOCK";
  if (centralAvailable <= minimum) return "LOW_STOCK";
  return "HEALTHY";
}

// ── OP data loader (VENDOR-SAMPLE-OP-LINKING-01 + OP-ACTIVE-FILTER-01) ──────
//
// Loads open ProductionOrders, aggregates lines by referenceCode,
// resolves subgrupoId via ProductEntity, and indexes by subgrupoId.
//
// OP activa para reemplazo (FILTER-01):
//   status = 'open' AND isClosed = false
//   AND (documentDate >= 6 months ago OR lastProductionEventDate >= 6 months ago)
//
// ProductionEvent.productionOrderRef uses "2949-1" format.
// ProductionOrder.documentNumber uses "2949" format.
// Linkage: SPLIT_PART(productionOrderRef, '-', 1) = documentNumber.

const DEFAULT_OP_ACTIVE_WINDOW_MONTHS = 6;

async function loadOpBySubgrupo(
  db: any,
  organizationId: string,
): Promise<Map<number, VendorOpReplacementOption[]>> {
  const result = new Map<number, VendorOpReplacementOption[]>();

  try {
    // ── 1. Compute temporal cutoff ──────────────────────────────────────
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - DEFAULT_OP_ACTIVE_WINDOW_MONTHS);
    const cutoffIso = cutoff.toISOString();

    // ── 2. Load last event date per OP (prefix-match linkage) ───────────
    //    ProductionEvent.productionOrderRef = "2949-1"
    //    → SPLIT_PART('-', 1) = "2949" = ProductionOrder.documentNumber
    interface LastEventRow { opDocNumber: string; lastEventDate: Date }
    let lastEventMap = new Map<string, Date>();
    try {
      const lastEvents: LastEventRow[] = await db.$queryRawUnsafe(`
        SELECT
          SPLIT_PART("productionOrderRef", '-', 1) AS "opDocNumber",
          MAX("eventDate") AS "lastEventDate"
        FROM "ProductionEvent"
        WHERE "organizationId" = $1
        GROUP BY SPLIT_PART("productionOrderRef", '-', 1)
      `, organizationId);
      for (const row of lastEvents) {
        if (row.opDocNumber) {
          lastEventMap.set(row.opDocNumber, new Date(row.lastEventDate));
        }
      }
    } catch {
      // ProductionEvent table might not exist — proceed without event data
    }

    // ── 3. Aggregate open OP lines (with temporal filter) ───────────────
    interface OpLineAgg {
      referenceCode: string;
      documentNumber: string;
      productName: string | null;
      quantityOrdered: number;
      documentDate: Date;
    }

    const opLines: OpLineAgg[] = await db.$queryRawUnsafe(`
      SELECT
        pol."referenceCode",
        po."documentNumber",
        pol."productName",
        SUM(pol."quantityOrdered")::float AS "quantityOrdered",
        po."documentDate"
      FROM "ProductionOrderLine" pol
      JOIN "ProductionOrder" po ON po.id = pol."productionOrderId"
      WHERE po."organizationId" = $1
        AND po.status = 'open'
        AND po."isClosed" = false
      GROUP BY pol."referenceCode", po."documentNumber", pol."productName", po."documentDate"
      ORDER BY po."documentDate" DESC
    `, organizationId);

    if (opLines.length === 0) return result;

    // ── 4. Apply temporal filter ────────────────────────────────────────
    //    OP is active for replacement if:
    //      documentDate >= cutoff  (recent OP, may not have events yet)
    //      OR lastProductionEventDate >= cutoff  (old OP but recently active)
    const cutoffMs = cutoff.getTime();
    const totalBeforeFilter = opLines.length;

    const activeOpLines = opLines.filter((line) => {
      const docMs = new Date(line.documentDate).getTime();
      if (docMs >= cutoffMs) return true; // recent OP

      const lastEvent = lastEventMap.get(line.documentNumber);
      if (lastEvent && lastEvent.getTime() >= cutoffMs) return true; // recent activity

      return false; // zombie OP
    });

    const filtered = totalBeforeFilter - activeOpLines.length;

    if (activeOpLines.length === 0) {
      console.log(`[MALETAS] OP filter: ${totalBeforeFilter} total, all filtered (${filtered} zombie)`);
      return result;
    }

    // ── 5. Resolve subgrupoId via ProductEntity ─────────────────────────
    const refCodes = [...new Set(activeOpLines.map((l) => l.referenceCode))];
    const products = await db.productEntity.findMany({
      where: { sku: { in: refCodes }, subgrupoId: { not: null } },
      select: { sku: true, subgrupoId: true, subgrupoSag: true, productLine: true },
    });

    const LINE_MAP = SAG_LINE_FK_MAP;
    const peMap = new Map<string, { subgrupoId: number; subgrupoSag: string; line: string }>();
    for (const p of products) {
      if (p.sku && p.subgrupoId != null) {
        peMap.set(p.sku, {
          subgrupoId: p.subgrupoId,
          subgrupoSag: p.subgrupoSag ?? "OTRO",
          line: LINE_MAP[p.productLine ?? ""] ?? "OT",
        });
      }
    }

    // ── 6. Build options indexed by subgrupoId ──────────────────────────
    for (const line of activeOpLines) {
      const pe = peMap.get(line.referenceCode);
      if (!pe) continue; // can't resolve subgrupo — skip

      const lastEvent = lastEventMap.get(line.documentNumber);
      const option: VendorOpReplacementOption = {
        reference: line.referenceCode,
        description: line.productName ?? line.referenceCode,
        subgrupoId: pe.subgrupoId,
        subgrupoSag: pe.subgrupoSag,
        line: pe.line,
        opNumber: line.documentNumber,
        orderedQty: Math.round(line.quantityOrdered),
        producedQty: 0, // no ET reconciliation yet
        pendingQty: Math.round(line.quantityOrdered),
        createdAt: line.documentDate?.toISOString?.() ?? new Date().toISOString(),
        lastEventDate: lastEvent?.toISOString?.() ?? null,
        source: "op_activa",
      };

      if (!result.has(pe.subgrupoId)) result.set(pe.subgrupoId, []);
      result.get(pe.subgrupoId)!.push(option);
    }

    // Sort each subgrupo's options: most quantity first
    for (const [, options] of result) {
      options.sort((a, b) => b.pendingQty - a.pendingQty);
    }

    console.log(`[MALETAS] OP filter: ${totalBeforeFilter} total, ${activeOpLines.length} active, ${filtered} zombie filtered (window=${DEFAULT_OP_ACTIVE_WINDOW_MONTHS}m)`);
  } catch (err) {
    console.error("[MALETAS] OP linking failed (non-fatal):", err);
  }

  return result;
}

// ── Motor 2: Derrotero de Maleta Ideal (MALETAS-GO-LIVE-01) ──────────────────
//
// Subgroup-level coverage engine. Decision unit = subgrupo SAG per vendor.
// When a vendor's active textil refs in a subgrupo drop to MINIMUM_REFS → cascade:
//   1. Find replacement ref from same subgrupo with central inventory → replacementOptions
//   2. If no inventory → find active OP in same subgrupo → opReplacementOptions
//   3. If no OP → LAST RESORT: requiresProductionSuggestion = true (LT/CS only)
//
// Motor 1 owns suggestedAction ("Retirar del mostrario") — Motor 2 never overrides it.
// Motor 2 only populates replacement/OP/production fields for subgroups needing coverage.
//
// Legacy single-ref fields (replacementRef/Desc/Available) kept for backward compat.

const MAX_REPLACEMENT_OPTIONS = 10;

interface CoverageRow {
  refCode: string;
  description: string;
  line: string;
  disponible: number;
  subgrupoId: number | null;
  subgrupoSag: string | null;
}

function applyReplacements(
  refs: VendorSampleRef[],
  coverageCatalog: CoverageRow[],
  _subgrupoLookup: Map<number, string>,
  opOptionsBySubgrupoId: Map<number, VendorOpReplacementOption[]>,
  derroteroMap?: Map<string, number>,
): void {
  // ── GO-LIVE-MALETAS-MOTOR-ABASTECIMIENTO-01 ─────────────────────────────
  // Castillitos commercial decision flow:
  //   Priority: 1. REEMPLAZAR_BODEGA → 2. COMPLETAR_DESDE_OP → 3. PRODUCCION_SUGERIDA → 4. RETIRAR_MOSTRARIO
  //   Exhausted refs → RETIRAR_MOSTRARIO only (no suggestions)
  //   Each ref gets exactly ONE supplyAction (no duplicates)
  //   IMPORT follows same cascade (no exception)

  // ── Step 1: Identify subgroups needing coverage (Motor 2 trigger) ─────
  // Group ALL refs (textil + import) by subgrupoSag — IMPORT follows same logic
  const eligibleRefs = refs.filter((r) => !r.isAccessory || r.line === "IMPORT");
  const subgroupMap = new Map<string, VendorSampleRef[]>();
  for (const ref of eligibleRefs) {
    const sg = ref.subgrupoSag || "OTRO";
    if (!subgroupMap.has(sg)) subgroupMap.set(sg, []);
    subgroupMap.get(sg)!.push(ref);
  }

  // Determine which subgroups need coverage action
  const subgroupsNeedingCoverage = new Set<string>();
  for (const [sg, sgRefs] of subgroupMap) {
    const line = sgRefs[0]?.line ?? "CS";
    const minRefs = derroteroMap?.get(`${line}|${sg}`) ?? DEFAULT_SUBGROUP_MINIMUM_REFS;
    const activeCount = sgRefs.filter((r) => r.state === "saludable").length;
    if (activeCount <= minRefs && sgRefs.some((r) => r.state === "reemplazar")) {
      subgroupsNeedingCoverage.add(sg);
    }
  }

  // ── Step 2: Index replacement candidates from bodega principal ─────────
  const candidatesBySubgrupoId = new Map<number, CoverageRow[]>();
  for (const cr of coverageCatalog) {
    const min = getMinimumForLine(cr.line);
    if (cr.disponible <= min) continue;
    if (cr.subgrupoId != null) {
      if (!candidatesBySubgrupoId.has(cr.subgrupoId)) candidatesBySubgrupoId.set(cr.subgrupoId, []);
      candidatesBySubgrupoId.get(cr.subgrupoId)!.push(cr);
    }
  }

  // Collect the set of refs already present in this vendor (to exclude from candidates)
  const vendorRefSet = new Set(refs.map((r) => r.reference));

  // ── Step 3: Apply Castillitos decision cascade per ref ────────────────
  for (const ref of eligibleRefs) {
    if (ref.state !== "reemplazar") continue;
    const sg = ref.subgrupoSag || "OTRO";

    // Exhausted ref that is NOT in a subgroup needing coverage →
    // RETIRAR_MOSTRARIO only, no production/replacement suggestions
    if (!subgroupsNeedingCoverage.has(sg)) {
      ref.supplyAction = "RETIRAR_MOSTRARIO";
      continue;
    }

    // ── Cascade Step 1: ¿Existe inventario disponible en bodega? ─────
    let options: VendorReplacementOption[] = [];
    let source: string | null = null;

    if (ref.subgrupoId != null) {
      const subCandidates = candidatesBySubgrupoId.get(ref.subgrupoId);
      if (subCandidates && subCandidates.length > 0) {
        const valid = subCandidates
          .filter((c) => c.refCode !== ref.reference && !vendorRefSet.has(c.refCode))
          .sort((a, b) => b.disponible - a.disponible)
          .slice(0, MAX_REPLACEMENT_OPTIONS);

        options = valid.map((c): VendorReplacementOption => ({
          reference: c.refCode,
          description: c.description,
          subgrupoId: c.subgrupoId,
          subgrupoSag: c.subgrupoSag ?? ref.subgrupoSag,
          line: c.line,
          available: c.disponible,
          source: "bodega_principal",
        }));
        source = "mismo subgrupo SAG";
      }
    }

    // ── Cascade Step 2: ¿Existe una OP abierta? ─────────────────────
    const opOptions: VendorOpReplacementOption[] =
      ref.subgrupoId != null
        ? (opOptionsBySubgrupoId.get(ref.subgrupoId) ?? [])
            .filter((o) => o.reference !== ref.reference && !vendorRefSet.has(o.reference))
            .slice(0, MAX_REPLACEMENT_OPTIONS)
        : [];

    // ── Apply results: exactly ONE supplyAction per ref ──────────────
    ref.replacementOptions = options;
    ref.opReplacementOptions = opOptions;
    ref.replacementSource = source;

    if (options.length > 0) {
      // Priority 1: REEMPLAZAR_BODEGA
      ref.supplyAction = "REEMPLAZAR_BODEGA";
      ref.replacementRef = options[0].reference;
      ref.replacementDesc = options[0].description;
      ref.replacementAvailable = options[0].available;
    } else if (opOptions.length > 0) {
      // Priority 2: COMPLETAR_DESDE_OP
      ref.supplyAction = "COMPLETAR_DESDE_OP";
      ref.replacementRef = opOptions[0].reference;
      ref.replacementDesc = opOptions[0].description;
      ref.replacementAvailable = opOptions[0].pendingQty;
      ref.replacementSource = "OP activa";
    } else {
      // Priority 3: last resort — depends on line
      // IMPORT/accessories → RECOMPRA_SUGERIDA (never produccion)
      // Textil (LT/CS)    → PRODUCCION_SUGERIDA
      ref.replacementRef = null;
      ref.replacementDesc = null;
      ref.replacementAvailable = null;

      if (ref.isAccessory || ref.line === "IMPORT") {
        ref.supplyAction = "RECOMPRA_SUGERIDA";
      } else {
        ref.supplyAction = "PRODUCCION_SUGERIDA";
        ref.requiresProductionSuggestion = true;
      }
    }
  }

  // ── Step 4: Refs not processed above (accessories, saludable) ─────────
  // Set RETIRAR_MOSTRARIO for any reemplazar ref that wasn't processed
  for (const ref of refs) {
    if (ref.state === "reemplazar" && ref.supplyAction === null) {
      ref.supplyAction = "RETIRAR_MOSTRARIO";
    }
  }
}

// ── Snapshot builders ────────────────────────────────────────────────────────

function buildVendorSnapshot(
  vendorId: string,
  vendorName: string,
  bodegaKaNl: number,
  refs: VendorSampleRef[],
  isActive = true,
): VendorSampleSnapshot {
  const replaceRefs = refs.filter((r) => r.state === "reemplazar").length;
  const healthyRefs = refs.filter((r) => r.state === "saludable").length;
  const sinDatosRefs = refs.filter((r) => r.state === "sin_datos").length;
  const riesgoAgotamientoRefs = refs.filter((r) => r.riesgoAgotamiento).length;
  const healthyCommercialRefs = refs.filter((r) => r.commercialHealth === "HEALTHY").length;
  const lowStockCommercialRefs = refs.filter((r) => r.commercialHealth === "LOW_STOCK").length;
  const outOfStockCommercialRefs = refs.filter((r) => r.commercialHealth === "OUT_OF_STOCK").length;
  const accessoryRefs = refs.filter((r) => r.isAccessory).length;
  const accessoryScarcityRefs = refs.filter((r) => r.accessoryScarcityState === "escasez").length;

  return {
    vendorId,
    vendorName,
    warehouseCode: String(bodegaKaNl),
    warehouseName: `VEND ${vendorName.toUpperCase()}`,
    health: deriveVendorHealth(refs),
    isActive,
    totalRefs: refs.length,
    totalUnits: refs.length,
    estimatedValue: 0,
    replaceRefs,
    healthyRefs,
    sinDatosRefs,
    riesgoAgotamientoRefs,
    healthyCommercialRefs,
    lowStockCommercialRefs,
    outOfStockCommercialRefs,
    accessoryRefs,
    accessoryScarcityRefs,
    refs,
    lines: [...new Set(refs.map((r) => r.line))],
  };
}

function deriveVendorHealth(refs: VendorSampleRef[]): VendorHealth {
  if (refs.length === 0) return "sin_datos";
  // Phase 10: Exclude sin_datos refs from health calculation —
  // they provide no actionable signal and would dilute the replacement percentage.
  const evaluableRefs = refs.filter((r) => r.state !== "sin_datos");
  if (evaluableRefs.length === 0) return "sin_datos";
  const replace = evaluableRefs.filter((r) => r.state === "reemplazar").length;
  const replacePct = replace / evaluableRefs.length;
  if (replacePct > 0.15 || replace >= 10) return "critico";
  if (replacePct > 0.05 || replace >= 5) return "riesgo";
  return "saludable";
}

function emptyVendor(vendorId: string, vendorName: string, bodegaKaNl: number, isActive = true): VendorSampleSnapshot {
  return {
    vendorId,
    vendorName,
    warehouseCode: String(bodegaKaNl),
    warehouseName: `VEND ${vendorName.toUpperCase()}`,
    health: "sin_datos",
    isActive,
    totalRefs: 0,
    totalUnits: 0,
    estimatedValue: 0,
    replaceRefs: 0,
    healthyRefs: 0,
    sinDatosRefs: 0,
    riesgoAgotamientoRefs: 0,
    healthyCommercialRefs: 0,
    lowStockCommercialRefs: 0,
    outOfStockCommercialRefs: 0,
    accessoryRefs: 0,
    accessoryScarcityRefs: 0,
    refs: [],
    lines: [],
  };
}

function emptySummary(): MaletasExecutiveSummary {
  return {
    activeVendors: 0,
    totalDistributedRefs: 0,
    replaceRefs: 0,
    riesgoAgotamientoRefs: 0,
    coverageGapRefs: 0,
    totalDistributedUnits: 0,
    estimatedTotalValue: 0,
    accessoryRefs: 0,
    accessoryScarcityRefs: 0,
  };
}

// ── Accessory summary builder (MALETAS-ACCESSORY-LINE-INTELLIGENCE-FIX-01) ──
//
// Accessories appear in F34 vendor presence (same bodegas 45-50 as textil).
// Central availability controlled by B36+B37 import warehouses.

function buildAccessorySummary(
  importRefSet: Set<string>,
  importAvailMap: Map<string, number>,
): AccessorySummary {
  const totalRefs = importRefSet.size;
  let availableRefs = 0;
  let scarcityRefs = 0;
  let healthyRefs = 0;
  let zeroStockRefs = 0;

  for (const sku of importRefSet) {
    const rawAvailable = importAvailMap.get(sku);
    // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 1:
    // Absent PIL record → skip (don't count as zero stock)
    if (rawAvailable === undefined) continue;
    const available = rawAvailable;
    if (available <= 0) {
      zeroStockRefs++;
    } else if (available <= IMPORT_SCARCITY_MINIMUM) {
      scarcityRefs++;
      availableRefs++;
    } else {
      healthyRefs++;
      availableRefs++;
    }
  }

  return { totalRefs, availableRefs, scarcityRefs, healthyRefs, zeroStockRefs };
}

// ── Product enrichment loader (MALLETS-GO-LIVE-COMPLETION-01) ────────────────
//
// Loads group, brand, and sizeClass from ProductEntity for all references.
// Brand resolved from productLine: "1"→"Latin Kids", "2"→"Castillitos", "5"→"Importación".
// sizeClass resolved from category for IMPORT refs (small/medium/large mapping).

interface ProductEnrichment {
  group: string | null;
  brand: string | null;
  sizeClass: string | null;
  imageUrl: string | null;  // MALETAS-REFERENCIAS-GRUPO-IMAGEN-01: hero image from ProductAssetLink
}

const BRAND_FROM_LINE: Record<string, string> = {
  "1": "Latin Kids",
  "2": "Castillitos",
  "5": "Importación",
};

async function loadProductEnrichment(
  db: any,
  organizationId: string,
): Promise<Map<string, ProductEnrichment>> {
  const result = new Map<string, ProductEnrichment>();
  try {
    const products = await db.productEntity.findMany({
      where: { organizationId },
      select: {
        id: true,
        sku: true,
        productLine: true,
        category: true,
        handlingUnit: true,
      },
    });

    // MALETAS-REFERENCIAS-GRUPO-IMAGEN-01: Load hero images via ProductAssetLink → GeneratedAsset
    const heroImageMap = new Map<string, string>(); // productId → assetUrl
    try {
      const heroLinks = await db.productAssetLink.findMany({
        where: { organizationId, role: "hero" },
        select: {
          productId: true,
          assetId: true,
        },
      });
      if (heroLinks.length > 0) {
        const assetIds = heroLinks.map((l: any) => l.assetId);
        const assets = await db.generatedAsset.findMany({
          where: { id: { in: assetIds }, generationStatus: "READY", assetUrl: { not: null } },
          select: { id: true, assetUrl: true },
        });
        const assetMap = new Map<string, string>();
        for (const a of assets) {
          if (a.assetUrl) assetMap.set(a.id, a.assetUrl);
        }
        for (const link of heroLinks) {
          const url = assetMap.get(link.assetId);
          if (url) heroImageMap.set(link.productId, url);
        }
      }
    } catch { /* ProductAssetLink/GeneratedAsset may not exist yet */ }
    let fromHandlingUnit = 0;
    let fromFallback = 0;
    let unmapped = 0;
    for (const p of products) {
      if (!p.sku) continue;
      const brand = BRAND_FROM_LINE[p.productLine ?? ""] ?? null;
      let sizeClass: string | null = null;
      if (p.productLine === "5") {
        // IMPORT-SIZECLASS-FROM-SAG-01: Use handlingUnit directly from SAG
        if (p.handlingUnit && isCanonicalSizeClass(p.handlingUnit)) {
          sizeClass = p.handlingUnit;
          fromHandlingUnit++;
        } else if (p.handlingUnit) {
          // Non-canonical value — preserve for diagnostics
          sizeClass = null;
          unmapped++;
        } else {
          // No handlingUnit — fallback disabled per sprint rules
          sizeClass = null;
          fromFallback++;
        }
      }
      result.set(p.sku, {
        group: p.category ?? null,
        brand,
        sizeClass,
        imageUrl: heroImageMap.get(p.id) ?? null,
      });
    }
    console.log(`[MALETAS] Product enrichment: ${result.size} refs enriched (import sizeClass: ${fromHandlingUnit} from SAG, ${unmapped} unmapped, ${fromFallback} without handlingUnit)`);
  } catch (err) {
    console.error("[MALETAS] Product enrichment failed (non-fatal):", err);
  }
  return result;
}

const CANONICAL_SIZE_CLASSES = new Set(["PEQUENO", "MEDIANO", "GRANDE"]);

function isCanonicalSizeClass(value: string): boolean {
  return CANONICAL_SIZE_CLASSES.has(value);
}

// resolveImportSizeClass REMOVED — IMPORT-SIZECLASS-FROM-SAG-01
// Size classification now comes from ProductEntity.handlingUnit (SAG "Unidad de manejo").
// No inference from description, grupo, subgrupo, or talla.

// ── Import availability loader (IMPORT-SCARCITY-ENGINE-01) ──────────────────
//
// Aggregates stock from import source warehouses (B36+B37) per SKU.
// Returns Map<sku, totalAvailable>.

async function loadImportAvailability(
  db: any,
  organizationId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const whList = IMPORT_SOURCE_WAREHOUSES.map((_, i) => `$${i + 2}`).join(",");
    const params = [organizationId, ...IMPORT_SOURCE_WAREHOUSES];
    interface ImportRow { sku: string; available: number }
    const rows: ImportRow[] = await db.$queryRawUnsafe(`
      SELECT pe.sku,
             SUM(GREATEST(pil.quantity, 0))::int AS available
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe.id = pil."productId"
        AND pe."organizationId" = pil."organizationId"
      WHERE pil."organizationId" = $1
        AND pil."warehouseId" IN (${whList})
      GROUP BY pe.sku
    `, ...params);

    for (const row of rows) {
      result.set(row.sku, row.available);
    }
    console.log(`[MALETAS] Import availability: ${result.size} refs from B${IMPORT_SOURCE_WAREHOUSES.join("+B")}`);
  } catch (err) {
    console.error("[MALETAS] Import availability load failed (non-fatal):", err);
  }
  return result;
}

// ── Import ref identification (IMPORT-SCARCITY-ENGINE-01) ───────────────────
//
// Returns Set<sku> for all ProductEntity with productLine = "5" (accesorios/importacion).

async function loadImportRefSet(
  db: any,
  organizationId: string,
): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    const products = await db.productEntity.findMany({
      where: { organizationId, productLine: "5" },
      select: { sku: true },
    });
    for (const p of products) {
      if (p.sku) result.add(p.sku);
    }
    console.log(`[MALETAS] Import ref set: ${result.size} refs (productLine=5)`);
  } catch (err) {
    console.error("[MALETAS] Import ref set load failed (non-fatal):", err);
  }
  return result;
}
