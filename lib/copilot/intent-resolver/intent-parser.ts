/**
 * lib/copilot/intent-resolver/intent-parser.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Enhanced deterministic parser (v2).
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * v2 improvements over AGENTIK-INTENT-RESOLVER-01:
 *   1. Synonym normalization applied to BOTH input and keywords before scoring.
 *      "rebaja" and "descuento" become the same token → cross-form matching.
 *   2. Word-level token overlap instead of full-phrase substring matching.
 *      "sube los productos" partially matches "publicar productos pendientes"
 *      because "productos" (after synonym: sube→publicar) is a shared token.
 *   3. Phrase alias matching: per-intent full-phrase aliases that strongly
 *      boost the correct candidate even without keyword coverage.
 *   4. Entity signal bonus: small boost when extracted entities are consistent
 *      with the candidate's domain and actionId.
 *   5. Ambiguity detection: warning when top two candidates score close together.
 *   6. Extended IntentParseResult with debug fields for explainIntentResolution().
 *
 * Score composition (weights sum to 1.0):
 *   finalScore = keyword_score × 0.60 + alias_score × 0.30 + entity_bonus × 0.10
 *
 * All operations are O(candidates × keywords) — fully synchronous, no I/O.
 */
import "server-only";

import type { IntentCandidate, IntentParseResult } from "./intent-types";
import {
  normalizeWithSynonyms,
  normalizeWithSynonymsTracked,
  getMatchingAliases,
} from "./intent-aliases";
import { extractEntities, getEntitySignals } from "./intent-entities";
import type { EntitySignal } from "./intent-entities";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum composite score required to consider an intent matched. */
export const MIN_CONFIDENCE = 0.12;

/** Below this threshold, the match is considered ambiguous risk. */
export const LOW_CONFIDENCE_WARN = 0.30;

/** If top - second score < this gap, flag as ambiguous. */
const AMBIGUITY_GAP_THRESHOLD = 0.08;

/** Composite score weights. Must sum to 1.0. */
const W_KEYWORD = 0.60;
const W_ALIAS   = 0.30;
const W_ENTITY  = 0.10;

// ── Text normalization ─────────────────────────────────────────────────────────

/**
 * Remove Unicode combining marks (accents, tildes, etc.).
 * "publicación" → "publicacion"
 */
function removeAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Remove non-alphanumeric characters (except spaces) and collapse whitespace.
 */
function stripPunctuation(input: string): string {
  return input.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Full normalization pipeline: lowercase → remove accents → strip punctuation.
 * Applied BEFORE synonym normalization.
 */
export function normalizeText(input: string): string {
  return stripPunctuation(removeAccents(input.toLowerCase()));
}

/**
 * Two-stage normalization: normalizeText + synonym map.
 * Used to normalize BOTH user input and keywords for a level playing field.
 */
function normalizeAndSynonymize(input: string): string {
  return normalizeWithSynonyms(normalizeText(input));
}

/**
 * Tokenize a normalized string into individual words.
 */
export function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter(Boolean);
}

// ── Keyword scoring ────────────────────────────────────────────────────────────

/**
 * Compute the keyword match sub-score [0–1] for a candidate against the
 * synonym-normalized input token set.
 *
 * Algorithm (word-level overlap):
 *   For each keyword:
 *     - Normalize + synonym-map the keyword (same pipeline as input)
 *     - Tokenize into a word set
 *     - Overlap = keywords words found in input token set
 *     - Contribution = (overlap / keyword_word_count) × original_keyword_length
 *   Score = total_contribution / total_original_weight
 *
 * Using original keyword length (before synonyms) as weight keeps weights stable
 * across synonym map updates.
 *
 * @returns [score: number, matchedKeywords: string[]] where score ∈ [0, 1]
 */
function scoreKeywords(
  keywords:      string[],
  inputTokenSet: Set<string>,
): [number, string[]] {
  let matched      = 0;
  let total        = 0;
  const matchedKws: string[] = [];

  for (const keyword of keywords) {
    const originalWeight = keyword.length;
    const normalized     = normalizeAndSynonymize(keyword);
    const kwTokens       = tokenize(normalized);
    if (kwTokens.length === 0) continue;

    total += originalWeight;

    const overlap = kwTokens.filter(t => inputTokenSet.has(t)).length;
    if (overlap > 0) {
      const ratio = overlap / kwTokens.length;
      matched += ratio * originalWeight;
      matchedKws.push(keyword);
    }
  }

  const score = total === 0 ? 0 : matched / total;
  return [score, matchedKws];
}

// ── Entity context scoring ────────────────────────────────────────────────────

/**
 * Return 1.0 if the extracted entity signals are consistent with the candidate,
 * 0.0 otherwise. Purely rule-based — no ML.
 *
 * Rules per domain:
 *   shopify:
 *     - promotions.*           → relevant if "discount" signal
 *     - promotions.generate*   → also relevant if "count" signal
 *     - collections.*          → relevant if "collection" signal
 *     - operations.*Delayed    → relevant if "status_delayed" signal
 *     - operations.*Failed     → relevant if "status_failed" signal
 *     - operations.*Pending*   → relevant if "status_pending" signal
 *     - operations.*Risk*      → relevant if "status_failed" or "status_delayed"
 *     - enrichment.*Seo*       → relevant if "seo" signal
 *     - catalog.*pending*      → relevant if "status_pending" signal
 */
function scoreEntityContext(
  candidate: IntentCandidate,
  signals:   Set<EntitySignal>,
): number {
  const { domain, actionId } = candidate;
  const id  = actionId.toLowerCase();
  const cid = candidate.id.toLowerCase();

  if (domain === "shopify") {
    if (id.startsWith("promotions.generate") && signals.has("count"))    return 1.0;
    if (id.startsWith("promotions.")  && signals.has("discount"))        return 1.0;
    if (id.startsWith("collections.") && signals.has("collection"))      return 1.0;
    if (id.includes("delayed") || cid.includes("delayed")) {
      if (signals.has("status_delayed"))                                  return 1.0;
    }
    if (id.includes("failed") || cid.includes("failed")) {
      if (signals.has("status_failed"))                                   return 1.0;
    }
    if (id.includes("pending") || cid.includes("pending")) {
      if (signals.has("status_pending"))                                  return 1.0;
    }
    if (id.includes("risk") || cid.includes("risk")) {
      if (signals.has("status_failed") || signals.has("status_delayed")) return 1.0;
    }
    if (id.includes("seo") || cid.includes("seo")) {
      if (signals.has("seo"))                                             return 1.0;
    }
    if (id.includes("alttext") || cid.includes("alt_text")) {
      if (signals.has("seo"))                                             return 1.0;
    }
    if ((id.includes("publish") || cid.includes("publish")) &&
        signals.has("status_pending"))                                    return 1.0;
  }

  return 0.0;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a raw user utterance and match it against the provided registry.
 *
 * Returns an extended IntentParseResult with v2 debug fields populated.
 * All v2 fields are optional — v1 consumers can safely ignore them.
 *
 * @param rawInput  - The original user text, e.g. "Haz una rebaja del 20% en juguetes"
 * @param registry  - The full INTENT_REGISTRY (or a subset for testing)
 */
export function parseIntent(
  rawInput:  string,
  registry:  Record<string, IntentCandidate>,
): IntentParseResult {
  // ── Stage 1: normalize input ──────────────────────────────────────────────

  const baseNormalized  = normalizeText(rawInput);
  const { result: synNormalized, applied: synonymsApplied } =
    normalizeWithSynonymsTracked(baseNormalized);
  const inputTokenSet   = new Set(tokenize(synNormalized));
  const tokens          = [...inputTokenSet];

  // ── Stage 2: extract entity signals ──────────────────────────────────────

  const entities      = extractEntities(rawInput);
  const entitySignals = new Set(getEntitySignals(entities));

  // ── Stage 3: score all candidates ────────────────────────────────────────

  const keywordScores:     Record<string, number>   = {};
  const phraseAliasScores: Record<string, number>   = {};
  const aliasMatches:      Record<string, string[]> = {};
  const keywordsMatched:   Record<string, string[]> = {};
  const allScores:         Record<string, number>   = {};

  for (const [id, candidate] of Object.entries(registry)) {
    // Keyword sub-score
    const [kwScore, matchedKws] = scoreKeywords(candidate.keywords, inputTokenSet);
    keywordScores[id]   = kwScore;
    keywordsMatched[id] = matchedKws;

    // Phrase alias sub-score
    const matched = getMatchingAliases(id, inputTokenSet, normalizeAndSynonymize);
    const aliasScore = matched.length > 0 ? 1.0 : 0.0;
    phraseAliasScores[id] = aliasScore;
    aliasMatches[id]      = matched;

    // Entity context bonus
    const entityBonus = scoreEntityContext(candidate, entitySignals);

    // Composite score
    const finalScore = Math.min(
      kwScore * W_KEYWORD + aliasScore * W_ALIAS + entityBonus * W_ENTITY,
      1.0,
    );
    allScores[id] = finalScore;
  }

  // ── Stage 4: select top candidate ────────────────────────────────────────

  const sorted = Object.entries(allScores).sort((a, b) => b[1] - a[1]);
  const [topId, topScore]            = sorted[0]  ?? ["", 0];
  const [secondId, secondScore = 0]  = sorted[1]  ?? ["", 0];

  // Reject weak matches
  if (topScore < MIN_CONFIDENCE) {
    return {
      normalizedInput: synNormalized,
      tokens,
      candidateId:     null,
      confidence:      topScore,
      allScores,
      synonymsApplied,
      aliasMatches,
      keywordsMatched,
      keywordScores,
      phraseAliasScores,
      ambiguous:       false,
      alternativeCandidates: [],
    };
  }

  // Ambiguity detection
  const gap       = topScore - secondScore;
  const ambiguous = gap < AMBIGUITY_GAP_THRESHOLD && secondScore >= MIN_CONFIDENCE;

  const alternativeCandidates = sorted
    .slice(1)
    .filter(([, s]) => s >= MIN_CONFIDENCE)
    .map(([id]) => id);

  // Reduce confidence slightly when ambiguous
  const finalConfidence = ambiguous
    ? Math.max(topScore - 0.05, MIN_CONFIDENCE)
    : topScore;

  return {
    normalizedInput: synNormalized,
    tokens,
    candidateId:     topId || null,
    confidence:      finalConfidence,
    allScores,
    synonymsApplied,
    aliasMatches,
    keywordsMatched,
    keywordScores,
    phraseAliasScores,
    ambiguous,
    alternativeCandidates,
  };
}

// ── Helpers for resolver ──────────────────────────────────────────────────────

/**
 * Returns true if the parse result confidence is below the warning threshold.
 */
export function isLowConfidence(confidence: number): boolean {
  return confidence >= MIN_CONFIDENCE && confidence < LOW_CONFIDENCE_WARN;
}

// MIN_CONFIDENCE and LOW_CONFIDENCE_WARN are already exported via their const declarations above.
