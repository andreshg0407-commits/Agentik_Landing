/**
 * vendor-types.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * LiveVendor — the first Digital Business Entity in Agentik.
 *
 * A vendor is NOT a user record. It is a living operational center
 * that consolidates real-time data from multiple modules:
 * maletas, pedidos, clientes, inventario, produccion.
 */

import type { OperationalState } from "@/lib/business-engine/entities/entity-types";

// ── Identity ─────────────────────────────────────────────────────────────────

export interface VendorIdentity {
  /** Internal salesRep ID (e.g. "NESTOR", "ORLANDO"). */
  id: string;
  /** Display name. */
  name: string;
  /** SAG-matched name (null if unconfirmed). */
  sagName: string | null;
  /** Slugified name for join keys across CRM/SAG. */
  slug: string;
  /** Zone or territory. */
  zone: string | null;
  /** Whether this vendor is currently active. */
  active: boolean;
}

// ── Commercial KPIs ──────────────────────────────────────────────────────────

export interface VendorCommercialKpis {
  /** Sales today (COP). */
  salesToday: number;
  /** Sales this week (COP). */
  salesWeek: number;
  /** Sales this month (COP). */
  salesMonth: number;
  /** Monthly sales goal (COP). Null if not configured. */
  salesGoal: number | null;
  /** Goal fulfillment percentage (0-100). Null if no goal. */
  goalPercent: number | null;
  /** Average daily sales this month (COP). */
  avgDailySales: number;
  /** Average ticket value (COP). */
  ticketPromedio: number;
  /** Number of orders today. */
  ordersToday: number;
  /** Number of orders this month. */
  ordersMonth: number;
  /** Unique customers served today. */
  customersToday: number;
  /** Unique references sold today. */
  referencesToday: number;
  /** Commercial ranking position (1-based). Null if not enough data. */
  ranking: number | null;
  /** Total vendors in ranking pool. */
  rankingTotal: number;
}

// ── Active Case (Maleta) ─────────────────────────────────────────────────────

export interface VendorActiveCaseSnapshot {
  /** Case ID (Prisma CommercialCase or VendorCommercialBag). */
  caseId: string | null;
  /** Case label / season name. */
  caseName: string | null;
  /** Last sync timestamp. */
  lastSyncedAt: string | null;
  /** Total references in the case. */
  totalReferences: number;
  /** References with zero availability. */
  depletedReferences: number;
  /** References below minimum threshold. */
  criticalReferences: number;
  /** Approximate portfolio value (COP). */
  portfolioValue: number;
  /** Overall case health. */
  health: "healthy" | "warning" | "critical" | "empty";
}

// ── Customer Summary ─────────────────────────────────────────────────────────

export interface VendorCustomerSummary {
  /** Total active customers assigned. */
  activeCustomers: number;
  /** Customers visited (with orders) this month. */
  customersVisited: number;
  /** Customers with zero orders this month. */
  customersWithoutOrders: number;
  /** Customers with outstanding receivables. */
  customersWithCartera: number;
  /** Customers with pending (unfulfilled) orders. */
  customersWithPendingOrders: number;
  /** Top customers by value this month. */
  topCustomers: VendorTopCustomer[];
}

export interface VendorTopCustomer {
  customerName: string;
  valor: number;
  pedidos: number;
  ultimaCompra: string | null;
}

// ── Order Summary ────────────────────────────────────────────────────────────

export interface VendorOrderSummary {
  /** Orders placed today. */
  ordersToday: number;
  /** Open (unfulfilled) orders. */
  ordersOpen: number;
  /** Blocked orders. */
  ordersBlocked: number;
  /** Fully delivered orders this month. */
  ordersDelivered: number;
  /** Orders waiting for inventory. */
  ordersWaitingInventory: number;
  /** Orders waiting for production. */
  ordersWaitingProduction: number;
}

// ── Fulfillment ──────────────────────────────────────────────────────────────

export interface VendorFulfillment {
  /** Overall fulfillment rate (0-100). */
  fulfillmentRate: number;
  /** Total orders considered. */
  totalOrders: number;
  /** Orders fully invoiced. */
  fullyInvoiced: number;
  /** Orders partially invoiced. */
  partiallyInvoiced: number;
  /** Orders without invoice. */
  withoutInvoice: number;
  /** Orders with value differences. */
  withDifferences: number;
}

// ── Alert ────────────────────────────────────────────────────────────────────

export type VendorAlertSeverity = "critical" | "high" | "medium" | "low";

export type VendorAlertType =
  | "depleted_references"
  | "blocked_orders"
  | "unattended_customers"
  | "stale_case"
  | "orders_waiting_production"
  | "orders_waiting_inventory"
  | "low_fulfillment"
  | "goal_at_risk";

export interface VendorAlert {
  id: string;
  type: VendorAlertType;
  severity: VendorAlertSeverity;
  title: string;
  description: string;
  metric: number | null;
  entityId: string | null;
  createdAt: string;
}

// ── Recommendation ───────────────────────────────────────────────────────────

export type VendorRecommendationType =
  | "update_case"
  | "remove_depleted_reference"
  | "visit_customer"
  | "call_customer"
  | "prioritize_order"
  | "add_new_reference"
  | "replenish_reference"
  | "follow_up_cartera";

export interface VendorRecommendation {
  id: string;
  type: VendorRecommendationType;
  title: string;
  description: string;
  priority: number;
  entityId: string | null;
  suggestedOnly: true;
}

// ── Future Business Events (documented, NOT implemented) ─────────────────────

/**
 * Events that this entity will emit once the Business Event Engine is active.
 * Documented per AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01.
 *
 * - vendor.sale_created        — A sale is recorded for this vendor
 * - vendor.portfolio_updated   — Maleta/case contents changed
 * - vendor.portfolio_depleted  — A reference in the case reached zero
 * - vendor.goal_reached        — Monthly sales goal met
 * - vendor.order_blocked       — An order was blocked
 * - vendor.customer_visited    — Customer received an order
 * - vendor.recommendation_generated — New recommendation created
 */
export type VendorBusinessEventType =
  | "vendor.sale_created"
  | "vendor.portfolio_updated"
  | "vendor.portfolio_depleted"
  | "vendor.goal_reached"
  | "vendor.order_blocked"
  | "vendor.customer_visited"
  | "vendor.recommendation_generated";

// ── LiveVendor — The First Digital Business Entity ───────────────────────────

/**
 * LiveVendor: a living operational representation of a sales rep.
 *
 * This is NOT a database record. It is assembled in real-time from
 * multiple data sources (SAG, CRM, Prisma, maletas engine, pedidos).
 *
 * When a manager opens a vendor profile, they immediately understand:
 * - What the vendor is doing
 * - What they have sold
 * - What orders they have
 * - Which customers need attention
 * - Which references should be retired
 * - What opportunities exist
 * - What problems require action
 */
export interface LiveVendor {
  kind: "vendor";
  identity: VendorIdentity;
  commercial: VendorCommercialKpis;
  activeCase: VendorActiveCaseSnapshot;
  customers: VendorCustomerSummary;
  orders: VendorOrderSummary;
  fulfillment: VendorFulfillment;
  alerts: VendorAlert[];
  recommendations: VendorRecommendation[];
  operationalState: OperationalState;
  /** ISO timestamp when this snapshot was assembled. */
  assembledAt: string;
}

// ── Vendor List Card ─────────────────────────────────────────────────────────

/** Lightweight vendor card for the list view. */
export interface VendorCard {
  id: string;
  name: string;
  salesToday: number;
  salesMonth: number;
  ordersToday: number;
  customersToday: number;
  fulfillmentRate: number;
  depletedReferences: number;
  alertCount: number;
  health: "healthy" | "warning" | "critical" | "unknown";
  ranking: number | null;
}

// ── Dashboard (all vendors) ──────────────────────────────────────────────────

/** Team-level sales performance dashboard. */
export interface VendorTeamDashboard {
  orgId: string;
  vendors: VendorCard[];
  teamKpis: {
    totalSalesToday: number;
    totalSalesMonth: number;
    totalOrdersToday: number;
    totalCustomersToday: number;
    avgFulfillment: number;
    vendorsActive: number;
    vendorsWithAlerts: number;
  };
  generatedAt: string;
}
