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
 *   - Location context: browser geolocation capture
 *   - Commission policy: frozen business rates (NOT implemented)
 *   - Advances contract: account 133010 read model (NOT implemented)
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

// ── Seller Location Context ────────────────────────────────────────────────
//
// Browser Geolocation for coordinates. Approved reverse-geocoding for city.
// No IP-based city inference. Not order-blocking unless future policy.

export type LocationPermissionState = "granted" | "denied" | "prompt" | "unavailable";

export interface SellerLocationContext {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;         // meters
  city: string | null;             // from approved reverse-geocoding only
  capturedAt: string | null;       // ISO
  permissionState: LocationPermissionState;
}

// ── Seller Commission Policy (FROZEN — NOT implemented) ────────────────────
//
// Sprint: AGENTIK-SELLER-APP-PRODUCT-CONTRACT-01
// Status: FROZEN. Business rates stored as domain policy. NOT in React.
//
// Calculates commission % based on days from invoice issue to collection.
// Missing SAG sources documented in seller-app-product-contract.md:
//   1. Seller ID on invoice (vw_agentik_cartera exposes VENDEDOR name, not ID)
//   2. Invoice issue date from recaudos join
//   3. Partial payment behavior certification
//   4. Account 133010 per-seller movements

export interface CommissionBand {
  minDays: number;
  maxDays: number;      // inclusive
  rate: number;         // e.g. 0.05 = 5%
}

export const SELLER_COMMISSION_BANDS: CommissionBand[] = [
  { minDays: 0,   maxDays: 59,  rate: 0.05 },
  { minDays: 60,  maxDays: 75,  rate: 0.04 },
  { minDays: 76,  maxDays: 90,  rate: 0.03 },
  { minDays: 91,  maxDays: 105, rate: 0.02 },
  { minDays: 106, maxDays: Infinity, rate: 0.01 },
];

export interface SellerCommissionStatement {
  sellerId: string;
  sellerName: string;
  periodStart: string;          // ISO date
  periodEnd: string;            // ISO date

  lines: Array<{
    invoiceNumber: string;
    customerName: string;
    invoiceDate: string;        // ISO date — when invoice was issued
    collectionDate: string;     // ISO date — when payment was received
    daysToCollect: number;      // collectionDate - invoiceDate
    invoiceAmount: number;
    collectedAmount: number;
    commissionRate: number;     // from SELLER_COMMISSION_BANDS
    commissionAmount: number;   // collectedAmount * commissionRate
  }>;

  totalCommission: number;
  status: "DRAFT" | "APPROVED" | "PAID";
}

// ── Seller Advances / Loans Contract (FROZEN — NOT implemented) ────────────
//
// Account: 133010 (PRESTAMOS / ANTICIPOS VENDEDORES)
// Source: SAG accounting module — NO current vw_agentik view exposes this.
// seller <-> accounting third-party must be deterministic. No name join.

export interface SellerAdvanceMovement {
  date: string;                 // ISO date
  documentNumber: string;
  concept: string;
  debit: number;
  credit: number;
}

export interface SellerAdvanceStatement {
  sellerId: string;
  sellerName: string;
  accountCode: "133010";
  currentBalance: number;
  movements: SellerAdvanceMovement[];
  asOf: string;                 // ISO
  status: "NOT_AVAILABLE";      // until SAG view exists
}
