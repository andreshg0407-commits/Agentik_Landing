/**
 * lib/marketing-studio/library/world-classification.ts
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A — Tres Mundos Classification
 *
 * Canonical classification of references into commercial worlds.
 * Source of truth: SAG LINEAS FK via lib/comercial/line-map.ts
 *
 *   1 → LT → latin_kids
 *   2 → CS → castillitos
 *   5 → IM → importacion
 *   * → sin_clasificar
 *
 * Pure types + pure functions. No Prisma. No React.
 */

import { SAG_LINE_FK_MAP } from "@/lib/comercial/line-map";

// ── World code ──────────────────────────────────────────────────────────────────

export type WorldCode = "castillitos" | "latin_kids" | "importacion" | "sin_clasificar";

export const ALL_WORLDS: readonly WorldCode[] = [
  "castillitos", "latin_kids", "importacion", "sin_clasificar",
] as const;

// ── Display labels ──────────────────────────────────────────────────────────────

export const WORLD_LABELS: Record<WorldCode, string> = {
  castillitos:    "Castillitos",
  latin_kids:     "Latin Kids",
  importacion:    "Importación",
  sin_clasificar: "Sin clasificar",
};

export const WORLD_ACCENT: Record<WorldCode, string> = {
  castillitos:    "#004AAD",   // C.blueDark
  latin_kids:     "#7c3aed",   // C.brand (purple)
  importacion:    "#0891b2",   // teal
  sin_clasificar: "#94a3b8",   // gray
};

// ── SAG line code → WorldCode ───────────────────────────────────────────────────

const LINE_TO_WORLD: Record<string, WorldCode> = {
  CS: "castillitos",
  LT: "latin_kids",
  IM: "importacion",
};

/**
 * Classify a reference into a world based on SAG line codes.
 *
 * Accepts either the 2-letter line code (CS, LT, IM) or the numeric SAG FK (1, 2, 5).
 * Returns "sin_clasificar" when evidence is insufficient — never guesses.
 */
export function classifyWorld(
  lineCode: string | null | undefined,
  productLine?: string | null,
): WorldCode {
  // Direct line code match
  if (lineCode) {
    const upper = lineCode.trim().toUpperCase();
    const direct = LINE_TO_WORLD[upper];
    if (direct) return direct;

    // Full name match
    if (upper === "CASTILLITOS" || upper === "CONFECCION") return "castillitos";
    if (upper === "LATIN KIDS" || upper === "LENCERIA") return "latin_kids";
    if (upper === "IMPORTACION" || upper === "IMPORTACIÓN" || upper === "ACCESORIOS") return "importacion";
  }

  // Numeric SAG FK via productLine
  if (productLine) {
    const fkCode = SAG_LINE_FK_MAP[productLine];
    if (fkCode) {
      const world = LINE_TO_WORLD[fkCode];
      if (world) return world;
    }
  }

  return "sin_clasificar";
}

// ── World counts ────────────────────────────────────────────────────────────────

export interface WorldCounts {
  castillitos:    number;
  latin_kids:     number;
  importacion:    number;
  sin_clasificar: number;
  total:          number;
}

export function emptyWorldCounts(): WorldCounts {
  return { castillitos: 0, latin_kids: 0, importacion: 0, sin_clasificar: 0, total: 0 };
}

/**
 * Validate the world invariant:
 * castillitos + latin_kids + importacion + sin_clasificar === total
 */
export function validateWorldInvariant(counts: WorldCounts): boolean {
  return (
    counts.castillitos + counts.latin_kids + counts.importacion + counts.sin_clasificar
    === counts.total
  );
}
