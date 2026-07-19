/**
 * planning-types.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Core types for the Operational Planning Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- ID Generation ------------------------------------------------------------

let _seq = 0;

/** Generate a unique planning-related ID with prefix. */
export function nextPlanId(prefix: string = "plan"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Plan Status --------------------------------------------------------------

/** Lifecycle status of a business plan. */
export type PlanStatus =
  | "draft"
  | "proposed"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed"
  | "unknown";

/** All valid plan statuses. */
export const PLAN_STATUSES: readonly PlanStatus[] = [
  "draft", "proposed", "under_review", "approved", "rejected",
  "expired", "cancelled", "executed", "unknown",
] as const;

/** Statuses the Planning Engine may produce (never "executed"). */
export const PLANNABLE_STATUSES: readonly PlanStatus[] = [
  "draft", "proposed",
] as const;

// -- Plan Source --------------------------------------------------------------

/** Where a plan originated from. */
export type PlanSource =
  | "rule_engine"
  | "reasoning_engine"
  | "executive_intelligence"
  | "manual"
  | "workflow_engine"
  | "signal_engine"
  | "event_engine"
  | "system"
  | "future_ai_agent";

// -- Plan Priority ------------------------------------------------------------

/** Priority level for plans. */
export type PlanPriority =
  | "lowest"
  | "low"
  | "normal"
  | "high"
  | "highest";

// -- Plan Severity ------------------------------------------------------------

/** Severity of the situation a plan addresses. */
export type PlanSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

// -- Strategy -----------------------------------------------------------------

/** Named strategy for a plan alternative. */
export type PlanStrategy =
  | "produce"
  | "transfer_inventory"
  | "remove_portfolio_sample"
  | "contact_vendor"
  | "contact_customer"
  | "wait_for_production"
  | "replace_reference"
  | "escalate_to_management"
  | "review_data"
  | "do_nothing"
  | (string & {});

/** All built-in strategies. */
export const PLAN_STRATEGIES: readonly string[] = [
  "produce", "transfer_inventory", "remove_portfolio_sample",
  "contact_vendor", "contact_customer", "wait_for_production",
  "replace_reference", "escalate_to_management", "review_data", "do_nothing",
] as const;

// -- Entity Reference ---------------------------------------------------------

/** Lightweight entity reference within planning structures. */
export interface PlanEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}

// -- Cost Type ----------------------------------------------------------------

/** Types of cost a plan alternative may incur. */
export type PlanCostType =
  | "money"
  | "time"
  | "effort"
  | "risk"
  | "opportunity_cost"
  | "operational_load"
  | "customer_impact";

// -- Benefit Type -------------------------------------------------------------

/** Types of benefit a plan alternative may produce. */
export type PlanBenefitType =
  | "revenue_protected"
  | "orders_unblocked"
  | "customers_protected"
  | "inventory_recovered"
  | "production_aligned"
  | "risk_reduced"
  | "time_saved"
  | "customer_satisfaction";

// -- Step Type ----------------------------------------------------------------

/** Types of step within a plan alternative. */
export type PlanStepType =
  | "review"
  | "notify"
  | "approve"
  | "assign"
  | "transfer"
  | "produce"
  | "remove_sample"
  | "contact"
  | "wait"
  | "verify"
  | "escalate"
  | "document"
  | "custom";

// -- Constraint Type ----------------------------------------------------------

/** Types of constraint on a plan. */
export type PlanConstraintType =
  | "inventory"
  | "production"
  | "financial"
  | "commercial"
  | "customer"
  | "workflow"
  | "approval"
  | "data_quality"
  | "time"
  | "capacity"
  | "system"
  | "custom";

// -- Dependency Type ----------------------------------------------------------

/** Types of dependency a plan alternative requires. */
export type PlanDependencyType =
  | "inventory_available"
  | "production_complete"
  | "approval_granted"
  | "customer_confirmed"
  | "vendor_confirmed"
  | "data_refreshed"
  | "payment_received"
  | "workflow_stage_completed"
  | "external_dependency";

// -- Dependency Status --------------------------------------------------------

/** Current status of a dependency. */
export type PlanDependencyStatus =
  | "pending"
  | "met"
  | "unmet"
  | "unknown";

// -- Approval Type ------------------------------------------------------------

/** Types of approval a plan may require. */
export type PlanApprovalType =
  | "manual"
  | "manager"
  | "admin"
  | "finance"
  | "production"
  | "commercial"
  | "system"
  | "none";
