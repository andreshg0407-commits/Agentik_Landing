/**
 * entity-types.ts
 *
 * AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01
 * Digital Business Entities — living operational representations.
 *
 * Each important business entity is NOT just a database record.
 * It is a living entity with real-time operational state.
 */

// ── Entity Kind ───────────────────────────────────────────────────────────────

export type DigitalEntityKind =
  | "product"
  | "customer"
  | "vendor"
  | "production_order"
  | "sales_portfolio"
  | "store"
  | "case"          // maleta
  | "purchase_order"
  | "invoice"
  | "bank_account";

// ── Operational State ─────────────────────────────────────────────────────────

/** The universal operational state every digital entity carries. */
export interface OperationalState {
  /** Health of this entity: healthy | warning | critical | unknown. */
  health: "healthy" | "warning" | "critical" | "unknown";
  /** Active alerts for this entity. */
  activeAlertCount: number;
  /** Pending actions that need attention. */
  pendingActionCount: number;
  /** Last time this entity was updated. */
  lastUpdatedAt: string | null;
  /** Last time external data was synced. */
  lastSyncedAt: string | null;
  /** Data completeness (0-100). */
  completeness: number;
}

// ── Digital Product ───────────────────────────────────────────────────────────

export interface DigitalProduct {
  kind: "product";
  id: string;
  organizationId: string;
  reference: string;
  name: string;
  category: string | null;
  /** Total stock across all warehouses. */
  totalStock: number;
  /** Number of variants with zero stock. */
  depletedVariants: number;
  /** Total variants. */
  totalVariants: number;
  /** Number of pending orders containing this product. */
  pendingOrders: number;
  /** Whether there's active production for this reference. */
  hasActiveProduction: boolean;
  /** Total quantity ordered in active OPs. */
  productionQuantityOrdered: number;
  operationalState: OperationalState;
}

// ── Digital Customer ──────────────────────────────────────────────────────────

export interface DigitalCustomer {
  kind: "customer";
  id: string;
  organizationId: string;
  name: string;
  nit: string | null;
  /** Total lifetime value. */
  lifetimeValue: number;
  /** Number of orders placed. */
  totalOrders: number;
  /** Outstanding receivable balance. */
  outstandingBalance: number;
  /** Days since last order. */
  daysSinceLastOrder: number | null;
  /** Credit status. */
  creditStatus: "current" | "overdue" | "blocked" | "unknown";
  operationalState: OperationalState;
}

// ── Digital Vendor (Vendedor / Sales Rep) ──────────────────────────────────────

export interface DigitalVendor {
  kind: "vendor";
  id: string;
  organizationId: string;
  name: string;
  /** Active case (maleta) ID. */
  activeCaseId: string | null;
  /** References in active case. */
  caseReferenceCount: number;
  /** Depleted references in case. */
  caseDepleted: number;
  /** Orders today. */
  ordersToday: number;
  /** Sales today (COP). */
  salesToday: number;
  /** Sales this month (COP). */
  salesMonth: number;
  /** Average ticket value. */
  ticketPromedio: number;
  /** Unique customers served today. */
  customersToday: number;
  /** Customers pending visit. */
  customersPending: number;
  /** Fulfillment rate (0-100). */
  fulfillmentRate: number;
  operationalState: OperationalState;
}

// ── Digital Store ─────────────────────────────────────────────────────────────

export interface DigitalStore {
  kind: "store";
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  /** Total SKUs in store. */
  totalSkus: number;
  /** SKUs with zero stock. */
  depletedSkus: number;
  /** Sales today (COP). */
  salesToday: number;
  /** Replenishment needs. */
  replenishmentNeeded: number;
  operationalState: OperationalState;
}

// ── Digital Production Order ──────────────────────────────────────────────────

export interface DigitalProductionOrder {
  kind: "production_order";
  id: string;
  organizationId: string;
  documentNumber: string;
  reference: string;
  /** Current workflow stage (null if no flow configured). */
  currentStage: string | null;
  /** Total quantity ordered. */
  quantityOrdered: number;
  /** Whether the OP is open. */
  isOpen: boolean;
  /** Business date of the OP. */
  documentDate: string;
  /** Number of line items. */
  lineCount: number;
  operationalState: OperationalState;
}

// ── Union Type ────────────────────────────────────────────────────────────────

export type DigitalEntity =
  | DigitalProduct
  | DigitalCustomer
  | DigitalVendor
  | DigitalStore
  | DigitalProductionOrder;

// ── Entity Engine Interface ───────────────────────────────────────────────────

/** Contract for resolving Digital Business Entities. */
export interface IEntityEngine {
  /** Resolve a single entity by kind and ID. */
  resolve(organizationId: string, kind: DigitalEntityKind, entityId: string): Promise<DigitalEntity | null>;
  /** Resolve multiple entities of the same kind. */
  resolveBatch(organizationId: string, kind: DigitalEntityKind, entityIds: string[]): Promise<DigitalEntity[]>;
  /** Search entities by kind with optional filters. */
  search(organizationId: string, kind: DigitalEntityKind, query?: string, limit?: number): Promise<DigitalEntity[]>;
}
