/**
 * lib/copilot/intent-resolver/intent-parser.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Deterministic keyword-based parser.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Algorithm (purely rule-based — no AI):
 *   1. Normalize input: lowercase, remove accents, strip punctuation.
 *   2. For each IntentCandidate in the registry:
 *      - Compute a weighted match score based on keyword presence.
 *      - Weight = keyword character length (longer = more specific = higher weight).
 *      - Candidate score = matched_weight / total_candidate_weight.
 *   3. Return the candidate with the highest score if it exceeds MIN_CONFIDENCE.
 *   4. Emit confidence in [0, 1].
 *
 * No embeddings, no cosine similarity, no neural nets.
 * This is the safe, auditable, enterprise-grade base layer.
 */
import "server-only";

import type { IntentCandidate, IntentParseResult } from "./intent-types";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum confidence score required to consider an intent matched. */
const MIN_CONFIDENCE = 0.15;

/** Below this threshold, warn about low-confidence matches. */
const LOW_CONFIDENCE_WARN = 0.35;

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
 * Full normalization pipeline:
 *   lowercase → remove accents → strip punctuation
 */
export function normalizeText(input: string): string {
  return stripPunctuation(removeAccents(input.toLowerCase()));
}

/**
 * Tokenize normalized text into individual words.
 */
export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Compute a [0–1] match score for a single candidate against the normalized input.
 *
 * Strategy:
 *   - For each keyword, normalize it the same way as the input.
 *   - Check if the normalized input CONTAINS the normalized keyword (substring match).
 *   - Accumulate matched_weight = sum of matched keyword lengths.
 *   - total_weight = sum of all keyword lengths for this candidate.
 *   - score = matched_weight / total_weight
 *
 * A candidate with a single long, specific keyword like "pagos rechazados" (16 chars)
 * will beat one that matched only a short keyword like "pagos" (5 chars).
 */
function scoreCandidate(candidate: IntentCandidate, normalizedInput: string): number {
  let matched = 0;
  let total   = 0;

  for (const keyword of candidate.keywords) {
    const nkw = normalizeText(keyword);
    const w   = nkw.length;
    total  += w;
    if (normalizedInput.includes(nkw)) {
      matched += w;
    }
  }

  if (total === 0) return 0;
  return matched / total;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a raw user utterance and match it against the provided registry.
 *
 * @param rawInput  - The original user text, e.g. "Muéstrame los pagos fallidos"
 * @param registry  - The full INTENT_REGISTRY (or a subset for testing)
 * @returns IntentParseResult with the best candidate, confidence, and all scores.
 */
export function parseIntent(
  rawInput:  string,
  registry:  Record<string, IntentCandidate>,
): IntentParseResult {
  const normalizedInput = normalizeText(rawInput);
  const tokens          = tokenize(normalizedInput);

  const allScores: Record<string, number> = {};
  let topId: string | null = null;
  let topScore             = 0;

  for (const [id, candidate] of Object.entries(registry)) {
    const score   = scoreCandidate(candidate, normalizedInput);
    allScores[id] = score;
    if (score > topScore) {
      topScore = score;
      topId    = id;
    }
  }

  // Reject weak matches
  if (topScore < MIN_CONFIDENCE) {
    return {
      normalizedInput,
      tokens,
      candidateId: null,
      confidence:  topScore,
      allScores,
    };
  }

  return {
    normalizedInput,
    tokens,
    candidateId: topId,
    confidence:  topScore,
    allScores,
  };
}

// ── Helpers for resolver ──────────────────────────────────────────────────────

/**
 * Returns true if the parse result confidence is below the warning threshold.
 * Used by the resolver to emit a warning without rejecting the match.
 */
export function isLowConfidence(confidence: number): boolean {
  return confidence >= MIN_CONFIDENCE && confidence < LOW_CONFIDENCE_WARN;
}

export { MIN_CONFIDENCE, LOW_CONFIDENCE_WARN };
