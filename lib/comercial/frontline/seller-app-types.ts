/**
 * lib/comercial/frontline/seller-app-types.ts
 *
 * AGENTIK-SELLER-APP-V1-01
 *
 * Client-safe types for Seller App V1.
 * Pure types only. No runtime, no Prisma, no server-only.
 *
 * Domains:
 *   - Notification: structured delivery of domain signals
 *   - Fulfillment Timeline: order lifecycle read model
 *   - Inactive customers: >90 day intelligence
 *   - Catalog generation: stub contract for Marketing Studio
 *   - Feature flags: seller app capabilities
 */

import type { FrontlineProvenance, AttentionSeverity } from "./frontline-types";

// ── Notification ────────────────────────────────────────────────────────────

export type SellerNotificationType =
  | "SAMPLE_WITHDRAWAL_REQUIRED"
  | "PORTFOLIO_SUPPLY_REQUIRED"
  | "CUSTOMER_INACTIVE_90D"
  | "CUSTOMER_OVERDUE_WHILE_ORDERING"
  | "ORDER_PENDING_SYNC"
  | "ORDER_SYNC_FAILED"
  | "ORDER_CONFIRMED";

export type NotificationDeliveryStatus =
  | "PENDING"
  | "DELIVERED"
  | "READ"
  | "DISMISSED";

export type NotificationEntityType =
  | "PORTFOLIO"
  | "CUSTOMER"
  | "ORDER"
  | "REFERENCE";

export interface SellerNotification {
  organizationId: string;
  sellerId: string;
  type: SellerNotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  evidence: Record<string, unknown>;
  imageUrl: string | null;
  deepLink: string;
  createdAt: string;           // ISO
  deduplicationKey: string;
  deliveryStatus: NotificationDeliveryStatus;
}

// ── Order Fulfillment Timeline ──────────────────────────────────────────────

export type FulfillmentStageStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NOT_STARTED"
  | "NOT_AVAILABLE";

export interface OrderFulfillmentTimeline {
  orderId: string;
  orderNumber: string;
  orderStatus: string;

  submittedAt: string | null;   // ISO

  invoice: {
    status: FulfillmentStageStatus;
    invoiceNumber: string | null;
    invoicedAt: string | null;
  };

  shipment: {
    status: FulfillmentStageStatus;
    carrier: string | null;
    trackingNumber: string | null;
    shippedAt: string | null;
  };

  delivery: {
    status: FulfillmentStageStatus;
    deliveredAt: string | null;
  };

  sync: {
    status: "SYNCED" | "PENDING" | "ERROR" | "NOT_AVAILABLE";
    lastAttempt: string | null;
    error: string | null;
  };

  provenance: FrontlineProvenance;
}

// ── Inactive Customer ───────────────────────────────────────────────────────

export type InactiveCustomerClassification =
  | "INACTIVE_90D"         // last purchase > 90 days ago
  | "NO_PURCHASE_HISTORY"; // customer has never purchased

export interface InactiveCustomerItem {
  customerId: string;
  customerName: string;
  sellerId: string | null;

  classification: InactiveCustomerClassification;

  lastPurchaseDate: string | null;    // ISO — null if NO_PURCHASE_HISTORY
  daysSinceLastPurchase: number | null;

  receivables: {
    total: number;
    overdue: number;
    maxDaysOverdue: number;
  } | null;

  purchaseSummary: {
    totalOrdersL12: number;
    topProducts: Array<{
      referenceCode: string;
      description: string;
      totalUnits: number;
    }>;
  };

  asOf: string;
  provenance: FrontlineProvenance;
}

export interface InactiveCustomerResult {
  items: InactiveCustomerItem[];
  totalCount: number;
  provenance: FrontlineProvenance;
}

// ── Catalog Generation (stub) ───────────────────────────────────────────────

export interface CatalogGenerationRequest {
  organizationId: string;
  sellerId: string;
  customerId?: string;
  specifications: {
    line?: string;
    productType?: string;
    priceRange?: { min?: number; max?: number };
    references?: string[];
    categories?: string[];
  };
}

// ── Feature flags ───────────────────────────────────────────────────────────

export type SellerAppFeature =
  | "SELLER_CATALOG_GENERATION"
  | "SELLER_WEB_PUSH"
  | "SELLER_ORDER_FULFILLMENT_TIMELINE";

export interface SellerAppFeatureFlags {
  SELLER_CATALOG_GENERATION: boolean;
  SELLER_WEB_PUSH: boolean;
  SELLER_ORDER_FULFILLMENT_TIMELINE: boolean;
}

// ── Seller App Navigation ───────────────────────────────────────────────────

export interface SellerAppNavigation {
  inicio: { attention: boolean; tareas: boolean };
  clientes: { all: boolean; inactive90d: boolean; search: boolean };
  nuevoPedido: boolean;
  miMaleta: { retiro: boolean; planSurtido: boolean; muestras: boolean };
  pedidos: boolean;
}

// ── Overdue enforcement policy ──────────────────────────────────────────────

export type OverdueEnforcementLevel =
  | "WARNING"            // V1 default — show warning, do not block
  | "APPROVAL_REQUIRED"  // future — require manager approval
  | "BLOCK";             // future — prevent order creation

export interface OverduePolicyConfig {
  enforcement: OverdueEnforcementLevel;
  thresholdDays: number; // default: 30
}

export const DEFAULT_OVERDUE_POLICY: OverduePolicyConfig = {
  enforcement: "WARNING",
  thresholdDays: 30,
};
