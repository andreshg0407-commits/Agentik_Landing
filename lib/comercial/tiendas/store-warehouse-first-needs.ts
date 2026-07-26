/**
 * lib/comercial/tiendas/store-warehouse-first-needs.ts
 *
 * AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01
 *
 * Warehouse-first needs resolution: the primary row is a warehouse reference
 * with available commercial stock, and its children are the store needs it
 * can resolve.
 *
 * Data flow:
 *   1. loadDistributionData() → full warehouse stock (cached)
 *   2. getCanonicalStoreDetail() → store items with actions/rules (cached)
 *   3. Build two universes: store needs + warehouse availability
 *   4. Match warehouse refs → store needs (reposición + reemplazo)
 *   5. Anti-overallocation simulation
 *   6. Return warehouse-first read model
 *
 * No SOAP. No N+1. No parallel engine — reuses canonical distribution.
 *
 * Sprint: AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01
 */

import "server-only";

import {
  loadDistributionData,
  buildMainStockIndex,
  getScarcityParams,
  buildSubstitutionIndex,
  buildCandidateVariants,
  loadHeroImageMap,
  getCanonicalStoreDetail,
} from "./store-distribution-service";
import type {
  MainStockIndex,
  ScarcityParams,
  SubstitutionIndex,
} from "./store-distribution-service";
import type {
  StoreDistributionItem,
  ReplacementVariant,
} from "./store-distribution-types";
import type { EffectiveRule, EffectiveRuleSource } from "./store-inventory-by-line";
import type { StoreSizeClass } from "./store-policy-types";

// ── Public types ──────────────────────────────────────────────────────────────

export type WHFLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES" | "UNCLASSIFIED";

export type WHFMatchType =
  | "MISMA_REFERENCIA"
  | "MISMO_GRUPO_Y_SUBGRUPO"
  | "MISMO_SUBGRUPO"
  | "MISMO_SIZE_CLASS"
  | "MISMO_SUBGRUPO_Y_SIZE_CLASS";

export type WHFResolutionType = "REPOSICION" | "REEMPLAZO";

export type WHFRule36Status =
  | "ELEGIBLE_4_TIENDAS"
  | "SOLO_CENTRO_CALDAS"
  | "BLOQUEADA";

export type WHFSortBy =
  | "AVAILABLE_DESC"
  | "NEEDS_COUNT_DESC"
  | "URGENCY_DESC"
  | "REFERENCE_ASC";

export interface WHFStoreNeed {
  storeReference: string;
  description: string;
  imageUrl: string | null;
  canonicalLine: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  storeQty: number;
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
  shortageQty: number;
  matchType: WHFMatchType;
  resolutionType: WHFResolutionType;
  suggestedQty: number;
  coveragePossible: number;
  effectiveRule: EffectiveRule;
  ruleSource: string;
}

export interface WHFWarehouseVariant {
  size: string | null;
  color: string | null;
  availableQty: number;
}

export interface WHFWarehouseRef {
  warehouseReference: string;
  description: string;
  imageUrl: string | null;
  canonicalLine: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  warehouseId: string;
  commercialAvailableQty: number;
  totalSuggestedQty: number;
  needsResolvable: number;
  rule36Status: WHFRule36Status;
  resolutionType: WHFResolutionType;
  positiveVariants: WHFWarehouseVariant[];
  snapshotAt: string;
  storeNeeds: WHFStoreNeed[];
}

export interface WHFNoSolutionItem {
  storeReference: string;
  description: string;
  imageUrl: string | null;
  canonicalLine: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  storeQty: number;
  minUnits: number;
  idealUnits: number;
  shortageQty: number;
  reason: string;
  effectiveRule: EffectiveRule;
}

export interface WHFSummary {
  availableForSupply: number;
  totalSuggestedUnits: number;
  sameRefReplenishments: number;
  replacements: number;
  noSolution: number;
}

export interface WHFRequest {
  storeId: string;
  line: WHFLine;
  sortBy?: WHFSortBy;
  search?: string;
  page: number;
  pageSize: number;
}

export interface WHFLineCount {
  line: WHFLine;
  count: number;
}

export interface WHFResponse {
  line: WHFLine;
  summary: WHFSummary;
  items: WHFWarehouseRef[];
  noSolutionItems: WHFNoSolutionItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  lineCounts: WHFLineCount[];
  dataFreshness: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NEED_ACTIONS = new Set(["SURTIR", "SUGERIR_REEMPLAZO", "SIN_STOCK_ORIGEN"]);
const WHF_LINES: WHFLine[] = ["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"];

// ── Internal: consolidated store need ─────────────────────────────────────────

interface ConsolidatedNeed {
  referenceCode: string;
  productName: string;
  imageUrl: string | null;
  canonicalLine: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  world: string;
  storeQty: number;
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
  shortageQty: number;
  mainWarehouseAvailable: number;
  effectiveRule: EffectiveRule;
  ruleSource: string;
  line: WHFLine;
  variantsInStore: { size: string; color: string; qty: number }[];
}

// ── Classify line (mirrors needs-by-line logic) ────────────────────────────

function classifyLine(item: StoreDistributionItem): WHFLine {
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

// ── Build effective rule from distribution item ────────────────────────────

function resolveRuleSource(resolvedBy: string): EffectiveRuleSource {
  switch (resolvedBy) {
    case "textile_default": case "default": return "TENANT_DEFAULT";
    case "special_product": return "SPECIAL_PRODUCT";
    case "global_low_stock": return "RULE_36";
    default: return "STORE_OVERRIDE";
  }
}

function buildRule(item: StoreDistributionItem): EffectiveRule {
  const source = resolveRuleSource(item.resolvedBy);
  return {
    ruleId: null,
    source,
    minUnits: item.minUnits,
    idealUnits: item.idealUnits,
    maxUnits: item.maxUnits,
    targetUnits: item.idealUnits,
    inherited: source === "TENANT_DEFAULT" || source === "FALLBACK",
    validFrom: null,
    validTo: null,
    season: null,
  };
}

// ── Consolidate variants into reference-level needs ───────────────────────

function consolidateNeeds(items: StoreDistributionItem[]): ConsolidatedNeed[] {
  const byRef = new Map<string, {
    items: StoreDistributionItem[];
    totalQty: number;
    variants: { size: string; color: string; qty: number }[];
  }>();

  for (const item of items) {
    if (!NEED_ACTIONS.has(item.action)) continue;

    const key = item.referenceCode;
    const existing = byRef.get(key);
    if (existing) {
      existing.items.push(item);
      existing.totalQty += item.currentUnits;
      existing.variants.push({ size: item.size, color: item.color, qty: item.currentUnits });
    } else {
      byRef.set(key, {
        items: [item],
        totalQty: item.currentUnits,
        variants: [{ size: item.size, color: item.color, qty: item.currentUnits }],
      });
    }
  }

  const consolidated: ConsolidatedNeed[] = [];
  for (const [ref, data] of byRef) {
    // Use first variant's metadata (all share the same ref-level fields)
    const first = data.items[0];
    const line = classifyLine(first);

    // Aggregate: storeQty = sum of all variant currentUnits
    // Use first item's rule thresholds (they're per-reference, same across variants)
    const shortageQty = Math.max(0, first.idealUnits - data.totalQty);

    consolidated.push({
      referenceCode: ref,
      productName: first.productName,
      imageUrl: first.imageUrl,
      canonicalLine: first.canonicalLine,
      group: first.group,
      subgroup: first.subgroup,
      sizeClass: first.sizeClass,
      world: first.world,
      storeQty: data.totalQty,
      minUnits: first.minUnits,
      idealUnits: first.idealUnits,
      maxUnits: first.maxUnits,
      shortageQty,
      mainWarehouseAvailable: first.mainWarehouseAvailable,
      effectiveRule: buildRule(first),
      ruleSource: first.resolvedBy,
      line,
      variantsInStore: data.variants,
    });
  }
  return consolidated;
}

// ── Rule 36 evaluation ──────────────────────────────────────────────────────

/** @internal — exported for testing only */
export function evaluateRule36(
  commercialStock: number,
  resolutionType: WHFResolutionType,
  storeSlug: string,
  scarcity: ScarcityParams,
): WHFRule36Status {
  if (!scarcity.enabled) return "ELEGIBLE_4_TIENDAS";

  if (resolutionType === "REEMPLAZO") {
    // Replacement: must be > threshold for ALL stores
    return commercialStock > scarcity.threshold ? "ELEGIBLE_4_TIENDAS" : "BLOQUEADA";
  }

  // Same ref replenishment
  if (commercialStock > scarcity.threshold) return "ELEGIBLE_4_TIENDAS";

  // Between 1 and threshold: only allowed stores
  if (commercialStock > 0 && scarcity.allowedIds.includes(storeSlug)) return "SOLO_CENTRO_CALDAS";

  return "BLOQUEADA";
}

// ── Compatibility matching ───────────────────────────────────────────────────

/** @internal — exported for testing only */
export function findMatchType(
  warehouseRef: string,
  warehouseMeta: { canonicalLine: string; group: string; subgroup: string; sizeClass: string | null },
  need: ConsolidatedNeed,
): WHFMatchType | null {
  // Same reference = reposición
  if (warehouseRef === need.referenceCode) return "MISMA_REFERENCIA";

  // Castillitos: same group + subgroup
  if (need.line === "CASTILLITOS") {
    if (warehouseMeta.canonicalLine === need.canonicalLine &&
        warehouseMeta.group === need.group && warehouseMeta.group !== "SIN_GRUPO_SAG" &&
        warehouseMeta.subgroup === need.subgroup && warehouseMeta.subgroup !== "SIN_SUBGRUPO_SAG") {
      return "MISMO_GRUPO_Y_SUBGRUPO";
    }
    return null;
  }

  // Latin Kids: same subgroup (no group requirement)
  if (need.line === "LATIN_KIDS") {
    if (warehouseMeta.canonicalLine === need.canonicalLine &&
        warehouseMeta.subgroup === need.subgroup && warehouseMeta.subgroup !== "SIN_SUBGRUPO_SAG") {
      return "MISMO_SUBGRUPO";
    }
    return null;
  }

  // Accessories: same sizeClass (prefer same subgroup + sizeClass)
  if (need.line === "ACCESSORIES") {
    if (warehouseMeta.sizeClass && warehouseMeta.sizeClass === need.sizeClass) {
      if (warehouseMeta.subgroup === need.subgroup && warehouseMeta.subgroup !== "SIN_SUBGRUPO_SAG") {
        return "MISMO_SUBGRUPO_Y_SIZE_CLASS";
      }
      return "MISMO_SIZE_CLASS";
    }
    return null;
  }

  return null;
}

// ── Suggested qty calculation ─────────────────────────────────────────────

/** @internal — exported for testing only */
export function computeSuggestedQty(
  need: ConsolidatedNeed,
  resolutionType: WHFResolutionType,
  remainingStock: number,
): number {
  if (resolutionType === "REPOSICION") {
    // Same ref: fill to ideal, capped by available and max
    return Math.min(
      need.shortageQty,
      remainingStock,
      Math.max(0, need.maxUnits - need.storeQty),
    );
  }
  // Replacement: new ref entering store, use idealUnits as target, capped by max
  return Math.min(
    need.shortageQty,
    remainingStock,
    need.idealUnits,
    need.maxUnits,
  );
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function loadWarehouseFirstNeeds(
  orgId: string,
  req: WHFRequest,
): Promise<WHFResponse> {
  const { storeId, line: requestedLine } = req;

  // ── Load data (both cached) ─────────────────────────────────────────────
  const [distData, storeDetail, heroImageMap] = await Promise.all([
    loadDistributionData(orgId),
    getCanonicalStoreDetail(orgId, storeId),
    loadHeroImageMap(orgId),
  ]);

  if (!storeDetail) {
    return emptyResponse(requestedLine);
  }

  const mainStockIndex = buildMainStockIndex(distData.mainStock);
  const scarcity = getScarcityParams();
  const subIndex = buildSubstitutionIndex(
    distData.storeInventory, mainStockIndex, distData.grupoByRef,
    heroImageMap, distData.refToProductId, distData.sizeClassByRef,
  );

  // ── Universe A: Store needs (consolidated by reference) ─────────────────
  const allNeeds = consolidateNeeds(storeDetail.items);

  // ── Build store active reference set (any ref with positive stock) ──────
  const storeActiveRefs = new Set<string>();
  for (const item of storeDetail.items) {
    if (item.currentUnits > 0) storeActiveRefs.add(item.referenceCode);
  }

  // ── Build store stock by ref (total across variants) ────────────────────
  const storeStockByRef = new Map<string, number>();
  for (const item of storeDetail.items) {
    storeStockByRef.set(item.referenceCode, (storeStockByRef.get(item.referenceCode) ?? 0) + item.currentUnits);
  }

  // ── Universe B: Warehouse refs with positive stock ──────────────────────
  // All refs in mainStockIndex with commercialAvailable > 0
  const allWarehouseRefs = new Map<string, number>();
  for (const [ref, qty] of mainStockIndex.byReference) {
    if (qty > 0) allWarehouseRefs.set(ref, qty);
  }

  // ── Build needs indices for efficient matching ──────────────────────────
  const needsByRef = new Map<string, ConsolidatedNeed[]>();
  const needsByLineGroupSubgroup = new Map<string, ConsolidatedNeed[]>();
  const needsByLineSubgroup = new Map<string, ConsolidatedNeed[]>();
  const needsBySizeClass = new Map<string, ConsolidatedNeed[]>();

  for (const need of allNeeds) {
    // By exact reference
    const refList = needsByRef.get(need.referenceCode) ?? [];
    refList.push(need);
    needsByRef.set(need.referenceCode, refList);

    // By line+group+subgroup (Castillitos)
    if (need.line === "CASTILLITOS" && need.group !== "SIN_GRUPO_SAG" && need.subgroup !== "SIN_SUBGRUPO_SAG") {
      const key = `${need.canonicalLine}|${need.group}|${need.subgroup}`;
      const list = needsByLineGroupSubgroup.get(key) ?? [];
      list.push(need);
      needsByLineGroupSubgroup.set(key, list);
    }

    // By line+subgroup (Latin Kids)
    if (need.line === "LATIN_KIDS" && need.subgroup !== "SIN_SUBGRUPO_SAG") {
      const key = `${need.canonicalLine}|${need.subgroup}`;
      const list = needsByLineSubgroup.get(key) ?? [];
      list.push(need);
      needsByLineSubgroup.set(key, list);
    }

    // By sizeClass (Accessories)
    if (need.line === "ACCESSORIES" && need.sizeClass) {
      const list = needsBySizeClass.get(need.sizeClass) ?? [];
      list.push(need);
      needsBySizeClass.set(need.sizeClass, list);
    }
  }

  // ── Match warehouse refs → store needs ──────────────────────────────────
  const warehouseItems: WHFWarehouseRef[] = [];
  const resolvedNeedRefs = new Set<string>();

  // Anti-overallocation: track remaining stock per warehouse ref
  const remainingStock = new Map<string, number>();
  for (const [ref, qty] of allWarehouseRefs) remainingStock.set(ref, qty);

  // Process all warehouse refs
  for (const [whRef, commercialQty] of allWarehouseRefs) {
    const meta = subIndex.refMeta.get(whRef);
    if (!meta) continue;

    // Determine warehouse ID
    const whLine = meta.canonicalLine;
    const isImport = whLine === "accesorios_importacion";
    const warehouseId = isImport ? "33" : "10";

    // Skip production, non-commercial
    if (!meta.canonicalLine) continue;

    // Classify line for this warehouse ref
    const whfLine = classifyWarehouseLine(meta);

    // Find all needs this warehouse ref can resolve
    const matchedNeeds: Array<{ need: ConsolidatedNeed; matchType: WHFMatchType }> = [];

    // 1. Same reference match (REPOSICION)
    const sameRefNeeds = needsByRef.get(whRef) ?? [];
    for (const need of sameRefNeeds) {
      matchedNeeds.push({ need, matchType: "MISMA_REFERENCIA" });
    }

    // 2. Compatible reference match (REEMPLAZO) — only if not present in store
    if (!storeActiveRefs.has(whRef)) {
      // Castillitos: by group+subgroup
      if (meta.group !== "SIN_GRUPO_SAG" && meta.subgroup !== "SIN_SUBGRUPO_SAG") {
        const gsKey = `${meta.canonicalLine}|${meta.group}|${meta.subgroup}`;
        for (const need of (needsByLineGroupSubgroup.get(gsKey) ?? [])) {
          if (need.referenceCode === whRef) continue;
          if (!matchedNeeds.some(m => m.need.referenceCode === need.referenceCode)) {
            matchedNeeds.push({ need, matchType: "MISMO_GRUPO_Y_SUBGRUPO" });
          }
        }
      }

      // Latin Kids: by subgroup
      if (meta.subgroup !== "SIN_SUBGRUPO_SAG") {
        const sKey = `${meta.canonicalLine}|${meta.subgroup}`;
        for (const need of (needsByLineSubgroup.get(sKey) ?? [])) {
          if (need.referenceCode === whRef) continue;
          if (!matchedNeeds.some(m => m.need.referenceCode === need.referenceCode)) {
            matchedNeeds.push({ need, matchType: "MISMO_SUBGRUPO" });
          }
        }
      }

      // Accessories: by sizeClass
      if (meta.sizeClass) {
        for (const need of (needsBySizeClass.get(meta.sizeClass) ?? [])) {
          if (need.referenceCode === whRef) continue;
          if (!matchedNeeds.some(m => m.need.referenceCode === need.referenceCode)) {
            // Prefer subgroup+sizeClass match
            const mt = (meta.subgroup === need.subgroup && meta.subgroup !== "SIN_SUBGRUPO_SAG")
              ? "MISMO_SUBGRUPO_Y_SIZE_CLASS" as WHFMatchType
              : "MISMO_SIZE_CLASS" as WHFMatchType;
            matchedNeeds.push({ need, matchType: mt });
          }
        }
      }
    }

    // Skip warehouse refs with no matching needs
    if (matchedNeeds.length === 0) continue;

    // Determine resolution type (first pass)
    const hasSameRef = matchedNeeds.some(m => m.matchType === "MISMA_REFERENCIA");
    const hasReplacement = matchedNeeds.some(m => m.matchType !== "MISMA_REFERENCIA");
    const primaryResType: WHFResolutionType = hasSameRef ? "REPOSICION" : "REEMPLAZO";

    // Evaluate Rule 36
    const rule36Status = evaluateRule36(commercialQty, primaryResType, storeId, scarcity);

    // Skip if blocked by Rule 36
    if (rule36Status === "BLOQUEADA") continue;

    // Sort needs by priority: higher deficit%, lower stock, then stable ref
    matchedNeeds.sort((a, b) => {
      const defA = a.need.idealUnits > 0 ? a.need.shortageQty / a.need.idealUnits : 0;
      const defB = b.need.idealUnits > 0 ? b.need.shortageQty / b.need.idealUnits : 0;
      if (defB !== defA) return defB - defA;
      if (a.need.storeQty !== b.need.storeQty) return a.need.storeQty - b.need.storeQty;
      return a.need.referenceCode.localeCompare(b.need.referenceCode);
    });

    // Anti-overallocation: allocate from remaining stock
    let currentRemaining = remainingStock.get(whRef) ?? 0;
    const storeNeedItems: WHFStoreNeed[] = [];
    let totalSuggested = 0;

    for (const { need, matchType } of matchedNeeds) {
      if (currentRemaining <= 0) break;
      if (need.shortageQty <= 0) continue;

      const resType: WHFResolutionType = matchType === "MISMA_REFERENCIA" ? "REPOSICION" : "REEMPLAZO";

      // For replacement: re-check Rule 36 (must be > threshold for all stores)
      if (resType === "REEMPLAZO") {
        const replRule36 = evaluateRule36(commercialQty, "REEMPLAZO", storeId, scarcity);
        if (replRule36 === "BLOQUEADA") continue;
      }

      const suggestedQty = computeSuggestedQty(need, resType, currentRemaining);
      if (suggestedQty <= 0) continue;

      currentRemaining -= suggestedQty;
      totalSuggested += suggestedQty;
      resolvedNeedRefs.add(need.referenceCode);

      storeNeedItems.push({
        storeReference: need.referenceCode,
        description: need.productName,
        imageUrl: need.imageUrl,
        canonicalLine: need.canonicalLine,
        group: need.group,
        subgroup: need.subgroup,
        sizeClass: need.sizeClass,
        storeQty: need.storeQty,
        minUnits: need.minUnits,
        idealUnits: need.idealUnits,
        maxUnits: need.maxUnits,
        shortageQty: need.shortageQty,
        matchType,
        resolutionType: resType,
        suggestedQty,
        coveragePossible: Math.min(100, Math.round(suggestedQty / need.shortageQty * 100)),
        effectiveRule: need.effectiveRule,
        ruleSource: need.ruleSource,
      });
    }

    // Update remaining stock
    remainingStock.set(whRef, currentRemaining);

    // Skip if nothing was allocated
    if (storeNeedItems.length === 0) continue;

    // Build variants
    const variantResult = buildCandidateVariants(whRef, mainStockIndex);
    const positiveVariants: WHFWarehouseVariant[] = variantResult.variants.map(v => ({
      size: v.size,
      color: v.color,
      availableQty: v.mainWarehouseQty,
    }));

    const sameRefCount = storeNeedItems.filter(n => n.resolutionType === "REPOSICION").length;
    const finalResType: WHFResolutionType = sameRefCount > 0 ? "REPOSICION" : "REEMPLAZO";

    warehouseItems.push({
      warehouseReference: whRef,
      description: meta.productName,
      imageUrl: meta.imageUrl,
      canonicalLine: meta.canonicalLine,
      group: meta.group,
      subgroup: meta.subgroup,
      sizeClass: meta.sizeClass,
      warehouseId,
      commercialAvailableQty: commercialQty,
      totalSuggestedQty: totalSuggested,
      needsResolvable: storeNeedItems.length,
      rule36Status,
      resolutionType: finalResType,
      positiveVariants,
      snapshotAt: distData.lastSyncAt ?? new Date().toISOString(),
      storeNeeds: storeNeedItems,
    });
  }

  // ── Build no-solution items ─────────────────────────────────────────────
  const noSolutionItems: WHFNoSolutionItem[] = [];
  for (const need of allNeeds) {
    if (resolvedNeedRefs.has(need.referenceCode)) continue;

    const reason = buildNoSolutionReason(need, mainStockIndex, scarcity, storeId);
    noSolutionItems.push({
      storeReference: need.referenceCode,
      description: need.productName,
      imageUrl: need.imageUrl,
      canonicalLine: need.canonicalLine,
      group: need.group,
      subgroup: need.subgroup,
      sizeClass: need.sizeClass,
      storeQty: need.storeQty,
      minUnits: need.minUnits,
      idealUnits: need.idealUnits,
      shortageQty: need.shortageQty,
      reason,
      effectiveRule: need.effectiveRule,
    });
  }

  // ── Group by requested line ─────────────────────────────────────────────
  const byLine = new Map<WHFLine, WHFWarehouseRef[]>();
  for (const l of WHF_LINES) byLine.set(l, []);
  for (const item of warehouseItems) {
    const itemLine = classifyWarehouseLine2(item);
    byLine.get(itemLine)?.push(item);
  }

  const noSolByLine = new Map<WHFLine, WHFNoSolutionItem[]>();
  for (const l of WHF_LINES) noSolByLine.set(l, []);
  for (const item of noSolutionItems) {
    const itemLine = classifyNoSolLine(item);
    noSolByLine.get(itemLine)?.push(item);
  }

  // Line counts
  const lineCounts: WHFLineCount[] = WHF_LINES.map(l => ({
    line: l,
    count: (byLine.get(l)?.length ?? 0) + (noSolByLine.get(l)?.length ?? 0),
  }));

  // Items for requested line
  let lineItems = byLine.get(requestedLine) ?? [];
  const lineNoSol = noSolByLine.get(requestedLine) ?? [];

  // ── Apply search filter ─────────────────────────────────────────────────
  if (req.search) {
    const q = req.search.toLowerCase().trim();
    if (q.length > 0) {
      lineItems = lineItems.filter(item => {
        if (item.warehouseReference.toLowerCase().includes(q)) return true;
        if (item.description.toLowerCase().includes(q)) return true;
        if (item.group.toLowerCase().includes(q)) return true;
        if (item.subgroup.toLowerCase().includes(q)) return true;
        return item.storeNeeds.some(n => n.storeReference.toLowerCase().includes(q) || n.description.toLowerCase().includes(q));
      });
    }
  }

  // ── Sort ────────────────────────────────────────────────────────────────
  const sorted = applySorting(lineItems, req.sortBy);

  // ── Summary ─────────────────────────────────────────────────────────────
  const allLineItems = byLine.get(requestedLine) ?? [];
  const summary: WHFSummary = {
    availableForSupply: allLineItems.length,
    totalSuggestedUnits: allLineItems.reduce((s, i) => s + i.totalSuggestedQty, 0),
    sameRefReplenishments: allLineItems.filter(i => i.resolutionType === "REPOSICION").length,
    replacements: allLineItems.filter(i => i.resolutionType === "REEMPLAZO").length,
    noSolution: lineNoSol.length,
  };

  // ── Paginate ────────────────────────────────────────────────────────────
  const total = sorted.length;
  const totalPages = Math.ceil(total / req.pageSize) || 1;
  const page = Math.min(req.page, totalPages);
  const offset = (page - 1) * req.pageSize;
  const paginatedItems = sorted.slice(offset, offset + req.pageSize);

  return {
    line: requestedLine,
    summary,
    items: paginatedItems,
    noSolutionItems: lineNoSol,
    pagination: { page, pageSize: req.pageSize, total, totalPages },
    lineCounts,
    dataFreshness: storeDetail.store.lastSyncAt,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyWarehouseLine(meta: { canonicalLine: string; group: string; subgroup: string; sizeClass: string | null }): WHFLine {
  if (!meta.canonicalLine || meta.canonicalLine === "SIN_LINEA") return "UNCLASSIFIED";
  if (meta.canonicalLine === "latin_kids") return "LATIN_KIDS";
  if (meta.canonicalLine === "accesorios_importacion") return "ACCESSORIES";
  if (meta.canonicalLine === "castillitos") return "CASTILLITOS";
  return "UNCLASSIFIED";
}

function classifyWarehouseLine2(item: WHFWarehouseRef): WHFLine {
  return classifyWarehouseLine({
    canonicalLine: item.canonicalLine,
    group: item.group,
    subgroup: item.subgroup,
    sizeClass: item.sizeClass,
  });
}

function classifyNoSolLine(item: WHFNoSolutionItem): WHFLine {
  if (!item.canonicalLine || item.canonicalLine === "SIN_LINEA") return "UNCLASSIFIED";
  if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
  if (item.canonicalLine === "accesorios_importacion") return "ACCESSORIES";
  if (item.canonicalLine === "castillitos") return "CASTILLITOS";
  return "UNCLASSIFIED";
}

function buildNoSolutionReason(
  need: ConsolidatedNeed,
  mainStockIndex: MainStockIndex,
  scarcity: ScarcityParams,
  storeSlug: string,
): string {
  const mainStock = mainStockIndex.byReference.get(need.referenceCode) ?? 0;

  // Same ref: no stock
  if (mainStock <= 0) {
    // Check if incomplete classification prevents replacement search
    if (need.group === "SIN_GRUPO_SAG" || need.subgroup === "SIN_SUBGRUPO_SAG") {
      return "Clasificacion incompleta — no se puede buscar reemplazo compatible";
    }
    return "Sin stock de la misma referencia en bodega principal";
  }

  // Same ref exists but Rule 36 blocks it
  if (mainStock > 0 && mainStock <= scarcity.threshold && !scarcity.allowedIds.includes(storeSlug)) {
    return `Referencia con ${mainStock} uds en bodega — bloqueada por regla de concentracion para esta tienda`;
  }

  // Production only
  return "Sin referencias comerciales compatibles disponibles en bodega principal";
}

function applySorting(items: WHFWarehouseRef[], sortBy?: WHFSortBy): WHFWarehouseRef[] {
  const sorted = [...items];
  switch (sortBy ?? "URGENCY_DESC") {
    case "AVAILABLE_DESC":
      sorted.sort((a, b) => b.commercialAvailableQty - a.commercialAvailableQty || a.warehouseReference.localeCompare(b.warehouseReference));
      break;
    case "NEEDS_COUNT_DESC":
      sorted.sort((a, b) => b.needsResolvable - a.needsResolvable || b.totalSuggestedQty - a.totalSuggestedQty || a.warehouseReference.localeCompare(b.warehouseReference));
      break;
    case "URGENCY_DESC":
      sorted.sort((a, b) => b.totalSuggestedQty - a.totalSuggestedQty || b.needsResolvable - a.needsResolvable || a.warehouseReference.localeCompare(b.warehouseReference));
      break;
    case "REFERENCE_ASC":
      sorted.sort((a, b) => a.warehouseReference.localeCompare(b.warehouseReference));
      break;
  }
  return sorted;
}

function emptyResponse(line: WHFLine): WHFResponse {
  return {
    line,
    summary: { availableForSupply: 0, totalSuggestedUnits: 0, sameRefReplenishments: 0, replacements: 0, noSolution: 0 },
    items: [],
    noSolutionItems: [],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    lineCounts: WHF_LINES.map(l => ({ line: l, count: 0 })),
    dataFreshness: null,
  };
}
