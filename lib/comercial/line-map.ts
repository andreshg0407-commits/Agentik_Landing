/**
 * lib/comercial/line-map.ts
 *
 * COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 7:
 * Single source of truth for SAG line code mappings.
 *
 * Before this file, 4+ inline definitions existed with different
 * casing and fallback behavior. All consumers MUST import from here.
 */

/** SAG line code → brand display name */
export const LINE_TO_BRAND: Record<string, string> = {
  CS: "Castillitos",
  LT: "Latin Kids",
};

/** SAG line code → sub-line label (uppercase) */
export const LINE_TO_SUBLINEA: Record<string, string> = {
  CS: "CASTILLITOS",
  LT: "LATIN KIDS",
};

/** All recognized commercial line codes */
export const COMMERCIAL_LINES = ["CS", "LT"] as const;
export type CommercialLineCode = (typeof COMMERCIAL_LINES)[number];

/** Check if a line code is a known commercial line */
export function isCommercialLine(line: string): line is CommercialLineCode {
  return COMMERCIAL_LINES.includes(line as CommercialLineCode);
}
