/**
 * lib/reconciliation/engine/scoring.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Match Scoring
 *
 * Computes an explainable 0–100 score for a candidate pair of records.
 * Used by the fuzzy matching pass to rank candidates.
 *
 * Scoring philosophy:
 *   - Every point is traceable to a specific field comparison
 *   - No magic numbers, no AI, no probabilities
 *   - Score = sum of earned points, capped at 100
 *   - Same inputs ALWAYS produce the same score (deterministic)
 *
 * Score interpretation:
 *   85–100  → High confidence — very likely the same record
 *   60–84   → Medium confidence — probable match, requires operator review
 *   0–59    → Low/no confidence — treat as unmatched
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";
import type { MatchScore, ScoreItem } from "./engine-types";
import {
  normalizeDocumentNumber,
  normalizeThirdPartyId,
  normalizeText,
  referencesMatch,
  amountsWithinTolerance,
  parseDate,
  dateDiffDays,
} from "./normalization";

// ── Score weights ──────────────────────────────────────────────────────────────
//
// Weights reflect relative reliability of each identifier in Colombian ERP/fiscal data:
//
//   documentNumber  +40  — Most reliable. NIT+comprobante uniquely identifies a document.
//   amount          +30  — Critical for financial matching. Amount must match for reconciliation.
//   thirdPartyId    +20  — NIT is a stable legal identifier in Colombia.
//   reference       +15  — Useful corroboration. Often present in bank/gateway data.
//   dateSameDay     +10  — Same business date strongly corroborates identity.
//   dateWithin3Days + 5  — Nearby date provides weak corroboration (mutually exclusive with +10).
//   thirdPartyName  + 5  — Normalized name match. Lower weight due to formatting variation.
//
// Maximum possible (document+amount+NIT+reference+date): 40+30+20+15+10 = 115 → capped at 100.

const WEIGHT_DOCUMENT_NUMBER  = 40;
const WEIGHT_AMOUNT           = 30;
const WEIGHT_THIRD_PARTY_ID   = 20;
const WEIGHT_REFERENCE        = 15;
const WEIGHT_DATE_SAME_DAY    = 10;
const WEIGHT_DATE_PROXIMITY   =  5;  // mutually exclusive with WEIGHT_DATE_SAME_DAY
const WEIGHT_THIRD_PARTY_NAME =  5;

/**
 * Compute a match score for a candidate pair.
 *
 * @param recordA     Record from source A
 * @param recordB     Record from source B
 * @param opts.amountTolerance  Fractional tolerance for amount matching (default 0.001)
 * @param opts.dateFuzzyDays    Max days for proximity scoring (default 3)
 */
export function scoreMatch(
  recordA:  CanonicalReconRecord,
  recordB:  CanonicalReconRecord,
  opts?: {
    amountTolerance?: number;
    dateFuzzyDays?:   number;
  },
): MatchScore {
  const tolerance   = opts?.amountTolerance ?? 0.001;
  const fuzzyDays   = opts?.dateFuzzyDays   ?? 3;
  const items: ScoreItem[] = [];

  // ── Document number ─────────────────────────────────────────────────────────
  const docA = normalizeDocumentNumber(recordA.documentNumber);
  const docB = normalizeDocumentNumber(recordB.documentNumber);

  if (docA !== "" && docB !== "" && docA === docB) {
    items.push({
      field:  "documentNumber",
      points: WEIGHT_DOCUMENT_NUMBER,
      reason: "Número de documento idéntico",
    });
  }

  // ── Amount ──────────────────────────────────────────────────────────────────
  if (amountsWithinTolerance(recordA.amount, recordB.amount, tolerance)) {
    items.push({
      field:  "amount",
      points: WEIGHT_AMOUNT,
      reason: `Valor exacto coincide (${recordA.amount.toFixed(2)})`,
    });
  }

  // ── Third party ID (NIT) ────────────────────────────────────────────────────
  const nitA = normalizeThirdPartyId(recordA.thirdPartyId);
  const nitB = normalizeThirdPartyId(recordB.thirdPartyId);

  if (nitA !== "" && nitB !== "" && nitA === nitB) {
    items.push({
      field:  "thirdPartyId",
      points: WEIGHT_THIRD_PARTY_ID,
      reason: `NIT/tercero coincide (${nitA})`,
    });
  }

  // ── Reference ───────────────────────────────────────────────────────────────
  if (referencesMatch(recordA.reference, recordB.reference)) {
    items.push({
      field:  "reference",
      points: WEIGHT_REFERENCE,
      reason: `Referencia coincide`,
    });
  }

  // ── Date (same day / proximity) — mutually exclusive ────────────────────────
  const dateA = parseDate(recordA.date);
  const dateB = parseDate(recordB.date);
  const dayDiff = dateDiffDays(dateA, dateB);

  if (dayDiff === 0) {
    items.push({
      field:  "date",
      points: WEIGHT_DATE_SAME_DAY,
      reason: "Misma fecha de documento",
    });
  } else if (dayDiff != null && dayDiff > 0 && dayDiff <= fuzzyDays) {
    items.push({
      field:  "date",
      points: WEIGHT_DATE_PROXIMITY,
      reason: `Fecha con diferencia de ${dayDiff} día${dayDiff !== 1 ? "s" : ""}`,
    });
  }

  // ── Third party name (only when NIT did not already match) ──────────────────
  const alreadyMatchedNit = items.some(i => i.field === "thirdPartyId");
  if (!alreadyMatchedNit) {
    const nameA = normalizeText(recordA.thirdPartyName);
    const nameB = normalizeText(recordB.thirdPartyName);
    if (nameA.length >= 3 && nameB.length >= 3 && nameA === nameB) {
      items.push({
        field:  "thirdPartyName",
        points: WEIGHT_THIRD_PARTY_NAME,
        reason: `Nombre de tercero coincide (normalizado)`,
      });
    }
  }

  const rawTotal = items.reduce((s, i) => s + i.points, 0);
  const total    = Math.min(100, rawTotal);

  return { total, breakdown: items };
}

/**
 * Convert a MatchScore into human-readable reasons array.
 * Ordered from highest-point to lowest-point field.
 */
export function scoreToHumanReadable(score: MatchScore): string[] {
  return score.breakdown
    .slice()
    .sort((a, b) => b.points - a.points)
    .map(i => i.reason);
}

/**
 * Determine MatchConfidence from a numeric score.
 */
export function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}
