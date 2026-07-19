/**
 * lib/comercial/tiendas/active-inventory.ts
 *
 * FASE 1 — Active inventory filter and assortment gap detection.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Core principle: a PIL record with availableQty = 0 is historical noise
 * unless it belongs to the store's expected assortment (via policy rules).
 *
 * Sprint: TIENDAS-ACTIVE-INVENTORY-AND-ASSORTMENT-01
 */

import type {
  StoreInventoryVariant,
  MainWarehouseAvailability,
} from "./store-replenishment-types";
import type {
  StorePolicyRule,
  StoreProductClass,
} from "./store-policy-types";

// ── Product class inference (aligned with store-needs-service.ts) ────────────

export function inferProductClass(v: {
  category: string;
  line: string;
  size: string;
  color: string;
}): StoreProductClass {
  const cat = (v.category || "").toUpperCase(); // Now = real subgrupoSag

  // Textile: has real size/color, or subgrupoSag indicates clothing
  if (v.size && v.size !== "SIN_TALLA" && v.color && v.color !== "SIN_COLOR") return "textile";
  if (/PIJAMA|CAMISET|CONJUNT|PANTALON|VESTID|BLUSA|SHORT|LEGGIN|BODY|FALDA|CAMIBUSO|POLO|BUZO|CHAQUETA|BATA|JOGGER|BERMUDA|MAMELUCO/.test(cat))
    return "textile";

  // Bulky: large items (SAG linea 5 subgroups)
  if (/CUNA|COCHE|MUEBLE|CORRAL|SILLA|CAMINADOR|MOTO/.test(cat))
    return "bulky";

  // Accessory: small items
  if (/ACCESORI|BOLSO|MALET|BIBERON|TETERO|LONCHERA|TERMOS/.test(cat))
    return "accessory";

  // Business line fallback
  const lineId = (v.line || "").trim();
  if (lineId === "castillitos" || lineId === "latin_kids") return "textile";
  if (lineId === "accesorios_importacion") return "other";

  return "other";
}

// ── Rule matching ───────────────────────────────────────────────────────────

/**
 * Check if a policy rule covers a specific inventory item.
 * Mirrors resolveStorePolicyForVariant but returns boolean (not the rule).
 */
function ruleMatchesItem(
  rule: StorePolicyRule,
  item: StoreInventoryVariant,
  productClass: StoreProductClass,
): boolean {
  if (!rule.active) return false;
  if (rule.storeId !== item.storeId) return false;

  switch (rule.scope) {
    case "store":
      return true;
    case "variant_override":
      return (
        rule.referenceCode === item.referenceCode &&
        rule.size === item.size &&
        rule.color === item.color
      );
    case "reference":
      return rule.referenceCode === item.referenceCode;
    case "line_subgroup":
      return rule.line === item.line && rule.subgroup === item.category;
    case "subgroup":
      return rule.subgroup === item.category;
    case "line":
      return rule.line === item.line;
    case "class_size":
      return rule.productClass === productClass;
    case "productClass":
      return rule.productClass === productClass;
    default:
      return false;
  }
}

/**
 * Check if ANY active policy rule applies to this inventory item.
 */
export function hasApplicableRule(
  item: StoreInventoryVariant,
  rules: StorePolicyRule[],
): boolean {
  const productClass = inferProductClass(item);
  return rules.some((r) => ruleMatchesItem(r, item, productClass));
}

/**
 * Find the best-matching policy rule for an inventory item.
 * Returns null if no rule applies.
 *
 * Resolution order (most specific wins):
 *   1. variant_override
 *   2. reference
 *   3. line_subgroup
 *   4. subgroup
 *   5. line
 *   6. class_size
 *   7. productClass
 *   8. store
 */
export function findApplicableRule(
  item: StoreInventoryVariant,
  rules: StorePolicyRule[],
): StorePolicyRule | null {
  const storeRules = rules.filter(
    (r) => r.active && r.storeId === item.storeId,
  );
  if (storeRules.length === 0) return null;

  const productClass = inferProductClass(item);

  // 1. variant_override
  const vo = storeRules.find(
    (r) =>
      r.scope === "variant_override" &&
      r.referenceCode === item.referenceCode &&
      r.size === item.size &&
      r.color === item.color,
  );
  if (vo) return vo;

  // 2. reference
  const ref = storeRules.find(
    (r) => r.scope === "reference" && r.referenceCode === item.referenceCode,
  );
  if (ref) return ref;

  // 3. line_subgroup
  if (item.line && item.category) {
    const ls = storeRules.find(
      (r) =>
        r.scope === "line_subgroup" &&
        r.line === item.line &&
        r.subgroup === item.category,
    );
    if (ls) return ls;
  }

  // 4. subgroup
  if (item.category) {
    const sg = storeRules.find(
      (r) => r.scope === "subgroup" && r.subgroup === item.category,
    );
    if (sg) return sg;
  }

  // 5. line
  if (item.line) {
    const ln = storeRules.find(
      (r) => r.scope === "line" && r.line === item.line,
    );
    if (ln) return ln;
  }

  // 6. class_size
  const cs = storeRules.find(
    (r) => r.scope === "class_size" && r.productClass === productClass,
  );
  if (cs) return cs;

  // 7. productClass
  const pc = storeRules.find(
    (r) => r.scope === "productClass" && r.productClass === productClass,
  );
  if (pc) return pc;

  // 8. store
  const sd = storeRules.find((r) => r.scope === "store");
  if (sd) return sd;

  return null;
}

// ── Active inventory ────────────────────────────────────────────────────────

/**
 * An inventory item is "active" if it has stock > 0.
 * Items with zero stock are historical unless covered by a rule.
 */
export function isActiveInventoryItem(
  item: StoreInventoryVariant,
): boolean {
  return item.currentUnits > 0;
}

/**
 * Filter to active inventory only (stock > 0).
 */
export function filterActiveInventory(
  items: StoreInventoryVariant[],
): StoreInventoryVariant[] {
  return items.filter((item) => item.currentUnits > 0);
}

/**
 * Determine if an item should generate a shortage alert.
 *
 * Rules:
 *   - stock > 0 → always evaluate (may be below min)
 *   - stock = 0 AND no rules for store → skip (no expected assortment)
 *   - stock = 0 AND has applicable rule → evaluate (expected but missing)
 *   - stock = 0 AND rules exist but none match → skip (not expected)
 */
export function isExpectedAssortment(
  item: StoreInventoryVariant,
  rules: StorePolicyRule[],
): boolean {
  const storeRules = rules.filter(
    (r) => r.active && r.storeId === item.storeId,
  );

  // No rules for this store → nothing is "expected" → no shortages
  if (storeRules.length === 0) return false;

  // Has stock → evaluate (may be below min)
  if (item.currentUnits > 0) return true;

  // Zero stock with rules → check if any rule covers it
  return hasApplicableRule(item, storeRules);
}

// ── Subgroup coverage ───────────────────────────────────────────────────────

export interface SubgroupCoverageResult {
  totalExpected:     number;
  totalCovered:      number;
  coveragePercent:   number; // -1 = no data
  coveredSubgroups:  string[];
  missingSubgroups:  string[];
}

/**
 * Compute subgroup-level coverage for a store.
 *
 * A subgroup is "expected" if:
 *   - any inventory item (active or historical) belongs to it
 *
 * A subgroup is "covered" if:
 *   - the store has at least one active item (currentUnits > 0) in it
 *
 * Returns coveragePercent = -1 when no subgroups exist.
 */
export function computeStoreSubgroupCoverage(
  storeInventory: StoreInventoryVariant[],
): SubgroupCoverageResult {
  const subgroups = new Map<string, { hasActive: boolean }>();

  for (const v of storeInventory) {
    const sg = v.category || v.line;
    if (!sg) continue;
    const entry = subgroups.get(sg) ?? { hasActive: false };
    if (v.currentUnits > 0) entry.hasActive = true;
    subgroups.set(sg, entry);
  }

  if (subgroups.size === 0) {
    return { totalExpected: 0, totalCovered: 0, coveragePercent: -1, coveredSubgroups: [], missingSubgroups: [] };
  }

  const coveredSubgroups: string[] = [];
  const missingSubgroups: string[] = [];

  for (const [sg, data] of subgroups) {
    if (data.hasActive) coveredSubgroups.push(sg);
    else missingSubgroups.push(sg);
  }

  const pct = Math.round((coveredSubgroups.length / subgroups.size) * 100);

  return {
    totalExpected:    subgroups.size,
    totalCovered:     coveredSubgroups.length,
    coveragePercent:  pct,
    coveredSubgroups,
    missingSubgroups,
  };
}

// ── Replenishment opportunities ─────────────────────────────────────────────

export type OpportunityPriority = "critica" | "alta" | "media" | "baja";

export interface ReplenishmentOpportunity {
  storeId:          string;
  subgroup:         string;
  priority:         OpportunityPriority;
  candidateRefs:    number;
  availableUnits:   number;
  message:          string;
}

/**
 * Compute actionable replenishment opportunities for a store.
 *
 * An opportunity exists when:
 *   1. Store has a subgroup with no active stock OR below minimum
 *   2. Main warehouse has available stock in that subgroup
 *
 * Priority:
 *   critica — subgroup completely absent (0 active items)
 *   alta    — subgroup below minimum (has some but not enough)
 *   media   — subgroup below ideal
 *   baja    — optimization opportunity
 *
 * Only uses real, current data. Never historical zeros or zero-stock main warehouse.
 */
export function computeStoreReplenishmentOpportunities(
  storeId: string,
  storeName: string,
  storeInventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
  policyRules: StorePolicyRule[],
): ReplenishmentOpportunity[] {
  // Index store subgroup status
  const storeSubgroups = new Map<string, { activeCount: number; totalCount: number }>();
  for (const v of storeInventory) {
    const sg = v.category || v.line;
    if (!sg) continue;
    const entry = storeSubgroups.get(sg) ?? { activeCount: 0, totalCount: 0 };
    entry.totalCount++;
    if (v.currentUnits > 0) entry.activeCount++;
    storeSubgroups.set(sg, entry);
  }

  // Index main warehouse availability by subgroup (cross-referenced via store inventory refs)
  const mainBySubgroup = new Map<string, { refs: Set<string>; units: number }>();
  for (const v of storeInventory) {
    const sg = v.category || v.line;
    if (!sg) continue;
    for (const m of mainStock) {
      if (m.referenceCode !== v.referenceCode) continue;
      const net = Math.max(0, m.availableUnits - m.reservedUnits);
      if (net <= 0) continue;
      const entry = mainBySubgroup.get(sg) ?? { refs: new Set<string>(), units: 0 };
      entry.refs.add(m.referenceCode);
      entry.units += net;
      mainBySubgroup.set(sg, entry);
    }
  }

  const opportunities: ReplenishmentOpportunity[] = [];
  const storeRules = policyRules.filter(r => r.active && r.storeId === storeId);

  // No rules → no opportunities (Agentik doesn't know what the store should carry)
  if (storeRules.length === 0) return [];

  for (const [sg, counts] of storeSubgroups) {
    const mainData = mainBySubgroup.get(sg);
    if (!mainData || mainData.refs.size === 0) continue; // Nothing to send

    let priority: OpportunityPriority;
    if (counts.activeCount === 0) {
      priority = "critica";
    } else {
      // Check if below minimum via rules
      const hasRuleForSubgroup = storeRules.some(
        r => (r.scope === "subgroup" && r.subgroup === sg) ||
             (r.scope === "line_subgroup" && (r.subgroup === sg || r.line === sg)) ||
             r.scope === "store",
      );
      if (hasRuleForSubgroup && counts.activeCount < 3) {
        priority = "alta";
      } else if (counts.activeCount < 5) {
        priority = "media";
      } else {
        priority = "baja";
      }
    }

    // Only include critica/alta/media — baja is noise
    if (priority === "baja") continue;

    opportunities.push({
      storeId,
      subgroup: sg,
      priority,
      candidateRefs: mainData.refs.size,
      availableUnits: mainData.units,
      message: priority === "critica"
        ? `${storeName} no tiene surtido activo en ${sg}. ${mainData.refs.size} refs disponibles en bodega principal.`
        : `${sg} tiene surtido bajo. ${mainData.refs.size} refs disponibles en bodega principal (${mainData.units} uds).`,
    });
  }

  // Sort: critica > alta > media
  const ORDER: Record<OpportunityPriority, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return opportunities.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
}
