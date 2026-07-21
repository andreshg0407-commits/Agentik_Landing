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
import {
  classifyMaletaReferencesBatch,
  lastClassifyPerformanceMs,
  isCommerciallyAvailableForMaletas,
  isEligibleForMaletaCoverage,
  isEligibleForMaletaPresence,
  resolveMaletaRemovalReason,
  isStructurallyEligibleForMaletaProduction,
  resolveMaletaSupplyAction,
  matchesMaletaCoverageNeed,
  MALETA_REMOVAL_LIMITS,
  MALETA_COVERAGE_MINIMUMS,
  type CanonicalMaletaInventoryRef,
  type MaletaCcsRecord,
  type MaletaCoverageContext,
  type MaletaCoverageNeed,
  type MaletaCoverageMatch,
  type MaletaSupplyAction,
} from "./maletas-canonical-inventory";
import { isReferenceEligibleForMaletasRuntime } from "./maletas-commercial-scope";
import {
  loadCanonicalReferencesByReferenceList,
  type CanonicalReferenceLookupRecord,
} from "@/lib/inventory/canonical-reference-lookup";
import type {
  VendorAssortmentResult,
  SubgroupProductionEval,
  ImportEvaluationResult,
  OpCoverageCandidate,
  IdealOverrideMap,
  BusinessCoverageResult,
} from "./maletas-functional-evaluation";

// ── Canonical diff report (Phase 6 — progressive integration) ────────────────

export interface CanonicalDiffEntry {
  reference: string;
  vendorId: string;
  oldState: SampleState;
  newCanonicalStatus: string;
  oldLine: string;
  newDomain: string;
  commerciallyAvailable: boolean;
  eligiblePresence: boolean;
  /** Qualifies as coverage candidate for THIS vendor (stock > threshold, not in bag) */
  eligibleCoverage: boolean;
  /** Structurally eligible for production consideration */
  structurallyEligibleProduction: boolean;
  /** Has production in process (productionStock > 0) */
  hasProductionInProcess: boolean;
  /** Resolved supply action from waterfall */
  supplyAction: MaletaSupplyAction | null;
  removalReason: string | null;
  diverges: boolean;
}

/** Per-need coverage/supply diff for shadow comparison */
export interface CanonicalNeedDiff {
  riskReference: string;
  vendorId: string;
  vendorName: string;
  canonicalLine: string;
  grupoSag: string | null;
  subgrupoSag: string | null;
  sizeClass: string | null;
  oldSupplyAction: SupplyActionType | null;
  canonicalSupplyAction: MaletaSupplyAction;
  coverageMatches: MaletaCoverageMatch[];
  divergenceReason: string | null;
}

/** Per-vendor reconciled coverage summary (Cierre 1) */
export interface VendorCoverageSummary {
  vendorId: string;
  vendorName: string;
  /** Total refs currently in this vendor's bag */
  currentRefs: number;
  /** Refs that need replacement (state=reemplazar or removalReason!=null) */
  needsReplacement: number;
  /** candidatePool: unique refs eligible for this vendor BEFORE need-matching */
  candidatePoolCS: number;
  candidatePoolLT: number;
  candidatePoolIMPORT: number;
  /** matchedCandidatesByNeed: total candidate-need pairs that match */
  matchedPairsTotal: number;
  /** coveredNeeds: needs for which >= 1 candidate exists */
  coveredNeeds: number;
  /** uniqueCandidatesUsed: unique refs that serve as candidate in >= 1 match */
  uniqueCandidatesUsed: number;
  /** excludedAlreadyInOwnBag: refs that would pass stock/status but are in THIS bag */
  excludedAlreadyInOwnBag: number;
  /** needsWithoutCoverage: needs without any matching candidate */
  needsWithoutCoverage: number;
}

/** OP audit data (Cierre 3) */
export interface OpAuditData {
  totalOpLoaded: number;
  activeAfterTemporalFilter: number;
  withResolvedSubgrupo: number;
  uniqueSubgruposWithOp: number;
  /** OP that match at least one vendor need */
  matchingVendorNeeds: number;
  /** OP discarded: reasons */
  discardedZombie: number;
  discardedNoSubgrupo: number;
  discardedNoMatchingNeed: number;
}

export interface CanonicalDiffReport {
  totalRefs: number;
  divergentRefs: number;
  stateDivergences: number;
  lineDivergences: number;
  commerciallyAvailable: number;
  eligiblePresence: number;
  removalByLimit: number;
  removalByCanonicalState: number;
  productionInProcess: number;
  newProductionNeeded: number;
  excludedByAge: number;
  excludedByExternalIntegration: number;
  entries: CanonicalDiffEntry[];
  vendorCoverageSummaries: VendorCoverageSummary[];
  needDiffs: CanonicalNeedDiff[];
  opAudit: OpAuditData;
  canonicalMap: Map<string, CanonicalMaletaInventoryRef>;
  performanceMs: {
    peQueryMs: number;
    pilQueryMs: number;
    classifyLoopMs: number;
    diffComputationMs: number;
    totalCanonicalMs: number;
  };
}

/** COMERCIAL-MALETAS-CANONICAL-ACTIVATION-01: scope filter audit */
export interface CommercialScopeAudit {
  totalClassified: number;
  runtimeEligible: number;
  excluded: number;
  exclusionsByReason: Record<string, number>;
  classificationMs: number;
  scopeFilterMs: number;
}

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
  /** Phase 6: canonical diff report (progressive integration — remove after migration) */
  canonicalDiffReport: CanonicalDiffReport | null;
  /** ACTIVATION-01: commercial scope filter audit */
  commercialScopeAudit: CommercialScopeAudit | null;
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
      canonicalDiffReport: null,
      commercialScopeAudit: null,
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

  // ── 2c. Load import ref identification (productLine=5) ─────────────
  const importRefSet = await loadImportRefSet(db, organizationId);

  // ── 2d. Load product enrichment (group, brand, sizeClass) from ProductEntity ──
  const productEnrichmentMap = await loadProductEnrichment(db, organizationId);

  // ── 2e. Canonical reference lookup (CANONICAL-INVENTORY-REFERENCE-LOOKUP-01)
  // Single batch lookup for all vendor refs — replaces loadImportAvailability
  // and local CCS/PIL queries for commercial stock resolution.
  const allVendorRefsForLookup = new Set<string>();
  for (const pr of presenceResults) {
    for (const item of pr.items) allVendorRefsForLookup.add(item.reference);
  }
  const canonicalLookup = await loadCanonicalReferencesByReferenceList(
    db as any,
    { organizationId, references: [...allVendorRefsForLookup] },
  );
  const canonicalLookupMap = canonicalLookup.records;
  console.log(`[MALETAS] Canonical lookup: ${canonicalLookup.stats.resolved} resolved, ${canonicalLookup.stats.productNotFound} not found, ${canonicalLookup.stats.queryTimeMs}ms`);

  // ── 2f. Canonical classification + commercial scope filter ──────────────
  // COMERCIAL-MALETAS-CANONICAL-ACTIVATION-01
  // Runs classifyMaletaReferencesBatch() to get CanonicalMaletaInventoryRef per ref.
  // Applies isReferenceEligibleForMaletasRuntime() to produce the filtered universe.
  // All downstream candidate operations use the filtered set.

  // Pre-compute allVendorRefs from presence (needed for classification)
  const allVendorRefs = new Set<string>();
  for (const pr of presenceResults) {
    for (const item of pr.items) {
      allVendorRefs.add(item.reference);
    }
  }

  const tClassifyStart = Date.now();
  const ccsRecordsForClassify: MaletaCcsRecord[] = canonical.refs.map((r) => ({
    reference: r.reference,
    disponible: r.available,
    line: r.line,
    subgrupoSag: r.subgrupoSag,
    description: r.description,
  }));
  const additionalClassifyRefs = [...allVendorRefs].filter((ref) => !coverageMap.has(ref));

  const canonicalMap = await classifyMaletaReferencesBatch({
    organizationId,
    ccsRecords: ccsRecordsForClassify,
    additionalReferences: additionalClassifyRefs.length > 0 ? additionalClassifyRefs : undefined,
  });
  const tClassifyEnd = Date.now();
  const classificationMs = tClassifyEnd - tClassifyStart;

  // Apply commercial scope filter
  const tScopeStart = Date.now();
  const runtimeEligibleSet = new Set<string>();
  const scopeExclusions: Record<string, number> = {};
  for (const [ref, can] of canonicalMap) {
    if (isReferenceEligibleForMaletasRuntime(can)) {
      runtimeEligibleSet.add(ref);
    } else {
      const reason = can.businessDomain === "JUPITER_PETS" ? "JUPITER_PETS"
        : can.businessDomain === "UNKNOWN" ? "UNKNOWN_DOMAIN"
        : can.stockDistribution === "NO_ACTIVITY_DATA" ? "NO_DATA"
        : can.commercialReferenceStatus;
      scopeExclusions[reason] = (scopeExclusions[reason] ?? 0) + 1;
    }
  }
  const tScopeEnd = Date.now();

  // Filtered candidate catalogs (replacement candidates, coverage gaps, production)
  const runtimeCoverageRows = coverageRows.filter((r) => runtimeEligibleSet.has(r.refCode));

  console.log(`[MALETAS] Commercial scope: ${canonicalMap.size} classified → ${runtimeEligibleSet.size} eligible, ${canonicalMap.size - runtimeEligibleSet.size} excluded (${classificationMs}ms classify, ${tScopeEnd - tScopeStart}ms filter)`);

  const commercialScopeAudit: CommercialScopeAudit = {
    totalClassified: canonicalMap.size,
    runtimeEligible: runtimeEligibleSet.size,
    excluded: canonicalMap.size - runtimeEligibleSet.size,
    exclusionsByReason: scopeExclusions,
    classificationMs,
    scopeFilterMs: tScopeEnd - tScopeStart,
  };

  // ── 3. Build per-vendor snapshots ──────────────────────────────────
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
      const enrichment = productEnrichmentMap.get(item.reference);
      const isAccessory = importRefSet.has(item.reference);
      // PRESENCE-VS-COMMERCIAL-SCOPE-FIX-01: Resolve line with PE productLine fallback.
      // CCS may be empty — PE productLine is the authoritative source for line identity.
      const line = isAccessory ? "IMPORT"
        : coverage?.line
          ?? (enrichment?.productLine === "1" ? "LT"
            : enrichment?.productLine === "2" ? "CS"
            : "OTRO");
      const minimum = getMinimumForLine(line);

      // CANONICAL-INVENTORY-REFERENCE-LOOKUP-01: Single canonical source for ALL stock data.
      // No local warehouse sums. No module-specific fallbacks.
      const can = canonicalMap.get(item.reference);
      const lookupRec = canonicalLookupMap.get(item.reference);
      const hasCentralAvailability = lookupRec
        ? lookupRec.stockDataState === "CERTIFIED"
        : coverage != null;
      /** @deprecated Use lookupRec.compatibleCommercialStock — alias kept for downstream compatibility */
      const centralAvailable = lookupRec
        ? lookupRec.compatibleCommercialStock
        : (coverage?.disponible ?? 0);
      const stockDataState: import("./vendor-sample-types").StockDataState =
        hasCentralAvailability ? "CERTIFIED" : "ABSENT";
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
        // CANONICAL-INVENTORY-REFERENCE-LOOKUP-01: Scarcity from canonical lookup.
        if (lookupRec && lookupRec.stockDataState === "CERTIFIED") {
          availableB24 = lookupRec.compatibleCommercialStock;
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
        stockDataState,
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
    // ACTIVATION-01: uses runtimeCoverageRows (scope-filtered candidate catalog)
    applyReplacements(refs, runtimeCoverageRows, subgrupoLookup, opOptionsBySubgrupoId, derroteroMap);

    vendors.push(buildVendorSnapshot(pr.vendorId, pr.vendorName, pr.bodegaKaNl, refs, vendorIsActive));
  }

  // ── 4. Coverage gaps ───────────────────────────────────────────────
  // ACTIVATION-01: uses runtimeCoverageRows (scope-filtered)
  const coverageGaps: CoverageGapRef[] = runtimeCoverageRows
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
      if (!runtimeEligibleSet.has(ref.reference)) continue; // ACTIVATION-01
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
  const accessorySummary = buildAccessorySummary(importRefSet, canonicalLookupMap);

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
  // ACTIVATION-01: scope-filtered central refs for coverage opportunities
  const allCentralRefs = canonical.refs
    .filter((cr) => runtimeEligibleSet.has(cr.reference))
    .map((cr) => ({
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

  // ── 10. Canonical classification shadow diff ──────────────────────────────
  // Gated by MALETAS_CANONICAL_SHADOW_ENABLED. Default: false.
  // When false: zero additional queries, zero overhead.
  // When true: runs batch classifier + diff computation for validation only.
  // Does NOT change any existing outputs — pure observation.
  const shadowEnabled = process.env.MALETAS_CANONICAL_SHADOW_ENABLED === "true";
  let canonicalDiffReport: CanonicalDiffReport | null = null;

  if (shadowEnabled) {
    try {
      // ACTIVATION-01: canonicalMap already computed in step 2f — reuse it (zero additional queries)
      const tDiffStart = Date.now();

      // Build per-vendor ref sets (scoped, NOT global)
      const vendorRefSetsForDiff = new Map<string, Set<string>>();
      for (const v of vendors) {
        vendorRefSetsForDiff.set(v.vendorId, new Set(v.refs.map((r) => r.reference)));
      }

      const entries: CanonicalDiffEntry[] = [];
      let stateDivergences = 0;
      let lineDivergences = 0;
      let commerciallyAvailableCount = 0;
      let eligiblePresenceCount = 0;
      let removalByLimitCount = 0;
      let removalByCanonicalStateCount = 0;
      let productionInProcessCount = 0;
      let newProductionNeededCount = 0;
      let excludedByAgeCount = 0;
      let excludedByExternalCount = 0;
      const seenForGlobalCounts = new Set<string>();
      const vendorCoverageSummaries: VendorCoverageSummary[] = [];
      const needDiffs: CanonicalNeedDiff[] = [];

      // OP audit: count OP entries by subgrupoId for audit trail
      let opTotalLoaded = 0;
      let opWithSubgrupo = 0;
      const opSubgruposWithEntries = new Set<number>();
      for (const [subId, opts] of opOptionsBySubgrupoId) {
        opTotalLoaded += opts.length;
        opWithSubgrupo += opts.length;
        opSubgruposWithEntries.add(subId);
      }
      let opMatchingNeeds = 0;
      let opDiscardedNoMatch = 0;

      for (const v of vendors) {
        if (!v.isActive) continue;

        const thisVendorRefs = vendorRefSetsForDiff.get(v.vendorId) ?? new Set<string>();
        const coverageCtx: MaletaCoverageContext = {
          vendorId: v.vendorId,
          currentVendorReferences: thisVendorRefs,
        };

        // ── Cierre 1: Compute candidatePool BEFORE need matching ──
        // Scan entire canonical map for refs eligible for this vendor
        let poolCS = 0;
        let poolLT = 0;
        let poolIMPORT = 0;
        let excludedInBag = 0;
        for (const [, can] of canonicalMap) {
          if (!isCommerciallyAvailableForMaletas(can)) continue;
          if (!can.grupoSag || !can.subgrupoSag) continue;
          const threshold = MALETA_COVERAGE_MINIMUMS[can.canonicalLine];
          if (threshold === undefined) continue;
          if (can.compatibleCommercialStock <= threshold) continue;

          // Would be eligible except for bag exclusion?
          if (thisVendorRefs.has(can.reference)) {
            excludedInBag++;
            continue;
          }

          // Passes all eligibility checks for this vendor
          if (can.canonicalLine === "CASTILLITOS") poolCS++;
          else if (can.canonicalLine === "LATIN_KIDS") poolLT++;
          else if (can.canonicalLine === "IMPORTACION") poolIMPORT++;
        }

        // ── Process refs in this vendor's bag ──
        let vendorNeedsReplacement = 0;
        let vendorMatchedPairs = 0;
        let vendorCoveredNeeds = 0;
        const vendorUniqueCandidates = new Set<string>();
        let vendorUncoveredNeeds = 0;

        for (const ref of v.refs) {
          const can = canonicalMap.get(ref.reference);
          if (!can) continue;

          const oldStateMap: Record<SampleState, string> = {
            saludable: "ACTIVE_AVAILABLE",
            reemplazar: ref.commercialHealth === "OUT_OF_STOCK" ? "ACTIVE_NON_COMMERCIAL" : "ACTIVE_AVAILABLE",
            sin_datos: "UNKNOWN",
          };
          const oldStateCanonical = oldStateMap[ref.state] ?? "UNKNOWN";
          const oldLineToDomain: Record<string, string> = {
            CS: "CASTILLITOS_TEXTILE", LT: "LATIN_KIDS_TEXTILE", IMPORT: "CASTILLITOS_IMPORT", OTRO: "UNKNOWN",
          };
          const oldDomainEquiv = oldLineToDomain[ref.line] ?? "UNKNOWN";

          const commerciallyAvailable = isCommerciallyAvailableForMaletas(can);
          const eligiblePresence = isEligibleForMaletaPresence(can);
          const eligibleCoverage = isEligibleForMaletaCoverage(can, coverageCtx);
          const structurallyEligibleProduction = isStructurallyEligibleForMaletaProduction(can);
          const hasProductionInProcess = can.productionStock > 0 && can.compatibleCommercialStock <= 0;

          const removalLimit = MALETA_REMOVAL_LIMITS[can.canonicalLine] ?? ref.minimumRequired;
          const removalReason = resolveMaletaRemovalReason(can, removalLimit);

          if (!seenForGlobalCounts.has(ref.reference)) {
            seenForGlobalCounts.add(ref.reference);
            if (commerciallyAvailable) commerciallyAvailableCount++;
            if (eligiblePresence) eligiblePresenceCount++;
            if (hasProductionInProcess) productionInProcessCount++;
            if (removalReason === "BELOW_OPERATIONAL_LIMIT") removalByLimitCount++;
            if (removalReason === "DORMANT_REFERENCE" || removalReason === "ARCHIVE_REVIEW" || removalReason === "UNKNOWN_ACTIVITY" || removalReason === "NON_COMMERCIAL_STOCK" || removalReason === "OUT_OF_STOCK") removalByCanonicalStateCount++;
            if (removalReason === "DORMANT_REFERENCE" || removalReason === "ARCHIVE_REVIEW") excludedByAgeCount++;
            if (removalReason === "EXTERNAL_INTEGRATION") excludedByExternalCount++;
          }

          const stateDiverges = oldStateCanonical !== can.commercialReferenceStatus;
          const lineDiverges = oldDomainEquiv !== can.businessDomain;
          const diverges = stateDiverges || lineDiverges;
          if (stateDiverges) stateDivergences++;
          if (lineDiverges) lineDivergences++;

          // Waterfall for refs needing replacement
          let supplyAction: MaletaSupplyAction | null = null;
          if (ref.state === "reemplazar" || removalReason != null) {
            vendorNeedsReplacement++;

            const need: MaletaCoverageNeed = {
              riskReference: ref.reference,
              vendorId: v.vendorId,
              businessDomain: can.businessDomain,
              canonicalLine: can.canonicalLine,
              grupoSag: can.grupoSag,
              subgrupoSag: can.subgrupoSag,
              sizeClass: can.sizeClass,
            };

            // Find warehouse candidates matching this need
            const warehouseMatches: MaletaCoverageMatch[] = [];
            for (const [, candidateCan] of canonicalMap) {
              if (candidateCan.reference === ref.reference) continue;
              if (!isEligibleForMaletaCoverage(candidateCan, coverageCtx)) continue;
              if (!matchesMaletaCoverageNeed(candidateCan, need)) continue;
              warehouseMatches.push({
                candidateReference: candidateCan.reference,
                riskReference: ref.reference,
                vendorId: v.vendorId,
                matchReason: buildMatchReason(can.canonicalLine, can.grupoSag, can.subgrupoSag, can.sizeClass),
                candidateStock: candidateCan.compatibleCommercialStock,
                candidateDomain: candidateCan.businessDomain,
                candidateLine: candidateCan.canonicalLine,
              });
            }

            // OP audit: check if OP candidates exist for this ref's subgrupo
            const hasOpCandidates = ref.opReplacementOptions.length > 0;
            if (hasOpCandidates) opMatchingNeeds++;

            supplyAction = resolveMaletaSupplyAction({
              ref: can,
              hasWarehouseCandidates: warehouseMatches.length > 0,
              hasActiveOpCandidates: hasOpCandidates,
            });

            if (supplyAction === "CREATE_NEW_PRODUCTION_NEED") newProductionNeededCount++;

            // Reconciled counts
            vendorMatchedPairs += warehouseMatches.length;
            if (warehouseMatches.length > 0 || hasOpCandidates || can.productionStock > 0) {
              vendorCoveredNeeds++;
            } else {
              vendorUncoveredNeeds++;
            }
            for (const m of warehouseMatches) vendorUniqueCandidates.add(m.candidateReference);

            needDiffs.push({
              riskReference: ref.reference,
              vendorId: v.vendorId,
              vendorName: v.vendorName,
              canonicalLine: can.canonicalLine,
              grupoSag: can.grupoSag,
              subgrupoSag: can.subgrupoSag,
              sizeClass: can.sizeClass,
              oldSupplyAction: ref.supplyAction,
              canonicalSupplyAction: supplyAction,
              coverageMatches: warehouseMatches.slice(0, 5),
              divergenceReason: ref.supplyAction !== mapCanonicalToOldAction(supplyAction)
                ? `old=${ref.supplyAction ?? "null"} vs canonical=${supplyAction}`
                : null,
            });
          }

          entries.push({
            reference: ref.reference,
            vendorId: v.vendorId,
            oldState: ref.state,
            newCanonicalStatus: can.commercialReferenceStatus,
            oldLine: ref.line,
            newDomain: can.businessDomain,
            commerciallyAvailable,
            eligiblePresence,
            eligibleCoverage,
            structurallyEligibleProduction,
            hasProductionInProcess,
            supplyAction,
            removalReason,
            diverges,
          });
        }

        vendorCoverageSummaries.push({
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          currentRefs: v.totalRefs,
          needsReplacement: vendorNeedsReplacement,
          candidatePoolCS: poolCS,
          candidatePoolLT: poolLT,
          candidatePoolIMPORT: poolIMPORT,
          matchedPairsTotal: vendorMatchedPairs,
          coveredNeeds: vendorCoveredNeeds,
          uniqueCandidatesUsed: vendorUniqueCandidates.size,
          excludedAlreadyInOwnBag: excludedInBag,
          needsWithoutCoverage: vendorUncoveredNeeds,
        });
      }

      // OP audit: count OP that DON'T match any need
      const needSubgrupoIds = new Set<number>();
      for (const nd of needDiffs) {
        // Find subgrupoId from the risk ref in vendor data
        for (const v of vendors) {
          const vRef = v.refs.find((r) => r.reference === nd.riskReference);
          if (vRef?.subgrupoId != null) needSubgrupoIds.add(vRef.subgrupoId);
        }
      }
      for (const subId of opSubgruposWithEntries) {
        if (!needSubgrupoIds.has(subId)) {
          opDiscardedNoMatch += opOptionsBySubgrupoId.get(subId)?.length ?? 0;
        }
      }

      const tDiffEnd = Date.now();

      canonicalDiffReport = {
        totalRefs: entries.length,
        divergentRefs: entries.filter((e) => e.diverges).length,
        stateDivergences,
        lineDivergences,
        commerciallyAvailable: commerciallyAvailableCount,
        eligiblePresence: eligiblePresenceCount,
        removalByLimit: removalByLimitCount,
        removalByCanonicalState: removalByCanonicalStateCount,
        productionInProcess: productionInProcessCount,
        newProductionNeeded: newProductionNeededCount,
        excludedByAge: excludedByAgeCount,
        excludedByExternalIntegration: excludedByExternalCount,
        entries,
        vendorCoverageSummaries,
        needDiffs,
        opAudit: {
          totalOpLoaded: opTotalLoaded,
          activeAfterTemporalFilter: opTotalLoaded, // already filtered by loadOpBySubgrupo
          withResolvedSubgrupo: opWithSubgrupo,
          uniqueSubgruposWithOp: opSubgruposWithEntries.size,
          matchingVendorNeeds: opMatchingNeeds,
          discardedZombie: 0, // already filtered upstream
          discardedNoSubgrupo: 0, // already filtered upstream
          discardedNoMatchingNeed: opDiscardedNoMatch,
        },
        canonicalMap,
        performanceMs: {
          peQueryMs: lastClassifyPerformanceMs.peQueryMs,
          pilQueryMs: lastClassifyPerformanceMs.pilQueryMs,
          classifyLoopMs: lastClassifyPerformanceMs.classifyLoopMs,
          diffComputationMs: tDiffEnd - tDiffStart,
          totalCanonicalMs: classificationMs + (tDiffEnd - tDiffStart),
        },
      };
    } catch (err) {
      console.error("[MALETAS] Canonical shadow diff failed (non-fatal):", err);
    }
  }

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
    canonicalDiffReport,
    commercialScopeAudit,
  };
}

// ── Canonical diff helpers ─────────────────────────────────────────────────────

function buildMatchReason(
  canonicalLine: string,
  grupoSag: string | null,
  subgrupoSag: string | null,
  sizeClass: string | null,
): string {
  switch (canonicalLine) {
    case "CASTILLITOS": return `grupo=${grupoSag ?? "?"} subgrupo=${subgrupoSag ?? "?"}`;
    case "LATIN_KIDS": return `subgrupo=${subgrupoSag ?? "?"}`;
    case "IMPORTACION": return `sizeClass=${sizeClass ?? "?"}`;
    default: return canonicalLine;
  }
}

function mapCanonicalToOldAction(action: MaletaSupplyAction | null): SupplyActionType | null {
  if (action == null) return null;
  switch (action) {
    case "COVER_FROM_WAREHOUSE": return "REEMPLAZAR_BODEGA";
    case "COVER_FROM_ACTIVE_OP": return "COMPLETAR_DESDE_OP";
    case "WAIT_FOR_PRODUCTION_IN_PROCESS": return "PRODUCCION_SUGERIDA"; // closest old equivalent
    case "CREATE_NEW_PRODUCTION_NEED": return "PRODUCCION_SUGERIDA";
    case "NO_ACTION_DATA_ISSUE": return "RETIRAR_MOSTRARIO";
  }
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
// Central availability via canonical lookup (domain-specific stock policy).

function buildAccessorySummary(
  importRefSet: Set<string>,
  lookupMap: Map<string, CanonicalReferenceLookupRecord>,
): AccessorySummary {
  const totalRefs = importRefSet.size;
  let availableRefs = 0;
  let scarcityRefs = 0;
  let healthyRefs = 0;
  let zeroStockRefs = 0;

  for (const sku of importRefSet) {
    const rec = lookupMap.get(sku);
    if (!rec || rec.stockDataState === "ABSENT") continue;
    const available = rec.compatibleCommercialStock;
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
  productLine: string | null; // PRESENCE-VS-COMMERCIAL-SCOPE-FIX-01: PE productLine for line resolution
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
        productLine: p.productLine ?? null,
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
