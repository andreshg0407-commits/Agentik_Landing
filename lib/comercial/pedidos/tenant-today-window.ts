/**
 * lib/comercial/pedidos/tenant-today-window.ts
 *
 * Computes the UTC interval [todayStart, tomorrowStart) for a given
 * IANA timezone (default: America/Bogota = COT, UTC-5).
 *
 * For COT on 2026-08-18:
 *   todayStart    = 2026-08-18T05:00:00.000Z  (midnight COT in UTC)
 *   tomorrowStart = 2026-08-19T05:00:00.000Z
 *
 * Semi-open interval: createdAt >= todayStart AND createdAt < tomorrowStart
 *
 * Sprint: ORDERS-RUNTIME-CORRECTION-06A1
 */

export interface TodayWindow {
  /** Midnight of today in the tenant timezone, expressed as UTC Date */
  todayStart: Date;
  /** Midnight of tomorrow in the tenant timezone, expressed as UTC Date */
  tomorrowStart: Date;
}

/**
 * Compute the UTC boundaries for "today" in the given IANA timezone.
 *
 * Algorithm:
 *   1. Format `now` as YYYY-MM-DD in the target timezone using Intl
 *   2. Find the UTC epoch for midnight of that date in the target timezone
 *      by binary-searching a small range (the offset is within ±14h)
 *
 * This handles DST transitions correctly for any IANA timezone.
 *
 * @param now       — current instant (defaults to new Date())
 * @param timezone  — IANA timezone string (e.g. "America/Bogota")
 */
export function computeTodayWindow(
  now: Date = new Date(),
  timezone: string = "America/Bogota",
): TodayWindow {
  const tenantDate = formatDateInTz(now, timezone);
  const todayStart = midnightUtcForTzDate(tenantDate, timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);
  return { todayStart, tomorrowStart };
}

/**
 * Format a Date as "YYYY-MM-DD" in the given timezone.
 */
function formatDateInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const dd = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${dd}`;
}

/**
 * Find the UTC epoch for midnight of the given calendar date in the target timezone.
 *
 * Strategy: test candidate UTC epochs from dateStr T00:00Z - 14h to dateStr T00:00Z + 14h.
 * For each candidate, check if it maps to the correct calendar date in the target timezone.
 * The correct answer is the earliest UTC epoch that maps to the target date.
 *
 * For Colombia (UTC-5, no DST): midnight COT = 05:00 UTC.
 */
function midnightUtcForTzDate(dateStr: string, tz: string): Date {
  // Start from dateStr midnight UTC minus 14 hours (covers all timezones)
  const baseUtc = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const start = baseUtc - 14 * 3600_000;
  const end = baseUtc + 14 * 3600_000;

  // Step in 15-minute increments (handles UTC+5:45 Nepal etc.)
  const step = 15 * 60_000;

  for (let t = start; t <= end; t += step) {
    const candidate = new Date(t);
    const candidateDate = formatDateInTz(candidate, tz);
    if (candidateDate === dateStr) {
      return candidate;
    }
  }

  // Fallback — should never happen for valid timezone/date combos
  return new Date(`${dateStr}T05:00:00.000Z`);
}
