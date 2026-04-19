/**
 * Shared period helpers for the sales module.
 * Previously inline in page.tsx — extracted so drill-down pages can reuse them.
 */

/** Subtract N months from a "YYYYMM" string, returning a new "YYYYMM" string. */
export function periodMinusMonths(periodo: string, months: number): string {
  const year  = Number(periodo.slice(0, 4));
  const month = Number(periodo.slice(4));           // 1-based
  const date  = new Date(year, month - 1 - months, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns true when `p` is a valid "YYYYMM" period string. */
export function isValidPeriod(p: string | undefined): p is string {
  return typeof p === "string" && /^\d{6}$/.test(p);
}

/** Format a "YYYYMM" period as a human-readable Spanish label, e.g. "Ene 2024". */
const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
                     "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}
