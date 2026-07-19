/**
 * rule-registry.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * In-memory rule storage and lookup.
 *
 * Rules can be registered, queried, and filtered.
 * Supports tenant-scoped and system-wide rules.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessRule } from "./rule";
import type { RuleCategory, RulePriority, RuleSeverity } from "./rule-types";
import type { RuleTriggerType } from "./rule-trigger";

// -- Rule Filter --------------------------------------------------------------

/** Filter criteria for querying rules. */
export interface RuleFilter {
  orgSlug?: string | null;
  category?: RuleCategory;
  severity?: RuleSeverity;
  priority?: RulePriority;
  status?: BusinessRule["status"];
  triggerType?: RuleTriggerType;
  tenantConfigurable?: boolean;
}

// -- Rule Registry ------------------------------------------------------------

/** In-memory rule registry. */
export class RuleRegistry {
  private rules = new Map<string, BusinessRule>();

  /** Register a rule. Overwrites if same ruleId exists. */
  register(rule: BusinessRule): void {
    this.rules.set(rule.ruleId, rule);
  }

  /** Register multiple rules. */
  registerAll(rules: BusinessRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /** Get a rule by ID. */
  get(ruleId: string): BusinessRule | undefined {
    return this.rules.get(ruleId);
  }

  /** Remove a rule by ID. */
  remove(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /** Get all registered rules. */
  all(): BusinessRule[] {
    return Array.from(this.rules.values());
  }

  /** Get rules matching a filter. */
  query(filter: RuleFilter): BusinessRule[] {
    let result = this.all();

    if (filter.orgSlug !== undefined) {
      result = result.filter(r =>
        r.orgSlug === filter.orgSlug || r.orgSlug === null,
      );
    }
    if (filter.category) {
      result = result.filter(r => r.category === filter.category);
    }
    if (filter.severity) {
      result = result.filter(r => r.severity === filter.severity);
    }
    if (filter.priority) {
      result = result.filter(r => r.priority === filter.priority);
    }
    if (filter.status) {
      result = result.filter(r => r.status === filter.status);
    }
    if (filter.triggerType) {
      result = result.filter(r =>
        r.triggers.some(t => t.triggerType === filter.triggerType),
      );
    }
    if (filter.tenantConfigurable !== undefined) {
      result = result.filter(r => r.tenantConfigurable === filter.tenantConfigurable);
    }

    return result;
  }

  /** Get active rules for an org (includes system-wide rules). */
  activeForOrg(orgSlug: string): BusinessRule[] {
    return this.query({ orgSlug, status: "active" });
  }

  /** Get rules by category. */
  byCategory(category: RuleCategory): BusinessRule[] {
    return this.query({ category });
  }

  /** Total registered rules. */
  size(): number {
    return this.rules.size;
  }

  /** Clear all rules. */
  clear(): void {
    this.rules.clear();
  }
}
