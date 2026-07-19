/**
 * Inventory normalizer — helpers for building UnifiedInventory records.
 */

import type { UnifiedInventory } from "../types";

// ── Inventory builder ─────────────────────────────────────────────────────────

/**
 * Build a UnifiedInventory, deriving quantityAvailable from onHand − reserved
 * when not explicitly provided.
 */
export function buildInventory(
  input: Omit<UnifiedInventory, "quantityAvailable"> & { quantityAvailable?: number }
): UnifiedInventory {
  const onHand   = input.quantityOnHand   ?? 0;
  const reserved = input.quantityReserved ?? 0;
  const available = input.quantityAvailable ?? Math.max(0, onHand - reserved);

  return {
    ...input,
    quantityOnHand:    onHand,
    quantityReserved:  reserved,
    quantityAvailable: available,
  };
}

// ── SKU normalisation ─────────────────────────────────────────────────────────

/** Uppercase and trim a SKU. Returns the original on blank input. */
export function normalizeSku(raw: string | null | undefined, fallback = ""): string {
  if (!raw) return fallback;
  return raw.trim().toUpperCase();
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface InventoryValidation {
  valid:    boolean;
  warnings: string[];
}

export function validateInventory(i: UnifiedInventory): InventoryValidation {
  const w: string[] = [];
  if (!i.sourceId)           w.push("missing sourceId");
  if (!i.sku)                w.push("missing sku");
  if (!i.name)               w.push("missing name");
  if (i.quantityOnHand < 0)  w.push(`negative quantityOnHand: ${i.quantityOnHand}`);
  if (i.unitCost != null && i.unitCost < 0) w.push(`negative unitCost: ${i.unitCost}`);
  return { valid: w.length === 0, warnings: w };
}
