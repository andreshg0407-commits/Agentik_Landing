/**
 * lib/comercial/tiendas/store-needs-by-line.ts
 *
 * Server-side service: needs per store, organized by commercial line.
 *
 * Needs = items with action SURTIR | SUGERIR_REEMPLAZO | SIN_STOCK_ORIGEN.
 *
 * Lines: CASTILLITOS, LATIN_KIDS, ACCESSORIES, UNCLASSIFIED (no OUT_OF_STOCK — not a need).
 *
 * Read path: getCanonicalStoreDetail() → filter needs → classify by line → sort → paginate.
 *
 * Sprint: AGENTIK-STORES-NEEDS-BY-LINE-01
 * Sprint: AGENTIK-STORES-NEEDS-REPLACEMENT-CASCADE-FIX-01
 */

import "server-only";

import { getCanonicalStoreDetail } from "./store-distribution-service";
import type {
  StoreDistributionItem,
  ReplacementCandidate,
  VariantAllocationSuggestion,
  NeedResolution,
} from "./store-distribution-types";

// ── Line identifiers ─────────────────────────────────────────────────────────

export type NeedLine =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "ACCESSORIES"
  | "UNCLASSIFIED";

export const NEED_LINES: NeedLine[] = ["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"];

// ── Need type filter (CASCADE-FIX-01: added PARTIAL_DIRECT_PLUS_REPLACEMENT) ─

export type NeedType =
  | "ALL"
  | "DIRECT_REPLENISHMENT"
  | "PARTIAL_DIRECT_PLUS_REPLACEMENT"
  | "REPLACEMENT"
  | "NO_ALTERNATIVE"
  | "CLASSIFICATION_INCOMPLETE";

// ── Sort options ─────────────────────────────────────────────────────────────

export type NeedSortBy =
  | "SHORTAGE_DESC"
  | "SHORTAGE_ASC"
  | "MAIN_STOCK_DESC"
  | "REFERENCE_ASC"
  | "REFERENCE_DESC";

// ── Size class filter (accessories only) ──────────────────────────────────────

export type NeedSizeClass =
  | "ALL"
  | "SMALL"
  | "MEDIUM"
  | "LARGE"
  | "UNCLASSIFIED";

// ── Request / Response ─────────────────────────────────────────────────────

export interface NeedsByLineRequest {
  storeId:    string;
  line:       NeedLine;
  needType?:  NeedType;       // default ALL
  sortBy?:    NeedSortBy;     // default SHORTAGE_DESC
  sizeClass?: NeedSizeClass;  // default ALL, only for ACCESSORIES
  search?:    string;
  page:       number;
  pageSize:   number;
}

export interface NeedItem {
  referenceCode:          string;
  productName:            string;
  imageUrl:               string | null;
  canonicalLine:          string;
  group:                  string;
  subgroup:               string;
  sizeClass:              string | null;
  world:                  string;

  currentUnits:           number;
  minUnits:               number;
  idealUnits:             number;
  maxUnits:               number;
  shortageQty:            number;        // max(0, minUnits - currentUnits)
  mainWarehouseAvailable: number;

  // Derived need type (CASCADE-FIX-01: 4 states + CLASSIFICATION_INCOMPLETE)
  needType:               "DIRECT_REPLENISHMENT" | "PARTIAL_DIRECT_PLUS_REPLACEMENT" | "REPLACEMENT" | "NO_ALTERNATIVE" | "CLASSIFICATION_INCOMPLETE";
  needTypeLabel:          string;

  // For DIRECT_REPLENISHMENT / PARTIAL_DIRECT_PLUS_REPLACEMENT
  suggestedReplenishment: number;        // min(shortageQty, mainWarehouseAvailable)

  // For REPLACEMENT / PARTIAL_DIRECT_PLUS_REPLACEMENT
  candidates:             ReplacementCandidate[];
  totalCandidatesFound:   number;
  hasMoreCandidates:      boolean;
  rule36BlockedCount:     number;
  replacementShortageQty: number;

  // Coverage resolution (CASCADE-FIX-01)
  resolution:             NeedResolution | null;

  // For variant allocation
  variantAllocation:      VariantAllocationSuggestion | null;

  // Explanation
  actionReason:           string;
}

export interface NeedLineSummary {
  directReplenishment:          number;
  partialDirectPlusReplacement: number;
  replacement:                  number;
  noAlternative:                number;
  classificationIncomplete:     number;
  total:                        number;
}

export interface NeedLineCount {
  line:  NeedLine;
  count: number;
}

export interface NeedsByLineResponse {
  line:             NeedLine;
  summary:          NeedLineSummary;
  items:            NeedItem[];
  pagination:       { page: number; pageSize: number; total: number; totalPages: number };
  lineCounts:       NeedLineCount[];
  availableSizeClasses: string[];  // only for ACCESSORIES
  dataFreshness:    string | null;
}

// ── Need classification ──────────────────────────────────────────────────────

const NEED_ACTIONS = new Set(["SURTIR", "SUGERIR_REEMPLAZO", "SIN_STOCK_ORIGEN"]);

function isNeed(item: StoreDistributionItem): boolean {
  return NEED_ACTIONS.has(item.action);
}

function classifyNeedLine(item: StoreDistributionItem): NeedLine {
  // Unclassified conditions
  if (!item.canonicalLine || item.canonicalLine === "SIN_LINEA") return "UNCLASSIFIED";
  if (item.group === "SIN_GRUPO_SAG" && item.world === "TEXTILE") return "UNCLASSIFIED";
  if (item.subgroup === "SIN_SUBGRUPO_SAG" && item.world === "TEXTILE") return "UNCLASSIFIED";
  if (item.classificationQuality === "UNAVAILABLE") return "UNCLASSIFIED";

  if (item.world === "TEXTILE") {
    if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
    return "CASTILLITOS";
  }
  if (item.world === "IMPORT") return "ACCESSORIES";

  return "UNCLASSIFIED";
}

// CASCADE-FIX-01: Derive need type from NeedResolution when available
// CLASSIFICATION-COMPLETENESS-01: Detect incomplete classification
function deriveNeedType(item: StoreDistributionItem): "DIRECT_REPLENISHMENT" | "PARTIAL_DIRECT_PLUS_REPLACEMENT" | "REPLACEMENT" | "NO_ALTERNATIVE" | "CLASSIFICATION_INCOMPLETE" {
  // Use NeedResolution from cascade engine when available
  if (item.needResolution) {
    const base = item.needResolution.resolutionType;
    // If NO_ALTERNATIVE and classification is incomplete, differentiate
    if (base === "NO_ALTERNATIVE" && hasIncompleteClassification(item)) {
      return "CLASSIFICATION_INCOMPLETE";
    }
    return base;
  }

  // Fallback for items without needResolution
  if (item.action === "SURTIR") {
    if (item.replacement && item.replacement.replacementCandidates.length > 0) {
      return "PARTIAL_DIRECT_PLUS_REPLACEMENT";
    }
    return "DIRECT_REPLENISHMENT";
  }
  if (item.action === "SUGERIR_REEMPLAZO") {
    const hasValid = item.replacement?.replacementCandidates.some(
      c => c.suggestedQty > 0 && c.mainWarehouseAvailableQty > 0
    );
    if (hasValid) return "REPLACEMENT";
    return hasIncompleteClassification(item) ? "CLASSIFICATION_INCOMPLETE" : "NO_ALTERNATIVE";
  }
  return hasIncompleteClassification(item) ? "CLASSIFICATION_INCOMPLETE" : "NO_ALTERNATIVE";
}

/**
 * Check if a need item has missing classification fields that prevent
 * replacement matching. Differentiates "no real alternative" from
 * "can't search because data is incomplete".
 */
function hasIncompleteClassification(item: StoreDistributionItem): boolean {
  // Castillitos: needs group + subgroup for SAME_GROUP_AND_SUBGROUP matching
  if (item.world === "TEXTILE" && item.canonicalLine !== "latin_kids") {
    return item.group === "SIN_GRUPO_SAG" || item.subgroup === "SIN_SUBGRUPO_SAG";
  }
  // Latin Kids: needs subgroup for SAME_SUBGROUP matching
  if (item.world === "TEXTILE" && item.canonicalLine === "latin_kids") {
    return item.subgroup === "SIN_SUBGRUPO_SAG";
  }
  // Accessories: needs sizeClass for SAME_SIZE_CLASS matching
  if (item.world === "IMPORT") {
    return item.sizeClass === null;
  }
  return false;
}

const NEED_TYPE_LABELS: Record<string, string> = {
  DIRECT_REPLENISHMENT:          "Reposicion directa",
  PARTIAL_DIRECT_PLUS_REPLACEMENT: "Parcial + reemplazo",
  REPLACEMENT:                   "Reemplazo sugerido",
  NO_ALTERNATIVE:                "Sin alternativa",
  CLASSIFICATION_INCOMPLETE:     "Clasificacion incompleta",
};

// ── Build NeedItem from StoreDistributionItem ─────────────────────────────

function buildNeedItem(item: StoreDistributionItem): NeedItem {
  const needType = deriveNeedType(item);
  const shortageQty = Math.max(0, item.minUnits - item.currentUnits);

  return {
    referenceCode:          item.referenceCode,
    productName:            item.productName,
    imageUrl:               item.imageUrl,
    canonicalLine:          item.canonicalLine,
    group:                  item.group,
    subgroup:               item.subgroup,
    sizeClass:              item.sizeClass,
    world:                  item.world,
    currentUnits:           item.currentUnits,
    minUnits:               item.minUnits,
    idealUnits:             item.idealUnits,
    maxUnits:               item.maxUnits,
    shortageQty,
    mainWarehouseAvailable: item.mainWarehouseAvailable,
    needType,
    needTypeLabel:          NEED_TYPE_LABELS[needType],
    suggestedReplenishment: item.action === "SURTIR" ? item.transferableUnits : 0,
    candidates:             item.replacement?.replacementCandidates ?? [],
    totalCandidatesFound:   item.replacement?.totalCandidatesFound ?? 0,
    hasMoreCandidates:      item.replacement?.hasMoreCandidates ?? false,
    rule36BlockedCount:     item.replacement?.rule36BlockedCount ?? 0,
    replacementShortageQty: item.replacement?.replacementShortageQty ?? shortageQty,
    resolution:             item.needResolution,
    variantAllocation:      item.variantAllocation,
    actionReason:           item.actionReason,
  };
}

// ── Filtering ─────────────────────────────────────────────────────────────

function applyFilters(
  items: NeedItem[],
  req: NeedsByLineRequest,
): NeedItem[] {
  let result = items;

  // Need type filter
  if (req.needType && req.needType !== "ALL") {
    result = result.filter(i => i.needType === req.needType);
  }

  // Size class filter (accessories only)
  if (req.line === "ACCESSORIES" && req.sizeClass && req.sizeClass !== "ALL") {
    const target = req.sizeClass.toLowerCase();
    if (target === "unclassified") {
      result = result.filter(i => !i.sizeClass);
    } else {
      result = result.filter(i => i.sizeClass === target);
    }
  }

  // Search
  if (req.search) {
    const q = req.search.toLowerCase().trim();
    if (q.length > 0) {
      result = result.filter(i => {
        if (i.referenceCode.toLowerCase().includes(q)) return true;
        if (i.productName.toLowerCase().includes(q)) return true;
        if (i.group.toLowerCase().includes(q)) return true;
        if (i.subgroup.toLowerCase().includes(q)) return true;
        if (req.line === "ACCESSORIES" && i.sizeClass?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
  }

  return result;
}

// ── Sorting ──────────────────────────────────────────────────────────────────

function applySorting(items: NeedItem[], sortBy?: NeedSortBy): NeedItem[] {
  const sorted = [...items];
  switch (sortBy ?? "SHORTAGE_DESC") {
    case "SHORTAGE_DESC":
      sorted.sort((a, b) => b.shortageQty - a.shortageQty || a.referenceCode.localeCompare(b.referenceCode));
      break;
    case "SHORTAGE_ASC":
      sorted.sort((a, b) => a.shortageQty - b.shortageQty || a.referenceCode.localeCompare(b.referenceCode));
      break;
    case "MAIN_STOCK_DESC":
      sorted.sort((a, b) => b.mainWarehouseAvailable - a.mainWarehouseAvailable || a.referenceCode.localeCompare(b.referenceCode));
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

// ── Main entry point ─────────────────────────────────────────────────────

export async function loadStoreNeedsByLine(
  orgId: string,
  req: NeedsByLineRequest,
): Promise<NeedsByLineResponse> {
  const detail = await getCanonicalStoreDetail(orgId, req.storeId);

  if (!detail) {
    return {
      line: req.line,
      summary: { directReplenishment: 0, partialDirectPlusReplacement: 0, replacement: 0, noAlternative: 0, classificationIncomplete: 0, total: 0 },
      items: [],
      pagination: { page: 1, pageSize: req.pageSize, total: 0, totalPages: 0 },
      lineCounts: NEED_LINES.map(l => ({ line: l, count: 0 })),
      availableSizeClasses: [],
      dataFreshness: null,
    };
  }

  // Filter to needs only
  const allNeeds = detail.items.filter(isNeed);

  // Classify by line
  const byLine = new Map<NeedLine, StoreDistributionItem[]>();
  for (const line of NEED_LINES) byLine.set(line, []);
  for (const item of allNeeds) {
    const line = classifyNeedLine(item);
    byLine.get(line)!.push(item);
  }

  // Build line counts
  const lineCounts: NeedLineCount[] = NEED_LINES.map(line => ({
    line,
    count: byLine.get(line)!.length,
  }));

  // Build need items for selected line
  const lineItems = byLine.get(req.line)!;
  const needItems = lineItems.map(buildNeedItem);

  // Build summary BEFORE applying user filters
  const summary: NeedLineSummary = {
    directReplenishment:          needItems.filter(i => i.needType === "DIRECT_REPLENISHMENT").length,
    partialDirectPlusReplacement: needItems.filter(i => i.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT").length,
    replacement:                  needItems.filter(i => i.needType === "REPLACEMENT").length,
    noAlternative:                needItems.filter(i => i.needType === "NO_ALTERNATIVE").length,
    classificationIncomplete:     needItems.filter(i => i.needType === "CLASSIFICATION_INCOMPLETE").length,
    total:                        needItems.length,
  };

  // Available size classes (for accessories)
  const availableSizeClasses: string[] = [];
  if (req.line === "ACCESSORIES") {
    const scs = new Set<string>();
    for (const item of needItems) {
      if (item.sizeClass) scs.add(item.sizeClass);
      else scs.add("unclassified");
    }
    for (const sc of ["small", "medium", "large", "unclassified"]) {
      if (scs.has(sc)) availableSizeClasses.push(sc);
    }
  }

  // Apply filters
  const filtered = applyFilters(needItems, req);

  // Sort
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
    lineCounts,
    availableSizeClasses,
    dataFreshness: detail.store.lastSyncAt,
  };
}
