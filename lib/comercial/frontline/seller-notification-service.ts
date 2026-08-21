/**
 * lib/comercial/frontline/seller-notification-service.ts
 *
 * AGENTIK-SELLER-APP-V1-01
 *
 * Notification infrastructure for seller-facing domain signals.
 *
 * Architecture:
 *   Domain Signal → Notification Service → Delivery Adapter
 *
 * ATTENTION = current unresolved business condition (live query)
 * NOTIFICATION = delivery event emitted when condition becomes true (persisted)
 *
 * Delivery adapters:
 *   - InApp: writes to in-memory store (V1) / Prisma (future)
 *   - WebPush: adapter interface ready, implementation gated by feature flag
 *
 * Deduplication: stable deduplicationKey prevents repeat notifications
 * on every refresh. A new notification is only emitted when the
 * condition transitions from resolved → true (conditionVersion changes).
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";
import type {
  SellerNotification,
  SellerNotificationType,
  NotificationEntityType,
  NotificationDeliveryStatus,
} from "./seller-app-types";
import type { FrontlineAttentionItem } from "./frontline-types";

// ── Deduplication store ─────────────────────────────────────────────────────
// V1: in-memory per-process. Future: Prisma SellerNotification model.

const emittedKeys = new Set<string>();

/**
 * Check if a notification with this dedup key has already been emitted
 * in the current process lifetime.
 */
function hasBeenEmitted(key: string): boolean {
  return emittedKeys.has(key);
}

function markEmitted(key: string): void {
  emittedKeys.add(key);
}

/**
 * Clear a dedup key when a condition resolves.
 * Allows re-emission if condition recurs.
 */
export function clearResolvedCondition(key: string): void {
  emittedKeys.delete(key);
}

// ── Delivery adapter interface ──────────────────────────────────────────────

export interface NotificationDeliveryAdapter {
  deliver(notification: SellerNotification): Promise<void>;
}

// ── In-App delivery (V1) ────────────────────────────────────────────────────

const inAppStore: SellerNotification[] = [];

export const InAppDeliveryAdapter: NotificationDeliveryAdapter = {
  async deliver(notification: SellerNotification): Promise<void> {
    inAppStore.push(notification);
  },
};

/**
 * Get all in-app notifications for a seller.
 * Sorted by createdAt desc (newest first).
 */
export function getInAppNotifications(
  orgId: string,
  sellerId: string,
): SellerNotification[] {
  return inAppStore
    .filter(n => n.organizationId === orgId && n.sellerId === sellerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Mark a notification as read.
 */
export function markNotificationRead(
  orgId: string,
  sellerId: string,
  deduplicationKey: string,
): void {
  for (const n of inAppStore) {
    if (
      n.organizationId === orgId &&
      n.sellerId === sellerId &&
      n.deduplicationKey === deduplicationKey
    ) {
      n.deliveryStatus = "READ";
    }
  }
}

/**
 * Dismiss a notification.
 */
export function dismissNotification(
  orgId: string,
  sellerId: string,
  deduplicationKey: string,
): void {
  for (const n of inAppStore) {
    if (
      n.organizationId === orgId &&
      n.sellerId === sellerId &&
      n.deduplicationKey === deduplicationKey
    ) {
      n.deliveryStatus = "DISMISSED";
    }
  }
}

// ── WebPush delivery adapter (stub — feature-gated) ─────────────────────────

export const WebPushDeliveryAdapter: NotificationDeliveryAdapter = {
  async deliver(_notification: SellerNotification): Promise<void> {
    // Future: service worker push via web-push library
    // Gated by SELLER_WEB_PUSH feature flag
  },
};

// ── Notification emission ───────────────────────────────────────────────────

const activeAdapters: NotificationDeliveryAdapter[] = [InAppDeliveryAdapter];

/**
 * Emit a seller notification from a domain signal.
 * Deduplicates by key — same key will NOT produce a second notification
 * unless clearResolvedCondition() is called first.
 *
 * Returns the notification if emitted, null if deduplicated.
 */
export async function emitSellerNotification(input: {
  organizationId: string;
  sellerId: string;
  type: SellerNotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  evidence: Record<string, unknown>;
  imageUrl?: string | null;
  deepLink: string;
  deduplicationKey: string;
}): Promise<SellerNotification | null> {
  if (hasBeenEmitted(input.deduplicationKey)) return null;

  const notification: SellerNotification = {
    organizationId: input.organizationId,
    sellerId: input.sellerId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    evidence: input.evidence,
    imageUrl: input.imageUrl ?? null,
    deepLink: input.deepLink,
    createdAt: new Date().toISOString(),
    deduplicationKey: input.deduplicationKey,
    deliveryStatus: "PENDING",
  };

  // Deliver through all active adapters
  for (const adapter of activeAdapters) {
    try {
      await adapter.deliver(notification);
      notification.deliveryStatus = "DELIVERED";
    } catch {
      // Adapter failure should not block other adapters
    }
  }

  markEmitted(input.deduplicationKey);
  return notification;
}

// ── Sample withdrawal notification ──────────────────────────────────────────

/**
 * Emit SAMPLE_WITHDRAWAL_REQUIRED notification for a specific seller.
 *
 * Called when a reference in a seller's Maleta enters Retiro state.
 * Uses stable dedup key: SAMPLE_WITHDRAWAL_REQUIRED:{sellerId}:{portfolioId}:{referenceCode}:{conditionVersion}
 *
 * The conditionVersion is derived from the withdrawal reason, so if the
 * condition resolves and later recurs with the same reason, it's treated
 * as the same event. If the reason changes, a new notification is emitted.
 */
export async function emitSampleWithdrawalNotification(input: {
  organizationId: string;
  sellerId: string;
  portfolioId: string;
  referenceCode: string;
  description: string;
  productImageUrl: string | null;
  world: string | null;
  line: string | null;
  withdrawalReason: string;
  currentAvailability: number | null;
  orgSlug: string;
  asOf: string;
}): Promise<SellerNotification | null> {
  const conditionVersion = `${input.withdrawalReason}`;
  const deduplicationKey = [
    "SAMPLE_WITHDRAWAL_REQUIRED",
    input.sellerId,
    input.portfolioId,
    input.referenceCode,
    conditionVersion,
  ].join(":");

  return emitSellerNotification({
    organizationId: input.organizationId,
    sellerId: input.sellerId,
    type: "SAMPLE_WITHDRAWAL_REQUIRED",
    entityType: "REFERENCE",
    entityId: input.referenceCode,
    title: "Retira esta referencia de tu mostrario.",
    evidence: {
      sellerId: input.sellerId,
      portfolioId: input.portfolioId,
      referenceCode: input.referenceCode,
      description: input.description,
      productImageUrl: input.productImageUrl,
      world: input.world,
      line: input.line,
      withdrawalReason: input.withdrawalReason,
      currentAvailability: input.currentAvailability,
      asOf: input.asOf,
    },
    imageUrl: input.productImageUrl,
    deepLink: `/${input.orgSlug}/comercial/maletas?vendor=${input.sellerId}&tab=retiro&ref=${input.referenceCode}`,
    deduplicationKey,
  });
}

// ── Batch emission from attention items ──────────────────────────────────────

/**
 * Convert FrontlineAttentionItem signals into seller notifications.
 * Only emits for items that have a sellerId and haven't been emitted yet.
 */
export async function emitNotificationsFromAttention(
  items: FrontlineAttentionItem[],
  orgSlug: string,
): Promise<SellerNotification[]> {
  const results: SellerNotification[] = [];

  for (const item of items) {
    if (!item.sellerId) continue;

    const entityType = resolveEntityType(item.type);
    const entityId = item.referenceCode ?? item.orderId ?? item.customerId ?? item.portfolioId ?? "";

    const notification = await emitSellerNotification({
      organizationId: item.organizationId,
      sellerId: item.sellerId,
      type: item.type as SellerNotificationType,
      entityType,
      entityId,
      title: item.title,
      evidence: item.evidence,
      deepLink: item.deepLink ?? `/${orgSlug}/comercial`,
      deduplicationKey: item.deduplicationKey,
    });

    if (notification) results.push(notification);
  }

  return results;
}

function resolveEntityType(type: string): NotificationEntityType {
  if (type.startsWith("SAMPLE_") || type.startsWith("PORTFOLIO_")) return "PORTFOLIO";
  if (type.startsWith("CUSTOMER_")) return "CUSTOMER";
  if (type.startsWith("ORDER_")) return "ORDER";
  return "REFERENCE";
}
