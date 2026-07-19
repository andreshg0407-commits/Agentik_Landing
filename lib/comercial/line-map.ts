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

/**
 * SAG LINEAS FK (numeric) → letter code.
 * Used by inventory-refresh-pipeline, vendor-sample-loader, _resync-coverage-snapshot.
 *
 * CONFIRMED live (Jul 16 2026): 6 lines in SAG LINEAS table:
 *   1=LATIN KIDS, 2=CASTILLITOS, 3=OTROS, 4=POWER, 5=IMPORTACION, 6=PIJAMAS DAMA
 */
export const SAG_LINE_FK_MAP: Record<string, string> = {
  "1": "LT",
  "2": "CS",
  "3": "OT",   // was "PK" — confirmed OTROS in live SAG
  "4": "PW",   // POWER
  "5": "IM",   // was "AC" — confirmed IMPORTACION in live SAG
  "6": "PD",   // PIJAMAS DAMA
};

/**
 * Resolve a SAG line code from any format (numeric FK, letter code, or name).
 * Returns the canonical letter code ("LT", "CS", "OTRO", etc.)
 * Used by sag-inventory-normalizer.ts.
 *
 * COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 3:
 * Never defaults unrecognized codes to "CS". Returns "OTRO" when evidence is unclear.
 */
export function resolveLineCode(
  rawLine: string | undefined,
  description: string,
): "LT" | "CS" | "OTRO" {
  if (rawLine) {
    const u = rawLine.trim().toUpperCase();
    if (u === "LT" || u === "CS") return u as "LT" | "CS";
    // SAG numeric FK codes
    const mapped = SAG_LINE_FK_MAP[u];
    if (mapped === "LT" || mapped === "CS") return mapped;
    // Named variants
    if (u.startsWith("L") || u === "LENCERIA") return "LT";
    if (u === "CONFECCION") return "CS";
    return "OTRO";
  }
  // Fallback: infer from description keywords (only when rawLine is absent)
  const d = description.toUpperCase();
  if (d.includes("LENCERIA") || d.includes("TELERIA")) return "LT";
  return "OTRO";
}
