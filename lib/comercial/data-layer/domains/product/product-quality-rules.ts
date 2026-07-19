/**
 * domains/product/product-quality-rules.ts
 *
 * Quality evaluation rules specific to the Product Domain.
 * Uses the shared CommercialQualityEvaluator with product-specific configuration.
 */

import type { ProductProfile } from "./product-entities";
import type { CommercialQualityResult, FieldRule } from "../../quality";
import { evaluateCommercialQuality } from "../../quality";
import type { FreshnessEvaluationResult } from "../../shared/freshness-evaluator";
import { evaluateCommercialFreshness } from "../../shared/freshness-evaluator";

// ── Product Quality Configuration ───────────────────────────────────────────

const PRODUCT_REQUIRED_FIELDS = [
  "referenceCode",
  "name",
  "classification",
  "pricing",
  "operational",
];

const PRODUCT_OPTIONAL_FIELDS = [
  "secondaryName",
  "hasVariants",
];

const PRODUCT_FIELD_RULES: FieldRule[] = [
  { field: "referenceCode", type: "string", minLength: 1, maxLength: 50 },
  { field: "name", type: "string", minLength: 1, maxLength: 200 },
];

/** Product Domain freshness SLA: 24 hours (daily sync) */
const PRODUCT_FRESHNESS_SLA_SECONDS = 86400;

// ── Evaluate Product Quality ────────────────────────────────────────────────

export function evaluateProductQuality(
  profile: ProductProfile,
  options?: { now?: Date }
): CommercialQualityResult {
  const now = options?.now ?? new Date();

  // Flatten product for field-level evaluation
  const record: Record<string, unknown> = {
    referenceCode: profile.referenceCode,
    name: profile.name,
    secondaryName: profile.secondaryName,
    classification: profile.classification.groupId ? profile.classification : null,
    pricing: profile.pricing.salePrice > 0 ? profile.pricing : null,
    operational: profile.operational,
    hasVariants: profile.hasVariants,
  };

  // Detect conflicts (none for single-source, but ready for multi-source)
  const conflicts: Array<{ field: string; values: unknown[] }> = [];

  return evaluateCommercialQuality({
    record,
    requiredFields: PRODUCT_REQUIRED_FIELDS,
    optionalFields: PRODUCT_OPTIONAL_FIELDS,
    fieldRules: PRODUCT_FIELD_RULES,
    source: profile.sourceMetadata.sourceType,
    freshness: {
      observedAt: profile.timestamps.lastSyncAt,
      slaSeconds: PRODUCT_FRESHNESS_SLA_SECONDS,
      now,
    },
    conflicts,
    evaluatorVersion: "product-v1.0.0",
  });
}

// ── Evaluate Product Freshness ──────────────────────────────────────────────

export function evaluateProductFreshness(
  profile: ProductProfile,
  options?: { now?: Date }
): FreshnessEvaluationResult {
  const now = options?.now ?? new Date();

  return evaluateCommercialFreshness({
    observedAt: profile.timestamps.lastSyncAt,
    sourceUpdatedAt: profile.timestamps.sourceModifiedAt,
    now,
    slaSeconds: PRODUCT_FRESHNESS_SLA_SECONDS,
    syncMode: profile.sourceMetadata.extractionMode as any,
  });
}

// ── Commercial Article Filter ───────────────────────────────────────────────

export interface CommercialArticleDecision {
  readonly isCommercial: boolean;
  readonly reasons: string[];
}

/**
 * Determines if a product profile qualifies as a commercial article.
 * Equivalent to the existing isCommercialArticle() logic but operating on canonical data.
 */
export function isCommercialProduct(profile: ProductProfile): CommercialArticleDecision {
  const reasons: string[] = [];

  if (!profile.operational.active) {
    reasons.push("Product is inactive");
  }
  if (profile.operational.blocked) {
    reasons.push("Product is blocked");
  }
  if (profile.pricing.salePrice <= 0) {
    reasons.push("Product has no sale price");
  }
  if (!profile.operational.managesInventory) {
    reasons.push("Product does not manage inventory (kardex)");
  }

  return {
    isCommercial: reasons.length === 0,
    reasons,
  };
}
