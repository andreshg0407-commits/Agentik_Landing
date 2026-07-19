/**
 * event-types.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Core types for the Operational Event Engine.
 *
 * A Business Event represents that something relevant OCCURRED.
 * A Signal represents a condition. An Event represents a transition.
 *
 * Signal: "Stock critico" (condition exists)
 * Event:  "Stock paso de critico a agotado" (transition happened)
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- Event ID Generation ----------------------------------------------------

let _seq = 0;

/** Generate a unique event ID with prefix. */
export function nextEventId(prefix: string = "evt"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Lightweight entity reference for events --------------------------------

/**
 * Lightweight entity reference within event structures.
 * Compatible with EntityRef (business-reasoning) and SignalEntityRef (business-signals).
 */
export interface EventEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}

// -- Event Type Registry ----------------------------------------------------

/**
 * All recognized business event types.
 *
 * Organized by domain. These are TRANSITIONS, not conditions.
 * New event types are added here — never inside individual modules.
 */
export type BusinessEventType =
  // Inventory
  | "inventory_stock_critical_detected"
  | "inventory_out_of_stock_detected"
  | "inventory_stock_recovered"
  | "inventory_transfer_suggested"
  // Commercial
  | "commercial_order_created"
  | "commercial_order_blocked"
  | "commercial_order_unblocked"
  | "commercial_order_fulfilled"
  | "commercial_customer_inactive_detected"
  // Vendor
  | "vendor_portfolio_updated"
  | "vendor_portfolio_reference_out_of_stock"
  | "vendor_goal_reached"
  | "vendor_order_blocked"
  // Portfolio / Maletas
  | "portfolio_reference_added"
  | "portfolio_reference_removed"
  | "portfolio_reference_out_of_stock"
  | "portfolio_needs_update"
  // Store / Tiendas
  | "store_out_of_stock"
  | "store_stock_recovered"
  | "store_transfer_needed"
  // Production
  | "production_order_created"
  | "production_order_closed"
  | "production_stage_entered"
  | "production_stage_completed"
  | "production_delayed"
  | "production_finished_goods_entered"
  // Workflow
  | "workflow_started"
  | "workflow_stage_entered"
  | "workflow_stage_completed"
  | "workflow_blocked"
  | "workflow_completed"
  // Financial
  | "financial_payment_received"
  | "financial_reconciliation_completed"
  | "financial_reconciliation_exception"
  // Collection
  | "collection_account_overdue"
  | "collection_payment_promise_created"
  | "collection_risk_detected"
  // Signal lifecycle
  | "signal_created"
  | "signal_activated"
  | "signal_resolved"
  | "signal_escalated"
  | "signal_expired"
  | "signal_ignored"
  | "signal_merged"
  | "signal_compound_created"
  // System
  | "sync_completed"
  | "sync_failed"
  | "data_stale_detected"
  | "ai_alert_generated"
  // Custom
  | `custom_${string}`;
