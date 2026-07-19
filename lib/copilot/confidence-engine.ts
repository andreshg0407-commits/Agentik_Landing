/**
 * lib/copilot/confidence-engine.ts
 *
 * Confidence Engine V1 — D1 + D2 + D5 only.
 *
 * Dimensions used in V1:
 *   D1 (35%): Source coverage  — how many required data sources returned data
 *   D2 (25%): Data freshness   — age of the most recent data point
 *   D5 (10%): Completeness     — required fields present vs missing
 *
 * D3 (cross-module consistency) and D4 (tenant history) are NOT implemented in V1.
 *
 * Score normalization: V1 active weights sum = 0.70.
 * Raw weighted sum is divided by 0.70 so the final score still uses the full 0–100 range.
 *
 * Level thresholds:
 *   ≥ 75  → ALTA
 *   ≥ 50  → MEDIA
 *   ≥ 25  → BAJA
 *   < 25  → BASADA_EN_REGLA
 */

import type { ConfidenceScore, ConfidenceLevel } from "@/lib/copilot/types";

const W_D1 = 0.35;
const W_D2 = 0.25;
const W_D5 = 0.10;
const V1_WEIGHT_SUM = W_D1 + W_D2 + W_D5; // 0.70

// ── D1: Source Coverage ────────────────────────────────────────────────────────

/**
 * sources: array of booleans — true if that data source returned usable data.
 * Returns 0–100.
 */
export function scoreD1SourceCoverage(sources: boolean[]): number {
  if (sources.length === 0) return 0;
  const covered = sources.filter(Boolean).length;
  return Math.round((covered / sources.length) * 100);
}

// ── D2: Data Freshness ─────────────────────────────────────────────────────────

/**
 * dataAgeMinutes: age of the most stale data point in the signal computation.
 * Returns 0–100.
 */
export function scoreD2Freshness(dataAgeMinutes: number): number {
  if (dataAgeMinutes < 60)   return 100;
  if (dataAgeMinutes < 240)  return 80;
  if (dataAgeMinutes < 720)  return 60;
  if (dataAgeMinutes < 1440) return 40;
  if (dataAgeMinutes < 2880) return 20;
  return 0;
}

// ── D5: Completeness ───────────────────────────────────────────────────────────

/**
 * requiredFields: all field names required for this rule.
 * missingFields:  subset that are null / undefined / zero unexpectedly.
 * Returns 0–100.
 */
export function scoreD5Completeness(
  requiredFields: string[],
  missingFields: string[],
): number {
  if (requiredFields.length === 0) return 100;
  const present = requiredFields.length - missingFields.length;
  return Math.round(Math.max(0, present / requiredFields.length) * 100);
}

// ── Composite ──────────────────────────────────────────────────────────────────

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 75) return "ALTA";
  if (score >= 50) return "MEDIA";
  if (score >= 25) return "BAJA";
  return "BASADA_EN_REGLA";
}

export interface ConfidenceInput {
  sources: boolean[];
  dataAgeMinutes: number;
  requiredFields: string[];
  missingFields: string[];
}

export function computeConfidence(input: ConfidenceInput): ConfidenceScore {
  const d1 = scoreD1SourceCoverage(input.sources);
  const d2 = scoreD2Freshness(input.dataAgeMinutes);
  const d5 = scoreD5Completeness(input.requiredFields, input.missingFields);

  const rawScore = (d1 * W_D1 + d2 * W_D2 + d5 * W_D5) / V1_WEIGHT_SUM;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return {
    level: levelFromScore(score),
    score,
    d1_source_coverage: d1,
    d2_freshness: d2,
    d5_completeness: d5,
    stalestDataAgeMinutes: input.dataAgeMinutes,
    missingFields: input.missingFields,
  };
}
