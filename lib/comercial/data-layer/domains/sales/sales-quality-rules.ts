/**
 * domains/sales/sales-quality-rules.ts
 *
 * Quality evaluation rules specific to the Sales Domain.
 * Uses the shared CommercialQualityEvaluator with sales-specific configuration.
 */

import type { SalesDocument } from "./sales-entities";
import type { CommercialQualityResult, FieldRule } from "../../quality";
import { evaluateCommercialQuality } from "../../quality";
import type { FreshnessEvaluationResult } from "../../shared/freshness-evaluator";
import { evaluateCommercialFreshness } from "../../shared/freshness-evaluator";

// ── Sales Quality Configuration ─────────────────────────────────────────────

const SALES_REQUIRED_FIELDS = [
  "documentNumber",
  "documentType",
  "date",
  "customerCode",
  "financials",
];

const SALES_OPTIONAL_FIELDS = [
  "sellerCode",
  "sellerName",
  "warehouseCode",
  "observations",
  "customerName",
];

const SALES_FIELD_RULES: FieldRule[] = [
  { field: "documentNumber", type: "string", minLength: 1, maxLength: 50 },
  { field: "customerCode", type: "string", minLength: 1, maxLength: 20 },
];

/** Sales Domain freshness SLA: 30 minutes (near-real-time for billing) */
const SALES_FRESHNESS_SLA_SECONDS = 1800;

// ── Evaluate Sales Document Quality ─────────────────────────────────────────

export function evaluateSalesQuality(
  document: SalesDocument,
  options?: { now?: Date }
): CommercialQualityResult {
  const now = options?.now ?? new Date();

  const record: Record<string, unknown> = {
    documentNumber: document.documentNumber,
    documentType: document.documentType,
    date: document.date,
    customerCode: document.customerCode,
    customerName: document.customerName || null,
    sellerCode: document.sellerCode || null,
    sellerName: document.sellerName || null,
    warehouseCode: document.warehouseCode || null,
    financials: document.financials.total > 0 ? document.financials : null,
    observations: document.observations,
  };

  const conflicts: Array<{ field: string; values: unknown[] }> = [];

  return evaluateCommercialQuality({
    record,
    requiredFields: SALES_REQUIRED_FIELDS,
    optionalFields: SALES_OPTIONAL_FIELDS,
    fieldRules: SALES_FIELD_RULES,
    source: document.sourceMetadata.sourceType,
    freshness: {
      observedAt: document.timestamps.lastSyncAt,
      slaSeconds: SALES_FRESHNESS_SLA_SECONDS,
      now,
    },
    conflicts,
    evaluatorVersion: "sales-v1.0.0",
  });
}

// ── Evaluate Sales Freshness ────────────────────────────────────────────────

export function evaluateSalesFreshness(
  document: SalesDocument,
  options?: { now?: Date }
): FreshnessEvaluationResult {
  const now = options?.now ?? new Date();

  return evaluateCommercialFreshness({
    observedAt: document.timestamps.lastSyncAt,
    sourceUpdatedAt: document.timestamps.sourceModifiedAt,
    now,
    slaSeconds: SALES_FRESHNESS_SLA_SECONDS,
    syncMode: document.sourceMetadata.extractionMode as any,
  });
}

// ── Valid Sale Filter ────────────────────────────────────────────────────────

export interface ValidSaleDecision {
  readonly isValid: boolean;
  readonly reasons: string[];
}

/**
 * Determines if a sales document qualifies as a valid commercial sale.
 * Excludes voided documents, zero-value documents, and incomplete records.
 */
export function isValidSale(document: SalesDocument): ValidSaleDecision {
  const reasons: string[] = [];

  if (document.status === "ANULADA") {
    reasons.push("Document is voided (anulada)");
  }
  if (document.financials.total <= 0 && document.documentType === "FACTURA") {
    reasons.push("Invoice has zero or negative total");
  }
  if (!document.customerCode) {
    reasons.push("Missing customer code");
  }
  if (document.lineCount === 0) {
    reasons.push("Document has no lines");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}
