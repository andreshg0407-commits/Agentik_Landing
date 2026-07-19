/**
 * lib/comercial/business-policy/policy-types.ts
 *
 * Canonical types for the Business Policy Platform.
 * Pure contracts — no logic, no imports beyond type refs.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

// ── Policy Categories (FASE 2) ─────────────────────────────────────────────

export type PolicyCategory =
  | "COVERAGE"
  | "STORE"
  | "REPLENISHMENT"
  | "ORDER"
  | "VENDOR"
  | "CUSTOMER"
  | "INVENTORY"
  | "IMPORT"
  | "MARKDOWN"
  | "ALERT"
  | "REPORT"
  | "GENERAL";

export const ALL_POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "COVERAGE",
  "STORE",
  "REPLENISHMENT",
  "ORDER",
  "VENDOR",
  "CUSTOMER",
  "INVENTORY",
  "IMPORT",
  "MARKDOWN",
  "ALERT",
  "REPORT",
  "GENERAL",
] as const;

// ── Policy Scopes (FASE 3) ──────────────────────────────────────────────────

export type PolicyScope =
  | "GLOBAL"
  | "TENANT"
  | "BUSINESS_LINE"
  | "STORE"
  | "WAREHOUSE"
  | "PRODUCT"
  | "PRODUCT_CLASS"
  | "SUBGROUP"
  | "SIZE"
  | "CUSTOMER"
  | "VENDOR"
  | "ORDER"
  | "REFERENCE";

export const ALL_POLICY_SCOPES: readonly PolicyScope[] = [
  "GLOBAL",
  "TENANT",
  "BUSINESS_LINE",
  "STORE",
  "WAREHOUSE",
  "PRODUCT",
  "PRODUCT_CLASS",
  "SUBGROUP",
  "SIZE",
  "CUSTOMER",
  "VENDOR",
  "ORDER",
  "REFERENCE",
] as const;

/**
 * Lower number = more specific = wins when multiple policies match.
 * REFERENCE beats PRODUCT beats SUBGROUP ... beats GLOBAL.
 */
export const SCOPE_SPECIFICITY: Record<PolicyScope, number> = {
  REFERENCE: 1,
  SIZE: 2,
  PRODUCT: 3,
  SUBGROUP: 4,
  PRODUCT_CLASS: 5,
  WAREHOUSE: 6,
  STORE: 7,
  CUSTOMER: 8,
  VENDOR: 9,
  ORDER: 10,
  BUSINESS_LINE: 11,
  TENANT: 12,
  GLOBAL: 13,
};

// ── Policy Parameter ────────────────────────────────────────────────────────

export type PolicyParameterType = "NUMBER" | "STRING" | "BOOLEAN" | "ENUM" | "JSON";

export interface BusinessPolicyParameter {
  readonly name: string;
  readonly type: PolicyParameterType;
  readonly value: unknown;
  readonly description: string | null;
  readonly unit: string | null;
}

// ── Policy Condition ────────────────────────────────────────────────────────

export type ConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_OR_EQUAL"
  | "LESS_OR_EQUAL"
  | "IN"
  | "NOT_IN"
  | "CONTAINS"
  | "STARTS_WITH"
  | "IS_NULL"
  | "IS_NOT_NULL";

export interface BusinessPolicyCondition {
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value: unknown;
  readonly description: string | null;
}

// ── Policy Action ───────────────────────────────────────────────────────────

export type PolicyActionType =
  | "SET_THRESHOLD"
  | "SET_FLAG"
  | "SET_VALUE"
  | "APPLY_FORMULA"
  | "OVERRIDE"
  | "RESTRICT"
  | "ALLOW"
  | "NOTIFY";

export interface BusinessPolicyAction {
  readonly type: PolicyActionType;
  readonly target: string;
  readonly value: unknown;
  readonly description: string | null;
}

// ── Policy Version (FASE 5) ────────────────────────────────────────────────

export interface BusinessPolicyVersion {
  readonly version: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly activatedAt: Date | null;
  readonly deprecatedAt: Date | null;
  readonly previousVersion: string | null;
  readonly changeNote: string | null;
}

// ── Policy Scope Binding ────────────────────────────────────────────────────

export interface BusinessPolicyScopeBinding {
  readonly scope: PolicyScope;
  readonly scopeValue: string | null;
}

// ── Business Policy (FASE 1) ────────────────────────────────────────────────

export type PolicyStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";

export interface BusinessPolicy {
  readonly id: string;
  readonly tenantId: string;
  readonly category: PolicyCategory;
  readonly name: string;
  readonly description: string | null;

  readonly scopes: readonly BusinessPolicyScopeBinding[];
  readonly conditions: readonly BusinessPolicyCondition[];
  readonly actions: readonly BusinessPolicyAction[];
  readonly parameters: readonly BusinessPolicyParameter[];

  readonly priority: number;
  readonly status: PolicyStatus;
  readonly versionInfo: BusinessPolicyVersion;

  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
}

// ── Resolution Context ──────────────────────────────────────────────────────

export interface PolicyResolutionContext {
  readonly tenantId: string;
  readonly category: PolicyCategory;
  readonly scopeBindings: readonly BusinessPolicyScopeBinding[];
  readonly contextData: Record<string, unknown>;
}

// ── Resolution Result ───────────────────────────────────────────────────────

export interface PolicyResolutionCandidate {
  readonly policy: BusinessPolicy;
  readonly matchScore: number;
  readonly matchedScopes: readonly PolicyScope[];
  readonly matchedConditions: number;
  readonly totalConditions: number;
}

export interface PolicyResolutionResult {
  readonly resolved: boolean;
  readonly selectedPolicy: BusinessPolicy | null;
  readonly candidates: readonly PolicyResolutionCandidate[];
  readonly discarded: readonly PolicyResolutionDiscard[];
  readonly evidence: BusinessPolicyEvidence;
  readonly resolvedAt: Date;
}

export interface PolicyResolutionDiscard {
  readonly policy: BusinessPolicy;
  readonly reason: DiscardReason;
  readonly detail: string;
}

export type DiscardReason =
  | "INACTIVE"
  | "WRONG_TENANT"
  | "WRONG_CATEGORY"
  | "SCOPE_MISMATCH"
  | "CONDITION_FAILED"
  | "LOWER_PRIORITY"
  | "DEPRECATED"
  | "SUPERSEDED";

// ── Evaluation (FASE 1) ────────────────────────────────────────────────────

export interface BusinessPolicyEvaluation {
  readonly policyId: string;
  readonly policyName: string;
  readonly tenantId: string;
  readonly category: PolicyCategory;
  readonly parameters: readonly BusinessPolicyParameter[];
  readonly actions: readonly BusinessPolicyAction[];
  readonly evaluatedAt: Date;
  readonly evidence: BusinessPolicyEvidence;
}

// ── Evidence (FASE 6) ──────────────────────────────────────────────────────

export interface BusinessPolicyEvidence {
  readonly domain: "BUSINESS_POLICY";
  readonly traceId: string;
  readonly tenantId: string;
  readonly category: PolicyCategory;

  readonly selectedPolicyId: string | null;
  readonly selectedPolicyName: string | null;
  readonly selectedPolicyVersion: string | null;
  readonly selectedPriority: number | null;

  readonly candidateCount: number;
  readonly discardedCount: number;
  readonly discardReasons: readonly string[];

  readonly resolutionPath: readonly string[];
  readonly confidence: number;
  readonly observedAt: Date;
  readonly note: string | null;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type PolicyValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface PolicyValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: PolicyValidationSeverity;
}

export interface PolicyValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PolicyValidationIssue[];
}

// ── Registry Entry (FASE 7) ────────────────────────────────────────────────

export interface PolicyRegistryEntry {
  readonly category: PolicyCategory;
  readonly label: string;
  readonly description: string;
  readonly allowedScopes: readonly PolicyScope[];
  readonly requiredParameters: readonly string[];
  readonly optionalParameters: readonly string[];
  readonly version: string;
}
