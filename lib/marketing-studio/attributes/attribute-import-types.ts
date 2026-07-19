/**
 * lib/marketing-studio/attributes/attribute-import-types.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — SAG → Attribute Normalization Layer
 *
 * Domain types for the attribute import pipeline.
 * No Prisma, no business logic, no external deps.
 *
 * ── Provenance model ──────────────────────────────────────────────────────────
 *   AttributeImportSource  = where data came from
 *   ImportConfidence       = how sure we are about the mapping
 *   ImportReviewReason     = why a field was sent to review queue
 *
 * ── Pipeline flow ─────────────────────────────────────────────────────────────
 *   ExternalProductData → normalizeAndAssignAttributes() → AttributeImportResult
 *   Multiple products   → runAttributeImportPipeline()   → BatchImportResult
 */

import type { AttributeValueType } from "@/lib/marketing-studio/products/domain/product-enums";

// ── Source labels ──────────────────────────────────────────────────────────────

export type AttributeImportSource =
  | "manual"
  | "sag"
  | "shopify"
  | "erp_generic"
  | "pending_review";

// ── Confidence ────────────────────────────────────────────────────────────────

export type ImportConfidence = "high" | "medium" | "low" | "pending_review";

// ── Review reasons ────────────────────────────────────────────────────────────

export type ImportReviewReason =
  | "UNMAPPED_FIELD"   // field name not found in any field map
  | "AMBIGUOUS_VALUE"  // value could match multiple existing options
  | "TYPE_MISMATCH"    // raw value doesn't fit attribute type
  | "EMPTY_VALUE";     // raw value is empty / null

// ── External data contract ────────────────────────────────────────────────────

/** One raw field→value pair from an external system (SAG, Shopify, ERP). */
export interface ExternalProductField {
  /** Raw field name as it comes from SAG, e.g. "color", "TALLA", "Linea" */
  externalField: string;
  /** Raw value as it comes from SAG, e.g. "AZUL", "4", "Niño" */
  externalValue: string;
}

/**
 * A single product's data as received from an external system.
 * This is the input contract for the normalization service.
 */
export interface ExternalProductData {
  /** External system's product identifier */
  externalId: string;
  /** Source system identifier: "sag" | "shopify" | "erp_generic" */
  source:     AttributeImportSource;
  /** All raw field→value pairs for this product */
  fields:     ExternalProductField[];
}

// ── Review queue ──────────────────────────────────────────────────────────────

/**
 * A field that Agentik could not confidently map.
 * Queued for human review rather than silently discarded.
 */
export interface ImportReviewItem {
  externalField: string;
  externalValue: string;
  reason:        ImportReviewReason;
  confidence:    ImportConfidence;
  /** Best guess at what this might be, if any */
  suggestion?:   string;
}

// ── Per-product result ────────────────────────────────────────────────────────

/** Result of processing one product through the normalization service. */
export interface AttributeImportResult {
  /** Agentik product ID this result applies to */
  productId:          string;
  /** Keys of attribute definitions created during this run */
  definitionsCreated: string[];
  /** "key:value" pairs where a new option was added to an existing definition */
  valuesCreated:      string[];
  /** Keys of attributes that were assigned (created or updated) on the product */
  attributesAssigned: string[];
  /** Keys skipped because the value was already correct */
  attributesSkipped:  string[];
  /** Fields sent to human review queue */
  pendingReview:      ImportReviewItem[];
  /** Non-fatal errors per field */
  errors:             string[];
}

// ── Batch result ──────────────────────────────────────────────────────────────

/** Result of a batch import pipeline run. */
export interface BatchImportResult {
  total:       number;
  succeeded:   number;
  failed:      number;
  results:     AttributeImportResult[];
  /** Fatal errors that aborted individual products */
  errors:      string[];
}

// ── Field map entry ───────────────────────────────────────────────────────────

/**
 * How a raw external field should be mapped to an Agentik attribute.
 * Lives in attribute-field-map.ts; defined here so normalization-service
 * can import it without a circular dependency.
 */
export interface FieldMapEntry {
  /** Target ProductAttributeDefinition.key */
  agentikKey:      string;
  /** Human-readable label (Spanish) used when creating the definition */
  agentikLabel:    string;
  /** Attribute value type */
  type:            AttributeValueType;
  /** How confident we are in this mapping */
  confidence:      ImportConfidence;
  /** Whether this attribute is required for readiness scoring */
  required?:       boolean;
  /**
   * Optional value transformer.
   * Applied to externalValue before storing (e.g. title-case, unit normalization).
   */
  valueTransform?: (raw: string) => string;
}
