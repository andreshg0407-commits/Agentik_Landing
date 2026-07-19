/**
 * lib/comercial/tiendas/store-replacement-engine.ts
 *
 * FASE 2-8 — Store Replacement Intelligence Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Finds commercially equivalent products when the original reference
 * cannot be sourced from main warehouse.
 *
 * Scoring hierarchy (commercial priority):
 *   1. Same subgroup                          +40
 *   2. Same line                              +30
 *   3. Same category                          +15
 *   4. Same productClass                      +10
 *   5. Price similarity (band-based)     -10 to +25
 *   6. Stock availability (tier-based)     +5 to +20
 *   7. Sales velocity (rotation)          -5 to +15
 *   8. Size/color match (secondary)            +5
 *
 * Sprint: TIENDAS-REPLACEMENT-INTELLIGENCE-01
 */

import type {
  ReplacementMatch,
  ReplacementConfidence,
  CandidateProduct,
  ReplacementSourceContext,
} from "./store-replacement-types";

// ── FASE 2 — Main engine function ───────────────────────────────────────────

/**
 * Find best replacement candidates for a product that cannot be sourced.
 *
 * @param source   - The product that needs replacement (context from StoreNeed)
 * @param candidates - All available products with main warehouse stock
 * @param limit    - Max candidates to return (default 5)
 * @returns        Sorted ReplacementMatch[] (highest score first)
 */
export function findBestReplacementCandidates(
  source:     ReplacementSourceContext,
  candidates: CandidateProduct[],
  limit:      number = 5,
): ReplacementMatch[] {
  const matches: ReplacementMatch[] = [];

  for (const candidate of candidates) {
    // Skip same reference — we're looking for alternatives
    if (candidate.referenceCode === source.referenceCode) continue;

    // Skip candidates with no stock
    if (candidate.mainWarehouseQty <= 0) continue;

    const match = scoreCandidate(source, candidate);

    // Only include if there's at least some commercial relevance
    if (match.score > 0) {
      matches.push(match);
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, limit);
}

// ── FASE 3 — Scoring ────────────────────────────────────────────────────────

function scoreCandidate(
  source:    ReplacementSourceContext,
  candidate: CandidateProduct,
): ReplacementMatch {
  let score = 0;
  const reasons: string[] = [];

  // ── FASE 3 — Commercial hierarchy ────────────────────────────────────────

  // 1. Same subgroup (+40) — strongest commercial signal
  const sameSubgroup = !!(source.subgroup && candidate.subgroup
    && source.subgroup.toUpperCase() === candidate.subgroup.toUpperCase());
  if (sameSubgroup) {
    score += 40;
    reasons.push("Mismo subgrupo");
  }

  // 2. Same line (+30)
  const sameLine = !!(source.line && candidate.line
    && source.line.toUpperCase() === candidate.line.toUpperCase());
  if (sameLine) {
    score += 30;
    reasons.push("Misma linea");
  }

  // 3. Same category (+15)
  const sameCategory = !!(source.category && candidate.category
    && source.category.toUpperCase() === candidate.category.toUpperCase());
  if (sameCategory && !sameSubgroup) {
    score += 15;
    reasons.push("Misma categoria");
  }

  // 4. Same productClass (+10)
  if (source.productClass === candidate.productClass) {
    score += 10;
    reasons.push("Mismo tipo de producto");
  }

  // Must have at least subgroup, line, or category match to be relevant
  if (!sameSubgroup && !sameLine && !sameCategory) {
    return buildMatch(source, candidate, 0, "low", []);
  }

  // ── FASE 4 — Price band ──────────────────────────────────────────────────

  const priceDelta = computePriceDelta(source.price, candidate.price);
  const { priceScore, priceReason } = scorePriceBand(priceDelta);
  score += priceScore;
  if (priceReason) reasons.push(priceReason);

  // ── FASE 5 — Stock weight ────────────────────────────────────────────────

  const { stockScore, stockReason } = scoreStockWeight(candidate.mainWarehouseQty);
  score += stockScore;
  if (stockReason) reasons.push(stockReason);

  // ── FASE 6 — Sales velocity ──────────────────────────────────────────────

  const { salesScore, salesReason } = scoreSalesVelocity(candidate.recentSalesQty);
  score += salesScore;
  if (salesReason) reasons.push(salesReason);

  // ── FASE 8 — Confidence ──────────────────────────────────────────────────

  const confidence = computeConfidence(
    sameSubgroup ?? false,
    sameLine ?? false,
    priceDelta,
    candidate.mainWarehouseQty,
  );

  return buildMatch(source, candidate, score, confidence, reasons);
}

// ── FASE 4 — Price band scoring ─────────────────────────────────────────────

function computePriceDelta(
  sourcePrice: number | null,
  candidatePrice: number | null,
): number | null {
  if (sourcePrice == null || candidatePrice == null) return null;
  if (sourcePrice <= 0) return null;
  return Math.abs(candidatePrice - sourcePrice) / sourcePrice * 100;
}

function scorePriceBand(
  deltaPct: number | null,
): { priceScore: number; priceReason: string | null } {
  if (deltaPct == null) {
    return { priceScore: 0, priceReason: null };
  }

  if (deltaPct <= 10) {
    return { priceScore: 25, priceReason: `Precio similar (${deltaPct.toFixed(0)}% diferencia)` };
  }
  if (deltaPct <= 25) {
    return { priceScore: 15, priceReason: `Precio razonable (${deltaPct.toFixed(0)}% diferencia)` };
  }
  if (deltaPct <= 50) {
    return { priceScore: 5, priceReason: `Precio aceptable (${deltaPct.toFixed(0)}% diferencia)` };
  }

  return { priceScore: -10, priceReason: `Precio distante (${deltaPct.toFixed(0)}% diferencia)` };
}

// ── FASE 5 — Stock weight scoring ───────────────────────────────────────────

function scoreStockWeight(
  mainWarehouseQty: number,
): { stockScore: number; stockReason: string | null } {
  if (mainWarehouseQty >= 21) {
    return { stockScore: 20, stockReason: `Stock alto (${mainWarehouseQty} uds)` };
  }
  if (mainWarehouseQty >= 6) {
    return { stockScore: 10, stockReason: `Stock medio (${mainWarehouseQty} uds)` };
  }
  if (mainWarehouseQty >= 1) {
    return { stockScore: 5, stockReason: `Stock limitado (${mainWarehouseQty} uds)` };
  }
  return { stockScore: 0, stockReason: null };
}

// ── FASE 6 — Sales velocity scoring ─────────────────────────────────────────

function scoreSalesVelocity(
  recentSalesQty: number,
): { salesScore: number; salesReason: string | null } {
  if (recentSalesQty <= 0) {
    // No sales data — neutral (not punishing unknown)
    return { salesScore: 0, salesReason: null };
  }
  if (recentSalesQty >= 20) {
    return { salesScore: 15, salesReason: "Alta rotacion historica" };
  }
  if (recentSalesQty >= 5) {
    return { salesScore: 8, salesReason: "Rotacion media" };
  }
  // Low rotation — slight penalty
  return { salesScore: -5, salesReason: "Baja rotacion" };
}

// ── FASE 8 — Confidence ────────────────────────────────────────────────────

function computeConfidence(
  sameSubgroup:     boolean,
  sameLine:         boolean,
  priceDelta:       number | null,
  mainWarehouseQty: number,
): ReplacementConfidence {
  const priceOk = priceDelta == null || priceDelta <= 25;
  const stockOk = mainWarehouseQty >= 6;

  // HIGH: same subgroup + same line + reasonable price + sufficient stock
  if (sameSubgroup && sameLine && priceOk && stockOk) {
    return "high";
  }

  // MEDIUM: same subgroup + reasonable price + sufficient stock
  if (sameSubgroup && priceOk && stockOk) {
    return "medium";
  }

  return "low";
}

// ── Match builder ──────────────────────────────────────────────────────────

function buildMatch(
  source:     ReplacementSourceContext,
  candidate:  CandidateProduct,
  score:      number,
  confidence: ReplacementConfidence,
  reasons:    string[],
): ReplacementMatch {
  const priceDelta = computePriceDelta(source.price, candidate.price);

  return {
    sourceReferenceCode:    source.referenceCode,
    sourceProductName:      source.productName,
    candidateReferenceCode: candidate.referenceCode,
    candidateProductName:   candidate.productName,
    line:                   candidate.line,
    subgroup:               candidate.subgroup,
    sourcePrice:            source.price,
    candidatePrice:         candidate.price,
    priceDeltaPercent:      priceDelta != null ? Math.round(priceDelta * 10) / 10 : null,
    mainWarehouseQty:       candidate.mainWarehouseQty,
    recentSalesQty:         candidate.recentSalesQty,
    score,
    confidence,
    reasons,
  };
}
