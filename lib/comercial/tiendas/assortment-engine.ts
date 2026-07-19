/**
 * lib/comercial/tiendas/assortment-engine.ts
 *
 * Assortment-based evaluation engine for Tiendas.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Core principle:
 *   TEXTILE  → evaluated by SUBGROUP (count of active references)
 *   ACCESSORY/BULKY/OTHER → evaluated by SIZE CLASS (count of units)
 *
 *   The reference is NEVER the unit of decision.
 *   References only appear as candidates from main warehouse.
 *
 * NO production suggestions — tiendas don't produce.
 * NO recompra — not yet.
 * NO movimientos — read-only analysis.
 *
 * Sprint: TIENDAS-ASSORTMENT-RULES-ENGINE-01
 */

import type {
  StoreInventoryVariant,
  MainWarehouseAvailability,
} from "./store-replenishment-types";
import type { StoreSizeClass, StoreProductClass } from "./store-policy-types";
import type {
  AssortmentRule,
  TextileSubgroupRule,
  AccessorySizeRule,
  StoreAssortmentNeed,
  AssortmentCandidate,
  AssortmentNeedStatus,
} from "./assortment-types";
import { inferProductClass } from "./active-inventory";

// ── Size class inference ────────────────────────────────────────────────────

/**
 * Infer commercial size class from product attributes.
 *
 * Heuristic based on product class and category:
 *   bulky (cunas, coches, muebles) → large/oversized
 *   accessory (bolsos, maletas)    → small/medium
 *   other                          → medium (default)
 */
export function inferSizeClass(v: {
  category: string;
  line: string;
  productClass?: StoreProductClass;
}): StoreSizeClass {
  const cat = (v.category || "").toUpperCase(); // Now = real subgrupoSag
  const pc = v.productClass ?? inferProductClass({ ...v, size: "", color: "" });

  if (pc === "bulky") {
    if (/CUNA|COCHE/.test(cat)) return "large";
    if (/MUEBLE|EXHIB/.test(cat)) return "oversized";
    if (/SILLA|CORRAL|CAMINADOR|MOTO/.test(cat)) return "large";
    return "large";
  }

  if (pc === "accessory") {
    if (/BOLSO|BIBERON|TETERO|TERMOS/.test(cat)) return "small";
    if (/MALET|LONCHERA/.test(cat)) return "medium";
    return "small";
  }

  return "medium";
}

// ── Textile evaluation (by subgroup) ────────────────────────────────────────

/**
 * Evaluate textile assortment needs by subgroup.
 *
 * For each textile subgroup rule:
 *   1. Count distinct active references (currentUnits > 0) in the subgroup
 *   2. Compare to rule thresholds (minActiveReferences / idealActiveReferences)
 *   3. Find candidates from main warehouse in the same subgroup
 *
 * Returns needs where currentCoverage < idealRequired.
 */
function evaluateTextileSubgroup(
  rule: TextileSubgroupRule,
  storeName: string,
  storeInventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): StoreAssortmentNeed | null {
  // Count distinct active references in this subgroup for this store
  const activeRefs = new Set<string>();
  for (const v of storeInventory) {
    if (v.currentUnits <= 0) continue;
    const sg = v.category || v.line;
    if (!sg) continue;
    if (sg !== rule.subgroup) continue;
    if (rule.line && v.line !== rule.line) continue;
    activeRefs.add(v.referenceCode);
  }

  const current = activeRefs.size;
  if (current >= rule.idealActiveReferences) return null;

  const missing = Math.max(0, rule.idealActiveReferences - current);
  const status: AssortmentNeedStatus =
    current === 0 ? "out" :
    current < rule.minActiveReferences ? "low" : "ok";

  // Only generate need if below minimum or out
  if (status === "ok") return null;

  // Find candidates from main warehouse
  const candidates = findTextileCandidates(
    rule, activeRefs, mainStock, allInventory,
  );

  const label = rule.line ? `${rule.line} / ${rule.subgroup}` : rule.subgroup;
  const message = current === 0
    ? `${storeName} no tiene surtido activo en ${label}. Requiere al menos ${rule.minActiveReferences} referencias.`
    : `${label} tiene baja cobertura (${current}/${rule.idealActiveReferences} refs). Requiere ${missing} referencias adicionales.`;

  return {
    storeId:         rule.storeId,
    storeName,
    ruleType:        "textile_subgroup",
    productClass:    "textile",
    line:            rule.line,
    subgroup:        rule.subgroup,
    currentCoverage: current,
    minRequired:     rule.minActiveReferences,
    idealRequired:   rule.idealActiveReferences,
    missingQty:      missing,
    status,
    message,
    candidates,
  };
}

function findTextileCandidates(
  rule: TextileSubgroupRule,
  existingRefs: Set<string>,
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): AssortmentCandidate[] {
  // Build a lookup of subgroup/line by referenceCode from all inventory
  const refInfo = new Map<string, { productName: string; line: string; subgroup: string }>();
  for (const v of allInventory) {
    const sg = v.category || v.line;
    if (!sg || sg !== rule.subgroup) continue;
    if (rule.line && v.line !== rule.line) continue;
    if (!refInfo.has(v.referenceCode)) {
      refInfo.set(v.referenceCode, { productName: v.productName, line: v.line, subgroup: sg });
    }
  }

  // Find main warehouse stock in matching references NOT already in store
  const candidateMap = new Map<string, AssortmentCandidate>();
  for (const m of mainStock) {
    if (existingRefs.has(m.referenceCode)) continue;
    const info = refInfo.get(m.referenceCode);
    if (!info) continue;

    const net = Math.max(0, m.availableUnits - m.reservedUnits);
    if (net <= 0) continue;

    const existing = candidateMap.get(m.referenceCode);
    if (existing) {
      existing.availableMainWarehouseQty += net;
    } else {
      candidateMap.set(m.referenceCode, {
        referenceCode:             m.referenceCode,
        productName:               info.productName,
        availableMainWarehouseQty: net,
        line:                      info.line,
        subgroup:                  info.subgroup,
        reason:                    `Mismo subgrupo: ${info.subgroup}`,
      });
    }
  }

  return [...candidateMap.values()]
    .sort((a, b) => b.availableMainWarehouseQty - a.availableMainWarehouseQty)
    .slice(0, 5);
}

// ── Accessory/size evaluation ───────────────────────────────────────────────

/**
 * Evaluate accessory/bulky assortment needs by size class.
 *
 * For each accessory_size rule:
 *   1. Count total units of the given sizeClass in the store
 *   2. Compare to rule thresholds (minUnits / idealUnits)
 *   3. Find candidates from main warehouse in the same sizeClass
 *
 * Returns needs where currentCoverage < idealRequired.
 */
function evaluateAccessorySize(
  rule: AccessorySizeRule,
  storeName: string,
  storeInventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): StoreAssortmentNeed | null {
  // Count total active units matching this sizeClass
  let currentUnits = 0;
  for (const v of storeInventory) {
    if (v.currentUnits <= 0) continue;
    const pc = inferProductClass(v);
    if (pc !== rule.productClass && rule.productClass !== "other") continue;
    const sc = inferSizeClass({ category: v.category, line: v.line, productClass: pc });
    if (sc !== rule.sizeClass) continue;
    currentUnits += v.currentUnits;
  }

  if (currentUnits >= rule.idealUnits) return null;

  const missing = Math.max(0, rule.idealUnits - currentUnits);
  const status: AssortmentNeedStatus =
    currentUnits === 0 ? "out" :
    currentUnits < rule.minUnits ? "low" : "ok";

  if (status === "ok") return null;

  const candidates = findSizeCandidates(
    rule, mainStock, allInventory,
  );

  const sizeLabel = LABEL_SIZE[rule.sizeClass] ?? rule.sizeClass;
  const classLabel = LABEL_CLASS[rule.productClass] ?? rule.productClass;
  const message = currentUnits === 0
    ? `${storeName} no tiene ${classLabel} ${sizeLabel}. Requiere al menos ${rule.minUnits} unidades.`
    : `${classLabel} ${sizeLabel} tiene surtido bajo (${currentUnits}/${rule.idealUnits} uds). Requiere ${missing} unidades adicionales.`;

  return {
    storeId:         rule.storeId,
    storeName,
    ruleType:        "accessory_size",
    productClass:    rule.productClass,
    sizeClass:       rule.sizeClass,
    currentCoverage: currentUnits,
    minRequired:     rule.minUnits,
    idealRequired:   rule.idealUnits,
    missingQty:      missing,
    status,
    message,
    candidates,
  };
}

const LABEL_SIZE: Record<string, string> = {
  small:     "pequenos",
  medium:    "medianos",
  large:     "grandes",
  oversized: "extra grandes",
};

const LABEL_CLASS: Record<string, string> = {
  textile:   "textil",
  bulky:     "productos voluminosos",
  accessory: "accesorios",
  other:     "productos",
};

function findSizeCandidates(
  rule: AccessorySizeRule,
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): AssortmentCandidate[] {
  // Build lookup: which refs match the target sizeClass?
  const refInfo = new Map<string, { productName: string; line: string; subgroup: string }>();
  for (const v of allInventory) {
    const pc = inferProductClass(v);
    if (pc !== rule.productClass && rule.productClass !== "other") continue;
    const sc = inferSizeClass({ category: v.category, line: v.line, productClass: pc });
    if (sc !== rule.sizeClass) continue;
    if (!refInfo.has(v.referenceCode)) {
      refInfo.set(v.referenceCode, { productName: v.productName, line: v.line, subgroup: v.category || v.line });
    }
  }

  const candidateMap = new Map<string, AssortmentCandidate>();
  for (const m of mainStock) {
    const info = refInfo.get(m.referenceCode);
    if (!info) continue;

    const net = Math.max(0, m.availableUnits - m.reservedUnits);
    if (net <= 0) continue;

    const existing = candidateMap.get(m.referenceCode);
    if (existing) {
      existing.availableMainWarehouseQty += net;
    } else {
      const sizeLabel = LABEL_SIZE[rule.sizeClass] ?? rule.sizeClass;
      candidateMap.set(m.referenceCode, {
        referenceCode:             m.referenceCode,
        productName:               info.productName,
        availableMainWarehouseQty: net,
        line:                      info.line,
        subgroup:                  info.subgroup,
        sizeClass:                 rule.sizeClass,
        reason:                    `Producto ${sizeLabel} disponible`,
      });
    }
  }

  return [...candidateMap.values()]
    .sort((a, b) => b.availableMainWarehouseQty - a.availableMainWarehouseQty)
    .slice(0, 5);
}

// ── Main evaluation entry point ─────────────────────────────────────────────

/**
 * Evaluate all assortment rules for a store.
 *
 * Returns needs grouped by rule (subgroup or sizeClass), NOT by reference.
 * Each need includes up to 5 candidates from main warehouse.
 */
export function evaluateStoreAssortment(
  storeId: string,
  storeName: string,
  storeInventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
  rules: AssortmentRule[],
  allInventory: StoreInventoryVariant[],
): StoreAssortmentNeed[] {
  const storeRules = rules.filter(r => r.storeId === storeId);
  if (storeRules.length === 0) return [];

  const needs: StoreAssortmentNeed[] = [];

  for (const rule of storeRules) {
    let need: StoreAssortmentNeed | null = null;

    switch (rule.ruleType) {
      case "textile_subgroup":
        need = evaluateTextileSubgroup(rule, storeName, storeInventory, mainStock, allInventory);
        break;
      case "accessory_size":
        need = evaluateAccessorySize(rule, storeName, storeInventory, mainStock, allInventory);
        break;
    }

    if (need) needs.push(need);
  }

  // Sort: out > low
  const STATUS_ORDER: Record<AssortmentNeedStatus, number> = { out: 0, low: 1, ok: 2, overstock: 3 };
  return needs.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

// ── Auto-generate rules from inventory ──────────────────────────────────────

/**
 * Generate default assortment rules from observed inventory patterns.
 *
 * This is used when a store has NO explicit rules configured.
 * It creates one rule per observed subgroup (textile) or sizeClass (accessory/bulky).
 *
 * Default thresholds:
 *   textile:   min=2 ideal=4 active references per subgroup
 *   accessory: min=1 ideal=2 units per sizeClass
 *   bulky:     min=1 ideal=1 units per sizeClass
 */
export function generateDefaultAssortmentRules(
  storeId: string,
  storeInventory: StoreInventoryVariant[],
): AssortmentRule[] {
  const rules: AssortmentRule[] = [];

  // Track which subgroups we've seen for textiles
  const textileSubgroups = new Set<string>();
  // Track which sizeClasses we've seen for accessories/bulky
  const sizeClasses = new Map<string, StoreProductClass>(); // key: `${pc}|${sc}`

  for (const v of storeInventory) {
    const pc = inferProductClass(v);

    if (pc === "textile") {
      const sg = v.category || v.line;
      if (sg && !textileSubgroups.has(sg)) {
        textileSubgroups.add(sg);
        rules.push({
          ruleType:              "textile_subgroup",
          storeId,
          productClass:          "textile",
          line:                  v.line || undefined,
          subgroup:              sg,
          minActiveReferences:   2,
          idealActiveReferences: 4,
        });
      }
    } else if (pc === "accessory" || pc === "bulky" || pc === "other") {
      const sc = inferSizeClass({ category: v.category, line: v.line, productClass: pc });
      const key = `${pc}|${sc}`;
      if (!sizeClasses.has(key)) {
        sizeClasses.set(key, pc);
        rules.push({
          ruleType:     "accessory_size",
          storeId,
          productClass: pc,
          sizeClass:    sc,
          minUnits:     pc === "bulky" ? 1 : 1,
          idealUnits:   pc === "bulky" ? 1 : 2,
        });
      }
    }
  }

  return rules;
}
