/**
 * lib/comercial/tiendas/store-decision-types.ts
 *
 * Domain types for the Store Decision Engine.
 * Pure types — no runtime logic, no Prisma, no imports beyond type refs.
 *
 * Every policy evaluation answers three questions:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *
 * Sprint: CASTILLITOS-STORE-POLICY-PACK-01
 */

import type { StoreProductClass, StoreSizeClass } from "./store-policy-types";

// ── Policy types ────────────────────────────────────────────────────────────

export type StorePolicyType =
  | "STORE_TEXTILE_COVERAGE"
  | "STORE_GLOBAL_LOW_STOCK"
  | "STORE_ACCESSORY_COVERAGE"
  | "STORE_SPECIAL_PRODUCT"
  | "STORE_AUTOMATIC_MARKDOWN"
  | "STORE_SLOW_ROTATION"
  | "STORE_ASSORTMENT_SUGGESTION"
  | "STORE_COMPARATIVE_REPORT";

// ── Evidence item ───────────────────────────────────────────────────────────

export interface StorePolicyEvidenceItem {
  /** Which policy produced this */
  policyType: StorePolicyType;
  /** Policy ID */
  policyId: string;
  /** Human-readable policy name */
  policyName: string;
  /** Why did this policy activate? */
  activationReason: string;
  /** What data did it use? */
  dataUsed: Record<string, unknown>;
  /** What action does it recommend? */
  recommendedAction: string;
  /** Why this action? */
  actionRationale: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Severity */
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** Timestamp */
  evaluatedAt: string;
}

// ── Textile coverage result ─────────────────────────────────────────────────

export interface TextileCoverageResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  currentUnits: number;
  minimumUnits: number;
  idealUnits: number;
  maximumUnits: number;
  status: "below_minimum" | "below_ideal" | "ok" | "above_maximum";
  gap: number;
  evidence: StorePolicyEvidenceItem;
}

// ── Global low stock (Rule 36) result ───────────────────────────────────────

export interface GlobalLowStockResult {
  referenceCode: string;
  productName: string;
  totalUnitsAllWarehouses: number;
  threshold: number;
  /** Stores allowed to keep this reference */
  allowedStores: string[];
  /** Stores that should transfer out */
  transferOutStores: Array<{
    storeId: string;
    storeName: string;
    currentUnits: number;
    suggestedAction: "transfer_out";
  }>;
  evidence: StorePolicyEvidenceItem;
}

// ── Accessory coverage result ───────────────────────────────────────────────

export interface AccessoryCoverageResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  sizeClass: StoreSizeClass;
  currentUnits: number;
  idealUnits: number;
  status: "below" | "ok" | "above";
  gap: number;
  evidence: StorePolicyEvidenceItem;
}

// ── Special product result ──────────────────────────────────────────────────

export interface SpecialProductResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  currentUnits: number;
  idealUnits: number;
  status: "below" | "ok" | "above";
  gap: number;
  evidence: StorePolicyEvidenceItem;
}

// ── Automatic markdown result ───────────────────────────────────────────────

export interface AutomaticMarkdownResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  daysInStore: number;
  monthsInStore: number;
  currentUnits: number;
  suggestedDiscountPct: number;
  /** Markdown formatted suggestion */
  suggestedMarkdown: string;
  evidence: StorePolicyEvidenceItem;
}

// ── Slow rotation result ────────────────────────────────────────────────────

export interface SlowRotationResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  daysInStore: number;
  monthsInStore: number;
  currentUnits: number;
  suggestedDiscountPct: number;
  evidence: StorePolicyEvidenceItem;
}

// ── Assortment suggestion result ────────────────────────────────────────────

export interface AssortmentSuggestionResult {
  storeId: string;
  storeName: string;
  /** Suggested references sorted by store-specific sales history */
  suggestions: Array<{
    referenceCode: string;
    productName: string;
    storeSalesCount: number;
    suggestedQty: number;
    reason: string;
  }>;
  evidence: StorePolicyEvidenceItem;
}

// ── Comparative report result ───────────────────────────────────────────────

export interface ComparativeReportResult {
  /** Store with highest total sales */
  topSellingStore: { storeId: string; storeName: string; totalSales: number } | null;
  /** Store with best rotation (lowest avg days to sell) */
  topRotationStore: { storeId: string; storeName: string; avgDaysToSell: number } | null;
  /** Store with highest gross margin */
  topMarginStore: { storeId: string; storeName: string; grossMargin: number } | null;
  /** References that sell well in one store but not another */
  crossStoreOpportunities: Array<{
    referenceCode: string;
    productName: string;
    strongStore: { storeId: string; storeName: string; sales: number };
    weakStore: { storeId: string; storeName: string; sales: number };
    gap: number;
  }>;
  evidence: StorePolicyEvidenceItem;
}

// ── Inventory snapshot (input for evaluations) ──────────────────────────────

export interface StoreInventorySnapshot {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  productClass: StoreProductClass;
  sizeClass?: StoreSizeClass;
  line: string;
  subgroup: string;
  currentUnits: number;
  /** Days since the product arrived at this store */
  daysInStore?: number;
  /** First arrival date at this store */
  arrivedAt?: string;
}

// ── Sales history (input for assortment/comparative) ────────────────────────

export interface StoreSalesRecord {
  storeId: string;
  storeName: string;
  referenceCode: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  /** Average days from arrival to sale */
  avgDaysToSell: number;
  period: string;
}

// ── Full evaluation result ──────────────────────────────────────────────────

export interface StoreDecisionEvaluationResult {
  tenantId: string;
  evaluatedAt: string;
  policyPackVersion: string;
  textileCoverage: TextileCoverageResult[];
  globalLowStock: GlobalLowStockResult[];
  accessoryCoverage: AccessoryCoverageResult[];
  specialProducts: SpecialProductResult[];
  automaticMarkdowns: AutomaticMarkdownResult[];
  slowRotation: SlowRotationResult[];
  assortmentSuggestions: AssortmentSuggestionResult[];
  comparativeReport: ComparativeReportResult | null;
  /** All evidence items across all policies */
  allEvidence: StorePolicyEvidenceItem[];
}
