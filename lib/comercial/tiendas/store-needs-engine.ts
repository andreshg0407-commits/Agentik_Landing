/**
 * lib/comercial/tiendas/store-needs-engine.ts
 *
 * FASE 2-6 — Store Needs Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Calculates real replenishment needs per store by combining:
 *   - Real PIL inventory per store (TIENDAS-INVENTORY-01)
 *   - Policy rules (TIENDAS-POLICY-FOUNDATION-01)
 *   - Main warehouse stock
 *
 * Sprint: TIENDAS-INVENTORY-02
 */

import type {
  StoreNeed,
  NeedStatus,
  NeedPolicySource,
  StoreNeedsSummary,
  LineNeedsSummary,
  SubgroupNeedsSummary,
  StoreNeedsInput,
  InventoryItem,
  MainWarehouseStock,
} from "./store-needs-types";

import type { StorePolicyRule, PolicyResolutionInput } from "./store-policy-types";
import { resolveStorePolicyForVariant, getDefaultThresholds } from "./store-policy-engine";

// ── FASE 2+3+4 — Need calculation ────────────────────────────────────────────

/**
 * Calculate all replenishment needs for a single store.
 *
 * For each inventory item:
 *   1. Resolve the applicable policy rule
 *   2. Derive thresholds (from rule or defaults)
 *   3. Calculate status (out/low/healthy/overstock)
 *   4. Look up main warehouse availability
 *   5. Compute priority score
 *
 * Textile is evaluated per ref+size+color.
 * Bulky/import is evaluated per reference (size/color may be empty).
 */
export function calculateStoreNeeds(
  store:          StoreNeedsInput,
  inventory:      InventoryItem[],
  mainStock:      MainWarehouseStock[],
  policyRules:    StorePolicyRule[],
): StoreNeed[] {
  // Index main warehouse by variant key for O(1) lookup
  const mainIndex = new Map<string, number>();
  for (const s of mainStock) {
    const key = variantKey(s.referenceCode, s.size, s.color);
    const existing = mainIndex.get(key) ?? 0;
    mainIndex.set(key, existing + s.availableQty);
  }

  // Also index by reference only (for bulky/import items without size/color)
  const mainByRef = new Map<string, number>();
  for (const s of mainStock) {
    const existing = mainByRef.get(s.referenceCode) ?? 0;
    mainByRef.set(s.referenceCode, existing + s.availableQty);
  }

  const needs: StoreNeed[] = [];

  for (const item of inventory) {
    const resolutionInput: PolicyResolutionInput = {
      storeId:       store.storeId,
      referenceCode: item.referenceCode,
      size:          item.size,
      color:         item.color,
      line:          item.line,
      subgroup:      item.subgroup,
      category:      item.category,
      productClass:  item.productClass,
      sizeClass:     item.sizeClass,
    };

    const rule = resolveStorePolicyForVariant(resolutionInput, policyRules);
    const thresholds = rule
      ? { minQty: rule.minQty, idealQty: rule.idealQty, maxQty: rule.maxQty }
      : getDefaultThresholds(item.productClass);

    const status = deriveNeedStatus(item.currentQty, thresholds);
    const neededQty = computeNeededQty(item.currentQty, thresholds, status);

    // Main warehouse lookup: exact variant for textile, by ref for bulky
    const isBulky = item.productClass === "bulky" || item.productClass === "other";
    const mainQty = isBulky && (!item.size && !item.color)
      ? (mainByRef.get(item.referenceCode) ?? 0)
      : (mainIndex.get(variantKey(item.referenceCode, item.size, item.color)) ?? 0);

    const policySource = mapPolicySource(rule?.scope ?? null);
    const priorityScore = computePriorityScore(status, mainQty, neededQty, item);

    needs.push({
      storeId:         store.storeId,
      storeName:       store.storeName,
      warehouseId:     store.warehouseId,
      warehouseName:   store.warehouseName,

      productId:       item.productId,
      referenceCode:   item.referenceCode,
      productName:     item.productName,

      line:            item.line,
      subgroup:        item.subgroup,
      productClass:    item.productClass,
      sizeClass:       item.sizeClass,

      size:            item.size,
      color:           item.color,

      currentStoreQty: item.currentQty,
      minQty:          thresholds.minQty,
      idealQty:        thresholds.idealQty,
      maxQty:          thresholds.maxQty,
      neededQty,
      mainWarehouseQty: mainQty,

      status,
      priorityScore,
      policySource,
    });
  }

  // Sort by priority descending (highest priority first)
  needs.sort((a, b) => b.priorityScore - a.priorityScore);

  return needs;
}

// ── FASE 3+4 — Status derivation ────────────────────────────────────────────

function deriveNeedStatus(
  currentQty: number,
  thresholds: { minQty: number; idealQty: number; maxQty: number },
): NeedStatus {
  if (currentQty <= 0)                  return "out";
  if (currentQty < thresholds.minQty)   return "low";
  if (currentQty > thresholds.maxQty)   return "overstock";
  return "healthy";
}

function computeNeededQty(
  currentQty: number,
  thresholds: { minQty: number; idealQty: number; maxQty: number },
  status: NeedStatus,
): number {
  if (status === "out" || status === "low") {
    return Math.max(0, thresholds.idealQty - currentQty);
  }
  return 0;
}

// ── FASE 5 — Priority scoring ───────────────────────────────────────────────

/**
 * Priority score rules:
 *   Base:  out=100, low=50, healthy=0, overstock=-10
 *   +10   main warehouse has stock for this item
 *   +10   item belongs to a strategic line (non-empty line)
 *   +10   shortage is total (currentQty === 0)
 *   -20   NO stock in main warehouse at all
 */
function computePriorityScore(
  status: NeedStatus,
  mainWarehouseQty: number,
  neededQty: number,
  item: InventoryItem,
): number {
  const BASE: Record<NeedStatus, number> = {
    out:       100,
    low:        50,
    healthy:     0,
    overstock: -10,
  };

  let score = BASE[status];

  if (status === "out" || status === "low") {
    // Bonus: main warehouse has stock
    if (mainWarehouseQty > 0) score += 10;

    // Bonus: strategic line (has a line assigned)
    if (item.line && item.line.length > 0) score += 10;

    // Bonus: total shortage
    if (item.currentQty === 0) score += 10;

    // Penalty: no stock anywhere
    if (mainWarehouseQty <= 0) score -= 20;
  }

  return score;
}

// ── Policy source mapping ───────────────────────────────────────────────────

function mapPolicySource(scope: string | null): NeedPolicySource {
  switch (scope) {
    case "variant_override": return "variant_override";
    case "reference":        return "reference";
    case "line_subgroup":    return "line_subgroup";
    case "subgroup":         return "subgroup";
    case "line":             return "line";
    case "class_size":       return "class_size";
    case "productClass":     return "class";
    case "store":            return "store_default";
    default:                 return "global_default";
  }
}

// ── Variant key helper ──────────────────────────────────────────────────────

function variantKey(ref: string, size: string, color: string): string {
  return `${ref}|${size}|${color}`;
}

// ── FASE 6 — Aggregation helpers ────────────────────────────────────────────

export function groupNeedsByStore(needs: StoreNeed[]): StoreNeedsSummary[] {
  const map = new Map<string, StoreNeed[]>();
  for (const n of needs) {
    const arr = map.get(n.storeId) ?? [];
    arr.push(n);
    map.set(n.storeId, arr);
  }

  const summaries: StoreNeedsSummary[] = [];
  for (const [storeId, storeNeeds] of map) {
    const first = storeNeeds[0];
    summaries.push({
      storeId,
      storeName:      first.storeName,
      outCount:        storeNeeds.filter(n => n.status === "out").length,
      lowCount:        storeNeeds.filter(n => n.status === "low").length,
      healthyCount:    storeNeeds.filter(n => n.status === "healthy").length,
      overstockCount:  storeNeeds.filter(n => n.status === "overstock").length,
      totalNeeds:      storeNeeds.filter(n => n.status === "out" || n.status === "low").length,
      topPriority:     Math.max(...storeNeeds.map(n => n.priorityScore)),
    });
  }

  return summaries.sort((a, b) => b.topPriority - a.topPriority);
}

export function groupNeedsByLine(needs: StoreNeed[]): LineNeedsSummary[] {
  const map = new Map<string, StoreNeed[]>();
  for (const n of needs) {
    const key = n.line || "(sin linea)";
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }

  const summaries: LineNeedsSummary[] = [];
  for (const [line, lineNeeds] of map) {
    summaries.push({
      line,
      outCount:        lineNeeds.filter(n => n.status === "out").length,
      lowCount:        lineNeeds.filter(n => n.status === "low").length,
      healthyCount:    lineNeeds.filter(n => n.status === "healthy").length,
      overstockCount:  lineNeeds.filter(n => n.status === "overstock").length,
    });
  }

  return summaries.sort((a, b) => (b.outCount + b.lowCount) - (a.outCount + a.lowCount));
}

export function groupNeedsBySubgroup(needs: StoreNeed[]): SubgroupNeedsSummary[] {
  const map = new Map<string, StoreNeed[]>();
  for (const n of needs) {
    const key = n.subgroup || "(sin subgrupo)";
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }

  const summaries: SubgroupNeedsSummary[] = [];
  for (const [subgroup, sgNeeds] of map) {
    summaries.push({
      subgroup,
      outCount:        sgNeeds.filter(n => n.status === "out").length,
      lowCount:        sgNeeds.filter(n => n.status === "low").length,
      healthyCount:    sgNeeds.filter(n => n.status === "healthy").length,
      overstockCount:  sgNeeds.filter(n => n.status === "overstock").length,
    });
  }

  return summaries.sort((a, b) => (b.outCount + b.lowCount) - (a.outCount + a.lowCount));
}

// ── Filtered needs (for UI) ─────────────────────────────────────────────────

export interface NeedsFilter {
  storeId?:   string;
  line?:      string;
  subgroup?:  string;
  status?:    NeedStatus;
}

export function filterNeeds(needs: StoreNeed[], filter: NeedsFilter): StoreNeed[] {
  return needs.filter(n => {
    if (filter.storeId && n.storeId !== filter.storeId) return false;
    if (filter.line && n.line !== filter.line) return false;
    if (filter.subgroup && n.subgroup !== filter.subgroup) return false;
    if (filter.status && n.status !== filter.status) return false;
    return true;
  });
}
