/**
 * lib/comercial/business-policy/templates/store/store-policy-template-types.ts
 *
 * Canonical types for Store Policy Templates.
 * Templates declare the shape of a rule — never specific values.
 *
 * Sprint: STORE-POLICY-TEMPLATES-01
 */

import type {
  PolicyCategory,
  PolicyScope,
  ConditionOperator,
  PolicyActionType,
  PolicyParameterType,
} from "../../policy-types";

// ── Template Types ──────────────────────────────────────────────────────────

export type StorePolicyTemplateType =
  | "STORE_COVERAGE"
  | "STORE_ASSORTMENT"
  | "STORE_SIZE_TARGET"
  | "STORE_STOCK_RESTRICTION"
  | "STORE_PRODUCT_EXCEPTION"
  | "STORE_DEVIATION_ALERT"
  | "STORE_TRANSFER"
  | "STORE_ROTATION"
  | "STORE_MARKDOWN"
  | "STORE_CAPACITY";

export const ACTIVE_TEMPLATE_TYPES: readonly StorePolicyTemplateType[] = [
  "STORE_COVERAGE",
  "STORE_ASSORTMENT",
  "STORE_SIZE_TARGET",
  "STORE_STOCK_RESTRICTION",
  "STORE_PRODUCT_EXCEPTION",
  "STORE_DEVIATION_ALERT",
] as const;

export const PLANNED_TEMPLATE_TYPES: readonly StorePolicyTemplateType[] = [
  "STORE_TRANSFER",
  "STORE_ROTATION",
  "STORE_MARKDOWN",
  "STORE_CAPACITY",
] as const;

export const ALL_STORE_TEMPLATE_TYPES: readonly StorePolicyTemplateType[] = [
  ...ACTIVE_TEMPLATE_TYPES,
  ...PLANNED_TEMPLATE_TYPES,
] as const;

// ── Template Status ─────────────────────────────────────────────────────────

export type TemplateStatus = "ACTIVE" | "PLANNED" | "DEPRECATED";

// ── Parameter Descriptor ────────────────────────────────────────────────────

export interface TemplateParameterDescriptor {
  readonly name: string;
  readonly type: PolicyParameterType;
  readonly description: string;
  readonly unit: string | null;
  readonly required: boolean;
  readonly defaultValue: unknown;
  readonly constraints: ParameterConstraints | null;
}

export interface ParameterConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly allowedValues?: readonly unknown[];
  readonly pattern?: string;
}

// ── Condition Descriptor ────────────────────────────────────────────────────

export interface TemplateConditionDescriptor {
  readonly field: string;
  readonly description: string;
  readonly allowedOperators: readonly ConditionOperator[];
  readonly valueType: PolicyParameterType;
  readonly required: boolean;
}

// ── Action Descriptor ───────────────────────────────────────────────────────

export interface TemplateActionDescriptor {
  readonly type: PolicyActionType;
  readonly target: string;
  readonly description: string;
  readonly required: boolean;
}

// ── Precedence Group ────────────────────────────────────────────────────────

/**
 * When multiple templates produce policies in the same category,
 * precedenceGroup determines evaluation order.
 * Lower number = evaluated first = can be overridden by higher.
 */
export type PrecedenceGroup =
  | "BASE"         // 100 — foundational defaults
  | "STANDARD"     // 200 — normal business rules
  | "EXCEPTION"    // 300 — overrides for specific cases
  | "RESTRICTION"  // 400 — hard limits and blocks
  | "ALERT";       // 500 — monitoring, no action

export const PRECEDENCE_VALUES: Record<PrecedenceGroup, number> = {
  BASE: 100,
  STANDARD: 200,
  EXCEPTION: 300,
  RESTRICTION: 400,
  ALERT: 500,
};

// ── Store Policy Template ───────────────────────────────────────────────────

export interface StorePolicyTemplate {
  readonly templateId: string;
  readonly templateType: StorePolicyTemplateType;
  readonly category: PolicyCategory;
  readonly displayName: string;
  readonly description: string;
  readonly supportedScopes: readonly PolicyScope[];
  readonly supportedConditions: readonly TemplateConditionDescriptor[];
  readonly supportedActions: readonly TemplateActionDescriptor[];
  readonly requiredParameters: readonly TemplateParameterDescriptor[];
  readonly optionalParameters: readonly TemplateParameterDescriptor[];
  readonly precedenceGroup: PrecedenceGroup;
  readonly status: TemplateStatus;
  readonly version: string;
  readonly metadata: TemplateMetadata;
}

// ── Template Metadata ───────────────────────────────────────────────────────

export interface TemplateMetadata {
  readonly author: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly usageHint: string;
  readonly compatibleEngines: readonly string[];
  readonly tags: readonly string[];
}

// ── Template Instantiation Input ────────────────────────────────────────────

export interface TemplateInstantiationInput {
  readonly templateId: string;
  readonly tenantId: string;
  readonly policyName: string;
  readonly policyDescription: string | null;
  readonly scopeBindings: readonly { scope: PolicyScope; scopeValue: string | null }[];
  readonly parameterValues: Record<string, unknown>;
  readonly conditionValues: readonly { field: string; operator: ConditionOperator; value: unknown }[];
  readonly priority: number;
  readonly createdBy: string;
  readonly tags: readonly string[];
}

// ── Template Validation ─────────────────────────────────────────────────────

export type TemplateValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface TemplateValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: TemplateValidationSeverity;
}

export interface TemplateValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TemplateValidationIssue[];
}
