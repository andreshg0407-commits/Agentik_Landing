/**
 * lib/comercial/tiendas/store-policy-engine.ts
 *
 * Store Policy Engine for Tiendas.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Resolution chain (most specific wins):
 *   1. variant_override  — exact ref + size + color (excepciones puntuales)
 *   2. reference         — exact ref
 *   3. line_subgroup     — linea + subgrupo (flujo principal textil)
 *   4. subgroup          — subgrupo solo
 *   5. line              — linea sola
 *   6. class_size        — productClass + sizeClass (flujo principal importacion)
 *   7. productClass      — clase de producto sola
 *   8. store             — default de tienda
 *   9. global default    — por productClass hardcoded
 *
 * Sprint: TIENDAS-POLICY-FOUNDATION-01
 * Hotfix: TIENDAS-POLICY-SCOPE-CORRECTION-01
 */

import type {
  StoreProductClass,
  StorePolicyRule,
  StoreReplenishmentNeed,
  StoreReplenishmentDecision,
  ReplenishmentStatus,
  PolicyResolutionInput,
  ReplenishmentNeedInput,
  ReplenishmentDecisionInput,
  StoreReplenishmentThreshold,
} from "./store-policy-types";

// ── Default thresholds per product class ──────────────────────────────────────

const DEFAULT_THRESHOLDS: Record<StoreProductClass, StoreReplenishmentThreshold> = {
  textile:   { minQty: 1, idealQty: 1, maxQty: 2 },
  bulky:     { minQty: 1, idealQty: 1, maxQty: 2 },  // treated as accessory/large
  accessory: { minQty: 1, idealQty: 2, maxQty: 4 },
  other:     { minQty: 1, idealQty: 1, maxQty: 2 },
};

const DEFAULT_BEHAVIOR = {
  allowReplacement:           false,
  allowProductionSignal:      false,
  allowMainWarehouseTransfer: true,
};

export function getDefaultThresholds(productClass: StoreProductClass): StoreReplenishmentThreshold {
  return DEFAULT_THRESHOLDS[productClass] ?? DEFAULT_THRESHOLDS.other;
}

// ── Policy resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the best-matching policy rule for a specific product variant in a store.
 *
 * Resolution order (most specific wins):
 *   1. variant_override — exact ref + size + color
 *   2. reference        — exact ref (any size/color)
 *   3. line_subgroup    — store + line + subgroup
 *   4. subgroup         — store + subgroup
 *   5. line             — store + line
 *   6. class_size       — store + productClass + sizeClass
 *   7. productClass     — store + productClass
 *   8. store            — store-wide default
 *
 * If no rule matches, returns null (caller uses default thresholds).
 */
export function resolveStorePolicyForVariant(
  input: PolicyResolutionInput,
  rules: StorePolicyRule[],
): StorePolicyRule | null {
  const activeRules = rules.filter(r => r.active && r.storeId === input.storeId);
  if (activeRules.length === 0) return null;

  // 1. Variant override — exact ref + size + color
  const variantMatch = activeRules.find(
    r => r.scope === "variant_override"
      && r.referenceCode === input.referenceCode
      && r.size === input.size
      && r.color === input.color,
  );
  if (variantMatch) return variantMatch;

  // 2. Reference match — exact ref
  const refMatch = activeRules.find(
    r => r.scope === "reference" && r.referenceCode === input.referenceCode,
  );
  if (refMatch) return refMatch;

  // 3. Line + Subgroup match (primary textile flow)
  if (input.line && input.subgroup) {
    // Exact line+subgroup match first
    const exactMatch = activeRules.find(
      r => r.scope === "line_subgroup"
        && r.line === input.line
        && r.subgroup === input.subgroup,
    );
    if (exactMatch) return exactMatch;

    // "Todos los subgrupos" — line_subgroup with no subgroup = applies to all
    const allSubgroupsMatch = activeRules.find(
      r => r.scope === "line_subgroup"
        && r.line === input.line
        && !r.subgroup,
    );
    if (allSubgroupsMatch) return allSubgroupsMatch;
  }

  // 4. Subgroup only
  if (input.subgroup) {
    const subgroupMatch = activeRules.find(
      r => r.scope === "subgroup" && r.subgroup === input.subgroup,
    );
    if (subgroupMatch) return subgroupMatch;
  }

  // 5. Line only
  if (input.line) {
    const lineMatch = activeRules.find(
      r => r.scope === "line" && r.line === input.line,
    );
    if (lineMatch) return lineMatch;
  }

  // 6. ProductClass + SizeClass (primary accessory/import flow)
  if (input.sizeClass) {
    // Normalize: bulky resolves to accessory for rule matching
    const resolvedClass = input.productClass === "bulky" ? "accessory" : input.productClass;
    const classSizeMatch = activeRules.find(
      r => r.scope === "class_size"
        && (r.productClass === resolvedClass || r.productClass === input.productClass)
        && r.sizeClass === input.sizeClass,
    );
    if (classSizeMatch) return classSizeMatch;
  }

  // 7. ProductClass only
  const classMatch = activeRules.find(
    r => r.scope === "productClass" && r.productClass === input.productClass,
  );
  if (classMatch) return classMatch;

  // 8. Store-wide default
  const storeDefault = activeRules.find(r => r.scope === "store");
  if (storeDefault) return storeDefault;

  return null;
}

// ── Replenishment need calculation ────────────────────────────────────────────

/**
 * Calculate replenishment need for a single product variant in a store.
 *
 * Status rules:
 *   out       — currentQty === 0
 *   low       — currentQty > 0 && currentQty < minQty
 *   ok        — currentQty >= minQty && currentQty <= maxQty
 *   overstock — currentQty > maxQty
 */
export function calculateStoreReplenishmentNeed(
  input: ReplenishmentNeedInput,
  rules: StorePolicyRule[],
): StoreReplenishmentNeed {
  const resolutionInput: PolicyResolutionInput = {
    storeId:       input.storeId,
    referenceCode: input.referenceCode,
    size:          input.size,
    color:         input.color,
    line:          input.line,
    subgroup:      input.subgroup,
    category:      input.category,
    productClass:  input.productClass,
    sizeClass:     input.sizeClass,
  };

  const rule = resolveStorePolicyForVariant(resolutionInput, rules);

  const thresholds = rule
    ? { minQty: rule.minQty, idealQty: rule.idealQty, maxQty: rule.maxQty }
    : getDefaultThresholds(input.productClass);

  const resolvedBy = rule?.scope ?? "default";

  const status = deriveReplenishmentStatus(input.currentQty, thresholds);
  const neededQty = computeNeededQty(input.currentQty, thresholds, status);

  return {
    storeId:       input.storeId,
    referenceCode: input.referenceCode,
    productName:   input.productName,
    size:          input.size,
    color:         input.color,
    productClass:  input.productClass,
    currentQty:    input.currentQty,
    minQty:        thresholds.minQty,
    idealQty:      thresholds.idealQty,
    maxQty:        thresholds.maxQty,
    neededQty,
    status,
    resolvedBy,
  };
}

function deriveReplenishmentStatus(
  currentQty: number,
  thresholds: StoreReplenishmentThreshold,
): ReplenishmentStatus {
  if (currentQty <= 0)                return "out";
  if (currentQty < thresholds.minQty) return "low";
  if (currentQty > thresholds.maxQty) return "overstock";
  return "ok";
}

function computeNeededQty(
  currentQty: number,
  thresholds: StoreReplenishmentThreshold,
  status: ReplenishmentStatus,
): number {
  if (status === "out" || status === "low") {
    return Math.max(0, thresholds.idealQty - currentQty);
  }
  return 0;
}

// ── Main warehouse decision ───────────────────────────────────────────────────

/**
 * Decide what to do about a replenishment need.
 *
 * Logic:
 *   - If status is ok or overstock → no action
 *   - If main warehouse has enough stock → transfer
 *   - If main warehouse has partial stock → transfer what's available
 *   - If main warehouse has zero → check if replacement or production signal is allowed
 */
export function calculateReplenishmentDecision(
  input: ReplenishmentDecisionInput,
): StoreReplenishmentDecision {
  const { need, mainWarehouseQty, rule } = input;
  const base = {
    storeId:       need.storeId,
    referenceCode: need.referenceCode,
    size:          need.size,
    color:         need.color,
  };

  // No action needed
  if (need.status === "ok" || need.status === "overstock" || need.status === "blocked") {
    return {
      ...base,
      transferFromMainWarehouse: false,
      transferQty:               0,
      replacementNeeded:         false,
      productionSignalAllowed:   false,
      reason:                    need.status === "ok"
        ? "Stock dentro del rango aceptable"
        : need.status === "overstock"
          ? "Sobrestock — no requiere reposicion"
          : "Bloqueado — requiere revision manual",
    };
  }

  // Need replenishment (out or low)
  const canTransfer = rule?.allowMainWarehouseTransfer ?? DEFAULT_BEHAVIOR.allowMainWarehouseTransfer;
  const canReplace  = rule?.allowReplacement ?? DEFAULT_BEHAVIOR.allowReplacement;
  const canSignal   = rule?.allowProductionSignal ?? DEFAULT_BEHAVIOR.allowProductionSignal;

  // Main warehouse has enough
  if (canTransfer && mainWarehouseQty >= need.neededQty) {
    return {
      ...base,
      transferFromMainWarehouse: true,
      transferQty:               need.neededQty,
      replacementNeeded:         false,
      productionSignalAllowed:   false,
      reason:                    `Transferir ${need.neededQty} und desde bodega principal (disponible: ${mainWarehouseQty})`,
    };
  }

  // Main warehouse has partial stock
  if (canTransfer && mainWarehouseQty > 0 && mainWarehouseQty < need.neededQty) {
    const deficit = need.neededQty - mainWarehouseQty;
    return {
      ...base,
      transferFromMainWarehouse: true,
      transferQty:               mainWarehouseQty,
      replacementNeeded:         canReplace,
      productionSignalAllowed:   canSignal,
      reason:                    `Transferir ${mainWarehouseQty} und (parcial). Deficit: ${deficit} und.${canReplace ? " Requiere reemplazo." : ""}${canSignal ? " Senal de produccion permitida." : ""}`,
    };
  }

  // Main warehouse empty or transfer not allowed
  return {
    ...base,
    transferFromMainWarehouse: false,
    transferQty:               0,
    replacementNeeded:         canReplace,
    productionSignalAllowed:   canSignal,
    reason:                    mainWarehouseQty === 0
      ? `Sin stock en bodega principal.${canReplace ? " Requiere reemplazo." : ""}${canSignal ? " Senal de produccion permitida." : ""}`
      : `Transferencia no permitida por politica.${canReplace ? " Requiere reemplazo." : ""}`,
  };
}
