/**
 * reconciliation-rules.ts
 *
 * Pure scoring functions for the document-vs-receivable matching engine.
 * Every function is deterministic and side-effect free — safe to call in
 * server components or background jobs.
 *
 * Scoring philosophy:
 *   - Invoice-number match         → +40 pts  (strong anchor)
 *   - NIT / fiscal ID match        → +20 pts
 *   - Amount match (exact)         → +25 pts
 *   - Amount match (within 2%)     → +15 pts
 *   - Amount match (within 5%)     → +8  pts
 *   - Date match (same day)        → +20 pts
 *   - Date match (≤ 3 days)        → +15 pts
 *   - Date match (≤ 7 days)        → +8  pts
 *   - Reference/memo text hit      → +10 pts
 *
 * Thresholds (exported so the engine can override for testing):
 *   THRESHOLD_CONCILIADO   = 60   high-confidence match
 *   THRESHOLD_PARCIAL      = 30   low-confidence / partial
 *   AMOUNT_TOLERANCE_EXACT = 0.01 (1 COP/USD rounding)
 *   AMOUNT_TOLERANCE_SOFT  = 0.02 (2% — covers bank charges, FX rounding)
 *   AMOUNT_TOLERANCE_LOOSE = 0.05 (5% — flags INCONSISTENTE)
 *   DATE_WINDOW_EXACT      = 0    days
 *   DATE_WINDOW_NEAR       = 3    days
 *   DATE_WINDOW_WIDE       = 7    days
 */

// ── Tolerances & thresholds ───────────────────────────────────────────────────

export const THRESHOLD_CONCILIADO    = 60;
export const THRESHOLD_PARCIAL       = 30;
export const AMOUNT_TOLERANCE_EXACT  = 0.01;  // absolute COP
export const AMOUNT_TOLERANCE_SOFT   = 0.02;  // 2 %
export const AMOUNT_TOLERANCE_LOOSE  = 0.05;  // 5 % → flags INCONSISTENTE
export const DATE_WINDOW_NEAR        = 3;     // days
export const DATE_WINDOW_WIDE        = 7;     // days
export const DATE_WINDOW_LOOSE       = 14;    // days

// ── Individual scoring functions ──────────────────────────────────────────────

/**
 * Score based on invoice/comprobante number equality.
 * Strips whitespace and hyphens before comparing.
 */
export function scoreInvoiceNumber(
  docRef:       string | null | undefined,
  receivableRef: string | null | undefined,
): number {
  if (!docRef || !receivableRef) return 0;
  const clean = (s: string) => s.replace(/[\s\-\.]/g, "").toUpperCase();
  return clean(docRef) === clean(receivableRef) ? 40 : 0;
}

/**
 * Score based on NIT / fiscal-ID equality.
 * Strips common formatting (dots, hyphens, spaces, leading zeros not normalised).
 */
export function scoreNit(
  docNit:        string | null | undefined,
  receivableNit: string | null | undefined,
): number {
  if (!docNit || !receivableNit) return 0;
  const clean = (s: string) => s.replace(/[\s\-\.]/g, "").toUpperCase();
  return clean(docNit) === clean(receivableNit) ? 20 : 0;
}

/**
 * Score amount proximity.
 * Returns { score, amountDiff, isExact, isInconsistent }
 */
export function scoreAmount(
  docAmount:        number | null,
  receivableAmount: number,
): { score: number; amountDiff: number | null; isExact: boolean; isInconsistent: boolean } {
  if (docAmount === null || docAmount === undefined) {
    return { score: 0, amountDiff: null, isExact: false, isInconsistent: false };
  }

  const diff     = Math.abs(docAmount - receivableAmount);
  const base     = Math.max(Math.abs(receivableAmount), 1);
  const pct      = diff / base;
  const isExact  = diff <= AMOUNT_TOLERANCE_EXACT;

  let score = 0;
  if (isExact)                         score = 25;
  else if (pct <= AMOUNT_TOLERANCE_SOFT)  score = 15;
  else if (pct <= AMOUNT_TOLERANCE_LOOSE) score = 8;

  return {
    score,
    amountDiff:     diff,
    isExact,
    isInconsistent: pct > AMOUNT_TOLERANCE_LOOSE,
  };
}

/**
 * Score date proximity.
 * Returns 0 if either date is null.
 */
export function scoreDate(
  docDate:        Date | null | undefined,
  receivableDate: Date | null | undefined,
): number {
  if (!docDate || !receivableDate) return 0;
  const diffDays = Math.abs(
    (docDate.getTime() - receivableDate.getTime()) / 86_400_000,
  );
  if (diffDays === 0)                  return 20;
  if (diffDays <= DATE_WINDOW_NEAR)    return 15;
  if (diffDays <= DATE_WINDOW_WIDE)    return 8;
  if (diffDays <= DATE_WINDOW_LOOSE)   return 3;
  return 0;
}

/**
 * Score based on memo / reference text containing the invoice reference.
 * Used for bank-statement lines whose memo may embed an invoice number or NIT.
 */
export function scoreReferenceInMemo(
  invoiceRef: string | null | undefined,
  memo:       string | null | undefined,
): number {
  if (!invoiceRef || !memo) return 0;
  const ref     = invoiceRef.replace(/[\s\-\.]/g, "").toUpperCase();
  const memoUp  = memo.toUpperCase().replace(/[\s\-\.]/g, "");
  return memoUp.includes(ref) ? 10 : 0;
}

// ── Safe extractors for extractedJson ─────────────────────────────────────────

/**
 * Attempt to pull the invoice/comprobante number from a document's
 * parsed extractedJson blob. Falls back to null gracefully.
 */
export function extractInvoiceNumber(
  extractedJson: unknown,
): string | null {
  if (!extractedJson || typeof extractedJson !== "object") return null;
  const ej = extractedJson as Record<string, unknown>;
  // Common keys used by CFDI, Colombian e-invoice, or custom parsers
  for (const key of [
    "invoiceNumber", "numeroFactura", "folio", "serie",
    "cfdiNumber", "comprobanteCode", "documentNumber",
  ]) {
    const v = ej[key];
    if (v && typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "number")              return String(v);
  }
  return null;
}

/**
 * Attempt to pull the customer / receiver NIT from extractedJson.
 */
export function extractReceiverNit(
  extractedJson: unknown,
): string | null {
  if (!extractedJson || typeof extractedJson !== "object") return null;
  const ej = extractedJson as Record<string, unknown>;
  for (const key of [
    "receiverRfc", "receiverNit", "rfcReceptor", "nitReceptor",
    "customerNit", "clienteNit", "buyerNit",
  ]) {
    const v = ej[key];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
