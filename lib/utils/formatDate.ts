/**
 * lib/utils/formatDate.ts
 *
 * Deterministic date formatters for Colombian locale (es-CO).
 *
 * WHY: toLocaleDateString() produces different output on Node.js (server) vs
 * V8 in the browser for the same locale, causing React hydration mismatches.
 * These helpers are pure string concatenation — same output everywhere.
 *
 * All functions accept Date | string | null | undefined and return "—" for nullish.
 */

type DateInput = Date | string | null | undefined;

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

const WEEKDAYS = [
  "domingo", "lunes", "martes", "miércoles",
  "jueves", "viernes", "sábado",
] as const;

function parse(d: DateInput): Date | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** "26 de jun de 2020" — full date, short month. Most common. */
export function formatDateCol(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "26 de jun" — day + short month, no year. */
export function formatDateShort(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "junio de 2020" — long month + year. */
export function formatMonthYear(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "sábado, 26 de junio de 2020" — weekday + full date, long month. */
export function formatDateWeekday(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "sábado, 26 de junio" — weekday + day + long month, no year. */
export function formatDateWeekdayShort(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

/** "sábado, 26 de jun" — weekday + day + short month, no year. */
export function formatDateWeekdayMonthShort(date: DateInput): string {
  const d = parse(date);
  if (!d) return "—";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`;
}
