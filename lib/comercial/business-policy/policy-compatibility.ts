/**
 * lib/comercial/business-policy/policy-compatibility.ts
 *
 * Coverage Engine Compatibility Layer (FASE 9).
 * Prepares the bridge so Coverage Engine can migrate to Business Policy
 * without breaking existing behavior.
 *
 * Does NOT modify Coverage Engine behavior.
 * Only provides helpers to convert between the two systems.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicy,
  BusinessPolicyParameter,
  BusinessPolicyScopeBinding,
  PolicyResolutionContext,
} from "./policy-types";

// ── Coverage Rule → Business Policy Adapter ─────────────────────────────────

/**
 * Describes the shape of a Coverage Engine rule for conversion purposes.
 * This mirrors the coverage rule shape without importing it — no dependency on
 * Coverage Engine internals.
 */
export interface CoverageRuleShape {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly scopeValue?: string | null;
  readonly minQty: number;
  readonly idealQty: number;
  readonly maxQty: number;
  readonly priority?: number;
  readonly active?: boolean;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Converts a Coverage Engine rule into a Business Policy.
 * This is the bridge function that will be used when Coverage Engine
 * migrates to Business Policy.
 */
export function coverageRuleToPolicy(
  rule: CoverageRuleShape,
  tenantId: string,
): BusinessPolicy {
  const scopes = mapCoverageScope(rule.scope, rule.scopeValue ?? null);

  const parameters: BusinessPolicyParameter[] = [
    { name: "minQty", type: "NUMBER", value: rule.minQty, description: "Minimum stock quantity", unit: "units" },
    { name: "idealQty", type: "NUMBER", value: rule.idealQty, description: "Ideal stock quantity", unit: "units" },
    { name: "maxQty", type: "NUMBER", value: rule.maxQty, description: "Maximum stock quantity", unit: "units" },
  ];

  return {
    id: `coverage-${rule.id}`,
    tenantId,
    category: "COVERAGE",
    name: rule.name,
    description: `Converted from Coverage Engine rule "${rule.name}"`,
    scopes,
    conditions: [],
    actions: [
      { type: "SET_THRESHOLD", target: "stockLevel", value: { min: rule.minQty, ideal: rule.idealQty, max: rule.maxQty }, description: null },
    ],
    parameters,
    priority: rule.priority ?? 100,
    status: rule.active !== false ? "ACTIVE" : "DEPRECATED",
    versionInfo: {
      version: "1.0.0",
      createdAt: new Date(),
      createdBy: "coverage-migration",
      activatedAt: rule.active !== false ? new Date() : null,
      deprecatedAt: null,
      previousVersion: null,
      changeNote: "Auto-converted from Coverage Engine rule",
    },
    tags: ["coverage", "migrated"],
    metadata: rule.metadata ?? {},
  };
}

/**
 * Builds a PolicyResolutionContext from Coverage Engine input parameters.
 */
export function buildCoverageResolutionContext(params: {
  tenantId: string;
  storeId?: string;
  productClass?: string;
  subgroup?: string;
  sizeClass?: string;
  referenceCode?: string;
  businessLine?: string;
}): PolicyResolutionContext {
  const scopeBindings: BusinessPolicyScopeBinding[] = [
    { scope: "TENANT", scopeValue: params.tenantId },
  ];

  if (params.storeId) scopeBindings.push({ scope: "STORE", scopeValue: params.storeId });
  if (params.productClass) scopeBindings.push({ scope: "PRODUCT_CLASS", scopeValue: params.productClass });
  if (params.subgroup) scopeBindings.push({ scope: "SUBGROUP", scopeValue: params.subgroup });
  if (params.sizeClass) scopeBindings.push({ scope: "SIZE", scopeValue: params.sizeClass });
  if (params.referenceCode) scopeBindings.push({ scope: "REFERENCE", scopeValue: params.referenceCode });
  if (params.businessLine) scopeBindings.push({ scope: "BUSINESS_LINE", scopeValue: params.businessLine });

  return {
    tenantId: params.tenantId,
    category: "COVERAGE",
    scopeBindings,
    contextData: { ...params },
  };
}

// ── Scope Mapping ───────────────────────────────────────────────────────────

function mapCoverageScope(scope: string, scopeValue: string | null): BusinessPolicyScopeBinding[] {
  const mapping: Record<string, BusinessPolicyScopeBinding["scope"]> = {
    variant_override: "REFERENCE",
    reference: "REFERENCE",
    line_subgroup: "SUBGROUP",
    subgroup: "SUBGROUP",
    line: "BUSINESS_LINE",
    class_size: "SIZE",
    productClass: "PRODUCT_CLASS",
    store: "STORE",
    global: "GLOBAL",
  };

  const mapped = mapping[scope] ?? "GLOBAL";
  return [{ scope: mapped, scopeValue }];
}
