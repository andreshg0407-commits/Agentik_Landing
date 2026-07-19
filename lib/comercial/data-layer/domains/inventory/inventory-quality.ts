/**
 * domains/inventory/inventory-quality.ts
 *
 * Quality evaluation rules specific to the Inventory Domain.
 * Uses the shared CommercialQualityEvaluator with inventory-specific config.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type { InventoryPosition } from "./inventory-entities";
import type { CommercialQualityResult, FieldRule } from "../../quality";
import { evaluateCommercialQuality } from "../../quality";
import type { FreshnessEvaluationResult } from "../../shared/freshness-evaluator";
import { evaluateCommercialFreshness } from "../../shared/freshness-evaluator";

// -- Inventory Quality Configuration ----------------------------------------

const INVENTORY_REQUIRED_FIELDS = [
  "referenceCode",
  "productName",
  "location",
  "quantities",
  "state",
];

const INVENTORY_OPTIONAL_FIELDS = [
  "variant",
  "classification",
];

const INVENTORY_FIELD_RULES: FieldRule[] = [
  { field: "referenceCode", type: "string", minLength: 1, maxLength: 50 },
  { field: "productName", type: "string", minLength: 1, maxLength: 200 },
];

/** Inventory Domain freshness SLA: 15 minutes */
const INVENTORY_FRESHNESS_SLA_SECONDS = 900;

// -- Evaluate Inventory Quality ---------------------------------------------

export function evaluateInventoryQuality(
  position: InventoryPosition,
  options?: { now?: Date }
): CommercialQualityResult {
  const now = options?.now ?? new Date();

  const record: Record<string, unknown> = {
    referenceCode: position.referenceCode,
    productName: position.productName,
    location: position.location.code ? position.location : null,
    quantities: position.quantities.physicalQty >= 0 ? position.quantities : null,
    state: position.state,
    variant: position.variant,
    classification: position.classification.groupId ? position.classification : null,
  };

  const conflicts: Array<{ field: string; values: unknown[] }> = [];

  return evaluateCommercialQuality({
    record,
    requiredFields: INVENTORY_REQUIRED_FIELDS,
    optionalFields: INVENTORY_OPTIONAL_FIELDS,
    fieldRules: INVENTORY_FIELD_RULES,
    source: position.sourceMetadata.sourceType,
    freshness: {
      observedAt: position.timestamps.lastSyncAt,
      slaSeconds: INVENTORY_FRESHNESS_SLA_SECONDS,
      now,
    },
    conflicts,
    evaluatorVersion: "inventory-v1.0.0",
  });
}

// -- Evaluate Inventory Freshness -------------------------------------------

export function evaluateInventoryFreshness(
  position: InventoryPosition,
  options?: { now?: Date }
): FreshnessEvaluationResult {
  const now = options?.now ?? new Date();

  return evaluateCommercialFreshness({
    observedAt: position.timestamps.lastSyncAt,
    sourceUpdatedAt: position.timestamps.sourceModifiedAt,
    now,
    slaSeconds: INVENTORY_FRESHNESS_SLA_SECONDS,
    syncMode: position.sourceMetadata.extractionMode as any,
  });
}

// -- Inventory Quantity Validation ------------------------------------------

export interface InventoryQuantityValidation {
  readonly valid: boolean;
  readonly issues: string[];
}

export function validateInventoryQuantities(position: InventoryPosition): InventoryQuantityValidation {
  const issues: string[] = [];
  const q = position.quantities;

  if (q.physicalQty < 0) {
    issues.push("Physical quantity is negative");
  }
  if (q.availableQty < 0) {
    issues.push("Available quantity is negative");
  }
  if (q.reservedQty < 0) {
    issues.push("Reserved quantity is negative");
  }
  if (q.committedQty < 0) {
    issues.push("Committed quantity is negative");
  }
  if (q.availableQty > q.physicalQty) {
    issues.push("Available exceeds physical — possible data inconsistency");
  }
  if (q.reservedQty + q.committedQty > q.physicalQty) {
    issues.push("Reserved + committed exceeds physical");
  }

  return { valid: issues.length === 0, issues };
}
