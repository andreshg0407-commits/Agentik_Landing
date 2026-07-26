/**
 * lib/comercial/tiendas/store-inventory-by-line.ts
 *
 * Server-side service: inventory per store, organized by commercial line.
 *
 * Lines: CASTILLITOS, LATIN_KIDS, ACCESSORIES, UNCLASSIFIED, OUT_OF_STOCK.
 *
 * Two read paths:
 *   1. LIGHTWEIGHT — counts only: single-store PIL query, no distribution engine.
 *   2. FULL — paginated detail: getCanonicalStoreDetail() for summaries/filters/variants.
 *
 * Sprint: AGENTIK-STORES-INVENTORY-BY-LINE-01
 * Sprint: AGENTIK-STORES-INVENTORY-SNAPSHOT-PERFORMANCE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getCanonicalStoreDetail, CANONICAL_STORE_IDENTITY } from "./store-distribution-service";
import { resolveBusinessLineId } from "./store-business-lines";
import { BUSINESS_LINE_MAP } from "./store-business-lines";
import type { StoreDistributionItem, ReplacementVariant } from "./store-distribution-types";

// ── Line identifiers ─────────────────────────────────────────────────────────

export type InventoryLine =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "ACCESSORIES"
  | "UNCLASSIFIED"
  | "OUT_OF_STOCK";

// ── Inventory state (SEXTO) ──────────────────────────────────────────────────

export type InventoryState =
  | "BAJO_MINIMO"
  | "EN_RANGO"
  | "EXCESO"
  | "SIN_REGLA"
  | "AGOTADO"
  | "CLASIFICACION_PENDIENTE";

export type ConfigState =
  | "REGLA_HEREDADA"
  | "REGLA_PERSONALIZADA"
  | "SIN_REGLA"
  | "CLASIFICACION_PENDIENTE";

// ── Unclassified reason ──────────────────────────────────────────────────────

export type UnclassifiedReason =
  | "linea_ausente"
  | "grupo_ausente"
  | "subgrupo_ausente"
  | "tamano_ausente"
  | "clasificacion_ambigua"
  | "producto_no_elegible"
  | "dato_canonico_incompleto";

// ── Consolidated reference ───────────────────────────────────────────────────

export type StockQuality = "OPERATIONAL_CONFIRMED" | "PHYSICAL_ONLY" | "UNKNOWN";

export interface ReplacementBrief {
  candidateRef:              string;
  candidateDesc:             string;
  candidateImageUrl:         string | null;
  suggestedQty:              number;
  ruleSource:                string;   // "SAME_GROUP_AND_SUBGROUP" | "SAME_SUBGROUP"
  shortageQty:               number;
  // Stock evidence (REPLACEMENT-STOCK-EVIDENCE-01)
  candidateMainStock:        number;   // total main warehouse stock for candidate
  candidateStoreStock:       number;   // candidate's current stock in target store
  coveredQty:                number;   // total qty covered by all candidates
  remainingShortageQty:      number;   // shortageQty - coveredQty (≥ 0)
  stockQuality:              StockQuality;
  evidenceDate:              string;   // ISO date of stock snapshot
  // Variant detail (REPLACEMENT-VARIANTS-01)
  replacementVariants:       ReplacementVariant[];
  totalVariantCount:         number;
  displayedVariantCount:     number;
  totalVariantUnits:         number;
  variantEvidenceDate:       string;
}

export interface ConsolidatedInventoryRef {
  referenceCode:      string;
  productName:        string;
  imageUrl:           string | null;
  line:               InventoryLine;
  canonicalLine:      string;
  world:              string;
  group:              string;
  subgroup:           string;
  sizeClass:          string | null;
  currentStoreQty:    number;
  mainWarehouseQty:   number;
  minUnits:           number;
  idealUnits:         number;
  maxUnits:           number;
  inventoryState:     InventoryState;
  configState:        ConfigState;
  unclassifiedReason: UnclassifiedReason | null;
  variantCount:       number;
  hasReplacement:     boolean;
  replacementBrief:   ReplacementBrief | null;
}

// ── Variant (lazy-loaded) ────────────────────────────────────────────────────

export interface InventoryVariant {
  referenceCode:  string;
  size:           string;
  color:          string;
  storeQty:       number;
  mainQty:        number;
  inventoryState: InventoryState;
}

// ── Line summary ─────────────────────────────────────────────────────────────

export interface TextileLineSummary {
  referenciasActivas: number;
  unidades:           number;
  bajoMinimo:         number;
  enRango:            number;
  exceso:             number;
  sinRegla:           number;
  sinClasificacion:   number;
  reemplazos:         number;
  saludables:         number;
}

export interface AccessoryLineSummary {
  referenciasActivas: number;
  unidades:           number;
  pequenos:           number;
  medianos:           number;
  grandes:            number;
  sinTamano:          number;
  bajoObjetivo:       number;
  enObjetivo:         number;
  exceso:             number;
  reemplazos:         number;
  saludables:         number;
}

export interface UnclassifiedSummary {
  total:              number;
  unidades:           number;
  sinLinea:           number;
  sinGrupo:           number;
  sinSubgrupo:        number;
  sinTamano:          number;
  ambiguas:           number;
}

export interface OutOfStockSummary {
  total:              number;
  castillitos:        number;
  latinKids:          number;
  accesorios:         number;
  historialDisponible: boolean;
}

export type LineSummary =
  | { type: "textile";      data: TextileLineSummary }
  | { type: "accessory";    data: AccessoryLineSummary }
  | { type: "unclassified"; data: UnclassifiedSummary }
  | { type: "out_of_stock"; data: OutOfStockSummary };

// ── Available filters ────────────────────────────────────────────────────────

export interface AvailableFilters {
  groups:     string[];
  subgroups:  string[];
  sizeClasses: string[];
  inventoryStates: InventoryState[];
  unclassifiedReasons: UnclassifiedReason[];
}

// ── Request / Response ───────────────────────────────────────────────────────

export type SortBy = "QUANTITY_ASC" | "QUANTITY_DESC" | "REFERENCE_ASC" | "REFERENCE_DESC";

export type KpiFilter = "ALL" | "BELOW_MINIMUM" | "HEALTHY" | "HAS_REPLACEMENT";

export interface StoreInventoryByLineRequest {
  storeId:        string;
  line:           InventoryLine;
  group?:         string;
  subgroup?:      string;
  sizeClass?:     string;
  inventoryState?: InventoryState;
  unclassifiedReason?: UnclassifiedReason;
  kpiFilter?:     KpiFilter;
  sortBy?:        SortBy;
  search?:        string;
  page:           number;
  pageSize:       number;
}

export interface StoreInventoryByLineResponse {
  line:           InventoryLine;
  summary:        LineSummary;
  items:          ConsolidatedInventoryRef[];
  pagination:     { page: number; pageSize: number; total: number; totalPages: number };
  availableFilters: AvailableFilters;
  dataFreshness:  string | null;
}

export interface InventoryLineCount {
  line: InventoryLine;
  count: number;
}

// ── Classification ───────────────────────────────────────────────────────────

function classifyLine(item: StoreDistributionItem): InventoryLine {
  if (item.currentUnits === 0) return "OUT_OF_STOCK";

  // Check unclassified first
  if (isUnclassified(item)) return "UNCLASSIFIED";

  if (item.world === "TEXTILE") {
    if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
    return "CASTILLITOS";
  }
  if (item.world === "IMPORT") return "ACCESSORIES";

  return "UNCLASSIFIED";
}

function isUnclassified(item: StoreDistributionItem): boolean {
  if (!item.canonicalLine || item.canonicalLine === "SIN_LINEA") return true;
  if (item.group === "SIN_GRUPO_SAG" && item.world === "TEXTILE") return true;
  if (item.subgroup === "SIN_SUBGRUPO_SAG" && item.world === "TEXTILE") return true;
  if (item.classificationQuality === "UNAVAILABLE") return true;
  if (item.action === "REQUIERE_CONFIGURACION" && item.dataQuality === "REQUIRES_CONFIGURATION") return true;
  return false;
}

function deriveUnclassifiedReason(item: StoreDistributionItem): UnclassifiedReason {
  if (!item.canonicalLine || item.canonicalLine === "SIN_LINEA") return "linea_ausente";
  if (item.group === "SIN_GRUPO_SAG") return "grupo_ausente";
  if (item.subgroup === "SIN_SUBGRUPO_SAG") return "subgrupo_ausente";
  if (item.world === "IMPORT" && !item.sizeClass) return "tamano_ausente";
  if (item.classificationQuality === "UNAVAILABLE") return "dato_canonico_incompleto";
  if (item.dataQuality === "REQUIRES_CONFIGURATION") return "clasificacion_ambigua";
  return "dato_canonico_incompleto";
}

function deriveInventoryState(item: StoreDistributionItem, line: InventoryLine): InventoryState {
  if (line === "OUT_OF_STOCK") return "AGOTADO";
  if (line === "UNCLASSIFIED") return "CLASIFICACION_PENDIENTE";

  if (item.action === "SIN_REGLA" || item.action === "SIN_DATOS") return "SIN_REGLA";
  if (item.action === "REQUIERE_CONFIGURACION") return "CLASIFICACION_PENDIENTE";
  if (item.excess > 0) return "EXCESO";
  if (item.deficit > 0) return "BAJO_MINIMO";
  return "EN_RANGO";
}

function deriveConfigState(item: StoreDistributionItem): ConfigState {
  if (item.action === "SIN_REGLA" || item.action === "SIN_DATOS") return "SIN_REGLA";
  if (item.action === "REQUIERE_CONFIGURACION") return "CLASIFICACION_PENDIENTE";
  if (item.resolvedBy === "variant_override" || item.resolvedBy === "reference") return "REGLA_PERSONALIZADA";
  return "REGLA_HEREDADA";
}

// ── Consolidation (per-reference) ────────────────────────────────────────────

interface ItemsByRef {
  items: StoreDistributionItem[];
  line:  InventoryLine;
}

function consolidateByReference(
  items: StoreDistributionItem[],
): ConsolidatedInventoryRef[] {
  const refMap = new Map<string, ItemsByRef>();

  for (const item of items) {
    const line = classifyLine(item);
    const existing = refMap.get(item.referenceCode);
    if (existing) {
      existing.items.push(item);
    } else {
      refMap.set(item.referenceCode, { items: [item], line });
    }
  }

  const consolidated: ConsolidatedInventoryRef[] = [];

  for (const [ref, { items: variants, line }] of refMap) {
    const first = variants[0];
    const currentStoreQty = variants.reduce((sum, v) => sum + v.currentUnits, 0);
    const mainWarehouseQty = variants.reduce((sum, v) => sum + v.mainWarehouseAvailable, 0);

    // Use the highest priority variant for rule thresholds
    const minUnits = Math.max(...variants.map(v => v.minUnits));
    const idealUnits = Math.max(...variants.map(v => v.idealUnits));
    const maxUnits = Math.max(...variants.map(v => v.maxUnits));

    const inventoryState = deriveInventoryState(first, line);
    const configState = deriveConfigState(first);
    const unclassifiedReason = line === "UNCLASSIFIED" ? deriveUnclassifiedReason(first) : null;

    // Replacement: find first variant with replacement candidates
    const variantWithReplacement = variants.find(v =>
      v.replacement && v.replacement.replacementCandidates.length > 0
    );
    let hasReplacement = !!variantWithReplacement;
    let replacementBrief: ReplacementBrief | null = null;
    if (variantWithReplacement?.replacement) {
      const rep = variantWithReplacement.replacement;
      const best = rep.selectedReplacementCandidate ?? rep.replacementCandidates[0];
      if (best) {
        const coveredQty = rep.replacementCoveredQty;
        const remainingShortageQty = Math.max(0, rep.replacementShortageQty - coveredQty);
        // Consistency: if candidate has no available stock or suggested qty is 0, no replacement
        if (best.mainWarehouseAvailableQty > 0 && best.suggestedQty > 0) {
          replacementBrief = {
            candidateRef: best.referenceCode,
            candidateDesc: best.description,
            candidateImageUrl: best.imageUrl,
            suggestedQty: best.suggestedQty,
            ruleSource: rep.replacementRuleSource,
            shortageQty: rep.replacementShortageQty,
            candidateMainStock: best.mainWarehouseAvailableQty,
            candidateStoreStock: best.storeStock,
            coveredQty,
            remainingShortageQty,
            stockQuality: "OPERATIONAL_CONFIRMED",
            evidenceDate: new Date().toISOString().slice(0, 10),
            // Variant detail (REPLACEMENT-VARIANTS-01)
            replacementVariants: best.replacementVariants ?? [],
            totalVariantCount: best.totalVariantCount ?? 0,
            displayedVariantCount: best.displayedVariantCount ?? 0,
            totalVariantUnits: best.totalVariantUnits ?? 0,
            variantEvidenceDate: best.variantEvidenceDate ?? new Date().toISOString().slice(0, 10),
          };
        } else {
          // Candidate has no real stock — do not offer as replacement
          hasReplacement = false;
        }
      }
    }

    consolidated.push({
      referenceCode: ref,
      productName: first.productName,
      imageUrl: first.imageUrl,
      line,
      canonicalLine: first.canonicalLine,
      world: first.world,
      group: first.group,
      subgroup: first.subgroup,
      sizeClass: first.sizeClass,
      currentStoreQty,
      mainWarehouseQty,
      minUnits,
      idealUnits,
      maxUnits,
      inventoryState,
      configState,
      unclassifiedReason,
      variantCount: variants.length,
      hasReplacement,
      replacementBrief,
    });
  }

  return consolidated;
}

// ── Summaries ────────────────────────────────────────────────────────────────

function buildTextileSummary(refs: ConsolidatedInventoryRef[]): TextileLineSummary {
  return {
    referenciasActivas: refs.length,
    unidades:           refs.reduce((s, r) => s + r.currentStoreQty, 0),
    bajoMinimo:         refs.filter(r => r.inventoryState === "BAJO_MINIMO").length,
    enRango:            refs.filter(r => r.inventoryState === "EN_RANGO").length,
    exceso:             refs.filter(r => r.inventoryState === "EXCESO").length,
    sinRegla:           refs.filter(r => r.inventoryState === "SIN_REGLA").length,
    sinClasificacion:   refs.filter(r => r.inventoryState === "CLASIFICACION_PENDIENTE").length,
    reemplazos:         refs.filter(r => r.inventoryState === "BAJO_MINIMO" && r.hasReplacement).length,
    saludables:         refs.filter(r => r.inventoryState === "EN_RANGO").length,
  };
}

function buildAccessorySummary(refs: ConsolidatedInventoryRef[]): AccessoryLineSummary {
  return {
    referenciasActivas: refs.length,
    unidades:           refs.reduce((s, r) => s + r.currentStoreQty, 0),
    pequenos:           refs.filter(r => r.sizeClass === "small").length,
    medianos:           refs.filter(r => r.sizeClass === "medium").length,
    grandes:            refs.filter(r => r.sizeClass === "large").length,
    sinTamano:          refs.filter(r => !r.sizeClass).length,
    bajoObjetivo:       refs.filter(r => r.inventoryState === "BAJO_MINIMO").length,
    enObjetivo:         refs.filter(r => r.inventoryState === "EN_RANGO").length,
    exceso:             refs.filter(r => r.inventoryState === "EXCESO").length,
    reemplazos:         refs.filter(r => r.inventoryState === "BAJO_MINIMO" && r.hasReplacement).length,
    saludables:         refs.filter(r => r.inventoryState === "EN_RANGO").length,
  };
}

function buildUnclassifiedSummary(refs: ConsolidatedInventoryRef[]): UnclassifiedSummary {
  return {
    total:       refs.length,
    unidades:    refs.reduce((s, r) => s + r.currentStoreQty, 0),
    sinLinea:    refs.filter(r => r.unclassifiedReason === "linea_ausente").length,
    sinGrupo:    refs.filter(r => r.unclassifiedReason === "grupo_ausente").length,
    sinSubgrupo: refs.filter(r => r.unclassifiedReason === "subgrupo_ausente").length,
    sinTamano:   refs.filter(r => r.unclassifiedReason === "tamano_ausente").length,
    ambiguas:    refs.filter(r => r.unclassifiedReason === "clasificacion_ambigua" || r.unclassifiedReason === "dato_canonico_incompleto" || r.unclassifiedReason === "producto_no_elegible").length,
  };
}

function buildOutOfStockSummary(refs: ConsolidatedInventoryRef[]): OutOfStockSummary {
  return {
    total:               refs.length,
    castillitos:         refs.filter(r => r.canonicalLine === "castillitos").length,
    latinKids:           refs.filter(r => r.canonicalLine === "latin_kids").length,
    accesorios:          refs.filter(r => r.world === "IMPORT").length,
    historialDisponible: false, // DECIMOTERCERO: no reliable historical source yet
  };
}

function buildSummary(line: InventoryLine, refs: ConsolidatedInventoryRef[]): LineSummary {
  switch (line) {
    case "CASTILLITOS":
    case "LATIN_KIDS":
      return { type: "textile", data: buildTextileSummary(refs) };
    case "ACCESSORIES":
      return { type: "accessory", data: buildAccessorySummary(refs) };
    case "UNCLASSIFIED":
      return { type: "unclassified", data: buildUnclassifiedSummary(refs) };
    case "OUT_OF_STOCK":
      return { type: "out_of_stock", data: buildOutOfStockSummary(refs) };
  }
}

// ── Filtering ────────────────────────────────────────────────────────────────

function applyFilters(
  refs: ConsolidatedInventoryRef[],
  req: StoreInventoryByLineRequest,
): ConsolidatedInventoryRef[] {
  let result = refs;

  // KPI filter (mutually exclusive with inventoryState)
  if (req.kpiFilter && req.kpiFilter !== "ALL") {
    switch (req.kpiFilter) {
      case "BELOW_MINIMUM":
        result = result.filter(r => r.inventoryState === "BAJO_MINIMO");
        break;
      case "HEALTHY":
        result = result.filter(r => r.inventoryState === "EN_RANGO");
        break;
      case "HAS_REPLACEMENT":
        result = result.filter(r => r.inventoryState === "BAJO_MINIMO" && r.hasReplacement);
        break;
    }
  }

  if (req.group) {
    result = result.filter(r => r.group === req.group);
  }
  if (req.subgroup) {
    result = result.filter(r => r.subgroup === req.subgroup);
  }
  if (req.sizeClass) {
    result = result.filter(r => r.sizeClass === req.sizeClass);
  }
  if (req.inventoryState && !req.kpiFilter) {
    result = result.filter(r => r.inventoryState === req.inventoryState);
  }
  if (req.unclassifiedReason) {
    result = result.filter(r => r.unclassifiedReason === req.unclassifiedReason);
  }
  if (req.search) {
    const q = req.search.toLowerCase();
    result = result.filter(r =>
      r.referenceCode.toLowerCase().includes(q) ||
      r.productName.toLowerCase().includes(q) ||
      r.group.toLowerCase().includes(q) ||
      r.subgroup.toLowerCase().includes(q) ||
      (r.sizeClass && r.sizeClass.toLowerCase().includes(q))
    );
  }

  return result;
}

function applySorting(
  refs: ConsolidatedInventoryRef[],
  sortBy?: SortBy,
): ConsolidatedInventoryRef[] {
  if (!sortBy) sortBy = "QUANTITY_ASC";
  const sorted = [...refs];
  switch (sortBy) {
    case "QUANTITY_ASC":
      sorted.sort((a, b) => a.currentStoreQty - b.currentStoreQty);
      break;
    case "QUANTITY_DESC":
      sorted.sort((a, b) => b.currentStoreQty - a.currentStoreQty);
      break;
    case "REFERENCE_ASC":
      sorted.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode));
      break;
    case "REFERENCE_DESC":
      sorted.sort((a, b) => b.referenceCode.localeCompare(a.referenceCode));
      break;
  }
  return sorted;
}

function buildAvailableFilters(refs: ConsolidatedInventoryRef[], line: InventoryLine): AvailableFilters {
  const groups = [...new Set(refs.map(r => r.group).filter(g => g && g !== "SIN_GRUPO_SAG"))].sort();
  const subgroups = [...new Set(refs.map(r => r.subgroup).filter(s => s && s !== "SIN_SUBGRUPO_SAG"))].sort();
  const sizeClasses = [...new Set(refs.map(r => r.sizeClass).filter(Boolean) as string[])].sort();
  const inventoryStates = [...new Set(refs.map(r => r.inventoryState))];
  const unclassifiedReasons = line === "UNCLASSIFIED"
    ? [...new Set(refs.map(r => r.unclassifiedReason).filter(Boolean) as UnclassifiedReason[])]
    : [];

  return { groups, subgroups, sizeClasses, inventoryStates, unclassifiedReasons };
}

// ── Diagnostic (SEXTO — temporary) ──────────────────────────────────────────

export async function diagnoseInventoryByLine(
  orgId: string,
  storeId: string,
): Promise<Record<string, unknown>> {
  const detail = await getCanonicalStoreDetail(orgId, storeId);
  if (!detail) return { error: "store_not_found", storeId };

  const totalItems = detail.items.length;
  const totalStock = detail.items.reduce((s, i) => s + i.currentUnits, 0);
  const withStock = detail.items.filter(i => i.currentUnits > 0).length;

  // World distribution
  const byWorld: Record<string, number> = {};
  for (const i of detail.items) byWorld[i.world] = (byWorld[i.world] || 0) + 1;

  // CanonicalLine distribution
  const byCanonicalLine: Record<string, number> = {};
  for (const i of detail.items) byCanonicalLine[i.canonicalLine] = (byCanonicalLine[i.canonicalLine] || 0) + 1;

  // Group distribution
  const byGroup: Record<string, number> = {};
  for (const i of detail.items) byGroup[i.group] = (byGroup[i.group] || 0) + 1;

  // Subgroup distribution
  const bySubgroup: Record<string, number> = {};
  for (const i of detail.items) bySubgroup[i.subgroup] = (bySubgroup[i.subgroup] || 0) + 1;

  // ClassificationQuality distribution
  const byClassQ: Record<string, number> = {};
  for (const i of detail.items) byClassQ[i.classificationQuality] = (byClassQ[i.classificationQuality] || 0) + 1;

  // DataQuality distribution
  const byDataQ: Record<string, number> = {};
  for (const i of detail.items) byDataQ[i.dataQuality] = (byDataQ[i.dataQuality] || 0) + 1;

  // Action distribution
  const byAction: Record<string, number> = {};
  for (const i of detail.items) byAction[i.action] = (byAction[i.action] || 0) + 1;

  // Classification result
  const byInventoryLine: Record<string, number> = {};
  const unclassifiedReasons: Record<string, number> = {};
  for (const i of detail.items) {
    const line = classifyLine(i);
    byInventoryLine[line] = (byInventoryLine[line] || 0) + 1;
    if (line === "UNCLASSIFIED") {
      const reason = deriveUnclassifiedReason(i);
      unclassifiedReasons[reason] = (unclassifiedReasons[reason] || 0) + 1;
    }
  }

  // Consolidation
  const consolidated = consolidateByReference(detail.items);
  const byConsolidatedLine: Record<string, number> = {};
  for (const r of consolidated) byConsolidatedLine[r.line] = (byConsolidatedLine[r.line] || 0) + 1;

  // Check isUnclassified conditions
  const noCanonicalLine = detail.items.filter(i => !i.canonicalLine || i.canonicalLine === "SIN_LINEA").length;
  const sinGrupoSagTextile = detail.items.filter(i => i.group === "SIN_GRUPO_SAG" && i.world === "TEXTILE").length;
  const sinSubgrupoSagTextile = detail.items.filter(i => i.subgroup === "SIN_SUBGRUPO_SAG" && i.world === "TEXTILE").length;
  const unavailableClassQ = detail.items.filter(i => i.classificationQuality === "UNAVAILABLE").length;
  const reqConfigAndReqData = detail.items.filter(i => i.action === "REQUIERE_CONFIGURACION" && i.dataQuality === "REQUIRES_CONFIGURATION").length;

  return {
    storeId, storeName: detail.store.name,
    totalItems, totalStock, withStock,
    byWorld, byCanonicalLine, byGroup, bySubgroup,
    byClassQ, byDataQ, byAction,
    byInventoryLine, unclassifiedReasons,
    byConsolidatedLine,
    unclassifiedConditions: {
      noCanonicalLine,
      sinGrupoSagTextile,
      sinSubgrupoSagTextile,
      unavailableClassQ,
      reqConfigAndReqData,
    },
    kpis: detail.kpis,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load paginated inventory for a specific store and line.
 * Consumes getCanonicalStoreDetail — no additional DB queries.
 */
export async function loadStoreInventoryByLine(
  orgId: string,
  req: StoreInventoryByLineRequest,
): Promise<StoreInventoryByLineResponse> {
  const detail = await getCanonicalStoreDetail(orgId, req.storeId);

  if (!detail) {
    return {
      line: req.line,
      summary: buildSummary(req.line, []),
      items: [],
      pagination: { page: 1, pageSize: req.pageSize, total: 0, totalPages: 0 },
      availableFilters: { groups: [], subgroups: [], sizeClasses: [], inventoryStates: [], unclassifiedReasons: [] },
      dataFreshness: null,
    };
  }

  // Consolidate all items by reference
  const allConsolidated = consolidateByReference(detail.items);

  // Filter to the requested line
  const lineRefs = allConsolidated.filter(r => r.line === req.line);

  // Build summary BEFORE applying user filters (so summary reflects full line)
  const summary = buildSummary(req.line, lineRefs);

  // Build available filters from full line
  const availableFilters = buildAvailableFilters(lineRefs, req.line);

  // Apply user filters
  const filtered = applyFilters(lineRefs, req);

  // Sort server-side BEFORE pagination
  const sorted = applySorting(filtered, req.sortBy);

  // Paginate
  const total = sorted.length;
  const totalPages = Math.ceil(total / req.pageSize) || 1;
  const page = Math.min(req.page, totalPages);
  const offset = (page - 1) * req.pageSize;
  const items = sorted.slice(offset, offset + req.pageSize);

  return {
    line: req.line,
    summary,
    items,
    pagination: { page, pageSize: req.pageSize, total, totalPages },
    availableFilters,
    dataFreshness: detail.store.lastSyncAt,
  };
}

// ── Lightweight counts cache (PERFORMANCE-01) ────────────────────────────────

const countsCache = new Map<string, { data: InventoryLineCount[]; expiresAt: number }>();
const COUNTS_TTL = 120_000; // 2 minutes

/**
 * Invalidate line counts cache for all stores in an org.
 * Call after PIL sync, governance changes, or classification changes.
 */
export function invalidateLineCountsCache(orgId: string): void {
  for (const [key] of countsCache) {
    if (key.startsWith(`lineCounts:${orgId}:`)) countsCache.delete(key);
  }
}

/**
 * Returns line counts for all 5 lines (used for line navigation tabs).
 *
 * LIGHTWEIGHT PATH — single-store PIL query, no distribution engine:
 *   - queries only ONE warehouse (the store's PK)
 *   - only rows with quantity > 0
 *   - selects only classification columns (sku, productLine, grupoSag, subgrupoSag)
 *   - no images, no policies, no main warehouse, no replacements, no scarcity
 *   - classifies using the same canonical business line logic
 *   - consolidates by reference
 *   - cached per store for 2 minutes
 */
export async function getInventoryLineCounts(
  orgId: string,
  storeId: string,
): Promise<InventoryLineCount[]> {
  const cacheKey = `lineCounts:${orgId}:${storeId}`;
  const cached = countsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  // Resolve warehouse PK from store slug
  const warehousePk = resolveWarehousePk(storeId);
  if (!warehousePk) {
    return EMPTY_COUNTS;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  // Single-store, minimal PIL query — no joins to main warehouse, no images
  const levels: LightPILRow[] = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: warehousePk, quantity: { gt: 0 } },
    select: {
      quantity: true,
      reservedQty: true,
      product: { select: { sku: true, productLine: true, grupoSag: true, subgrupoSag: true } },
      variant: { select: { sku: true } },
    },
  });

  // Classify and consolidate by reference
  const refLines = new Map<string, InventoryLine>();
  for (const lv of levels) {
    const ref = (lv.variant?.sku ?? lv.product?.sku ?? "").toUpperCase();
    if (!ref) continue;
    const qty = Math.max(0, lv.quantity - lv.reservedQty);
    if (qty === 0) continue;
    if (refLines.has(ref)) continue; // first variant wins (same as consolidateByReference)

    refLines.set(ref, classifyFromPIL(lv));
  }

  const counts = new Map<InventoryLine, number>();
  for (const [, line] of refLines) {
    counts.set(line, (counts.get(line) || 0) + 1);
  }

  const result: InventoryLineCount[] = [
    { line: "CASTILLITOS", count: counts.get("CASTILLITOS") || 0 },
    { line: "LATIN_KIDS", count: counts.get("LATIN_KIDS") || 0 },
    { line: "ACCESSORIES", count: counts.get("ACCESSORIES") || 0 },
    { line: "UNCLASSIFIED", count: counts.get("UNCLASSIFIED") || 0 },
    { line: "OUT_OF_STOCK", count: counts.get("OUT_OF_STOCK") || 0 },
  ];

  countsCache.set(cacheKey, { data: result, expiresAt: Date.now() + COUNTS_TTL });
  return result;
}

// ── Lightweight PIL types ─────────────────────────────────────────────────────

interface LightPILRow {
  quantity:    number;
  reservedQty: number;
  product?: { sku: string | null; productLine: string | null; grupoSag: string | null; subgrupoSag: string | null } | null;
  variant?: { sku: string | null } | null;
}

const EMPTY_COUNTS: InventoryLineCount[] = [
  { line: "CASTILLITOS", count: 0 },
  { line: "LATIN_KIDS", count: 0 },
  { line: "ACCESSORIES", count: 0 },
  { line: "UNCLASSIFIED", count: 0 },
  { line: "OUT_OF_STOCK", count: 0 },
];

/**
 * Resolve warehouse PK from store slug.
 * Uses CANONICAL_STORE_IDENTITY (slug → PK reverse lookup).
 */
function resolveWarehousePk(storeId: string): string | null {
  for (const [pk, identity] of Object.entries(CANONICAL_STORE_IDENTITY)) {
    if (identity.slug === storeId) return pk;
  }
  return null;
}

/**
 * Classify a PIL row into an InventoryLine using the same canonical logic
 * as classifyLine() but without requiring a full StoreDistributionItem.
 *
 * Same rules:
 *   - no canonical line / SIN_LINEA → UNCLASSIFIED
 *   - SIN_GRUPO_SAG + TEXTILE → UNCLASSIFIED
 *   - SIN_SUBGRUPO_SAG + TEXTILE → UNCLASSIFIED
 *   - TEXTILE + latin_kids → LATIN_KIDS
 *   - TEXTILE + * → CASTILLITOS
 *   - IMPORT → ACCESSORIES
 *   - else → UNCLASSIFIED
 */
function classifyFromPIL(lv: LightPILRow): InventoryLine {
  const lineId = resolveBusinessLineId(lv.product?.productLine);
  const bl = BUSINESS_LINE_MAP[lineId];
  const world = bl?.ruleMode === "accessory_import" ? "IMPORT" : "TEXTILE";
  const grupo = lv.product?.grupoSag ?? "SIN_GRUPO_SAG";
  const subgrupo = lv.product?.subgrupoSag ?? "SIN_SUBGRUPO_SAG";

  if (!lineId || lineId === "SIN_LINEA") return "UNCLASSIFIED";
  if (grupo === "SIN_GRUPO_SAG" && world === "TEXTILE") return "UNCLASSIFIED";
  if (subgrupo === "SIN_SUBGRUPO_SAG" && world === "TEXTILE") return "UNCLASSIFIED";
  if (world === "TEXTILE") return lineId === "latin_kids" ? "LATIN_KIDS" : "CASTILLITOS";
  if (world === "IMPORT") return "ACCESSORIES";
  return "UNCLASSIFIED";
}

/**
 * Load variants for a specific reference in a store.
 */
export async function loadInventoryVariants(
  orgId: string,
  storeId: string,
  referenceCode: string,
): Promise<InventoryVariant[]> {
  const detail = await getCanonicalStoreDetail(orgId, storeId);
  if (!detail) return [];

  return detail.items
    .filter(i => i.referenceCode === referenceCode)
    .map(i => ({
      referenceCode: i.referenceCode,
      size: i.size,
      color: i.color,
      storeQty: i.currentUnits,
      mainQty: i.mainWarehouseAvailable,
      inventoryState: deriveInventoryState(i, classifyLine(i)),
    }));
}
