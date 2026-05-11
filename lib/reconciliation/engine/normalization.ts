/**
 * lib/reconciliation/engine/normalization.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Normalization Helpers
 *
 * Pure normalization utilities used by the matching and scoring layers.
 * No Prisma. No side effects. All functions are pure and deterministic.
 *
 * Normalization goals:
 *   - Enable consistent comparisons across heterogeneous source formats
 *   - Strip formatting differences (leading zeros, case, accents, spaces)
 *   - Never lose information — normalization is for COMPARISON, not for storage
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Text normalization ─────────────────────────────────────────────────────────

/**
 * Normalize a text string for comparison.
 *
 * Operations:
 *   1. Trim whitespace
 *   2. Lowercase
 *   3. Remove diacritics (á→a, é→e, ñ→n, etc.) using Unicode NFD decomposition
 *   4. Collapse multiple internal spaces to single space
 *
 * Used for: thirdPartyName, reference, label comparisons.
 */
export function normalizeText(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/\s+/g, " ");
}

/**
 * Normalize a document number for comparison.
 *
 * Operations:
 *   1. Trim and lowercase
 *   2. Strip leading zeros (e.g., "000123" → "123")
 *   3. Remove internal hyphens and spaces (some sources include them)
 *
 * Used for: documentNumber comparisons across SAG, DIAN, bank sources.
 */
export function normalizeDocumentNumber(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  const cleaned = s
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "");      // remove hyphens and spaces
  // Strip leading zeros only from purely numeric strings
  if (/^\d+$/.test(cleaned)) {
    return String(parseInt(cleaned, 10));
  }
  return cleaned;
}

// ── Amount normalization ───────────────────────────────────────────────────────

/**
 * Round an amount to 2 decimal places for stable comparison.
 * Avoids floating-point drift: 1000.000001 → 1000.00
 */
export function normalizeAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Check whether two amounts are within a fractional tolerance.
 *
 * @param a         Amount from source A
 * @param b         Amount from source B
 * @param tolerance Fractional tolerance (default 0.001 = 0.1%)
 *                  When a = 0 and b = 0: always within tolerance.
 *                  When a = 0 and b ≠ 0: never within tolerance.
 */
export function amountsWithinTolerance(
  a:         number,
  b:         number,
  tolerance: number = 0.001,
): boolean {
  const diff = Math.abs(a - b);
  if (diff === 0) return true;
  const base = Math.abs(a);
  if (base === 0) return false;
  return diff / base <= tolerance;
}

/**
 * Compute the percentage difference between two amounts.
 * Returns null when base (a) is 0 to avoid division by zero.
 */
export function amountDeltaPct(a: number, b: number): number | null {
  if (a === 0) return null;
  return Math.round(((b - a) / Math.abs(a)) * 10000) / 100;
}

// ── Date normalization ─────────────────────────────────────────────────────────

/**
 * Parse an ISO date string ("YYYY-MM-DD") or ISO timestamp to a Date object.
 * Returns null on invalid input.
 *
 * Strips time component to midnight UTC for stable date-only comparison.
 */
export function parseDate(s: string | null | undefined): Date | null {
  if (s == null || s === "") return null;
  // Take only the date part (handles both "YYYY-MM-DD" and full ISO timestamps)
  const datePart = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = new Date(datePart + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Absolute difference in calendar days between two dates.
 * Returns null if either date is null.
 */
export function dateDiffDays(a: Date | null, b: Date | null): number | null {
  if (a == null || b == null) return null;
  const msPerDay = 86_400_000;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay);
}

// ── NIT normalization ─────────────────────────────────────────────────────────

/**
 * Normalize a Colombian NIT or document ID for comparison.
 *
 * Strips:
 *   - Verification digit (e.g., "900123456-7" → "900123456")
 *   - Leading zeros for numeric NITs
 *   - Hyphens and spaces
 *
 * Examples:
 *   "900.123.456-7" → "900123456"
 *   "900123456" → "900123456"
 *   "C.C. 12345678" → "cc12345678"
 */
export function normalizeThirdPartyId(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  // Remove dots and spaces (NIT format: 900.123.456)
  let cleaned = s.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
  // Strip verification digit if present (trailing -N)
  cleaned = cleaned.replace(/-\d+$/, "");
  // Strip leading zeros from numeric IDs
  if (/^\d+$/.test(cleaned)) {
    cleaned = String(parseInt(cleaned, 10));
  }
  return cleaned;
}

// ── Reference normalization ───────────────────────────────────────────────────

/**
 * Normalize a payment reference for fuzzy comparison.
 *
 * Extracts numeric sequences — often the only stable part of a reference string
 * across heterogeneous source formats.
 *
 * Example:
 *   "REF-000123-2026" → "1232026"
 *   "PAGO FACTURA 1234" → "1234"
 */
export function normalizeReference(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  // Extract all digit sequences and join
  const digits = s.match(/\d+/g);
  return digits ? digits.map(d => String(parseInt(d, 10))).join("") : normalizeText(s);
}

/**
 * Check whether two references share significant content.
 * "Significant" = normalized text overlap of ≥ 5 characters,
 * OR numeric sequence match.
 */
export function referencesMatch(a: string | null, b: string | null): boolean {
  const na = normalizeReference(a);
  const nb = normalizeReference(b);
  if (na === "" || nb === "") return false;
  // Exact match on normalized
  if (na === nb) return true;
  // One contains the other (substring)
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
}
