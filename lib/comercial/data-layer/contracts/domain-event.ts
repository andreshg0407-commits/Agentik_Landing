/**
 * contracts/domain-event.ts
 *
 * Base contract for all domain events emitted by the Commercial Data Layer.
 */

import type { CommercialDomain } from "./commercial-identity";

// ── Domain Event ────────────────────────────────────────────────────────────

export interface DomainEvent<TPayload = unknown> {
  /** Unique event ID */
  readonly eventId: string;

  /** Event type identifier (e.g., "SynchronizationCompleted") */
  readonly type: string;

  /** Domain that emitted this event */
  readonly domain: CommercialDomain;

  /** Tenant scope */
  readonly tenantId: string;

  /** Correlation ID linking to the operation that triggered this event */
  readonly correlationId: string;

  /** When this event occurred */
  readonly occurredAt: Date;

  /** Event-specific payload */
  readonly payload: TPayload;

  /** Schema version for payload evolution */
  readonly schemaVersion: number;
}

// ── Event Metadata ──────────────────────────────────────────────────────────

export interface EventMetadata {
  /** Source adapter or service that emitted the event */
  readonly emitterId: string;

  /** Causation: event ID that caused this event (if any) */
  readonly causationId?: string;

  /** Sequence number within the correlation (for ordering) */
  readonly sequenceNumber: number;
}
