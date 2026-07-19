/**
 * lib/comercial/tiendas/store-replenishment-engine.ts
 *
 * Replenishment engine for the Tiendas module.
 * Calculates shortages, suggestions, and health per store.
 *
 * Decision order (variant-exact matching: referenceCode + size + color):
 *   1. Exact transfer      — main warehouse has full quantity
 *   2. Partial transfer     — main warehouse has some, rest unavailable
 *   3. Unavailable          — main warehouse has zero
 *   4. Substitute available — only if rules permit, marked as secondary
 *
 * Sprint: COMERCIAL-TIENDAS-SURTIDO-01
 */

import type {
  StoreInventoryVariant,
  MainWarehouseAvailability,
  StoreReplenishmentRule,
  StoreShortage,
  ShortageSeverity,
  ReplenishmentSuggestion,
  StoreHealthSummary,
  StoreCopilotSignal,
  StoreHealthStatus,
} from "./store-replenishment-types";
import type { StorePolicyRule } from "./store-policy-types";
import {
  isExpectedAssortment,
  findApplicableRule,
  hasApplicableRule,
  computeStoreSubgroupCoverage,
  computeStoreReplenishmentOpportunities,
} from "./active-inventory";
import type { MainWarehouseAvailability as MWA } from "./store-replenishment-types";

// ── Shortage calculation ─────────────────────────────────────────────────────

function deriveSeverity(current: number, min: number): ShortageSeverity {
  if (current === 0) return "critical";
  if (current < min * 0.5) return "critical";
  if (current < min) return "warning";
  return "normal";
}

/**
 * Calculate shortages for a store.
 *
 * Rule-aware filtering (TIENDAS-ACTIVE-INVENTORY-AND-ASSORTMENT-01):
 *   - Zero-stock items without applicable rules → SKIP (historical noise)
 *   - Zero-stock items WITH applicable rules → shortage (expected assortment)
 *   - Items with stock > 0 → evaluate against rule thresholds or adapter defaults
 *   - When rules exist for a store, use rule thresholds (minQty/idealQty)
 *   - When no rules exist, zero-stock items never generate shortages
 */
export function calculateStoreShortages(
  inventory: StoreInventoryVariant[],
  policyRules?: StorePolicyRule[],
): StoreShortage[] {
  const shortages: StoreShortage[] = [];
  const rules = policyRules ?? [];

  for (const v of inventory) {
    // Skip historical zero-stock items that aren't expected assortment
    if (!isExpectedAssortment(v, rules)) continue;

    // Resolve thresholds: rule overrides adapter defaults
    const rule = findApplicableRule(v, rules);
    const minUnits   = rule ? rule.minQty   : v.minUnits;
    const idealUnits = rule ? rule.idealQty : v.idealUnits;

    if (v.currentUnits >= minUnits) continue;

    shortages.push({
      storeId:       v.storeId,
      referenceCode: v.referenceCode,
      productName:   v.productName,
      category:      v.category,
      line:          v.line,
      size:          v.size,
      color:         v.color,
      currentUnits:  v.currentUnits,
      minUnits,
      idealUnits,
      missingUnits:  Math.max(0, idealUnits - v.currentUnits),
      severity:      deriveSeverity(v.currentUnits, minUnits),
    });
  }

  // Sort: critical first, then warning
  shortages.sort((a, b) => {
    const order: Record<ShortageSeverity, number> = { critical: 0, warning: 1, normal: 2 };
    return order[a.severity] - order[b.severity];
  });

  return shortages;
}

// ── Exact replenishment suggestions ──────────────────────────────────────────

function variantKey(ref: string, size: string, color: string): string {
  return `${ref}|${size}|${color}`;
}

export function calculateExactReplenishment(
  shortages:    StoreShortage[],
  mainStock:    MainWarehouseAvailability[],
  rules:        StoreReplenishmentRule[],
  inventory:    StoreInventoryVariant[],
): ReplenishmentSuggestion[] {
  // Index main warehouse by variant key
  const stockMap = new Map<string, MainWarehouseAvailability>();
  for (const s of mainStock) {
    stockMap.set(variantKey(s.referenceCode, s.size, s.color), s);
  }

  const suggestions: ReplenishmentSuggestion[] = [];

  for (const shortage of shortages) {
    const key = variantKey(shortage.referenceCode, shortage.size, shortage.color);
    const available = stockMap.get(key);
    const exactAvailable = available ? Math.max(0, available.availableUnits - available.reservedUnits) : 0;

    if (exactAvailable >= shortage.missingUnits) {
      // Case 1: full exact transfer
      suggestions.push({
        storeId:                shortage.storeId,
        referenceCode:          shortage.referenceCode,
        productName:            shortage.productName,
        size:                   shortage.size,
        color:                  shortage.color,
        missingUnits:           shortage.missingUnits,
        exactAvailableUnits:    exactAvailable,
        suggestedTransferUnits: shortage.missingUnits,
        productionSuggestedUnits: 0,
        suggestionType:         "exact_transfer",
        message:                `Enviar ${shortage.missingUnits} uds desde bodega principal.`,
      });
    } else if (exactAvailable > 0) {
      // Case 2: partial transfer — rest unavailable
      const unavailable = shortage.missingUnits - exactAvailable;
      suggestions.push({
        storeId:                shortage.storeId,
        referenceCode:          shortage.referenceCode,
        productName:            shortage.productName,
        size:                   shortage.size,
        color:                  shortage.color,
        missingUnits:           shortage.missingUnits,
        exactAvailableUnits:    exactAvailable,
        suggestedTransferUnits: exactAvailable,
        productionSuggestedUnits: unavailable,
        suggestionType:         "partial_transfer",
        message:                `Enviar ${exactAvailable} uds. ${unavailable} uds sin disponibilidad en bodega principal.`,
      });
    } else {
      // Case 3: unavailable in main warehouse
      const suggestion: ReplenishmentSuggestion = {
        storeId:                shortage.storeId,
        referenceCode:          shortage.referenceCode,
        productName:            shortage.productName,
        size:                   shortage.size,
        color:                  shortage.color,
        missingUnits:           shortage.missingUnits,
        exactAvailableUnits:    0,
        suggestedTransferUnits: 0,
        productionSuggestedUnits: shortage.missingUnits,
        suggestionType:         "production_needed",
        message:                `Sin disponibilidad en bodega principal. Requiere revision comercial.`,
      };

      // Case 4: check for substitutes (only if rules allow)
      const allowSubstitute = rules.some(r =>
        r.active &&
        r.storeId === shortage.storeId &&
        (r.ruleType === "category" && r.appliesTo === shortage.category ||
         r.ruleType === "line"     && r.appliesTo === shortage.line),
      );

      if (allowSubstitute) {
        const subs = findSubstitutes(shortage, inventory, mainStock);
        if (subs.length > 0) {
          suggestion.suggestionType = "substitute_available";
          suggestion.substituteOptions = subs;
          suggestion.message += ` Alternativa secundaria disponible.`;
        }
      }

      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

function findSubstitutes(
  shortage:  StoreShortage,
  inventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
) {
  // Look for same reference but different color/size in main warehouse
  const subs: ReplenishmentSuggestion["substituteOptions"] = [];

  for (const s of mainStock) {
    if (s.referenceCode !== shortage.referenceCode) continue;
    if (s.size === shortage.size && s.color === shortage.color) continue;
    const net = s.availableUnits - s.reservedUnits;
    if (net <= 0) continue;

    subs.push({
      referenceCode:  s.referenceCode,
      productName:    shortage.productName,
      size:           s.size,
      color:          s.color,
      availableUnits: net,
      reason:         s.size !== shortage.size
        ? `Talla alternativa: ${s.size}`
        : `Color alternativo: ${s.color}`,
    });
  }

  return subs.slice(0, 3); // max 3 substitutes
}

// ── Store health ─────────────────────────────────────────────────────────────

/**
 * Calculate store health summary.
 *
 * Coverage is based on expected assortment (rule-covered items), NOT total PIL.
 *   - If no rules → coverage = -1 (UI shows "Sin reglas")
 *   - If rules exist → coverage = covered / expected * 100
 *   - "covered" = items meeting their min threshold
 *   - "expected" = items with an applicable rule
 */
export function calculateStoreHealth(
  storeId:      string,
  storeName:    string,
  inventory:    StoreInventoryVariant[],
  shortages:    StoreShortage[],
  suggestions:  ReplenishmentSuggestion[],
  lastSyncAt:   string | null,
  policyRules:  StorePolicyRule[],
  mainStock:    MWA[],
): StoreHealthSummary {
  const storeInventory  = inventory.filter(v => v.storeId === storeId);
  const storeShortages  = shortages.filter(s => s.storeId === storeId);
  const storeSuggestions = suggestions.filter(s => s.storeId === storeId);

  const rules = policyRules.filter(r => r.active && r.storeId === storeId);
  const hasRules = rules.length > 0;

  const activeItems = storeInventory.filter(v => v.currentUnits > 0);

  // Coverage based on expected assortment
  let coverage: number;
  if (!hasRules) {
    coverage = -1; // No rules → UI shows "Sin reglas"
  } else {
    const expected = storeInventory.filter(v => hasApplicableRule(v, rules));
    const covered  = expected.filter(v => {
      const rule = findApplicableRule(v, rules);
      const minQty = rule ? rule.minQty : 1;
      return v.currentUnits >= minQty;
    });
    coverage = expected.length > 0
      ? Math.round((covered.length / expected.length) * 100)
      : 0;
  }

  // Subgroup coverage — descriptive only, NOT operational without rules
  const sgCoverage = hasRules
    ? computeStoreSubgroupCoverage(storeInventory)
    : { totalExpected: 0, totalCovered: 0, coveragePercent: -1, coveredSubgroups: [], missingSubgroups: [] };

  // Replenishment opportunities — only when rules exist
  const opportunities = hasRules
    ? computeStoreReplenishmentOpportunities(storeId, storeName, storeInventory, mainStock, policyRules)
    : [];

  return {
    storeId,
    coveragePercent:            coverage,
    criticalShortages:          storeShortages.filter(s => s.severity === "critical").length,
    warningShortages:           storeShortages.filter(s => s.severity === "warning").length,
    exactTransferSuggestions:   storeSuggestions.filter(s =>
      s.suggestionType === "exact_transfer" || s.suggestionType === "partial_transfer",
    ).length,
    lastSyncAt,
    hasRules,
    activeItemCount:            activeItems.length,
    subgroupCoveragePercent:    sgCoverage.coveragePercent,
    subgroupsCovered:           sgCoverage.totalCovered,
    subgroupsExpected:          sgCoverage.totalExpected,
    replenishmentOpportunities: opportunities.length,
  };
}

// ── Store health status label ────────────────────────────────────────────────

export function deriveStoreHealthStatus(health: StoreHealthSummary): StoreHealthStatus {
  if (!health.hasRules) return "sin_reglas";
  // Use subgroup coverage as primary health signal
  const sgPct = health.subgroupCoveragePercent;
  if (sgPct >= 0 && sgPct < 70) return "critica";
  if (sgPct >= 70 && sgPct < 90) return "requiere_surtido";
  // Fallback: critical shortages or low item-level coverage
  if (health.criticalShortages > 0) return "critica";
  if (health.coveragePercent >= 0 && health.coveragePercent < 70) return "critica";
  if (health.coveragePercent >= 70 && health.coveragePercent < 90) return "requiere_surtido";
  return "ok";
}

// ── Copilot signals ──────────────────────────────────────────────────────────

export function buildStoreSuggestions(
  storeId:     string,
  storeName:   string,
  health:      StoreHealthSummary,
  suggestions: ReplenishmentSuggestion[],
): StoreCopilotSignal[] {
  const signals: StoreCopilotSignal[] = [];
  const storeSuggestions = suggestions.filter(s => s.storeId === storeId);

  // No rules configured → neutral signal, no critical alerts
  if (!health.hasRules) {
    signals.push({
      storeId,
      type:     "healthy",
      message:  `${storeName} no tiene reglas de surtido configuradas. Configure reglas para activar alertas de faltantes.`,
      priority: 4,
    });
    return signals;
  }

  if (health.criticalShortages > 0) {
    signals.push({
      storeId,
      type:     "critical_shortage",
      message:  `${storeName} tiene ${health.criticalShortages} faltantes de surtido esperado.`,
      priority: 1,
    });
  }

  const transferUnits = storeSuggestions.reduce((sum, s) => sum + s.suggestedTransferUnits, 0);
  if (transferUnits > 0) {
    signals.push({
      storeId,
      type:     "transfer_ready",
      message:  `Hay ${transferUnits} unidades exactas disponibles para transferir desde bodega principal.`,
      priority: 2,
    });
  }

  if (health.replenishmentOpportunities > 0) {
    signals.push({
      storeId,
      type:     "opportunity_available",
      message:  `${health.replenishmentOpportunities} oportunidades de surtido disponibles desde bodega principal.`,
      priority: 3,
    });
  }

  if (signals.length === 0) {
    signals.push({
      storeId,
      type:     "healthy",
      message:  `${storeName} tiene cobertura saludable.`,
      priority: 4,
    });
  }

  return signals.slice(0, 3); // max 3 signals
}

// ── Priority ranking ─────────────────────────────────────────────────────────

export function rankStorePriority(
  healths: StoreHealthSummary[],
): StoreHealthSummary[] {
  return [...healths].sort((a, b) => {
    // Critical shortages first
    if (a.criticalShortages !== b.criticalShortages) return b.criticalShortages - a.criticalShortages;
    // Then by coverage (lower = more urgent)
    return a.coveragePercent - b.coveragePercent;
  });
}
