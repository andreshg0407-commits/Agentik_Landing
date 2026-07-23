/**
 * lib/comercial/pedidos/order-policy-pack-config.ts
 *
 * FASE 9 — All configurable values for Order Policy Pack.
 * Never hardcoded in evaluators.
 *
 * To modify a rule without changing code:
 *   1. Find the config section for the policy
 *   2. Change the value
 *   3. Re-run the engine
 *
 * Sprint: CASTILLITOS-ORDER-POLICY-PACK-01
 */

// ── FASE 3: Customer Credit ─────────────────────────────────────────────────

export interface CustomerCreditConfig {
  /** Days past due that triggers a warning alert */
  warningDaysPastDue: number;
  /** Days past due that triggers a critical alert */
  criticalDaysPastDue: number;
  /** Whether to block order submission on warning */
  blockOnWarning: boolean;
  /** Whether to block order submission on critical */
  blockOnCritical: boolean;
  /** Default severity for credit alerts */
  defaultSeverity: "warning" | "high" | "critical";
}

export const CASTILLITOS_CUSTOMER_CREDIT: CustomerCreditConfig = {
  warningDaysPastDue: 30,
  criticalDaysPastDue: 60,
  blockOnWarning: false,
  blockOnCritical: false,
  defaultSeverity: "warning",
};

// ── FASE 4: Auto Size Distribution ──────────────────────────────────────────

export interface AutoSizeDistributionConfig {
  /** Maximum units per size in a single allocation (prevents concentration) */
  maxUnitsPerSize: number;
  /** Minimum sizes to distribute across (if available) */
  minSizesForBalance: number;
  /** Whether to redistribute if a size is unavailable */
  redistributeOnMissing: boolean;
}

export const CASTILLITOS_AUTO_SIZE_DISTRIBUTION: AutoSizeDistributionConfig = {
  maxUnitsPerSize: 50,
  minSizesForBalance: 3,
  redistributeOnMissing: true,
};

// ── FASE 5: Partial Delivery ────────────────────────────────────────────────

export interface PartialDeliveryConfig {
  /** Minimum fulfillment percentage to allow partial delivery */
  minFulfillmentPct: number;
  /** Whether partial delivery is enabled */
  partialDeliveryEnabled: boolean;
  /** Whether to allow backorder creation */
  backorderEnabled: boolean;
}

export const CASTILLITOS_PARTIAL_DELIVERY: PartialDeliveryConfig = {
  minFulfillmentPct: 0,
  partialDeliveryEnabled: true,
  backorderEnabled: true,
};

// ── FASE 6: Discount Override ───────────────────────────────────────────────

export interface DiscountOverrideConfig {
  /** Whether discount override is allowed */
  overrideAllowed: boolean;
  /** Whether reason is mandatory for override */
  requireReason: boolean;
}

export const CASTILLITOS_DISCOUNT_OVERRIDE: DiscountOverrideConfig = {
  overrideAllowed: true,
  requireReason: true,
};

// ── FASE 7: Order Readiness ─────────────────────────────────────────────────

export interface OrderReadinessConfig {
  /** Minimum order value to submit */
  minOrderValue: number;
  /** Minimum total units to submit */
  minOrderUnits: number;
  /** Whether credit check blocks submission */
  creditBlocksSubmission: boolean;
  /** Whether missing branch blocks submission */
  branchRequiredForSubmission: boolean;
}

export const CASTILLITOS_ORDER_READINESS: OrderReadinessConfig = {
  minOrderValue: 0,
  minOrderUnits: 1,
  creditBlocksSubmission: false,
  branchRequiredForSubmission: false,
};

// ── FASE 8: Stock Thresholds (COMMERCIAL-INTEGRATION-01) ────────────────────

export interface StockThresholdsConfig {
  /** Units at or below which a variant is "low stock" in fulfillment */
  lowStockUnits: number;
  /** Units at or below which a product shows "last units" state in search */
  lastUnitsThreshold: number;
  /** Variant count at or below which product shows "few variants" state */
  fewVariantsThreshold: number;
  /** Line-specific minimum units (e.g. LT=30, CS=20) */
  lineMinimums: Record<string, number>;
}

export const CASTILLITOS_STOCK_THRESHOLDS: StockThresholdsConfig = {
  lowStockUnits: 10,
  lastUnitsThreshold: 10,
  fewVariantsThreshold: 1,
  lineMinimums: {
    LT: 30,
    CS: 20,
  },
};

// ── FASE 9a: SAG Date Validation (SAG-WRITE-ADAPTER-01) ─────────────────────

export interface SagDateValidationConfig {
  /** Maximum days in the past for orderDate (blocks if older) */
  maxDaysInPast: number;
  /** Future dates are always blocked — no config needed */
}

export const CASTILLITOS_SAG_DATE_VALIDATION: SagDateValidationConfig = {
  maxDaysInPast: 30,
};

// ── FASE 9: SAG Write Mode (WIZARD-IMPROVEMENTS-01) ────────────────────────

/**
 * SAG_ORDER_WRITE_MODE controls the behavior of the order → SAG write pipeline.
 *
 * - DISABLED:   No SAG write at all. sendOrderToSag returns immediately.
 * - SIMULATION: Builds payload, validates, logs — but never calls SAG.
 *               Returns a simulated success with a fake sagOperationId.
 *               Useful for verifying mapping + idempotency without side effects.
 * - LIVE:       Full pipeline — enqueues in SAG write queue for execution.
 *               Requires SAG integration connection to be configured.
 */
export type SagOrderWriteMode = "DISABLED" | "SIMULATION" | "LIVE";

export interface SagWriteConfig {
  /** Master switch — if false, all SAG write operations are blocked */
  enabled: boolean;
  /** Write mode — controls pipeline behavior */
  mode: SagOrderWriteMode;
  /** Idempotency key template: orgId + orderId + version */
  idempotencyKeyVersion: number;
}

export const CASTILLITOS_SAG_WRITE: SagWriteConfig = {
  enabled: true,
  mode: "SIMULATION",
  idempotencyKeyVersion: 1,
};

// ── Full Policy Pack Config ─────────────────────────────────────────────────

export interface OrderPolicyPackConfig {
  tenantId: string;
  version: string;
  customerCredit: CustomerCreditConfig;
  autoSizeDistribution: AutoSizeDistributionConfig;
  partialDelivery: PartialDeliveryConfig;
  discountOverride: DiscountOverrideConfig;
  orderReadiness: OrderReadinessConfig;
  stockThresholds: StockThresholdsConfig;
  sagDateValidation: SagDateValidationConfig;
  sagWrite: SagWriteConfig;
}

export const CASTILLITOS_ORDER_POLICY_PACK_CONFIG: OrderPolicyPackConfig = {
  tenantId: "castillitos",
  version: "1.0.0",
  customerCredit: CASTILLITOS_CUSTOMER_CREDIT,
  autoSizeDistribution: CASTILLITOS_AUTO_SIZE_DISTRIBUTION,
  partialDelivery: CASTILLITOS_PARTIAL_DELIVERY,
  discountOverride: CASTILLITOS_DISCOUNT_OVERRIDE,
  orderReadiness: CASTILLITOS_ORDER_READINESS,
  stockThresholds: CASTILLITOS_STOCK_THRESHOLDS,
  sagDateValidation: CASTILLITOS_SAG_DATE_VALIDATION,
  sagWrite: CASTILLITOS_SAG_WRITE,
};
