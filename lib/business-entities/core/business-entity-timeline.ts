/**
 * business-entity-timeline.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Common timeline event model for all Digital Business Entities.
 *
 * Every domain engine can emit timeline events.
 * Timeline events are the precursor to full Business Events.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntityType } from "./business-entity-types";

// ── Timeline Event Type ──────────────────────────────────────────────────────

/**
 * All supported timeline event types.
 * Organized by domain. New types are added here.
 */
export type TimelineEventType =
  // Vendor
  | "vendor_sale_created"
  | "vendor_portfolio_updated"
  | "vendor_portfolio_depleted"
  | "vendor_goal_reached"
  | "vendor_customer_visited"
  // Product
  | "product_out_of_stock"
  | "product_recovered"
  | "product_price_changed"
  | "product_created"
  // Order
  | "order_created"
  | "order_blocked"
  | "order_fulfilled"
  | "order_cancelled"
  | "order_invoiced"
  // Production
  | "production_started"
  | "production_stage_changed"
  | "production_completed"
  | "production_cancelled"
  | "production_sla_breached"
  // Store
  | "store_out_of_stock"
  | "store_replenished"
  | "store_transfer_completed"
  // Customer
  | "customer_order_created"
  | "customer_payment_received"
  | "customer_overdue"
  | "customer_reactivated"
  // Portfolio
  | "portfolio_reference_added"
  | "portfolio_reference_removed"
  | "portfolio_replenished"
  // Finance
  | "payment_received"
  | "payment_applied"
  | "invoice_overdue"
  // System
  | "sync_completed"
  | "sync_failed"
  | "ai_alert_generated"
  | "ai_recommendation_generated";

// ── Timeline Event ───────────────────────────────────────────────────────────

/**
 * A discrete event in the operational history of a business entity.
 *
 * Timeline events are consumed by:
 * - Entity detail views (vendor profile, product profile)
 * - Executive timeline
 * - Copilot context builders
 * - Future Business Event Engine (as event source)
 */
export interface BusinessEntityTimelineEvent {
  /** Unique event ID. */
  id: string;
  /** The entity this event belongs to. */
  entityId: string;
  /** Entity type. */
  entityType: BusinessEntityType;
  /** Event type from the registry. */
  eventType: TimelineEventType;
  /** Short title (suitable for timeline views). */
  title: string;
  /** Detailed description. */
  description: string;
  /** Source engine or system that generated this event. */
  source: string;
  /** ISO timestamp when the event occurred. */
  occurredAt: string;
  /** IDs of related entities involved in this event. */
  relatedEntityIds: string[];
  /** Arbitrary event-specific metadata. */
  metadata: Record<string, unknown>;
}

// ── Timeline Builder ─────────────────────────────────────────────────────────

let _timelineSeq = 0;

/** Generate a unique timeline event ID. */
export function nextTimelineEventId(): string {
  return `bet-${Date.now()}-${++_timelineSeq}`;
}

/** Build a BusinessEntityTimelineEvent with sensible defaults. */
export function buildTimelineEvent(opts: {
  entityId: string;
  entityType: BusinessEntityType;
  eventType: TimelineEventType;
  title: string;
  description: string;
  source: string;
  occurredAt?: string;
  relatedEntityIds?: string[];
  metadata?: Record<string, unknown>;
}): BusinessEntityTimelineEvent {
  return {
    id: nextTimelineEventId(),
    entityId: opts.entityId,
    entityType: opts.entityType,
    eventType: opts.eventType,
    title: opts.title,
    description: opts.description,
    source: opts.source,
    occurredAt: opts.occurredAt ?? new Date().toISOString(),
    relatedEntityIds: opts.relatedEntityIds ?? [],
    metadata: opts.metadata ?? {},
  };
}
