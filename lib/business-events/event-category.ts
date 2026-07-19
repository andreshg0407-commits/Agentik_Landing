/**
 * event-category.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Business domain categories for events.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/** Business domain category for events. */
export type EventCategory =
  | "inventory"
  | "commercial"
  | "production"
  | "workflow"
  | "vendor"
  | "portfolio"
  | "store"
  | "financial"
  | "collection"
  | "customer"
  | "system"
  | "ai"
  | "custom";

/** All valid event categories. */
export const EVENT_CATEGORIES: readonly EventCategory[] = [
  "inventory",
  "commercial",
  "production",
  "workflow",
  "vendor",
  "portfolio",
  "store",
  "financial",
  "collection",
  "customer",
  "system",
  "ai",
  "custom",
] as const;

/** Check if a string is a valid event category. */
export function isEventCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value);
}
