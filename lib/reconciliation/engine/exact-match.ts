/**
 * lib/reconciliation/engine/exact-match.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Exact Matching Pass
 *
 * Builds lookup indexes from source B records and matches source A records
 * against them using identity-based rules.
 *
 * Three identity strategies (tried in priority order):
 *
 *   1. Document number match  — normalizeDocumentNumber(a) === normalizeDocumentNumber(b)
 *   2. External ID match      — a.externalId === b.externalId (source's own key)
 *   3. Amount + NIT + date    — (normalized amount) + (NIT) + (same date YYYY-MM-DD)
 *
 * For each matched pair, determines exact_match or amount_mismatch.
 *
 * Returns:
 *   - Array of MatchedPair for all found pairs
 *   - Set of used B record IDs (so fuzzy pass knows what's available)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";
import type { MatchedPair, MatchDecision, MatchConfidence } from "./engine-types";
import {
  normalizeDocumentNumber,
  normalizeThirdPartyId,
  normalizeAmount,
  amountsWithinTolerance,
  amountDeltaPct,
  parseDate,
} from "./normalization";
import { scoreMatch, scoreToHumanReadable } from "./scoring";

// ── Index types ───────────────────────────────────────────────────────────────

/** Primary lookup index: normalized doc number → record */
type DocIndex       = Map<string, CanonicalReconRecord>;
/** External ID index: externalId → record */
type ExternalIndex  = Map<string, CanonicalReconRecord>;
/** Composite key index: `${amount}|${nit}|${date}` → record */
type CompositeIndex = Map<string, CanonicalReconRecord>;

// ── Build indexes ─────────────────────────────────────────────────────────────

/**
 * Build all three lookup indexes from source B records.
 * Duplicate keys in the same index are skipped (first occurrence wins).
 * Duplicates are detected and excluded separately by grouping.ts.
 */
export function buildIndexes(recordsB: CanonicalReconRecord[]): {
  docIndex:       DocIndex;
  externalIndex:  ExternalIndex;
  compositeIndex: CompositeIndex;
} {
  const docIndex       = new Map<string, CanonicalReconRecord>();
  const externalIndex  = new Map<string, CanonicalReconRecord>();
  const compositeIndex = new Map<string, CanonicalReconRecord>();

  for (const rec of recordsB) {
    // Document number index
    const docKey = normalizeDocumentNumber(rec.documentNumber);
    if (docKey !== "" && !docIndex.has(docKey)) {
      docIndex.set(docKey, rec);
    }

    // External ID index
    if (rec.externalId && !externalIndex.has(rec.externalId)) {
      externalIndex.set(rec.externalId, rec);
    }

    // Composite key index (amount + NIT + date)
    const compositeKey = buildCompositeKey(rec);
    if (compositeKey && !compositeIndex.has(compositeKey)) {
      compositeIndex.set(compositeKey, rec);
    }
  }

  return { docIndex, externalIndex, compositeIndex };
}

function buildCompositeKey(rec: CanonicalReconRecord): string | null {
  const nit  = normalizeThirdPartyId(rec.thirdPartyId);
  const date  = rec.date?.slice(0, 10) ?? "";
  if (nit === "" || date === "") return null;
  return `${normalizeAmount(rec.amount).toFixed(2)}|${nit}|${date}`;
}

// ── Exact matching pass ───────────────────────────────────────────────────────

export interface ExactMatchPassResult {
  matches:   MatchedPair[];
  /** IDs of all B records consumed by exact matching (must not re-use in fuzzy pass). */
  usedBIds:  Set<string>;
  /** A records that found no exact match (passed to fuzzy pass). */
  unmatchedA: CanonicalReconRecord[];
}

/**
 * Run the exact matching pass.
 *
 * For each record in recordsA (already de-duplicated), try to find a counterpart
 * in the indexes built from recordsB. If found, create a MatchedPair.
 * Records in A that find no match are returned as unmatchedA.
 *
 * @param recordsA      Deduplicated records from source A
 * @param indexes       Pre-built indexes from source B
 * @param usedBIds      Mutable set of already-used B record IDs (modified in place)
 * @param tolerance     Amount tolerance for match decision (default 0.001)
 */
export function runExactMatchPass(
  recordsA:  CanonicalReconRecord[],
  indexes:   ReturnType<typeof buildIndexes>,
  usedBIds:  Set<string>,
  tolerance: number = 0.001,
): ExactMatchPassResult {
  const matches:    MatchedPair[]           = [];
  const unmatchedA: CanonicalReconRecord[]  = [];

  for (const a of recordsA) {
    const pair = findExactMatch(a, indexes, usedBIds, tolerance);
    if (pair) {
      matches.push(pair);
      usedBIds.add(pair.recordB.id);
    } else {
      unmatchedA.push(a);
    }
  }

  return { matches, usedBIds, unmatchedA };
}

/**
 * Try to find an exact match for recordA in the indexes.
 * Returns a MatchedPair or null.
 */
function findExactMatch(
  a:         CanonicalReconRecord,
  indexes:   ReturnType<typeof buildIndexes>,
  usedBIds:  Set<string>,
  tolerance: number,
): MatchedPair | null {
  const { docIndex, externalIndex, compositeIndex } = indexes;

  // ── Strategy 1: document number ─────────────────────────────────────────────
  const docKey = normalizeDocumentNumber(a.documentNumber);
  if (docKey !== "") {
    const b = docIndex.get(docKey);
    if (b && !usedBIds.has(b.id)) {
      return buildPair(a, b, "documentNumber", tolerance);
    }
  }

  // ── Strategy 2: external ID ──────────────────────────────────────────────────
  if (a.externalId) {
    const b = externalIndex.get(a.externalId);
    if (b && !usedBIds.has(b.id)) {
      return buildPair(a, b, "externalId", tolerance);
    }
  }

  // ── Strategy 3: amount + NIT + date composite ────────────────────────────────
  const compositeKey = buildCompositeKey(a);
  if (compositeKey) {
    const b = compositeIndex.get(compositeKey);
    if (b && !usedBIds.has(b.id)) {
      return buildPair(a, b, "composite", tolerance);
    }
  }

  return null;
}

// ── Build pair ────────────────────────────────────────────────────────────────

/**
 * Build a MatchedPair from a matched (a, b) with a strategy label.
 * Computes decision (exact_match vs amount_mismatch) from amounts.
 */
function buildPair(
  a:         CanonicalReconRecord,
  b:         CanonicalReconRecord,
  strategy:  "documentNumber" | "externalId" | "composite",
  tolerance: number,
): MatchedPair {
  const amountsMatch = amountsWithinTolerance(a.amount, b.amount, tolerance);
  const decision:    MatchDecision   = amountsMatch ? "exact_match" : "amount_mismatch";
  const confidence:  MatchConfidence = "high";

  const score = scoreMatch(a, b, { amountTolerance: tolerance });

  const strategyLabel: Record<typeof strategy, string> = {
    documentNumber: "Número de documento idéntico",
    externalId:     "Identificador externo idéntico",
    composite:      "Valor + NIT + fecha coinciden",
  };

  const humanReadable: string[] = [strategyLabel[strategy]];
  if (!amountsMatch) {
    const delta = b.amount - a.amount;
    const pct   = amountDeltaPct(a.amount, b.amount);
    humanReadable.push(
      `Diferencia de monto: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` +
      (pct != null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""),
    );
  } else {
    humanReadable.push(...scoreToHumanReadable(score).filter(r => r !== strategyLabel[strategy]));
  }

  const delta    = b.amount - a.amount;
  const deltaPct = amountDeltaPct(a.amount, b.amount);

  return {
    id:             `m:${a.id}:${b.id}`,
    recordA:        a,
    recordB:        b,
    explanation: {
      decision,
      confidence,
      score,
      humanReadable,
    },
    amountDelta:    delta,
    amountDeltaPct: deltaPct,
  };
}
