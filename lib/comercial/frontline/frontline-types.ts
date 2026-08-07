/**
 * lib/comercial/frontline/frontline-types.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01
 *
 * Client-safe types for frontline domain: seller identity, customer context,
 * purchase intelligence, attention contract.
 *
 * Pure types only. No runtime, no Prisma, no server-only.
 */

// ── Data provenance ─────────────────────────────────────────────────────────

export interface FrontlineProvenance {
  source: string;
  asOf: string;
  limitations?: string[];
}

// ── Seller ↔ User identity ──────────────────────────────────────────────────

export type SellerMappingSource =
  | "membership_seller_slug"   // Membership.permissionsJson.sellerSlug
  | "email_crm_match"         // User.email matched to CRM quote seller
  | "admin_scope"             // ORG_ADMIN/MANAGER — not a seller
  | "unmapped";               // No mapping found

export interface ResolvedSellerIdentity {
  userId: string;
  organizationId: string;
  sellerId: string | null;        // seller slug (e.g. "juan-perez")
  sellerName: string | null;
  sellerSlug: string | null;
  sagSellerCode: string | null;   // SAG ka_nl_tercero_vend if known
  role: string;                   // Prisma Role
  mappingSource: SellerMappingSource;
  isSellerScoped: boolean;        // true if this user sees only own data
  isManagerOrAbove: boolean;      // true if MANAGER/ORG_ADMIN/SUPER_ADMIN
  active: boolean;
  provenance: FrontlineProvenance;
}

// ── Seller scope ────────────────────────────────────────────────────────────

export type ScopeLevel = "seller" | "manager" | "admin" | "super_admin";

export interface SellerScope {
  level: ScopeLevel;
  sellerId: string | null;
  sellerSlug: string | null;
  canAccessAllSellers: boolean;
  canAccessAllCustomers: boolean;
  canAccessAllOrders: boolean;
  canAccessAllPortfolios: boolean;
  canAccessAllAlerts: boolean;
}

// ── Customer purchase intelligence ──────────────────────────────────────────

export interface CustomerTopProduct {
  referenceCode: string;
  description: string;
  totalUnits: number;
  totalSalesValue: number;
  purchaseCount: number;          // distinct orders containing this ref
  lastPurchaseDate: string | null; // ISO
}

export type TopProductRanking = "UNITS" | "SALES_VALUE";

export interface CustomerPurchaseHistoryItem {
  orderId: string;
  orderNumber: string;
  orderDate: string;              // ISO
  referenceCode: string;
  description: string;
  quantity: number;
  unitValue: number;
  lineValue: number;
  status: string;
}

export interface CustomerPurchaseHistoryResult {
  customerId: string;
  items: CustomerPurchaseHistoryItem[];
  totalOrders: number;
  totalUnits: number;
  totalValue: number;
  provenance: FrontlineProvenance;
}

export interface CustomerTopProductsResult {
  customerId: string;
  ranking: TopProductRanking;
  products: CustomerTopProduct[];
  provenance: FrontlineProvenance;
}

// ── Customer receivables context ────────────────────────────────────────────

export interface CustomerReceivablesContext {
  totalReceivable: number;
  overdueAmount: number;
  overdueDocumentCount: number;
  oldestOverdueDate: string | null; // ISO
  maxDaysOverdue: number;
  currency: string;
  asOf: string;
}

// ── Customer commercial context ─────────────────────────────────────────────

export interface CustomerCommercialContext {
  customerId: string;
  customerName: string;
  nitNormalized: string | null;

  seller: {
    sellerName: string | null;
    sellerSlug: string | null;
    source: string;
    confidence: string;
  };

  receivables: CustomerReceivablesContext | null;

  topProductsByUnits: CustomerTopProduct[];
  topProductsBySalesValue: CustomerTopProduct[];

  lastPurchaseDate: string | null;
  totalOrdersL12: number;

  provenance: FrontlineProvenance;
}

// ── Frontline attention contract ────────────────────────────────────────────

export type AttentionSeverity = "critical" | "warning" | "info";

export type FrontlineAttentionType =
  // Maletas
  | "SAMPLE_WITHDRAWAL_REQUIRED"
  | "PORTFOLIO_SUPPLY_REQUIRED"
  | "PORTFOLIO_COVERAGE_AT_RISK"
  // Customer / Cartera
  | "CUSTOMER_OVERDUE_WHILE_ORDERING"
  | "CUSTOMER_OVERDUE_RECEIVABLE"
  // Orders
  | "ORDER_PENDING_SYNC"
  | "ORDER_SYNC_FAILED"
  | "ORDER_CONFIRMED";

export interface FrontlineAttentionItem {
  type: FrontlineAttentionType;
  severity: AttentionSeverity;

  organizationId: string;
  sellerId: string | null;

  customerId?: string;
  portfolioId?: string;
  orderId?: string;
  referenceCode?: string;

  title: string;
  evidence: Record<string, unknown>;
  suggestedAction?: string;
  deepLink?: string;

  createdAt: string;
  deduplicationKey: string;

  provenance: FrontlineProvenance;
}

export interface FrontlineAttentionResult {
  items: FrontlineAttentionItem[];
  provenance: FrontlineProvenance;
}
