/**
 * action-types.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Core types for the Controlled Execution Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- ID Generation ------------------------------------------------------------

let _seq = 0;

/** Generate a unique action-related ID with prefix. */
export function nextActionId(prefix: string = "act"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Action Status ------------------------------------------------------------

/** Lifecycle status of a business action. */
export type ActionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "skipped"
  | "unknown";

// -- Action Type --------------------------------------------------------------

/** Types of action the engine can orchestrate. */
export type ActionType =
  | "notification_send"
  | "alert_create"
  | "task_create"
  | "portfolio_remove_reference"
  | "portfolio_update"
  | "production_review_request"
  | "production_create_request"
  | "inventory_transfer_suggestion"
  | "inventory_transfer_request"
  | "order_priority_mark"
  | "customer_contact_request"
  | "vendor_contact_request"
  | "dashboard_update"
  | "timeline_append"
  | "data_refresh_request"
  | "manual_review_request"
  | "external_api_call"
  | "custom";

// -- Action Source ------------------------------------------------------------

/** Where an action originated from. */
export type ActionSource =
  | "decision_engine"
  | "planning_engine"
  | "rule_engine"
  | "manual"
  | "system"
  | "future_ai_agent"
  | "workflow_engine"
  | "executive_intelligence";

// -- Execution Mode -----------------------------------------------------------

/** How actions should be executed. */
export type ExecutionMode =
  | "dry_run"
  | "manual"
  | "semi_automatic"
  | "automatic";

// -- Execution Status ---------------------------------------------------------

/** Status of an execution attempt. */
export type ExecutionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "dry_run_completed"
  | "approval_required";

// -- Approval Status ----------------------------------------------------------

/** Status of an action approval. */
export type ActionApprovalStatus =
  | "not_required"
  | "required"
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

// -- Approval Type ------------------------------------------------------------

/** Types of approval for actions. */
export type ActionApprovalType =
  | "none"
  | "manual"
  | "manager"
  | "admin"
  | "finance"
  | "commercial"
  | "production"
  | "system";

// -- Target Kind --------------------------------------------------------------

/** What an action targets. */
export type ActionTargetKind =
  | "entity"
  | "user"
  | "role"
  | "team"
  | "external_system"
  | "workflow"
  | "dashboard"
  | "notification_channel"
  | "manual_queue";

// -- Entity Reference ---------------------------------------------------------

/** Lightweight entity reference within action structures. */
export interface ActionEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}

// -- Risk Level ---------------------------------------------------------------

/** Risk level for policy evaluation. */
export type ActionRiskLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";
