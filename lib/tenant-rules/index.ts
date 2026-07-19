/**
 * index.ts
 *
 * TENANT-BUSINESS-RULES-CONFIG-01
 * Client-safe barrel export for Tenant Business Rules.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// Types
export type {
  TenantBusinessRule,
  TenantRuleSet,
  TenantRuleCategory,
  TenantRuleScope,
  TenantRuleScopeType,
  TenantRuleCondition,
  TenantRuleConditionType,
  TenantRuleOperator,
  TenantRuleSuggestedAction,
  TenantRuleActionType,
  TenantRuleSeverity,
  TenantRulePriority,
  TenantRuleStatus,
  TenantRuleSource,
  TenantRuleSourceType,
  TenantRuleGovernance,
  TenantThresholdRule,
  TenantRuleEvidence,
} from "./tenant-rule-types";

export { TENANT_RULE_CATEGORIES } from "./tenant-rule-types";

// Registry
export {
  getTenantRuleSet,
  getActiveTenantRules,
  getTenantRulesByCategory,
  getRegisteredTenants,
} from "./tenant-rule-registry";

// Resolver
export {
  resolveTenantRules,
  resolveThresholdRules,
  resolveInventoryThresholds,
  resolveInventoryThresholdForSubLinea,
  resolveProductionRules,
  resolvePortfolioRules,
  resolveStoreRules,
  resolveSignalRulesForCategory,
  buildRuleDecisionContext,
  evaluateThreshold,
} from "./tenant-rule-resolver";
