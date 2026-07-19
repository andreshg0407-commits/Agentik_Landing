/**
 * lib/comercial/tiendas/store-suggestions-engine.ts
 *
 * FASE 2-9 — Store Replenishment Suggestions Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Converts StoreNeed[] → StoreReplenishmentSuggestion[].
 *
 * Decision rules:
 *   1. OUT/LOW + mainWarehouseQty >= neededQty → transfer_full
 *   2. OUT/LOW + mainWarehouseQty > 0 but < neededQty → transfer_partial
 *   3. OUT/LOW + mainWarehouseQty === 0 → find_replacement
 *   4. HEALTHY → no_action
 *   5. OVERSTOCK → overstock_review
 *
 * Sprint: TIENDAS-REPLENISHMENT-SUGGESTIONS-01
 */

import type { StoreNeed, MainWarehouseStock } from "./store-needs-types";
import type {
  StoreReplenishmentSuggestion,
  SuggestedAction,
  SuggestionConfidence,
  StoreReplacementCandidate,
  StoreSuggestionsSummary,
  ActionSuggestionsSummary,
} from "./store-suggestions-types";
import type { CandidateProduct, ReplacementMatch } from "./store-replacement-types";
import { findBestReplacementCandidates } from "./store-replacement-engine";

// ── FASE 2 — Main engine ────────────────────────────────────────────────────

/**
 * Build replenishment suggestions from detected needs.
 *
 * Each StoreNeed becomes exactly one StoreReplenishmentSuggestion.
 * The suggestion includes: what to do, how many to transfer, confidence,
 * replacement candidates if applicable, and operational text.
 */
export function buildStoreReplenishmentSuggestions(
  needs:     StoreNeed[],
  mainStock: MainWarehouseStock[],
  candidateProducts?: CandidateProduct[],
): StoreReplenishmentSuggestion[] {
  const suggestions: StoreReplenishmentSuggestion[] = [];
  let idCounter = 0;

  for (const need of needs) {
    idCounter++;
    const suggestion = buildSuggestionForNeed(need, mainStock, idCounter, candidateProducts);
    suggestions.push(suggestion);
  }

  // Sort by priority (same order as needs)
  suggestions.sort((a, b) => b.priorityScore - a.priorityScore);

  return suggestions;
}

// ── FASE 3-7 — Decision rules ───────────────────────────────────────────────

function buildSuggestionForNeed(
  need:      StoreNeed,
  mainStock: MainWarehouseStock[],
  idSeq:     number,
  candidateProducts?: CandidateProduct[],
): StoreReplenishmentSuggestion {
  const base = buildBaseSuggestion(need, idSeq);

  switch (need.status) {
    case "out":
    case "low":
      return applyReplenishmentRules(base, need, mainStock, candidateProducts);
    case "overstock":
      return applyOverstockRule(base, need);
    case "healthy":
    default:
      return applyNoActionRule(base, need);
  }
}

// ── FASE 3 — transfer_full ──────────────────────────────────────────────────

/**
 * Main warehouse can fulfill 100% of the need.
 * Confidence: HIGH if priority > 100, MEDIUM otherwise.
 */
function applyTransferFullRule(
  suggestion: StoreReplenishmentSuggestion,
  need:       StoreNeed,
): StoreReplenishmentSuggestion {
  return {
    ...suggestion,
    suggestedAction: "transfer_full",
    transferQty:     need.neededQty,
    confidence:      need.priorityScore >= 100 ? "high" : "medium",
    reason:          buildTransferFullReason(need),
    warnings:        [],
  };
}

// ── FASE 4 — transfer_partial ───────────────────────────────────────────────

/**
 * Main warehouse has stock but not enough to fulfill 100%.
 * Transfer what's available. Confidence: MEDIUM always.
 */
function applyTransferPartialRule(
  suggestion: StoreReplenishmentSuggestion,
  need:       StoreNeed,
): StoreReplenishmentSuggestion {
  const transferQty = need.mainWarehouseQty;
  const deficit = need.neededQty - transferQty;

  return {
    ...suggestion,
    suggestedAction: "transfer_partial",
    transferQty,
    confidence:      "medium",
    reason:          buildTransferPartialReason(need, transferQty, deficit),
    warnings:        [`Deficit de ${deficit} unidades sin fuente disponible`],
  };
}

// ── FASE 5 — find_replacement ───────────────────────────────────────────────

/**
 * No stock in main warehouse. Search for replacement candidates
 * using the V2 intelligence engine (commercial hierarchy) when
 * candidate products are available, otherwise fall back to basic
 * variant-level matching.
 */
function applyFindReplacementRule(
  suggestion:        StoreReplenishmentSuggestion,
  need:              StoreNeed,
  mainStock:         MainWarehouseStock[],
  candidateProducts?: CandidateProduct[],
): StoreReplenishmentSuggestion {
  // V2 replacement intelligence (when product catalog is available)
  if (candidateProducts && candidateProducts.length > 0) {
    const sourceCtx = {
      referenceCode: need.referenceCode,
      productName:   need.productName,
      line:          need.line,
      subgroup:      need.subgroup,
      category:      need.subgroup, // best available mapping
      productClass:  need.productClass,
      price:         null as number | null, // price resolved from candidates
    };

    // Try to resolve source price from candidate products
    const sourceProduct = candidateProducts.find(c => c.referenceCode === need.referenceCode);
    if (sourceProduct) sourceCtx.price = sourceProduct.price;

    const matches = findBestReplacementCandidates(sourceCtx, candidateProducts, 3);
    const candidates = matches.map(matchToCandidate);

    const topConfidence = matches.length > 0 ? matches[0].confidence : "low";

    return {
      ...suggestion,
      suggestedAction:       "find_replacement",
      transferQty:           0,
      confidence:            topConfidence,
      reason:                buildFindReplacementReason(need, candidates.length),
      replacementCandidates: candidates.length > 0 ? candidates : undefined,
      warnings:              candidates.length === 0
        ? ["Sin candidatos de reemplazo disponibles en bodega principal"]
        : [],
    };
  }

  // Fallback: basic variant-level matching (backward compatible)
  const candidates = rankReplacementCandidates(need, mainStock);

  return {
    ...suggestion,
    suggestedAction:       "find_replacement",
    transferQty:           0,
    confidence:            candidates.length > 0 ? "medium" : "low",
    reason:                buildFindReplacementReason(need, candidates.length),
    replacementCandidates: candidates.length > 0 ? candidates : undefined,
    warnings:              candidates.length === 0
      ? ["Sin candidatos de reemplazo disponibles en bodega principal"]
      : [],
  };
}

/** Convert ReplacementMatch → StoreReplacementCandidate */
function matchToCandidate(match: ReplacementMatch): StoreReplacementCandidate {
  return {
    referenceCode:    match.candidateReferenceCode,
    productName:      match.candidateProductName,
    size:             "",
    color:            "",
    line:             match.line,
    subgroup:         match.subgroup,
    productClass:     "textile", // default; real class comes from CandidateProduct
    mainWarehouseQty: match.mainWarehouseQty,
    price:            match.candidatePrice,
    priceDeltaPercent: match.priceDeltaPercent,
    recentSalesQty:   match.recentSalesQty,
    matchScore:       match.score,
    matchConfidence:  match.confidence,
    matchReasons:     match.reasons,
  };
}

// ── FASE 6 — no_action ──────────────────────────────────────────────────────

function applyNoActionRule(
  suggestion: StoreReplenishmentSuggestion,
  need:       StoreNeed,
): StoreReplenishmentSuggestion {
  return {
    ...suggestion,
    suggestedAction: "no_action",
    transferQty:     0,
    confidence:      "high",
    reason:          `${need.productName} — inventario saludable (${need.currentStoreQty} uds)`,
    warnings:        [],
  };
}

// ── FASE 7 — overstock_review ───────────────────────────────────────────────

function applyOverstockRule(
  suggestion: StoreReplenishmentSuggestion,
  need:       StoreNeed,
): StoreReplenishmentSuggestion {
  const excess = need.currentStoreQty - need.maxQty;
  return {
    ...suggestion,
    suggestedAction: "overstock_review",
    transferQty:     0,
    confidence:      "medium",
    reason:          buildOverstockReason(need, excess),
    excessQty:       excess,
    warnings:        excess >= need.maxQty * 2
      ? ["Sobrestock severo — revisar redistribucion urgente"]
      : [],
  };
}

// ── Combined replenishment rule dispatch ────────────────────────────────────

function applyReplenishmentRules(
  suggestion: StoreReplenishmentSuggestion,
  need:       StoreNeed,
  mainStock:  MainWarehouseStock[],
  candidateProducts?: CandidateProduct[],
): StoreReplenishmentSuggestion {
  if (need.mainWarehouseQty >= need.neededQty && need.neededQty > 0) {
    return applyTransferFullRule(suggestion, need);
  }
  if (need.mainWarehouseQty > 0 && need.neededQty > 0) {
    return applyTransferPartialRule(suggestion, need);
  }
  return applyFindReplacementRule(suggestion, need, mainStock, candidateProducts);
}

// ── FASE 8 — Replacement candidate ranking ──────────────────────────────────

/**
 * Find and rank replacement candidates for an item with no main warehouse stock.
 *
 * Scoring:
 *   +50 same subgroup
 *   +20 same line
 *   +15 same productClass
 *   +10 same size (for textiles)
 *   +5  higher available qty (normalized)
 *
 * Only returns candidates with mainWarehouseQty > 0.
 * Max 5 candidates returned.
 */
export function rankReplacementCandidates(
  need:      StoreNeed,
  mainStock: MainWarehouseStock[],
): StoreReplacementCandidate[] {
  // We can only suggest replacements from items that have stock
  // and are different from the original item.
  const candidates: StoreReplacementCandidate[] = [];

  // Group main stock by reference to avoid duplicate references
  const refStock = new Map<string, { totalQty: number; variants: MainWarehouseStock[] }>();
  for (const s of mainStock) {
    if (s.availableQty <= 0) continue;
    // Skip the exact same item
    if (s.referenceCode === need.referenceCode
      && s.size === need.size
      && s.color === need.color) continue;

    const existing = refStock.get(`${s.referenceCode}|${s.size}|${s.color}`) ?? { totalQty: 0, variants: [] };
    existing.totalQty += s.availableQty;
    existing.variants.push(s);
    refStock.set(`${s.referenceCode}|${s.size}|${s.color}`, existing);
  }

  for (const [key, entry] of refStock) {
    const first = entry.variants[0];
    const { score, reasons } = scoreReplacement(need, first, entry.totalQty);

    if (score <= 0) continue;

    candidates.push({
      referenceCode:    first.referenceCode,
      productName:      first.referenceCode, // best we have without a product catalog lookup
      size:             first.size,
      color:            first.color,
      line:             "", // not available from MainWarehouseStock
      subgroup:         "", // not available from MainWarehouseStock
      productClass:     need.productClass,
      mainWarehouseQty: entry.totalQty,
      price:            null,
      priceDeltaPercent: null,
      recentSalesQty:   0,
      matchScore:       score,
      matchConfidence:  "low", // basic fallback has low confidence
      matchReasons:     reasons,
    });
  }

  // Sort by score descending, take top 5
  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates.slice(0, 5);
}

function scoreReplacement(
  need:     StoreNeed,
  stock:    MainWarehouseStock,
  totalQty: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Same reference, different variant — high relevance
  if (stock.referenceCode === need.referenceCode) {
    score += 50;
    reasons.push("Misma referencia, variante diferente");
  }

  // Same size (textile relevance)
  if (need.size && stock.size === need.size) {
    score += 10;
    reasons.push("Misma talla");
  }

  // Qty bonus (normalized: max 5 points)
  const qtyBonus = Math.min(5, Math.floor(totalQty / 2));
  if (qtyBonus > 0) {
    score += qtyBonus;
    reasons.push(`${totalQty} uds disponibles`);
  }

  return { score, reasons };
}

// ── Base suggestion builder ─────────────────────────────────────────────────

function buildBaseSuggestion(
  need:  StoreNeed,
  idSeq: number,
): StoreReplenishmentSuggestion {
  return {
    suggestionId:    `sug-${need.storeId}-${idSeq}`,
    storeId:         need.storeId,
    storeName:       need.storeName,
    warehouseId:     need.warehouseId,
    warehouseName:   need.warehouseName,
    referenceCode:   need.referenceCode,
    productName:     need.productName,
    line:            need.line,
    subgroup:        need.subgroup,
    productClass:    need.productClass,
    sizeClass:       need.sizeClass,
    size:            need.size,
    color:           need.color,
    currentStoreQty: need.currentStoreQty,
    neededQty:       need.neededQty,
    mainWarehouseQty: need.mainWarehouseQty,
    needStatus:      need.status,
    priorityScore:   need.priorityScore,
    policySource:    need.policySource,
    suggestedAction: "no_action",
    transferQty:     0,
    confidence:      "low",
    reason:          "",
    warnings:        [],
  };
}

// ── FASE 9 — Aggregation helpers ────────────────────────────────────────────

export function groupSuggestionsByStore(
  suggestions: StoreReplenishmentSuggestion[],
): StoreSuggestionsSummary[] {
  const map = new Map<string, StoreReplenishmentSuggestion[]>();
  for (const s of suggestions) {
    const arr = map.get(s.storeId) ?? [];
    arr.push(s);
    map.set(s.storeId, arr);
  }

  const summaries: StoreSuggestionsSummary[] = [];
  for (const [storeId, storeSugs] of map) {
    const first = storeSugs[0];
    summaries.push({
      storeId,
      storeName: first.storeName,
      transferFullCount:    storeSugs.filter(s => s.suggestedAction === "transfer_full").length,
      transferPartialCount: storeSugs.filter(s => s.suggestedAction === "transfer_partial").length,
      findReplacementCount: storeSugs.filter(s => s.suggestedAction === "find_replacement").length,
      noActionCount:        storeSugs.filter(s => s.suggestedAction === "no_action").length,
      overstockReviewCount: storeSugs.filter(s => s.suggestedAction === "overstock_review").length,
      totalSuggestions:     storeSugs.length,
      totalTransferUnits:   storeSugs.reduce((sum, s) => sum + s.transferQty, 0),
    });
  }

  return summaries.sort((a, b) => b.totalTransferUnits - a.totalTransferUnits);
}

export function groupSuggestionsByAction(
  suggestions: StoreReplenishmentSuggestion[],
): ActionSuggestionsSummary[] {
  const actions: SuggestedAction[] = [
    "transfer_full", "transfer_partial", "find_replacement", "no_action", "overstock_review",
  ];

  return actions.map(action => ({
    action,
    count:              suggestions.filter(s => s.suggestedAction === action).length,
    totalTransferUnits: suggestions.filter(s => s.suggestedAction === action)
      .reduce((sum, s) => sum + s.transferQty, 0),
  })).filter(a => a.count > 0);
}

export function getTopSuggestions(
  suggestions: StoreReplenishmentSuggestion[],
  limit: number = 10,
): StoreReplenishmentSuggestion[] {
  return suggestions
    .filter(s => s.suggestedAction !== "no_action")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}

// ── Suggestion filter ───────────────────────────────────────────────────────

export interface SuggestionsFilter {
  storeId?:        string;
  action?:         SuggestedAction;
  confidence?:     SuggestionConfidence;
}

export function filterSuggestions(
  suggestions: StoreReplenishmentSuggestion[],
  filter:      SuggestionsFilter,
): StoreReplenishmentSuggestion[] {
  return suggestions.filter(s => {
    if (filter.storeId && s.storeId !== filter.storeId) return false;
    if (filter.action && s.suggestedAction !== filter.action) return false;
    if (filter.confidence && s.confidence !== filter.confidence) return false;
    return true;
  });
}

// ── FASE 13 — Operational text generation ───────────────────────────────────

function buildTransferFullReason(need: StoreNeed): string {
  const statusLabel = need.status === "out" ? "Agotado" : "Bajo";
  return `${statusLabel}: ${need.productName}${need.size ? ` T${need.size}` : ""}${need.color ? ` ${need.color}` : ""} — transferir ${need.neededQty} uds desde bodega principal (${need.mainWarehouseQty} disponibles)`;
}

function buildTransferPartialReason(need: StoreNeed, transferQty: number, deficit: number): string {
  const statusLabel = need.status === "out" ? "Agotado" : "Bajo";
  return `${statusLabel}: ${need.productName}${need.size ? ` T${need.size}` : ""}${need.color ? ` ${need.color}` : ""} — transferir ${transferQty} de ${need.neededQty} uds (faltan ${deficit})`;
}

function buildFindReplacementReason(need: StoreNeed, candidateCount: number): string {
  const statusLabel = need.status === "out" ? "Agotado" : "Bajo";
  const replacementText = candidateCount > 0
    ? `${candidateCount} candidatos de reemplazo encontrados`
    : "sin reemplazos disponibles";
  return `${statusLabel}: ${need.productName}${need.size ? ` T${need.size}` : ""}${need.color ? ` ${need.color}` : ""} — sin stock en bodega principal, ${replacementText}`;
}

function buildOverstockReason(need: StoreNeed, excess: number): string {
  return `Sobrestock: ${need.productName}${need.size ? ` T${need.size}` : ""}${need.color ? ` ${need.color}` : ""} — ${excess} uds por encima del maximo (${need.maxQty})`;
}
