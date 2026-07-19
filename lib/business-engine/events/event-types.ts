/**
 * event-types.ts
 *
 * AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01
 * Business Event Engine — the connective tissue between all modules.
 *
 * Modules NEVER communicate directly with each other.
 * They emit events. The Event Engine routes them to subscribers.
 */

// ── Event Categories ──────────────────────────────────────────────────────────

export type EventDomain =
  | "commercial"
  | "inventory"
  | "production"
  | "purchasing"
  | "finance"
  | "collection"
  | "marketing"
  | "hr"
  | "quality"
  | "dispatch"
  | "system";

export type EventType =
  // Commercial
  | "order.created"
  | "order.updated"
  | "order.delivered"
  | "order.cancelled"
  | "order.blocked"
  // Inventory
  | "inventory.depleted"
  | "inventory.critical"
  | "inventory.recovered"
  | "inventory.transferred"
  | "inventory.adjusted"
  // Production
  | "production.order_created"
  | "production.stage_advanced"
  | "production.order_completed"
  | "production.order_cancelled"
  | "production.sla_breached"
  // Purchasing
  | "purchasing.order_created"
  | "purchasing.order_received"
  | "purchasing.order_cancelled"
  // Finance
  | "finance.payment_received"
  | "finance.invoice_overdue"
  | "finance.reconciliation_completed"
  // Collection
  | "collection.payment_applied"
  | "collection.customer_overdue"
  // Marketing
  | "marketing.campaign_launched"
  | "marketing.asset_published"
  // Sales
  | "sales.case_assigned"
  | "sales.case_depleted"
  | "sales.vendor_performance_alert"
  // System
  | "system.sync_completed"
  | "system.sync_failed"
  | "system.sla_warning";

// ── Business Event ────────────────────────────────────────────────────────────

/** A business event emitted by any module. */
export interface BusinessEvent {
  /** Unique event ID. */
  id: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Event type (dot-separated domain.action). */
  type: EventType;
  /** Business domain that emitted this event. */
  domain: EventDomain;
  /** The entity that triggered this event. */
  entityId: string;
  /** Entity type (e.g. "production_order", "product_variant"). */
  entityType: string;
  /** Human-readable summary. */
  summary: string;
  /** Structured payload with event-specific data. */
  payload: Record<string, unknown>;
  /** Severity level for prioritization. */
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** ISO timestamp when the event occurred. */
  occurredAt: string;
  /** User ID that caused the event (null for system events). */
  triggeredBy: string | null;
  /** Source module or engine that emitted the event. */
  source: string;
  /** Correlation ID for tracing related events. */
  correlationId: string | null;
}

// ── Event Subscription ────────────────────────────────────────────────────────

/** A subscription to receive business events. */
export interface EventSubscription {
  /** Unique subscription ID. */
  id: string;
  /** Event types this subscription listens to (supports wildcards: "inventory.*"). */
  eventPatterns: string[];
  /** The handler that processes matched events. */
  handlerId: string;
  /** Priority for ordering handler execution. */
  priority: number;
  /** Whether this subscription is active. */
  isActive: boolean;
}

// ── Event Engine Interface ────────────────────────────────────────────────────

/** Contract for the Business Event Engine. */
export interface IEventEngine {
  /** Emit a business event. Triggers all matching subscriptions. */
  emit(event: BusinessEvent): Promise<void>;
  /** Emit multiple events atomically. */
  emitBatch(events: BusinessEvent[]): Promise<void>;
  /** Subscribe a handler to event patterns. */
  subscribe(subscription: EventSubscription): void;
  /** Remove a subscription. */
  unsubscribe(subscriptionId: string): void;
  /** Get recent events for a tenant. */
  getRecentEvents(organizationId: string, options?: {
    domain?: EventDomain;
    type?: EventType;
    since?: Date;
    limit?: number;
  }): Promise<BusinessEvent[]>;
}
