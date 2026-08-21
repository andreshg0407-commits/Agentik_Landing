/**
 * lib/marketing-studio/bulk-import/reference-normalizer.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Reference Normalizer
 *
 * Canonical reference normalizer for matching Drive file/folder names
 * to ProductEntity SKUs.
 *
 * ── Algorithm ──────────────────────────────────────────────────────────────────
 *   1. trim()
 *   2. toUpperCase()
 *   3. Collapse multiple spaces → single space
 *
 * ── Extraction patterns (from file/folder names) ───────────────────────────────
 *   Folder name:   "CJ-1126012 Conjunto Dino"    → "CJ-1126012"
 *   File name:     "CJ-1126012.jpg"               → "CJ-1126012"
 *   File name:     "CJ-1126012_01.jpg"             → "CJ-1126012"
 *   File name:     "CJ-1126012_frontal.jpg"        → "CJ-1126012"
 *   Bracket:       "Pijama [PJ-001]"               → "PJ-001"
 *   Delimited:     "CJ-1126012 - Niño Azul"        → "CJ-1126012"
 *
 * ── Matching ───────────────────────────────────────────────────────────────────
 *   EXACT MATCH ONLY. No fuzzy matching. No Levenshtein.
 *   If extraction yields AMBIGUOUS_REF (multiple candidates), flag it.
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *   - normalizeReference is idempotent
 *   - normalizeReference("  cj-1126012  ") === normalizeReference("CJ-1126012")
 *   - extractReference returns at most one canonical reference
 */

// ── Canonical normalizer ──────────────────────────────────────────────────────

/**
 * Canonical normalizer: trim, uppercase, collapse whitespace.
 * Used for both ProductEntity SKUs and extracted references.
 */
export function normalizeReference(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s{2,}/g, " ");
}

// ── Reference extraction from names ───────────────────────────────────────────

/**
 * Reference code pattern:
 *   2-5 uppercase letters, dash, 3-8 digits
 *   e.g. CJ-1126012, PJ-001, VES-42301, BB-1234567
 */
const REF_CODE_PATTERN = /([A-Za-z]{2,5}-\d{3,8})/;

/**
 * Bracket pattern: [CODE] anywhere in the string
 */
const BRACKET_PATTERN = /\[([A-Za-z0-9-]+)\]/;

export interface ExtractionResult {
  /** Normalized reference, or null if no reference could be extracted */
  reference:   string | null;
  /** Method used for extraction */
  method:      "prefix" | "bracket" | "filename_prefix" | "none";
  /** Original input (for debugging) */
  rawInput:    string;
}

/**
 * Extracts a product reference from a folder or file name.
 *
 * Priority:
 *   1. Bracket notation: "Name [CJ-123]" → CJ-123
 *   2. Prefix code: "CJ-123 Name" or "CJ-123 - Name" → CJ-123
 *   3. Filename prefix: "CJ-123.jpg" or "CJ-123_01.jpg" → CJ-123
 *
 * Returns normalized uppercase reference or null.
 */
export function extractReference(name: string): ExtractionResult {
  const raw = name.trim();
  if (!raw) return { reference: null, method: "none", rawInput: raw };

  // Strip file extension for file names
  const dotIdx = raw.lastIndexOf(".");
  const hasExt = dotIdx > 0 && raw.length - dotIdx <= 6; // .jpeg max
  const baseName = hasExt ? raw.slice(0, dotIdx) : raw;

  // 1. Bracket: "Name [CJ-123]" → CJ-123
  const bracketMatch = baseName.match(BRACKET_PATTERN);
  if (bracketMatch) {
    return {
      reference: normalizeReference(bracketMatch[1]),
      method:    "bracket",
      rawInput:  raw,
    };
  }

  // 2. Reference code anywhere in name
  const codeMatch = baseName.match(REF_CODE_PATTERN);
  if (codeMatch) {
    const ref = normalizeReference(codeMatch[1]);
    // Determine if it's a prefix or filename prefix
    const isPrefix = baseName.trimStart().toUpperCase().startsWith(ref);
    return {
      reference: ref,
      method:    isPrefix ? "prefix" : "filename_prefix",
      rawInput:  raw,
    };
  }

  return { reference: null, method: "none", rawInput: raw };
}

/**
 * Extracts reference from a file, trying parent folder name first,
 * then the filename itself.
 *
 * @param fileName    e.g. "frontal.jpg" or "CJ-1126012_01.jpg"
 * @param parentName  e.g. "CJ-1126012 Conjunto Dino"
 */
export function extractReferenceFromFile(
  fileName:   string,
  parentName: string,
): ExtractionResult {
  // Try parent folder first (most reliable)
  const fromParent = extractReference(parentName);
  if (fromParent.reference) return fromParent;

  // Fall back to filename
  return extractReference(fileName);
}

// ── Matcher ──────────────────────────────────────────────────────────────────

export interface MatchResult {
  /** Matched ProductEntity ID, or null */
  productId:    string | null;
  /** Matched normalized SKU, or null */
  matchedSku:   string | null;
  /** Status code */
  status:       "MATCHED" | "NO_REF_EXTRACTED" | "REF_NOT_FOUND" | "AMBIGUOUS_REF";
  /** Extracted reference (normalized) */
  extractedRef: string | null;
}

/**
 * Matches an extracted reference against a product SKU map.
 *
 * @param ref           Extracted reference (already normalized)
 * @param skuToProduct  Map<normalizedSku, productId> — EXACT match only
 * @param skuCounts     Optional Map<normalizedSku, count> to detect ambiguity
 */
export function matchReference(
  ref:          string | null,
  skuToProduct: Map<string, string>,
  skuCounts?:   Map<string, number>,
): MatchResult {
  if (!ref) {
    return { productId: null, matchedSku: null, status: "NO_REF_EXTRACTED", extractedRef: null };
  }

  // Check for ambiguity (multiple ProductEntities with same normalized SKU)
  if (skuCounts && (skuCounts.get(ref) ?? 0) > 1) {
    return { productId: null, matchedSku: ref, status: "AMBIGUOUS_REF", extractedRef: ref };
  }

  const productId = skuToProduct.get(ref);
  if (productId) {
    return { productId, matchedSku: ref, status: "MATCHED", extractedRef: ref };
  }

  return { productId: null, matchedSku: null, status: "REF_NOT_FOUND", extractedRef: ref };
}
