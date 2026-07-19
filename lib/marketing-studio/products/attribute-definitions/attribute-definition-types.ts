/**
 * lib/marketing-studio/products/attribute-definitions/attribute-definition-types.ts
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01 — Attribute Definition Domain Types
 *
 * Types for the org-level attribute definition catalog.
 * An AttributeDefinition governs what attributes exist for a tenant,
 * their types, display order, and valid options for select/multiselect.
 *
 * ── SEPARATION ────────────────────────────────────────────────────────────────
 *   AttributeDefinition  = org-level schema (this layer)
 *   ProductAttribute     = per-product value (product-types.ts)
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No Prisma imports
 *   - No business logic
 *   - No `any` types
 */

import type { AttributeValueType } from "../domain/product-enums";

// ── Option ─────────────────────────────────────────────────────────────────────

/** One valid option for a select or multiselect attribute definition. */
export interface AttributeDefinitionOption {
  id:          string;
  definitionId: string;
  value:       string;
  label:       string;
  sortOrder:   number;
  /** Import provenance: "manual" | "sag" | "shopify" | "erp_generic" */
  source:      string;
  /** Raw external value before normalization */
  externalRef: string | null;
}

// ── Definition ─────────────────────────────────────────────────────────────────

/** Org-level schema for one attribute type. */
export interface AttributeDefinition {
  id:             string;
  organizationId: string;

  /** Machine key — used as ProductAttribute.key */
  key:         string;
  /** Display label (Spanish) */
  label:       string;
  /** Value type */
  type:        AttributeValueType;
  /** Whether required for readiness scoring */
  required:    boolean;
  /** Sort order within attribute panels */
  sortOrder:   number;
  /** Optional tooltip/hint for operators */
  helpText:    string | null;
  /** Target channel; null = all channels */
  destination: string | null;
  /** Import provenance: "manual" | "sag" | "shopify" | "erp_generic" | "pending_review" */
  source:      string;
  /** External field name when imported (e.g. "color", "talla") */
  externalRef: string | null;

  /** Valid options — populated only for select/multiselect types */
  options:     AttributeDefinitionOption[];

  createdAt: Date;
  updatedAt: Date;
}

// ── Input types ────────────────────────────────────────────────────────────────

/** Input shape for an option when creating or updating a definition */
export interface AttributeDefinitionOptionInput {
  value:      string;
  label:      string;
  sortOrder?: number;
}

export interface CreateAttributeDefinitionInput {
  organizationId: string;
  key:            string;
  label:          string;
  type:           AttributeValueType;
  required?:      boolean;
  sortOrder?:     number;
  helpText?:      string | null;
  destination?:   string | null;
  /** Import provenance — defaults to "manual" */
  source?:        string;
  /** External field name when imported */
  externalRef?:   string | null;
  /** Options for select/multiselect types (ordered) */
  options?:       AttributeDefinitionOptionInput[];
}

export interface UpdateAttributeDefinitionInput {
  label?:       string;
  required?:    boolean;
  sortOrder?:   number;
  helpText?:    string | null;
  destination?: string | null;
  /** Full options replacement for select/multiselect */
  options?:     AttributeDefinitionOptionInput[];
}

// ── Display helpers ────────────────────────────────────────────────────────────

export const ATTRIBUTE_TYPE_LABELS: Record<AttributeValueType, string> = {
  text:        "Texto",
  number:      "Número",
  boolean:     "Sí / No",
  select:      "Selección única",
  multiselect: "Selección múltiple",
  dimension:   "Dimensión",
  color:       "Color",
};
