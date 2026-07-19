/**
 * tenant-rule-resolver.ts
 *
 * TENANT-BUSINESS-RULES-CONFIG-01 — Phase 5: Rule Resolver.
 *
 * The single entry point for engines to query business rules.
 * Engines NEVER access the registry directly.
 * Engines NEVER hardcode thresholds.
 *
 * Resolver translates tenant rules into engine-consumable shapes.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { MaletaReplacementRule } from "@/lib/commercial-intelligence/availability-types";
import type {
  TenantBusinessRule,
  TenantThresholdRule,
  TenantRuleCategory,
  TenantRuleEvidence,
} from "./tenant-rule-types";
import { getActiveTenantRules, getTenantRulesByCategory } from "./tenant-rule-registry";

// ── Phase 5: Generic Resolvers ──────────────────────────────────────────────

/**
 * Resolve all active tenant rules.
 * Use this when you need the full rule set.
 */
export function resolveTenantRules(orgSlug: string): TenantBusinessRule[] {
  return getActiveTenantRules(orgSlug);
}

/**
 * Resolve all threshold rules for a tenant.
 * Returns simplified TenantThresholdRule objects for easy consumption.
 */
export function resolveThresholdRules(orgSlug: string): TenantThresholdRule[] {
  const rules = getActiveTenantRules(orgSlug);
  return rules
    .filter((r) => r.condition.type === "INVENTORY_THRESHOLD" || r.condition.type === "PRODUCTION_DAYS_THRESHOLD" || r.condition.type === "CUSTOM_NUMERIC")
    .map((r) => ({
      ruleId: r.ruleId,
      target: r.scope.target,
      scopeType: r.scope.type,
      threshold: r.condition.threshold,
      operator: r.condition.operator,
      category: r.category,
      severity: r.severity,
      sourceAuthor: r.source.author,
      suggestedActions: r.suggestedActions.map((a) => a.type),
    }));
}

// ── Phase 6: Inventory Threshold Resolver ───────────────────────────────────

/**
 * Resolve inventory threshold rules for a tenant.
 * Returns MaletaReplacementRule[] — the shape consumed by:
 *   - Commercial Availability Engine
 *   - Replenishment Intelligence
 *   - Production Flow Intelligence
 *   - LiveVendor Foundation
 *
 * This bridges the tenant rule system with the existing engine interface.
 */
export function resolveInventoryThresholds(orgSlug: string): MaletaReplacementRule[] {
  const inventoryRules = getTenantRulesByCategory(orgSlug, "INVENTORY");

  return inventoryRules
    .filter((r) =>
      r.condition.type === "INVENTORY_THRESHOLD" &&
      r.scope.type === "SUB_LINEA",
    )
    .map((r) => ({
      subLinea: r.scope.target,
      threshold: r.condition.threshold,
    }));
}

/**
 * Resolve the inventory threshold for a specific sub-line.
 * Returns null if no rule is configured for this sub-line.
 */
export function resolveInventoryThresholdForSubLinea(
  orgSlug: string,
  subLinea: string,
): MaletaReplacementRule | null {
  const rules = resolveInventoryThresholds(orgSlug);
  return rules.find((r) =>
    r.subLinea.toUpperCase() === subLinea.toUpperCase(),
  ) ?? null;
}

// ── Phase 9: Production Rule Resolver ───────────────────────────────────────

/**
 * Resolve production-related rules for a tenant.
 * Currently returns inventory thresholds (used by Production Flow for
 * availability impact assessment). Can be extended with production-specific
 * rules in the future.
 */
export function resolveProductionRules(orgSlug: string): MaletaReplacementRule[] {
  return resolveInventoryThresholds(orgSlug);
}

// ── Phase 8: Portfolio Rule Resolver ────────────────────────────────────────

/**
 * Resolve portfolio (maleta) rules for a tenant.
 * Currently returns inventory thresholds (used by LiveVendor for
 * portfolio coverage assessment). Can be extended with portfolio-specific
 * rules in the future.
 */
export function resolvePortfolioRules(orgSlug: string): MaletaReplacementRule[] {
  return resolveInventoryThresholds(orgSlug);
}

// ── Phase 7: Store Rule Resolver ────────────────────────────────────────────

/**
 * Resolve store-level rules for a tenant.
 * Placeholder for future per-store threshold rules.
 */
export function resolveStoreRules(orgSlug: string): TenantThresholdRule[] {
  return resolveThresholdRules(orgSlug).filter((r) => r.scopeType === "STORE");
}

// ── Phase 10: Signal Rule Resolver ──────────────────────────────────────────

/**
 * Resolve which signal types should be generated when a rule fires.
 * Maps tenant rules to signal categories.
 */
export function resolveSignalRulesForCategory(
  orgSlug: string,
  category: TenantRuleCategory,
): TenantThresholdRule[] {
  return resolveThresholdRules(orgSlug).filter((r) => r.category === category);
}

// ── Phase 11: Decision Context Builder ──────────────────────────────────────

/**
 * Build decision context from a rule evaluation.
 * Decision Engine uses this to know what rule fired and why.
 */
export function buildRuleDecisionContext(opts: {
  rule: TenantThresholdRule;
  observedValue: number;
  entityId: string;
  orgSlug: string;
}): TenantRuleEvidence {
  const { rule, observedValue, entityId, orgSlug } = opts;
  return {
    ruleId: rule.ruleId,
    ruleName: `${rule.target} ${operatorLabel(rule.operator)} ${rule.threshold}`,
    orgSlug,
    matched: evaluateThreshold(observedValue, rule.operator, rule.threshold),
    observedValue,
    configuredThreshold: rule.threshold,
    operator: rule.operator,
    entityId,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Evaluation Helpers ──────────────────────────────────────────────────────

/** Evaluate a threshold comparison. */
export function evaluateThreshold(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case "lte": return value <= threshold;
    case "lt":  return value < threshold;
    case "gte": return value >= threshold;
    case "gt":  return value > threshold;
    case "eq":  return value === threshold;
    case "neq": return value !== threshold;
    default:    return false;
  }
}

function operatorLabel(op: string): string {
  switch (op) {
    case "lte": return "<=";
    case "lt":  return "<";
    case "gte": return ">=";
    case "gt":  return ">";
    case "eq":  return "=";
    case "neq": return "!=";
    default:    return op;
  }
}
