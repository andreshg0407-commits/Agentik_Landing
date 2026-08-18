/**
 * lib/comercial/importaciones/calendar-months.ts
 *
 * Calendar month calculations for import rotation classification.
 * Uses America/Bogota timezone and real calendar months — NOT fixed day counts.
 *
 * Rules:
 *   - "6 months ago" from 2026-08-17 = 2026-02-17 (not 180 days)
 *   - February 28/29, 30/31-day months handled by Date arithmetic
 *   - All comparisons in Colombia timezone
 *
 * Sprint: IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2
 */

const BOGOTA_TZ = "America/Bogota";

/**
 * Get the current date in Colombia timezone as a Date object.
 * The returned Date has year/month/day matching COT (UTC-5).
 */
export function nowBogota(): Date {
  const now = new Date();
  const bogotaStr = now.toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
  // en-CA format: YYYY-MM-DD
  const [y, m, d] = bogotaStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Subtract N calendar months from a date.
 * Handles month-end overflow: 2026-08-31 minus 6 months = 2026-02-28.
 */
export function subtractCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth() - months, date.getDate());
  // If the day overflowed (e.g., Jan 31 - 1 month = "Feb 31" → Mar 3),
  // clamp to the last day of the target month.
  const targetMonth = (date.getMonth() - months % 12 + 12) % 12;
  const targetYear = date.getFullYear() - Math.floor((date.getMonth() - months + (months > 0 ? 0 : 12)) / 12);
  // Simpler: just check if the month changed unexpectedly
  if (result.getMonth() !== ((date.getMonth() - months) % 12 + 12) % 12) {
    // Overflowed — set to last day of the intended month
    result.setDate(0); // Goes to last day of previous month
  }
  return result;
}

/**
 * Get the cutoff date for a sales window in Colombia timezone.
 * "6M" means: from (today_bogota minus 6 calendar months) to today_bogota.
 */
export function getWindowCutoff(windowMonths: number): Date {
  return subtractCalendarMonths(nowBogota(), windowMonths);
}

/**
 * Count calendar months between two dates.
 * Returns the number of complete calendar months elapsed.
 */
export function calendarMonthsBetween(earlier: Date, later: Date): number {
  const yearDiff = later.getFullYear() - earlier.getFullYear();
  const monthDiff = later.getMonth() - earlier.getMonth();
  let total = yearDiff * 12 + monthDiff;
  // If the day hasn't been reached yet, subtract one
  if (later.getDate() < earlier.getDate()) {
    total--;
  }
  return Math.max(0, total);
}

/**
 * Check if a date is at least N calendar months old (Colombia timezone).
 */
export function isAtLeastMonthsOld(dateStr: string, months: number): boolean {
  const date = new Date(dateStr);
  const today = nowBogota();
  return calendarMonthsBetween(date, today) >= months;
}

/**
 * Parse a date string to Colombia-local Date for comparison.
 */
export function parseDateBogota(dateStr: string): Date {
  const d = new Date(dateStr);
  const bogotaStr = d.toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
  const [y, m, day] = bogotaStr.split("-").map(Number);
  return new Date(y, m - 1, day);
}
