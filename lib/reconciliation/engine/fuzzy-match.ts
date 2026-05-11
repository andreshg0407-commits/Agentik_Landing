/**
 * lib/reconciliation/engine/fuzzy-match.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Fuzzy Matching Pass
 *
 * After exact matching, unmatched records from both sides are compared
 * using the scoring engine to detect probable matches.
 *
 * A probable match:
 *   - Has score >= minFuzzyScore (default: 60)
 *   - Is NOT committed as a MatchedPair (requires operator review)
 *   - Generates a "probable_match" exception containing BOTH records
 *   - Is excluded from orphan exceptions
 *
 * Performance:
 *   - Inner comparison loop is O(n_unmatchedA * n_unmatchedB)
 *   - Controlled by maxComparisons cap (default: 50_000)
 *   - When cap is exceeded, a warning is emitted and remaining A records
 *     are treated as orphans
 *   - For typical period datasets (< 5,000 records), this is well within budget
 *
 * Design:
 *   - NO AI, NO embeddings, NO black-box heuristics
 *   - Every probable match includes its score breakdown
 *   - An operator can verify "why" from the score breakdown alone
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";
import type { ReconException, MatchScore } from "./engine-types";
import { scoreMatch, confidenceFromScore, scoreToHumanReadable } from "./scoring";

// ── Result ─────────────────────────────────────────────────────────────────────

export interface FuzzyMatchPassResult {
  /** Probable match exceptions (score >= minFuzzyScore, both records included). */
  probableMatches: ReconException[];
  /** A records with no probable match candidate (become only_in_a exceptions). */
  orphanA:         CanonicalReconRecord[];
  /** B records consumed by probable matches (not available for only_in_b). */
  consumedBIds:    Set<string>;
  /** Warnings from this pass (e.g., comparison cap exceeded). */
  warnings:        string[];
}

// ── Fuzzy pass ─────────────────────────────────────────────────────────────────

/**
 * Run the fuzzy matching pass on unmatched records from both sides.
 *
 * Algorithm:
 *   For each A record in unmatchedA:
 *     1. Score against all available B records
 *     2. Find best candidate (highest score)
 *     3. If best score >= minFuzzyScore:
 *        - Emit probable_match exception
 *        - Mark B as consumed
 *     4. Else: record is orphan (will become only_in_a)
 *
 * @param unmatchedA          A records not found in exact pass
 * @param unmatchedBList      B records not used by exact pass
 * @param minFuzzyScore       Minimum score to qualify as probable match (default 60)
 * @param maxComparisons      Safety cap for total comparisons (default 50_000)
 * @param amountTolerance     Passed to scoreMatch
 * @param dateFuzzyDays       Passed to scoreMatch
 */
export function runFuzzyMatchPass(
  unmatchedA:       CanonicalReconRecord[],
  unmatchedBList:   CanonicalReconRecord[],
  opts?: {
    minFuzzyScore?:    number;
    maxComparisons?:   number;
    amountTolerance?:  number;
    dateFuzzyDays?:    number;
  },
): FuzzyMatchPassResult {
  const minScore      = opts?.minFuzzyScore   ?? 60;
  const maxCmp        = opts?.maxComparisons   ?? 50_000;
  const tolerance     = opts?.amountTolerance  ?? 0.001;
  const fuzzyDays     = opts?.dateFuzzyDays    ?? 3;

  const probableMatches: ReconException[]       = [];
  const orphanA:         CanonicalReconRecord[] = [];
  const consumedBIds:    Set<string>            = new Set();
  const warnings:        string[]               = [];

  let totalComparisons = 0;
  let capExceeded      = false;

  for (const a of unmatchedA) {
    // If cap already exceeded: all remaining A records → orphan
    if (capExceeded) {
      orphanA.push(a);
      continue;
    }

    let bestScore: number                     = 0;
    let bestB:     CanonicalReconRecord | null = null;
    let bestMatchScore: MatchScore | null      = null;

    for (const b of unmatchedBList) {
      // Skip B records already consumed by a prior probable match
      if (consumedBIds.has(b.id)) continue;

      totalComparisons++;

      if (totalComparisons > maxCmp) {
        capExceeded = true;
        warnings.push(
          `Fuzzy pass: límite de comparaciones alcanzado (${maxCmp}). ` +
          `${unmatchedA.length - unmatchedA.indexOf(a)} registros A restantes clasificados como huérfanos.`,
        );
        break;
      }

      const ms = scoreMatch(a, b, { amountTolerance: tolerance, dateFuzzyDays: fuzzyDays });
      if (ms.total > bestScore) {
        bestScore      = ms.total;
        bestB          = b;
        bestMatchScore = ms;
      }
    }

    if (capExceeded) {
      orphanA.push(a);
      continue;
    }

    if (bestScore >= minScore && bestB != null && bestMatchScore != null) {
      const confidence = confidenceFromScore(bestScore);
      const humanReadable = scoreToHumanReadable(bestMatchScore);

      probableMatches.push({
        id:          `ex:probable_match:${a.id}:${bestB.id}`,
        type:        "probable_match",
        severity:    confidence === "high" ? "elevated" : "watch",
        recordA:     a,
        recordB:     bestB,
        explanation: `Posible coincidencia detectada — puntaje ${bestScore}/100. Requiere revisión del operador.`,
        reasons:     [
          `Puntaje de coincidencia: ${bestScore}/100 (umbral: ${minScore})`,
          `Confianza: ${confidence}`,
          ...humanReadable,
        ],
        score:        bestMatchScore,
        amountA:      a.amount,
        amountB:      bestB.amount,
        amountDelta:  bestB.amount - a.amount,
      });

      consumedBIds.add(bestB.id);
    } else {
      orphanA.push(a);
    }
  }

  return { probableMatches, orphanA, consumedBIds, warnings };
}
