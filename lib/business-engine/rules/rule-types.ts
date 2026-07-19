/**
 * rule-types.ts
 *
 * AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01
 * Business Rule Engine — separates events from reactions.
 *
 * Event → Rule Engine → Action Engine → Destination
 *
 * Rules are tenant-configurable. New rules can be added
 * without modifying any module.
 */

import type { EventType, EventDomain } from "../events/event-types";

// ── Rule Condition ────────────────────────────────────────────────────────────

/** Operator for evaluating conditions. */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists";

/** A single condition that must be met for a rule to fire. */
export interface RuleCondition {
  /** The field path in the event payload to evaluate (dot notation). */
  field: string;
  /** The comparison operator. */
  operator: ConditionOperator;
  /** The value to compare against. */
  value: unknown;
}

// ── Rule Action ───────────────────────────────────────────────────────────────

/** An action to execute when a rule fires. */
export interface RuleAction {
  /** The action type (maps to Action Engine handlers). */
  type: string;
  /** Configuration for the action. */
  config: Record<string, unknown>;
  /** Execution priority (lower = first). */
  priority: number;
}

// ── Business Rule ─────────────────────────────────────────────────────────────

/** A tenant-configurable business rule. */
export interface BusinessRule {
  /** Unique rule ID. */
  id: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this rule does. */
  description: string;
  /** Event types that trigger this rule (supports wildcards). */
  triggerEvents: string[];
  /** Domain scope (null = all domains). */
  domain: EventDomain | null;
  /** All conditions must be true for the rule to fire. */
  conditions: RuleCondition[];
  /** Actions to execute when the rule fires. */
  actions: RuleAction[];
  /** Whether this rule is active. */
  isActive: boolean;
  /** Priority for ordering rule evaluation (lower = first). */
  priority: number;
  /** Maximum times this rule can fire per hour (0 = unlimited). */
  rateLimit: number;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last modification. */
  updatedAt: string;
}

// ── Rule Evaluation Result ────────────────────────────────────────────────────

/** Result of evaluating a rule against an event. */
export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionsEvaluated: number;
  conditionsMet: number;
  actionsTriggered: string[];
  evaluatedAt: string;
}

// ── Rule Engine Interface ─────────────────────────────────────────────────────

/** Contract for the Business Rule Engine. */
export interface IRuleEngine {
  /** Evaluate all active rules against a business event. */
  evaluate(organizationId: string, event: { type: string; domain: string; payload: Record<string, unknown> }): Promise<RuleEvaluationResult[]>;
  /** Get all rules for a tenant. */
  listRules(organizationId: string, domain?: EventDomain | null): Promise<BusinessRule[]>;
  /** Create or update a rule. */
  saveRule(rule: BusinessRule): Promise<BusinessRule>;
  /** Delete a rule. */
  deleteRule(ruleId: string): Promise<void>;
  /** Test a rule against a sample event without executing actions. */
  testRule(rule: BusinessRule, sampleEvent: { type: string; payload: Record<string, unknown> }): Promise<RuleEvaluationResult>;
}
