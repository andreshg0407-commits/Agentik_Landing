/**
 * lib/marketing-studio/products/product-events.ts
 *
 * MS-05C — Product Event System
 *
 * Typed event bus for Product Intelligence events.
 * Architecture: synchronous in-process event bus, org-scoped.
 * No Kafka, no Redis — extensible to async messaging later.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *   // Subscribe
 *   const unsub = productEventBus.on("PRODUCT_APPROVED", async (event) => {
 *     await recomputeReadiness(event.productId);
 *   });
 *
 *   // Emit
 *   await productEventBus.emit({
 *     type: "PRODUCT_APPROVED",
 *     productId: "...",
 *     orgId: "...",
 *     occurredAt: new Date(),
 *     payload: { approvedBy: "user-123" },
 *   });
 *
 * ── MULTI-TENANT SAFETY ────────────────────────────────────────────────────────
 *   All events carry orgId. Handlers MUST verify orgId before acting.
 *   No cross-tenant event propagation.
 */

import type { ProductEventType, SyncChannel, ProductAttributeRecord } from "./product-types";

// ── Discriminated union of event payloads ──────────────────────────────────────

interface BaseProductEvent {
  productId:  string;
  orgId:      string;
  actorId?:   string;
  occurredAt: Date;
}

export interface ProductCreatedEvent extends BaseProductEvent {
  type:    "PRODUCT_CREATED";
  payload: { name: string; sku: string | null; category: string | null };
}

export interface ProductApprovedEvent extends BaseProductEvent {
  type:    "PRODUCT_APPROVED";
  payload: { approvedBy: string | null; readyChannels: string[] };
}

export interface ProductUpdatedEvent extends BaseProductEvent {
  type:    "PRODUCT_UPDATED";
  payload: { changedFields: string[] };
}

export interface ProductAttributeUpdatedEvent extends BaseProductEvent {
  type:    "PRODUCT_ATTRIBUTE_UPDATED";
  payload: { attributes: Pick<ProductAttributeRecord, "key" | "label">[]; changedKeys: string[] };
}

export interface ProductVariantCreatedEvent extends BaseProductEvent {
  type:    "PRODUCT_VARIANT_CREATED";
  payload: { variantId: string; sku: string | null };
}

export interface ProductChannelEnabledEvent extends BaseProductEvent {
  type:    "PRODUCT_CHANNEL_ENABLED";
  payload: { channel: SyncChannel };
}

export interface ProductReadinessChangedEvent extends BaseProductEvent {
  type:    "PRODUCT_READINESS_CHANGED";
  payload: { readyCount: number; partialCount: number; totalEnabled: number };
}

export interface ProductSyncFailedEvent extends BaseProductEvent {
  type:    "PRODUCT_SYNC_FAILED";
  payload: { channel: SyncChannel; errorMessage: string };
}

export interface ProductPublishedEvent extends BaseProductEvent {
  type:    "PRODUCT_PUBLISHED";
  payload: { channel: SyncChannel; externalId: string };
}

export interface ProductAssetLinkedEvent extends BaseProductEvent {
  type:    "PRODUCT_ASSET_LINKED";
  payload: { assetId: string; role: string };
}

/** Discriminated union of all product events. */
export type ProductEvent =
  | ProductCreatedEvent
  | ProductApprovedEvent
  | ProductUpdatedEvent
  | ProductAttributeUpdatedEvent
  | ProductVariantCreatedEvent
  | ProductChannelEnabledEvent
  | ProductReadinessChangedEvent
  | ProductSyncFailedEvent
  | ProductPublishedEvent
  | ProductAssetLinkedEvent;

// ── Typed event bus ────────────────────────────────────────────────────────────

type Handler<T extends ProductEvent> = (event: T) => void | Promise<void>;

/**
 * ProductEventBus — in-process, synchronous, typed event dispatcher.
 * Handlers are invoked in registration order.
 * All errors in handlers are caught and logged — they never propagate to emitters.
 */
class ProductEventBus {
  private readonly handlers = new Map<ProductEventType, Handler<ProductEvent>[]>();

  /**
   * Register a handler for a specific event type.
   * @returns Unsubscribe function.
   */
  on<T extends ProductEvent>(
    type:    T["type"],
    handler: Handler<T>,
  ): () => void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler as Handler<ProductEvent>]);
    return () => this.off(type, handler);
  }

  /** Remove a previously registered handler. */
  off<T extends ProductEvent>(
    type:    T["type"],
    handler: Handler<T>,
  ): void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(
      type,
      existing.filter(h => h !== (handler as Handler<ProductEvent>)),
    );
  }

  /**
   * Emit an event to all registered handlers.
   * Handler errors are caught and logged — they don't fail the emit.
   */
  async emit<T extends ProductEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    await Promise.all(
      handlers.map(h =>
        Promise.resolve(h(event)).catch(err =>
          console.error(`[ProductEventBus] handler error on ${event.type} (org=${event.orgId}):`, err)
        )
      )
    );
  }

  /** Emit without waiting for handlers (fire-and-forget). */
  fire<T extends ProductEvent>(event: T): void {
    void this.emit(event);
  }
}

/** Singleton event bus — import and use directly. */
export const productEventBus = new ProductEventBus();

// ── Convenience factory functions ──────────────────────────────────────────────

export function makeProductCreatedEvent(
  productId: string,
  orgId:     string,
  payload:   ProductCreatedEvent["payload"],
  actorId?:  string,
): ProductCreatedEvent {
  return { type: "PRODUCT_CREATED", productId, orgId, actorId, occurredAt: new Date(), payload };
}

export function makeProductApprovedEvent(
  productId: string,
  orgId:     string,
  payload:   ProductApprovedEvent["payload"],
  actorId?:  string,
): ProductApprovedEvent {
  return { type: "PRODUCT_APPROVED", productId, orgId, actorId, occurredAt: new Date(), payload };
}

export function makeProductAssetLinkedEvent(
  productId: string,
  orgId:     string,
  payload:   ProductAssetLinkedEvent["payload"],
): ProductAssetLinkedEvent {
  return { type: "PRODUCT_ASSET_LINKED", productId, orgId, occurredAt: new Date(), payload };
}

export function makeProductAttributeUpdatedEvent(
  productId: string,
  orgId:     string,
  payload:   ProductAttributeUpdatedEvent["payload"],
  actorId?:  string,
): ProductAttributeUpdatedEvent {
  return { type: "PRODUCT_ATTRIBUTE_UPDATED", productId, orgId, actorId, occurredAt: new Date(), payload };
}

export function makeProductReadinessChangedEvent(
  productId: string,
  orgId:     string,
  payload:   ProductReadinessChangedEvent["payload"],
): ProductReadinessChangedEvent {
  return { type: "PRODUCT_READINESS_CHANGED", productId, orgId, occurredAt: new Date(), payload };
}
