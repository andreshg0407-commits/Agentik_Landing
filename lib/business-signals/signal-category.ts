/**
 * signal-category.ts
 *
 * BUSINESS-SIGNALS-01
 * Business domain categories for signals.
 *
 * Categories are domain-agnostic. They represent the business area
 * where the signal originated, not the module that detected it.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/**
 * Business domain categories.
 *
 * Every signal belongs to exactly one category.
 * Categories group signals for routing, filtering, and display.
 * New categories are added here — never inside individual modules.
 */
export type SignalCategory =
  | "inventory"
  | "production"
  | "commercial"
  | "financial"
  | "customer"
  | "vendor"
  | "portfolio"
  | "store"
  | "workflow"
  | "quality"
  | "operations"
  | "system"
  | "custom";

/** All valid signal categories as an array (for validation). */
export const SIGNAL_CATEGORIES: readonly SignalCategory[] = [
  "inventory",
  "production",
  "commercial",
  "financial",
  "customer",
  "vendor",
  "portfolio",
  "store",
  "workflow",
  "quality",
  "operations",
  "system",
  "custom",
] as const;

/** Check if a string is a valid signal category. */
export function isSignalCategory(value: string): value is SignalCategory {
  return (SIGNAL_CATEGORIES as readonly string[]).includes(value);
}
