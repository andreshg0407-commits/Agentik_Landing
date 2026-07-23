/**
 * lib/comercial/clientes/canonical-customer-types.ts
 *
 * Canonical commercial customer types for the Pedidos module and all
 * downstream consumers. Single source of truth for customer data contracts.
 *
 * Sprint: AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01
 */

// ── Data quality ────────────────────────────────────────────────────────────

export type CustomerDataQuality = "CONFIRMED" | "INFERRED" | "UNAVAILABLE";

// ── Seller resolution ───────────────────────────────────────────────────────

export type SellerResolutionSource =
  | "SAG_ORDER"
  | "CRM_ORDER"
  | "CUSTOMER_BRANCH"
  | "CUSTOMER_PROFILE"
  | "UNAVAILABLE";

export type SellerResolutionConfidence =
  | "CONFIRMED"
  | "INFERRED"
  | "UNAVAILABLE";

export interface ResolvedSeller {
  id?: string;
  sagCode?: string;
  name?: string;
  source: SellerResolutionSource;
  confidence: SellerResolutionConfidence;
}

// ── Price list ──────────────────────────────────────────────────────────────

export interface CustomerPriceList {
  code?: string;
  name?: string;
  quality: CustomerDataQuality;
}

// ── Payment terms ───────────────────────────────────────────────────────────

export interface CustomerPaymentTerms {
  paymentMethod?: string;
  creditLimit?: number;
  paymentDays?: number;
  quality: CustomerDataQuality;
}

// ── Portfolio / receivables summary ─────────────────────────────────────────

export interface CustomerPortfolio {
  totalBalance?: number;
  overdueBalance?: number;
  maxOverdueDays?: number;
  updatedAt?: string;
  quality: CustomerDataQuality;
}

// ── Customer branch ─────────────────────────────────────────────────────────

export interface CanonicalCustomerBranch {
  /** Stable internal ID (CustomerProfile.id of this branch record) */
  id: string;
  organizationId: string;
  /** Parent customer ID (CustomerProfile.id of the main record) */
  parentCustomerId: string;
  sagCustomerCode?: string;
  name: string;
  address?: string;
  city?: string;
  department?: string;
  phone?: string;
  seller?: ResolvedSeller;
  status: string;
  isMain: boolean;
  source: "SAG" | "CRM" | "AGENTIK";
  sourceRecordId?: string;
}

// ── SAG readiness (3 levels) ────────────────────────────────────────────────

/**
 * Three progressive readiness levels for customer data:
 *
 * CUSTOMER_IDENTIFIED — Identity and SAG code exist. Customer can be
 *   referenced in a borrador but NOT submitted.
 *
 * ORDER_DRAFT_READY — Can be selected in the wizard and used in a borrador.
 *   Has minimum data for a meaningful draft (name + NIT).
 *
 * SAG_SUBMISSION_READY — All mandatory fields confirmed for SAG PD document
 *   creation. The order can transition to listo_para_enviar.
 *
 * Required fields for SAG_SUBMISSION_READY (from SAG PD document contract):
 *   - customerSagCode (TERCERO code — mandatory)
 *   - NIT / document number (mandatory for document header)
 *   - Address (delivery address — mandatory for dispatch documents)
 *   - Product SAG codes on lines (validated separately, not here)
 *   - Seller code (when SAG document requires VENDEDOR — configurable)
 *   - Price list code (when SAG requires PRECIO_VENTA — configurable)
 *   - Branch/sucursal code (when customer has multiple branches — configurable)
 */
export type CustomerReadinessLevel =
  | "CUSTOMER_IDENTIFIED"
  | "ORDER_DRAFT_READY"
  | "SAG_SUBMISSION_READY";

/** Legacy alias — maps to the 3 levels */
export type SagReadinessStatus = "READY" | "DRAFT_ONLY" | "BLOCKED";

export interface SagReadinessBlocker {
  field: string;
  reason: string;
  /** Whether this blocker prevents only SAG submission or also draft creation */
  severity: "SUBMISSION_BLOCKER" | "DRAFT_BLOCKER";
}

export interface SagReadinessResult {
  status: SagReadinessStatus;
  /** Highest readiness level achieved */
  level: CustomerReadinessLevel;
  blockers: SagReadinessBlocker[];
}

// ── Field provenance ────────────────────────────────────────────────────────

export interface CustomerFieldQuality {
  sagCode: CustomerDataQuality;
  address: CustomerDataQuality;
  location: CustomerDataQuality;
  seller: CustomerDataQuality;
  priceList: CustomerDataQuality;
  credit: CustomerDataQuality;
}

// ── Canonical commercial customer ───────────────────────────────────────────

export interface CanonicalCommercialCustomer {
  /** CustomerProfile.id */
  id: string;
  organizationId: string;

  /** SAG erpId / sourceId */
  sagCode?: string;
  /** CRM ID */
  crmId?: string;
  /** SAG internal PK (ka_nl_tercero) */
  sagTerceroId?: number;

  // Identity
  documentType?: string;
  documentNumber?: string;
  verificationDigit?: string;
  nitNormalized?: string;

  // Names
  legalName: string;
  tradeName?: string;

  // Location
  address?: string;
  city?: string;
  sagCityId?: string;
  department?: string;
  sagDepartmentId?: string;
  country: string;

  // Contact
  phone?: string;
  mobile?: string;
  email?: string;

  // Commercial classification
  zone?: string;
  channel?: string;
  customerType: string;

  // Pricing & credit
  priceList: CustomerPriceList;
  paymentTerms: CustomerPaymentTerms;
  portfolio: CustomerPortfolio;

  // Seller
  seller: ResolvedSeller;

  // Branches
  branches: CanonicalCustomerBranch[];
  hasBranches: boolean;

  // Status
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "UNKNOWN";
  sagActive?: boolean;

  // Data quality
  dataQuality: CustomerFieldQuality;

  // Timestamps
  erpSyncedAt?: string;
  crmSyncedAt?: string;
  updatedAt: string;
}

// ── Search result (lighter than full canonical) ─────────────────────────────

export interface CustomerSearchResult {
  id: string;
  sagCode?: string;
  nit?: string;
  name: string;
  city?: string;
  address?: string;
  seller?: ResolvedSeller;
  priceListCode?: string;
  creditLimit?: number;
  hasBranches: boolean;
  branchCount: number;
  status: string;
  sagReadiness: SagReadinessStatus;
  lastPurchaseAt?: string;
}

// ── Order customer snapshot ─────────────────────────────────────────────────

/** Snapshot attached to an order at creation time. Preserved even if profile changes. */
export interface OrderCustomerSnapshot {
  customerId: string;
  customerSagCode?: string;
  customerNit?: string;
  customerName: string;
  branchId?: string;
  branchSagCode?: string;
  branchName?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDepartment?: string;
  sellerName?: string;
  sellerSagCode?: string;
  sellerSource: SellerResolutionSource;
  sellerConfidence: SellerResolutionConfidence;
  priceListCode?: string;
  sagReadiness: SagReadinessStatus;
  snapshotAt: string;
}
