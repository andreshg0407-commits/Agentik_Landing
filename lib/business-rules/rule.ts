/**
 * rule.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Core BusinessRule interface — the central governance policy definition.
 *
 * A rule evaluates conditions and suggests outcomes.
 * It does NOT execute actions.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleCategory, RuleSeverity, RulePriority, RuleEntityRef } from "./rule-types";
import type { RuleScope } from "./rule-scope";
import type { RuleTrigger } from "./rule-trigger";
import type { RuleCondition } from "./rule-condition";

// -- Rule Status --------------------------------------------------------------

/** Lifecycle status of a rule definition. */
export type RuleStatus =
  | "draft"
  | "active"
  | "paused"
  | "deprecated"
  | "archived";

// -- Suggested Action ---------------------------------------------------------

/** An action suggested by a rule when conditions match. */
export interface RuleSuggestedAction {
  /** Unique action ID within this rule. */
  actionId: string;
  /** Human-readable label. */
  label: string;
  /** Action type (for downstream routing). */
  actionType: string;
  /** Priority within this rule's actions. */
  priority: number;
  /** Parameters the action would need. */
  parameters: Record<string, unknown>;
  /** MANDATORY: actions are suggestions only until Action Engine exists. */
  suggestedOnly: true;
}

// -- Suggested Outcome --------------------------------------------------------

/** The outcome a rule suggests when its conditions match. */
export interface RuleSuggestedOutcome {
  /** Outcome severity (may differ from rule severity). */
  severity: RuleSeverity;
  /** Human-readable summary of what this outcome means. */
  summary: string;
  /** Detailed description. */
  description: string;
  /** Suggested actions. */
  suggestedActions: RuleSuggestedAction[];
  /** Tags for categorization/filtering. */
  tags: string[];
  /** MANDATORY: outcomes are suggestions only. */
  suggestedOnly: true;
}

// -- Business Rule ------------------------------------------------------------

/** A business governance rule definition. */
export interface BusinessRule {
  /** Unique rule ID. */
  ruleId: string;
  /** Organization that owns this rule (null = system-wide). */
  orgSlug: string | null;
  /** Human-readable rule name. */
  name: string;
  /** Rule description explaining its business purpose. */
  description: string;
  /** Business domain category. */
  category: RuleCategory;
  /** Default severity when this rule fires. */
  severity: RuleSeverity;
  /** Evaluation priority (higher = evaluated first). */
  priority: RulePriority;
  /** Current lifecycle status. */
  status: RuleStatus;
  /** Version number (incremented on updates). */
  version: number;

  // -- Trigger & Scope --------------------------------------------------------

  /** When this rule should be evaluated. Multiple triggers = OR. */
  triggers: RuleTrigger[];
  /** Where this rule applies. */
  scope: RuleScope;

  // -- Conditions -------------------------------------------------------------

  /** Root condition tree. Must match for rule to fire. */
  condition: RuleCondition;

  // -- Outcome ----------------------------------------------------------------

  /** What happens when the rule matches. */
  outcome: RuleSuggestedOutcome;

  // -- Metadata ---------------------------------------------------------------

  /** Entity references relevant to this rule definition. */
  relatedEntities: RuleEntityRef[];
  /** Whether this rule can be disabled by org admins. */
  tenantConfigurable: boolean;
  /** Who created the rule. */
  createdBy: string;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}
