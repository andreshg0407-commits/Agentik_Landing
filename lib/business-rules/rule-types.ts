/**
 * rule-types.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Core types for the Operational Rule Engine.
 *
 * Rules represent business governance policies.
 * They do NOT execute actions — they evaluate conditions and suggest outcomes.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- Rule ID Generation -----------------------------------------------------

let _seq = 0;

/** Generate a unique rule-related ID with prefix. */
export function nextRuleId(prefix: string = "rule"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Rule Category ----------------------------------------------------------

/** Business domain category for rules. */
export type RuleCategory =
  | "inventory"
  | "production"
  | "commercial"
  | "vendor"
  | "portfolio"
  | "store"
  | "customer"
  | "financial"
  | "collection"
  | "workflow"
  | "sync"
  | "executive"
  | "system"
  | "custom";

/** All valid rule categories. */
export const RULE_CATEGORIES: readonly RuleCategory[] = [
  "inventory", "production", "commercial", "vendor", "portfolio",
  "store", "customer", "financial", "collection", "workflow",
  "sync", "executive", "system", "custom",
] as const;

// -- Rule Severity ----------------------------------------------------------

/** Severity of outcomes when a rule matches. */
export type RuleSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

// -- Rule Priority ----------------------------------------------------------

/** Processing priority for rule evaluation. */
export type RulePriority =
  | "lowest"
  | "low"
  | "normal"
  | "high"
  | "highest";

// -- Rule Entity Reference --------------------------------------------------

/** Lightweight entity reference within rule structures. */
export interface RuleEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}
