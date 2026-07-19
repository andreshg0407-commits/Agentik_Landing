/**
 * reasoning-types.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Core types for the Business Reasoning Engine.
 *
 * The reasoning layer sits between Knowledge Graph and Executive Intelligence.
 * Data → Business Entities → Knowledge Graph → Reasoning → Executive → David
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- Entity Reference (lightweight) ----------------------------------------

/** Lightweight reference to a business entity within reasoning structures. */
export interface EntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}

// -- Reasoning Severity ----------------------------------------------------

/** Severity of a reasoning element. */
export type ReasoningSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

// -- Reasoning Category ----------------------------------------------------

/** Business domain category for reasoning elements. */
export type ReasoningCategory =
  | "commercial"
  | "inventory"
  | "production"
  | "financial"
  | "operational"
  | "customer"
  | "vendor"
  | "supply_chain"
  | "compliance"
  | "strategic";

// -- Reasoning Source -------------------------------------------------------

/** Origin of a reasoning element. */
export type ReasoningSource =
  | "knowledge_graph"
  | "business_entity"
  | "business_event"
  | "rule_engine"
  | "observation"
  | "computed"
  | "historical"
  | "external";

// -- Urgency ---------------------------------------------------------------

/** How urgently action is needed. */
export type Urgency =
  | "immediate"
  | "today"
  | "this_week"
  | "this_month"
  | "no_rush";

// -- Decision Type ---------------------------------------------------------

/** Category of a business decision. */
export type DecisionType =
  | "start_production"
  | "transfer_inventory"
  | "contact_customer"
  | "update_portfolio"
  | "visit_vendor"
  | "adjust_price"
  | "escalate"
  | "approve"
  | "reject"
  | "defer"
  | "investigate"
  | "replenish"
  | "cancel"
  | "notify";

// -- Effort Level ----------------------------------------------------------

/** Estimated effort to act on an opportunity or decision. */
export type EffortLevel =
  | "trivial"
  | "low"
  | "medium"
  | "high"
  | "major";

// -- ID Generation ---------------------------------------------------------

let _seq = 0;

/** Generate a unique reasoning element ID with prefix. */
export function nextReasoningId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}
