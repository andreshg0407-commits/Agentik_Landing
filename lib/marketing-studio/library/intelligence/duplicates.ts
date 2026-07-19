/**
 * lib/marketing-studio/library/intelligence/duplicates.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Duplicate intelligence — detection, classification, and resolution strategy.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   A duplicate is not just a copy.
 *   The Biblioteca distinguishes:
 *
 *     EXACT DUPLICATE     — same file (same perceptual hash)
 *     NEAR DUPLICATE      — visually very similar (hash distance < threshold)
 *     VARIANT             — deliberately different format/crop of the same product
 *     DERIVATIVE          — AI-modified version of an original
 *     CAMPAIGN REUSE      — same asset used in multiple campaigns (valid)
 *     ACCIDENTAL COPY     — same asset uploaded multiple times by error
 *
 *   The ingestion pipeline uses pHash for detection.
 *   This module defines the concepts, thresholds, and resolution logic.
 *
 * ── NO AI YET ─────────────────────────────────────────────────────────────────
 *
 *   Real perceptual hashing (imagehash, phash) and CLIP embedding similarity
 *   will be integrated in sprint MS-AI.
 *
 *   This module defines the CONTRACT and DECISION LOGIC only.
 *   The actual hash computation happens at the API/storage layer.
 */

// ── Similarity methods ─────────────────────────────────────────────────────────

/**
 * SimilarityMethod — how two assets were compared.
 */
export type SimilarityMethod =
  | "phash"           // perceptual hash (pHash / dHash) — bit distance
  | "url_exact"       // exact URL match
  | "sha256_exact"    // exact file content hash
  | "filename_match"  // same filename (weak — easily fooled)
  | "embedding";      // semantic vector similarity (future)

// ── Duplicate types ────────────────────────────────────────────────────────────

/**
 * DuplicateType — how severe the duplication is.
 */
export type DuplicateType =
  | "exact"       // bit-for-bit identical (same SHA256 or exact URL match)
  | "perceptual"  // visually identical to human eye (pHash distance ≤ 8)
  | "near"        // very similar but not identical (pHash distance 9–20)
  | "variant"     // intentionally different format (landscape vs portrait)
  | "derivative"; // AI-modified version (background removed, style transfer, etc.)

/**
 * DuplicateResolution — what the system should do with a detected duplicate.
 */
export type DuplicateResolution =
  | "skip"        // do not ingest — the exact asset already exists
  | "merge"       // point to existing asset record
  | "flag"        // ingest but mark as near-duplicate for operator review
  | "allow";      // allow — this is a valid variant or derivative

// ── Similarity result ─────────────────────────────────────────────────────────

/**
 * AssetSimilarityResult — the output of a pairwise similarity check.
 *
 * Produced by the deduplication stage of the ingestion pipeline.
 */
export interface AssetSimilarityResult {
  /** The new (incoming) asset being checked. */
  candidateId:    string;
  /** The existing asset it was compared to. */
  existingId:     string;
  /** The comparison method used. */
  method:         SimilarityMethod;
  /** Similarity score: 0 = completely different, 1 = identical. */
  score:          number;
  /** The classified duplicate type. */
  duplicateType:  DuplicateType;
  /** Recommended resolution action. */
  resolution:     DuplicateResolution;
  /** Whether this requires operator review before resolution. */
  requiresReview: boolean;
  /** Human-readable explanation. */
  explanation:    string;
}

// ── Duplicate record ───────────────────────────────────────────────────────────

/**
 * LibraryDuplicateRecord — a persisted record of a detected duplicate pair.
 *
 * Stored alongside assets to power the "similar assets" panel in the UI.
 * Future: used by Luca to avoid duplicate generation.
 */
export interface LibraryDuplicateRecord {
  id:              string;
  tenantId:        string;
  /** The newer asset (added later). */
  candidateId:     string;
  /** The older / original asset. */
  existingId:      string;
  similarity:      AssetSimilarityResult;
  /** How this duplicate was resolved. */
  resolution:      DuplicateResolution;
  /** Who resolved it (userId or "system"). */
  resolvedBy:      string;
  resolvedAt:      string;
  notes?:          string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/**
 * DUPLICATE_THRESHOLDS — pHash bit-distance thresholds for classification.
 *
 * pHash distance:
 *   0     = identical
 *   1–8   = perceptually identical (exact duplicate in practice)
 *   9–20  = near-duplicate (very similar, likely same product session)
 *   21–40 = similar (same scene, different angle — likely variant)
 *   > 40  = different (safe to treat as unique)
 *
 * Similarity score is normalized: score = 1 - (distance / 64)
 */
export const DUPLICATE_THRESHOLDS = {
  EXACT:       1.0,     // score = 1.0 → URL/SHA256 exact match
  PERCEPTUAL:  0.875,   // score ≥ 0.875 → pHash distance ≤ 8 (64-bit hash)
  NEAR:        0.6875,  // score ≥ 0.6875 → pHash distance ≤ 20
  VARIANT:     0.375,   // score ≥ 0.375 → pHash distance ≤ 40
} as const;

// ── Classification logic ──────────────────────────────────────────────────────

/**
 * classifyDuplicate — determines the DuplicateType and recommended resolution
 * from a raw similarity score and method.
 */
export function classifyDuplicate(
  score:  number,
  method: SimilarityMethod,
): { type: DuplicateType; resolution: DuplicateResolution; requiresReview: boolean } {
  if (method === "sha256_exact" || method === "url_exact") {
    return { type: "exact", resolution: "skip", requiresReview: false };
  }

  if (score >= DUPLICATE_THRESHOLDS.PERCEPTUAL) {
    return { type: "perceptual", resolution: "skip", requiresReview: false };
  }
  if (score >= DUPLICATE_THRESHOLDS.NEAR) {
    return { type: "near", resolution: "flag", requiresReview: true };
  }
  if (score >= DUPLICATE_THRESHOLDS.VARIANT) {
    return { type: "variant", resolution: "allow", requiresReview: false };
  }

  // Sufficiently different
  return { type: "derivative", resolution: "allow", requiresReview: false };
}

/**
 * buildSimilarityExplanation — generates a human-readable explanation for a duplicate.
 */
export function buildSimilarityExplanation(
  type:       DuplicateType,
  resolution: DuplicateResolution,
  score:      number,
): string {
  const pct = (score * 100).toFixed(0);

  switch (type) {
    case "exact":
      return `Asset idéntico al existente (coincidencia exacta). El nuevo asset no será ingresado.`;
    case "perceptual":
      return `Asset visualmente idéntico (similitud ${pct}%). Se recomienda omitir el duplicado y reutilizar el existente.`;
    case "near":
      return `Asset muy similar (similitud ${pct}%). Requiere revisión del operador para confirmar si es un duplicado o una variante válida.`;
    case "variant":
      return `Asset similar pero con diferencias intencionales (similitud ${pct}%). Tratado como variante — puede coexistir con el original.`;
    case "derivative":
      return `Asset derivado (similitud ${pct}%). Probablemente editado desde el original. Se ingresará con relación "parent_asset".`;
  }
}

// ── Batch deduplication context ────────────────────────────────────────────────

/**
 * BatchDeduplicationContext — context for deduplication during batch ingestion.
 *
 * The batch pipeline needs to deduplicate WITHIN the batch (cross-item)
 * as well as against the existing Biblioteca.
 */
export interface BatchDeduplicationContext {
  tenantId:        string;
  batchJobId:      string;
  /** pHash fingerprints of all assets already in the Biblioteca for this tenant. */
  existingHashes:  Array<{ assetId: string; pHash: string }>;
  /** pHash fingerprints of items already processed within this batch. */
  batchHashes:     Array<{ itemId: string; pHash: string }>;
  /** Whether to auto-skip exact duplicates or flag for review. */
  autoSkipExact:   boolean;
}

/**
 * DeduplicationReport — summary of the deduplication run for a batch.
 */
export interface DeduplicationReport {
  total:          number;
  exact:          number;
  perceptual:     number;
  near:           number;
  unique:         number;
  skipped:        number;
  flaggedForReview: number;
  details:        AssetSimilarityResult[];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * pHashDistanceToScore — converts a Hamming distance (0–64) to a 0–1 similarity score.
 * Used when the raw pHash distance is available (from imagehash library, etc.).
 */
export function pHashDistanceToScore(hammingDistance: number, bits: number = 64): number {
  return Math.max(0, 1 - hammingDistance / bits);
}

/**
 * isLikelyDuplicate — quick check: is a score above the near-duplicate threshold?
 * Use this for fast filtering before full classification.
 */
export function isLikelyDuplicate(score: number): boolean {
  return score >= DUPLICATE_THRESHOLDS.NEAR;
}

/**
 * isConfirmedDuplicate — is this score above the perceptual-identical threshold?
 * If true, the asset should be auto-skipped during ingestion.
 */
export function isConfirmedDuplicate(score: number, method: SimilarityMethod): boolean {
  if (method === "sha256_exact" || method === "url_exact") return true;
  return score >= DUPLICATE_THRESHOLDS.PERCEPTUAL;
}
