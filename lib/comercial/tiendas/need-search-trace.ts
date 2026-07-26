/**
 * lib/comercial/tiendas/need-search-trace.ts
 *
 * AGENTIK-STORES-NEEDS-CANDIDATE-EXPLAINER-01
 *
 * Full tracing for the candidate search engine.
 * Records every stage, every candidate, every discard reason.
 * Pure types and builder — no DB, no side effects.
 */

// ── Discard reasons ─────────────────────────────────────────────────────────

export type DiscardReason =
  | "NO_MAIN_STOCK"
  | "RULE36_BLOCKED"
  | "SELF_REFERENCE"
  | "ALREADY_ASSIGNED"
  | "LINE_MISMATCH"
  | "STORE_AT_MAX"
  | "ZERO_TRANSFERABLE"
  | "NO_META"
  | "EMPTY_SEARCH_UNIVERSE"
  | "SEARCH_NOT_TRIGGERED";

// ── Candidate trace ─────────────────────────────────────────────────────────

export interface CandidateTrace {
  referenceCode: string;
  productName: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  canonicalLine: string;
  mainStock: number;
  storeStock: number;
  score: number;
  suggestedQty: number;
  accepted: boolean;
  discardReason: DiscardReason | null;
}

// ── Stage trace ─────────────────────────────────────────────────────────────

export type SearchStageId =
  | "SAME_REF_STOCK"
  | "REPLACEMENT_SEARCH"
  | "RANKING"
  | "FINAL_SELECTION";

export interface SearchStage {
  id: SearchStageId;
  label: string;
  found: number;
  accepted: number;
  discarded: number;
  candidates: CandidateTrace[];
  elapsedMs: number;
}

// ── NO_ALTERNATIVE cause ────────────────────────────────────────────────────

export type NoAltPrimaryCause =
  | "MAIN_REF_ZERO_STOCK"
  | "ALL_COMPATIBLE_ZERO_STOCK"
  | "ALL_RULE36_BLOCKED"
  | "NO_COMPATIBLE_REFS_IN_INDEX"
  | "EMPTY_INDEX_KEY"
  | "SEARCH_NOT_TRIGGERED"
  | "ALL_AT_STORE_MAX"
  | "ALL_ALREADY_ASSIGNED"
  | "MIXED_BLOCKING"
  | "CLASSIFICATION_INCOMPLETE";

// ── Full need search trace ──────────────────────────────────────────────────

export interface NeedSearchTrace {
  referenceCode: string;
  store: string;
  line: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  world: string;
  shortageQty: number;
  action: string;
  matchMode: string;

  // Same-ref stage
  mainRefStock: number;
  sameRefCoverage: number;

  // Replacement search universe
  indexKey: string;
  universeSize: number;
  universeSelfExcluded: number;

  // Discard breakdown
  discardByReason: Record<string, number>;

  // All stages
  stages: SearchStage[];

  // Final result
  finalResult: "DIRECT_REPLENISHMENT" | "PARTIAL_DIRECT_PLUS_REPLACEMENT" | "REPLACEMENT" | "NO_ALTERNATIVE" | "CLASSIFICATION_INCOMPLETE";
  candidatesAccepted: number;
  coverageQty: number;

  // Ranking (top 10)
  ranking: CandidateTrace[];

  // Winner explanation
  winnerRef: string | null;
  winnerScore: number;
  winnerReason: string;
  losersCount: number;

  // NO_ALTERNATIVE explanation
  noAltCause: NoAltPrimaryCause | null;
  noAltExplanation: string;

  // Timing
  totalElapsedMs: number;
}

// ── Score calculator ────────────────────────────────────────────────────────

export function computeCandidateScore(
  candidateRef: string,
  needRef: string,
  matchMode: string,
  meta: { group: string; subgroup: string; sizeClass: string | null; canonicalLine: string },
  needMeta: { group: string; subgroup: string; sizeClass: string | null; canonicalLine: string },
  mainStock: number,
  storeStock: number,
): number {
  // Base score by match level
  let score = 0;

  // Same group + subgroup (most specific for Castillitos)
  if (meta.group === needMeta.group && meta.subgroup === needMeta.subgroup && meta.group !== "SIN_GRUPO_SAG") {
    score = 90;
  }
  // Same subgroup only (Latin Kids)
  else if (meta.subgroup === needMeta.subgroup && meta.subgroup !== "SIN_SUBGRUPO_SAG") {
    score = 85;
  }
  // Same sizeClass (Accessories)
  else if (meta.sizeClass && meta.sizeClass === needMeta.sizeClass) {
    score = 80;
  }
  // Same line but different group/subgroup
  else if (meta.canonicalLine === needMeta.canonicalLine) {
    score = 50;
  }

  // Bonus: store doesn't have it yet (novelty)
  if (storeStock === 0) score += 5;

  // Bonus: high main stock (availability)
  if (mainStock >= 50) score += 3;
  else if (mainStock >= 20) score += 2;
  else if (mainStock >= 10) score += 1;

  return score;
}
