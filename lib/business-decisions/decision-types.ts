/**
 * decision-types.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Core types for the Operational Decision Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- ID Generation ------------------------------------------------------------

let _seq = 0;

/** Generate a unique decision-related ID with prefix. */
export function nextDecisionId(prefix: string = "dec"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Decision Status ----------------------------------------------------------

/** Lifecycle status of a business decision. */
export type DecisionStatus =
  | "draft"
  | "recommended"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed"
  | "unknown";

/** Statuses the Decision Engine may produce (never "executed"). */
export const DECIDABLE_STATUSES: readonly DecisionStatus[] = [
  "draft", "recommended", "under_review",
] as const;

// -- Decision Source ----------------------------------------------------------

/** Where a decision originated from. */
export type DecisionSource =
  | "planning_engine"
  | "rule_engine"
  | "reasoning_engine"
  | "executive_intelligence"
  | "manual"
  | "system"
  | "future_ai_agent";

// -- Decision Priority --------------------------------------------------------

/** Priority level for decisions. */
export type DecisionPriority =
  | "lowest"
  | "low"
  | "normal"
  | "high"
  | "highest";

// -- Decision Severity --------------------------------------------------------

/** Severity of the situation a decision addresses. */
export type DecisionSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

// -- Criterion Direction ------------------------------------------------------

/** Whether a criterion should be maximized, minimized, or is neutral. */
export type CriterionDirection =
  | "maximize"
  | "minimize"
  | "neutral";

// -- Confidence Level ---------------------------------------------------------

/** Qualitative confidence level. */
export type ConfidenceLevel =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

// -- Approval Type ------------------------------------------------------------

/** Types of approval a decision may require. */
export type DecisionApprovalType =
  | "none"
  | "manual"
  | "manager"
  | "admin"
  | "finance"
  | "commercial"
  | "production"
  | "system";

// -- Decision Policy ----------------------------------------------------------

/** Named decision policy (selection strategy). */
export type DecisionPolicy =
  | "balanced"
  | "fastest"
  | "lowest_risk"
  | "highest_benefit"
  | "lowest_cost"
  | "approval_light"
  | "customer_first"
  | "production_first"
  | "commercial_first"
  | (string & {});

// -- Entity Reference ---------------------------------------------------------

/** Lightweight entity reference within decision structures. */
export interface DecisionEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}
