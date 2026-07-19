/**
 * lib/marketing-studio/library/duplicate-detection.ts
 *
 * MARKETING-STUDIO-BIBLIOTECA-DUPLICATES-01
 *
 * Deterministic duplicate detection for ProductConsoleItem[].
 * Pure function — no AI, no embeddings, no external dependencies.
 *
 * ── Scoring weights ───────────────────────────────────────────────────────────
 *   SKU exactamente igual:        60
 *   Nombre normalizado igual:     35
 *   Nombre similar (≥60%):        ≤20  (proportional)
 *   SKU similar (≥70%):           ≤20  (proportional)
 *   Misma categoría:              10
 *   Misma línea de producto:      10
 *
 * ── Threshold ────────────────────────────────────────────────────────────────
 *   score >= 50 → candidate shown to user
 *   score <  50 → discarded silently
 *
 * ── Pair deduplication ───────────────────────────────────────────────────────
 *   A-B and B-A produce the same canonical key.
 *   A product is never compared to itself.
 */

import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";

// ── Public types ──────────────────────────────────────────────────────────────

export interface DuplicateReason {
  label:  string;
  weight: number;
}

export interface DuplicateCandidate {
  primary:   ProductConsoleItem;
  secondary: ProductConsoleItem;
  /** Total confidence score (sum of matching weights). */
  score:     number;
  /** Individual reasons driving the score — shown to the user. */
  reasons:   DuplicateReason[];
}

// ── Text normalization ────────────────────────────────────────────────────────

const DIACRITIC_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u",
  ñ: "n", Ñ: "n",
};

/**
 * Normalize a string for duplicate comparison.
 * Converts to lowercase, strips diacritics, collapses whitespace,
 * removes non-alphanumeric characters.
 */
export function normalizeText(value: string): string {
  if (!value) return "";
  return value
    .replace(/[áéíóúüÁÉÍÓÚÜñÑ]/g, ch => DIACRITIC_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Token-based similarity ────────────────────────────────────────────────────

/**
 * Token Jaccard similarity between two strings.
 * Returns 0–1 where 1 = identical, 0 = no shared tokens.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (!na || !nb) return 0;
  if (na === nb)   return 1;

  // Substring containment — strong signal for SKU prefixes / name variants
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  const tokensA = new Set(na.split(" ").filter(Boolean));
  const tokensB = new Set(nb.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) shared++;
  }

  const union = tokensA.size + tokensB.size - shared;
  return union > 0 ? shared / union : 0;
}

// ── Detection engine ──────────────────────────────────────────────────────────

const THRESHOLD = 50;

/**
 * Detect potential duplicate product references.
 *
 * Runs in O(n²) — suitable for library sizes up to ~1 000 products.
 * Returns candidates sorted by score descending (highest confidence first).
 */
export function detectProductDuplicates(
  products: ProductConsoleItem[],
): DuplicateCandidate[] {
  if (products.length < 2) return [];

  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];

      // Canonical pair key — A-B and B-A map to the same key
      const pairKey = a.productId < b.productId
        ? `${a.productId}|${b.productId}`
        : `${b.productId}|${a.productId}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const reasons: DuplicateReason[] = [];
      let score = 0;

      // ── SKU exactamente igual ─────────────────────────────────────────────
      if (a.sku && b.sku) {
        const skuA = normalizeText(a.sku);
        const skuB = normalizeText(b.sku);
        if (skuA && skuB && skuA === skuB) {
          reasons.push({ label: "SKU idéntico", weight: 60 });
          score += 60;
        } else {
          // ── SKU similar ────────────────────────────────────────────────────
          const sim = similarityScore(a.sku, b.sku);
          if (sim >= 0.7) {
            const weight = Math.round(sim * 20);
            reasons.push({ label: "SKU similar", weight });
            score += weight;
          }
        }
      }

      // ── Nombre exactamente igual (normalizado) ────────────────────────────
      const nameA = normalizeText(a.name);
      const nameB = normalizeText(b.name);
      if (nameA && nameB && nameA === nameB) {
        reasons.push({ label: "Nombre idéntico", weight: 35 });
        score += 35;
      } else if (nameA && nameB) {
        // ── Nombre similar ─────────────────────────────────────────────────
        const sim = similarityScore(a.name, b.name);
        if (sim >= 0.6) {
          const weight = Math.round(sim * 20);
          reasons.push({ label: "Nombre similar", weight });
          score += weight;
        }
      }

      // ── Misma categoría ──────────────────────────────────────────────────
      if (a.category && b.category &&
          normalizeText(a.category) === normalizeText(b.category)) {
        reasons.push({ label: "Misma categoría", weight: 10 });
        score += 10;
      }

      // ── Misma línea de producto ──────────────────────────────────────────
      if (a.productLine && b.productLine &&
          normalizeText(a.productLine) === normalizeText(b.productLine)) {
        reasons.push({ label: "Misma línea de producto", weight: 10 });
        score += 10;
      }

      if (score >= THRESHOLD) {
        candidates.push({ primary: a, secondary: b, score, reasons });
      }
    }
  }

  return candidates.sort((x, y) => y.score - x.score);
}
