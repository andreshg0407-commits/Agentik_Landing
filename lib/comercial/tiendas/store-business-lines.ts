/**
 * lib/comercial/tiendas/store-business-lines.ts
 *
 * Fixed business line model for Castillitos.
 * Maps SAG productLine IDs to operational business lines.
 *
 * Sprint: TIENDAS-LINE-BUSINESS-MODEL-01
 */

import type { StoreProductClass } from "./store-policy-types";

// ── Types ────────────────────────────────────────────────────────────────────

export type RuleMode = "textile" | "accessory_import";

export interface StoreBusinessLine {
  /** Stable identifier (snake_case) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Default product class for this line */
  productClass: StoreProductClass;
  /** Rule UI mode: textile = subgroup+talla/color, accessory = sizeClass */
  ruleMode: RuleMode;
}

// ── Fixed line registry ──────────────────────────────────────────────────────

export const BUSINESS_LINES: readonly StoreBusinessLine[] = [
  {
    id: "castillitos",
    label: "Castillitos",
    productClass: "textile",
    ruleMode: "textile",
  },
  {
    id: "latin_kids",
    label: "Latin Kids",
    productClass: "textile",
    ruleMode: "textile",
  },
  {
    id: "accesorios_importacion",
    label: "Accesorios / Importacion",
    productClass: "accessory",
    ruleMode: "accessory_import",
  },
] as const;

/** Map of id → StoreBusinessLine for quick lookup */
export const BUSINESS_LINE_MAP: Record<string, StoreBusinessLine> = {
  ...Object.fromEntries(BUSINESS_LINES.map((l) => [l.id, l])),
  // Aliases: both resolve to the unified accesorios_importacion world
  accesorios: BUSINESS_LINES.find(l => l.id === "accesorios_importacion")!,
  importacion: BUSINESS_LINES.find(l => l.id === "accesorios_importacion")!,
};

// ── SAG productLine → business line mapping ──────────────────────────────────

const SAG_LINE_MAP: Record<string, string> = {
  "1": "castillitos",              // Pijamas, camisetas, conjuntos CC
  "2": "latin_kids",              // Mamelucos, conjuntos, vestidos LK
  "3": "castillitos",              // Pijamas dama (textile, same brand)
  "4": "accesorios_importacion",   // Accesorios (bolsos, carteras, etc.)
  "5": "accesorios_importacion",   // Jugueteria, dormitorio, peluche
};

const DEFAULT_LINE_ID = "accesorios_importacion";

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a product's business line from its SAG productLine ID.
 *
 * @param sagProductLine - Raw productLine from ProductEntity (e.g. "1", "2", "5")
 * @returns The business line id (e.g. "castillitos", "latin_kids")
 */
export function resolveBusinessLineId(sagProductLine: string | null | undefined): string {
  const key = (sagProductLine ?? "").trim();
  return SAG_LINE_MAP[key] ?? DEFAULT_LINE_ID;
}

/**
 * Full resolver: returns the StoreBusinessLine object.
 */
export function resolveBusinessLine(sagProductLine: string | null | undefined): StoreBusinessLine {
  const id = resolveBusinessLineId(sagProductLine);
  return BUSINESS_LINE_MAP[id] ?? BUSINESS_LINE_MAP[DEFAULT_LINE_ID]!;
}
