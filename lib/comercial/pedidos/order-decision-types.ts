/**
 * lib/comercial/pedidos/order-decision-types.ts
 *
 * Domain types for the Order Decision Engine.
 * Pure types — no runtime logic, no Prisma.
 *
 * Every policy evaluation answers three questions:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *
 * Sprint: CASTILLITOS-ORDER-POLICY-PACK-01
 */

// ── Policy types ────────────────────────────────────────────────────────────

export type OrderPolicyType =
  | "ORDER_CUSTOMER_BRANCH"
  | "ORDER_CUSTOMER_CREDIT"
  | "ORDER_AUTO_SIZE_DISTRIBUTION"
  | "ORDER_PARTIAL_DELIVERY"
  | "ORDER_DISCOUNT_OVERRIDE"
  | "ORDER_READINESS";

// ── Evidence item ───────────────────────────────────────────────────────────

export interface OrderPolicyEvidenceItem {
  policyType: OrderPolicyType;
  policyId: string;
  policyName: string;
  activationReason: string;
  dataUsed: Record<string, unknown>;
  recommendedAction: string;
  actionRationale: string;
  confidence: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  evaluatedAt: string;
}

// ── Customer branch result ──────────────────────────────────────────────────

export interface CustomerBranchInfo {
  branchCode: string;
  name: string;
  address: string | null;
  city: string | null;
  isMain: boolean;
  active: boolean;
}

export interface CustomerBranchResult {
  customerId: string;
  customerName: string;
  branches: CustomerBranchInfo[];
  selectedBranch: CustomerBranchInfo | null;
  selectionMode: "auto_single" | "requires_selection" | "no_branches";
  evidence: OrderPolicyEvidenceItem;
}

// ── Customer credit result ──────────────────────────────────────────────────

export interface CustomerCreditResult {
  customerId: string;
  customerName: string;
  totalReceivable: number;
  overdueReceivable: number;
  maxDaysPastDue: number;
  creditStatus: "approved" | "warning" | "blocked";
  alerts: Array<{
    message: string;
    severity: "warning" | "high" | "critical";
    daysPastDue: number;
  }>;
  evidence: OrderPolicyEvidenceItem;
}

// ── Auto size distribution result ───────────────────────────────────────────

export interface SizeDistributionEntry {
  size: string;
  sizeName: string;
  availableUnits: number;
  allocatedUnits: number;
  reason: string;
}

export interface AutoSizeDistributionResult {
  referenceCode: string;
  productName: string;
  requestedUnits: number;
  totalAllocated: number;
  unallocated: number;
  distribution: SizeDistributionEntry[];
  balanced: boolean;
  evidence: OrderPolicyEvidenceItem;
}

// ── Partial delivery result ─────────────────────────────────────────────────

export type DeliveryStatus = "COMPLETE" | "PARTIAL" | "BACKORDER";

export interface PartialDeliveryResult {
  orderId: string;
  totalLines: number;
  fulfillableLines: number;
  backorderLines: number;
  deliveryStatus: DeliveryStatus;
  lineDetails: Array<{
    referenceCode: string;
    size: string;
    color: string;
    requestedQty: number;
    availableQty: number;
    fulfillableQty: number;
    backorderQty: number;
    status: DeliveryStatus;
  }>;
  evidence: OrderPolicyEvidenceItem;
}

// ── Discount override result ────────────────────────────────────────────────

export interface DiscountOverrideResult {
  orderId: string;
  overrideApplied: boolean;
  originalDiscount: { type: string; value: number } | null;
  overriddenBy: string;
  overriddenAt: string;
  reason: string;
  evidence: OrderPolicyEvidenceItem;
}

// ── Order readiness result ──────────────────────────────────────────────────

export type OrderReadinessStatus = "READY" | "WARNING" | "BLOCKED";

export interface OrderReadinessCheck {
  dimension: string;
  status: "ok" | "warning" | "blocked";
  message: string;
}

export interface OrderReadinessResult {
  orderId: string;
  status: OrderReadinessStatus;
  checks: OrderReadinessCheck[];
  canSubmit: boolean;
  evidence: OrderPolicyEvidenceItem;
}

// ── Inventory snapshot for size distribution ─────────────────────────────────

export interface SizeInventorySnapshot {
  referenceCode: string;
  productName: string;
  sizes: Array<{
    size: string;
    sizeName: string;
    availableUnits: number;
  }>;
}

// ── Order context (input for evaluation) ────────────────────────────────────

export interface OrderPolicyContext {
  tenantId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  sellerId: string;
  sellerName: string;
  /** Order lines for inventory/delivery checks */
  lines: Array<{
    referenceCode: string;
    productName: string;
    size: string;
    color: string;
    quantity: number;
    availableUnits: number | null;
    unitPrice: number;
  }>;
  /** Customer credit data (from CustomerProfile denormalized fields) */
  credit: {
    totalReceivable: number;
    overdueReceivable: number;
    maxDaysPastDue: number;
  };
  /** Customer branches (from Customer Domain) */
  branches: CustomerBranchInfo[];
  /** Selected branch (if any) */
  selectedBranchCode: string | null;
  /** Discount info */
  discount: { type: string; value: number } | null;
  discountOverride: { by: string; at: string; reason: string } | null;
  /** Total order value */
  totalValue: number;
  totalUnits: number;
}

// ── Full evaluation result ──────────────────────────────────────────────────

export interface OrderDecisionEvaluationResult {
  tenantId: string;
  evaluatedAt: string;
  policyPackVersion: string;
  branch: CustomerBranchResult;
  credit: CustomerCreditResult;
  autoSizeDistributions: AutoSizeDistributionResult[];
  delivery: PartialDeliveryResult;
  discountOverride: DiscountOverrideResult | null;
  readiness: OrderReadinessResult;
  allEvidence: OrderPolicyEvidenceItem[];
}
