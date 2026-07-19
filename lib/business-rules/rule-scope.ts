/**
 * rule-scope.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Scope definitions controlling where a rule applies.
 *
 * Scopes can be broad (entire organization) or narrow (specific reference).
 * A rule matches scope when ALL specified scope fields match.
 * Unspecified fields mean "any".
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- Rule Scope -------------------------------------------------------------

/**
 * Defines where a rule applies.
 *
 * Every field is optional. Unspecified = matches all.
 * Multiple values in an array = matches any of them (OR within field).
 * Multiple fields specified = must match all fields (AND across fields).
 */
export interface RuleScope {
  /** Organization IDs this rule applies to (null = all orgs). */
  organizationIds: string[] | null;
  /** Entity types this rule evaluates (null = all types). */
  entityTypes: BusinessEntityType[] | null;
  /** Specific entity IDs (null = all entities of matching type). */
  entityIds: string[] | null;
  /** Business domains (null = all domains). */
  domains: string[] | null;
  /** Workflow definition IDs (null = all workflows). */
  workflowDefinitionIds: string[] | null;
  /** Workflow stages (null = all stages). */
  workflowStages: string[] | null;
  /** Vendor IDs (null = all vendors). */
  vendorIds: string[] | null;
  /** Portfolio IDs (null = all portfolios). */
  portfolioIds: string[] | null;
  /** Store IDs (null = all stores). */
  storeIds: string[] | null;
  /** Customer IDs (null = all customers). */
  customerIds: string[] | null;
  /** Product reference codes (null = all references). */
  productReferences: string[] | null;
  /** Location/warehouse IDs (null = all locations). */
  locationIds: string[] | null;
}

// -- Builder ----------------------------------------------------------------

/** Build a rule scope with defaults (all null = global). */
export function buildRuleScope(opts?: Partial<RuleScope>): RuleScope {
  return {
    organizationIds: opts?.organizationIds ?? null,
    entityTypes: opts?.entityTypes ?? null,
    entityIds: opts?.entityIds ?? null,
    domains: opts?.domains ?? null,
    workflowDefinitionIds: opts?.workflowDefinitionIds ?? null,
    workflowStages: opts?.workflowStages ?? null,
    vendorIds: opts?.vendorIds ?? null,
    portfolioIds: opts?.portfolioIds ?? null,
    storeIds: opts?.storeIds ?? null,
    customerIds: opts?.customerIds ?? null,
    productReferences: opts?.productReferences ?? null,
    locationIds: opts?.locationIds ?? null,
  };
}

/** Build a global scope (applies everywhere). */
export function globalScope(): RuleScope {
  return buildRuleScope();
}

/** Build an org-scoped rule. */
export function orgScope(organizationId: string): RuleScope {
  return buildRuleScope({ organizationIds: [organizationId] });
}

// -- Matching ---------------------------------------------------------------

/**
 * Check if a context matches a scope.
 *
 * The context provides the actual values; the scope defines constraints.
 * A null scope field means "matches all" for that dimension.
 * An array scope field means "matches if context value is in the array".
 */
export interface ScopeMatchContext {
  organizationId?: string;
  entityType?: string;
  entityId?: string;
  domain?: string;
  workflowDefinitionId?: string;
  workflowStage?: string;
  vendorId?: string;
  portfolioId?: string;
  storeId?: string;
  customerId?: string;
  productReference?: string;
  locationId?: string;
}

/** Check if a context matches a scope. Returns true if all specified constraints pass. */
export function matchesScope(scope: RuleScope, ctx: ScopeMatchContext): boolean {
  if (scope.organizationIds && ctx.organizationId && !scope.organizationIds.includes(ctx.organizationId)) return false;
  if (scope.entityTypes && ctx.entityType && !scope.entityTypes.includes(ctx.entityType as any)) return false;
  if (scope.entityIds && ctx.entityId && !scope.entityIds.includes(ctx.entityId)) return false;
  if (scope.domains && ctx.domain && !scope.domains.includes(ctx.domain)) return false;
  if (scope.workflowDefinitionIds && ctx.workflowDefinitionId && !scope.workflowDefinitionIds.includes(ctx.workflowDefinitionId)) return false;
  if (scope.workflowStages && ctx.workflowStage && !scope.workflowStages.includes(ctx.workflowStage)) return false;
  if (scope.vendorIds && ctx.vendorId && !scope.vendorIds.includes(ctx.vendorId)) return false;
  if (scope.portfolioIds && ctx.portfolioId && !scope.portfolioIds.includes(ctx.portfolioId)) return false;
  if (scope.storeIds && ctx.storeId && !scope.storeIds.includes(ctx.storeId)) return false;
  if (scope.customerIds && ctx.customerId && !scope.customerIds.includes(ctx.customerId)) return false;
  if (scope.productReferences && ctx.productReference && !scope.productReferences.includes(ctx.productReference)) return false;
  if (scope.locationIds && ctx.locationId && !scope.locationIds.includes(ctx.locationId)) return false;
  return true;
}
