/**
 * lib/comercial/sales-reps/sales-rep-policy-pack-config.ts
 *
 * FASE 11 — All configurable values for SalesRep Policy Pack.
 * Never hardcoded in evaluators.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

// ── Out-of-stock ────────────────────────────────────────────────────────────

export interface OutOfStockConfig {
  /** Inventory threshold at or below which item is considered out of stock */
  outOfStockThreshold: number;
  /** Maximum replacement suggestions per out-of-stock item */
  maxReplacementSuggestions: number;
  /** Minimum quality score for replacement candidates (0-1) */
  minReplacementQuality: number;
  /** Minimum freshness score for replacement candidates (0-1) */
  minReplacementFreshness: number;
}

export const CASTILLITOS_OUT_OF_STOCK: OutOfStockConfig = {
  outOfStockThreshold: 0,
  maxReplacementSuggestions: 3,
  minReplacementQuality: 0.3,
  minReplacementFreshness: 0.3,
};

// ── Overdue receivable ──────────────────────────────────────────────────────

export interface OverdueReceivableConfig {
  /** Days past due threshold — alert when STRICTLY GREATER THAN this value */
  overdueDaysThreshold: number;
  /** Default alert severity */
  severity: "info" | "warning" | "critical";
  /** Whether to allow order creation when overdue */
  allowOrder: boolean;
  /** Whether acknowledgement is required from sales rep */
  requireAcknowledgement: boolean;
  /** Alert cooldown in minutes (avoid spam) */
  cooldownMinutes: number;
}

export const CASTILLITOS_OVERDUE_RECEIVABLE: OverdueReceivableConfig = {
  overdueDaysThreshold: 30,
  severity: "warning",
  allowOrder: true,
  requireAcknowledgement: true,
  cooldownMinutes: 480,
};

// ── Inactive customer ───────────────────────────────────────────────────────

export interface InactiveCustomerConfig {
  /** Inactivity threshold in days */
  inactivityThresholdDays: number;
  /** Days at which customer moves to AT_RISK (before fully inactive) */
  atRiskThresholdDays: number;
  /** Minimum purchase count to consider customer as having history */
  minimumSalesHistoryRequired: number;
}

export const CASTILLITOS_INACTIVE_CUSTOMER: InactiveCustomerConfig = {
  inactivityThresholdDays: 90,
  atRiskThresholdDays: 60,
  minimumSalesHistoryRequired: 1,
};

// ── Customer priority ───────────────────────────────────────────────────────

export interface CustomerPriorityWeights {
  inactivity: number;
  historicalSales: number;
  receivablesStatus: number;
  orderFrequency: number;
  recency: number;
  dataQuality: number;
}

export interface CustomerPriorityConfig {
  weights: CustomerPriorityWeights;
  /** Score threshold for HIGH priority */
  highThreshold: number;
  /** Score threshold for MEDIUM priority (below this = LOW) */
  mediumThreshold: number;
}

export const CASTILLITOS_CUSTOMER_PRIORITY: CustomerPriorityConfig = {
  weights: {
    inactivity: 0.25,
    historicalSales: 0.20,
    receivablesStatus: 0.20,
    orderFrequency: 0.15,
    recency: 0.10,
    dataQuality: 0.10,
  },
  highThreshold: 70,
  mediumThreshold: 40,
};

// ── Alert defaults ──────────────────────────────────────────────────────────

export interface AlertDefaultsConfig {
  defaultCooldownMinutes: number;
  defaultAcknowledgementRequired: boolean;
  orderBlockedSeverity: "warning" | "critical";
  dataQualityWarningSeverity: "info" | "warning";
}

export const CASTILLITOS_ALERT_DEFAULTS: AlertDefaultsConfig = {
  defaultCooldownMinutes: 480,
  defaultAcknowledgementRequired: false,
  orderBlockedSeverity: "critical",
  dataQualityWarningSeverity: "warning",
};

// ── Freshness ───────────────────────────────────────────────────────────────

export interface FreshnessConfig {
  /** Hours since last sync to be considered "HOY" */
  todayHours: number;
  /** Hours since last sync to be considered "RECIENTE" */
  recentHours: number;
}

export const CASTILLITOS_FRESHNESS: FreshnessConfig = {
  todayHours: 24,
  recentHours: 72,
};

// ── Full Policy Pack Config ─────────────────────────────────────────────────

export interface SalesRepPolicyPackConfig {
  tenantId: string;
  version: string;
  outOfStock: OutOfStockConfig;
  overdueReceivable: OverdueReceivableConfig;
  inactiveCustomer: InactiveCustomerConfig;
  customerPriority: CustomerPriorityConfig;
  alertDefaults: AlertDefaultsConfig;
  freshness: FreshnessConfig;
}

export const CASTILLITOS_SALESREP_POLICY_PACK_CONFIG: SalesRepPolicyPackConfig = {
  tenantId: "castillitos",
  version: "1.0.0",
  outOfStock: CASTILLITOS_OUT_OF_STOCK,
  overdueReceivable: CASTILLITOS_OVERDUE_RECEIVABLE,
  inactiveCustomer: CASTILLITOS_INACTIVE_CUSTOMER,
  customerPriority: CASTILLITOS_CUSTOMER_PRIORITY,
  alertDefaults: CASTILLITOS_ALERT_DEFAULTS,
  freshness: CASTILLITOS_FRESHNESS,
};
