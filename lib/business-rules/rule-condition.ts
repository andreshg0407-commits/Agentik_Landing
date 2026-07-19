/**
 * rule-condition.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Declarative condition model for business rules.
 *
 * Conditions are evaluated against a flat data context.
 * They support simple comparisons and compound logic (all/any/none).
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Condition Operator -----------------------------------------------------

/** Comparison operators for simple conditions. */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "in"
  | "not_in"
  | "between"
  | "matches";

// -- Condition Source -------------------------------------------------------

/** Where the condition reads its data from. */
export type ConditionSource =
  | "event.payload"
  | "event.metadata"
  | "signal.context"
  | "signal.metadata"
  | "entity.health"
  | "entity.state"
  | "entity.metrics"
  | "entity.metadata"
  | "knowledge.relations"
  | "reasoning.risks"
  | "reasoning.findings"
  | "workflow.currentStage"
  | "workflow.metadata"
  | "metrics"
  | "metadata"
  | "context";

// -- Simple Condition -------------------------------------------------------

/** A single condition comparing a field to a value. */
export interface SimpleCondition {
  kind: "simple";
  /** The field path to evaluate (e.g. "inventory_available", "status"). */
  field: string;
  /** Comparison operator. */
  operator: ConditionOperator;
  /** Expected value(s). Null for exists/not_exists. Array for in/not_in/between. */
  value: unknown;
  /** Where to read the field from. */
  source: ConditionSource;
}

// -- Compound Condition -----------------------------------------------------

/** A compound condition combining multiple sub-conditions. */
export interface CompoundCondition {
  kind: "compound";
  /** Logical combinator. */
  logic: "all" | "any" | "none";
  /** Sub-conditions. */
  conditions: RuleCondition[];
}

// -- Rule Condition (union) -------------------------------------------------

/** A rule condition — either simple or compound. */
export type RuleCondition = SimpleCondition | CompoundCondition;

// -- Builders ---------------------------------------------------------------

/** Build a simple condition. */
export function simpleCondition(
  field: string,
  operator: ConditionOperator,
  value: unknown,
  source: ConditionSource = "context",
): SimpleCondition {
  return { kind: "simple", field, operator, value, source };
}

/** Build a compound "all" condition (AND). */
export function allConditions(...conditions: RuleCondition[]): CompoundCondition {
  return { kind: "compound", logic: "all", conditions };
}

/** Build a compound "any" condition (OR). */
export function anyConditions(...conditions: RuleCondition[]): CompoundCondition {
  return { kind: "compound", logic: "any", conditions };
}

/** Build a compound "none" condition (NOT ANY). */
export function noneConditions(...conditions: RuleCondition[]): CompoundCondition {
  return { kind: "compound", logic: "none", conditions };
}

// -- Evaluation -------------------------------------------------------------

/** Result of evaluating a single condition. */
export interface ConditionEvalResult {
  condition: RuleCondition;
  matched: boolean;
  /** Actual value found (null if field not found). */
  actualValue: unknown;
  /** Reason for the result. */
  reason: string;
}

/**
 * Evaluate a condition against a flat data context.
 *
 * The data context is a Record<string, unknown> where keys are field names.
 * For this first implementation, the source field is informational —
 * the caller must flatten the appropriate source into the data map.
 */
export function evaluateCondition(
  condition: RuleCondition,
  data: Record<string, unknown>,
): ConditionEvalResult {
  if (condition.kind === "compound") {
    return evaluateCompound(condition, data);
  }
  return evaluateSimple(condition, data);
}

function evaluateSimple(
  c: SimpleCondition,
  data: Record<string, unknown>,
): ConditionEvalResult {
  const actual = data[c.field];
  const missing = actual === undefined || actual === null;

  // exists / not_exists
  if (c.operator === "exists") {
    return { condition: c, matched: !missing, actualValue: actual, reason: missing ? `${c.field} not found` : `${c.field} exists` };
  }
  if (c.operator === "not_exists") {
    return { condition: c, matched: missing, actualValue: actual, reason: missing ? `${c.field} not found` : `${c.field} exists` };
  }

  if (missing) {
    return { condition: c, matched: false, actualValue: null, reason: `${c.field} not found in data` };
  }

  let matched = false;
  switch (c.operator) {
    case "equals":
      matched = actual === c.value;
      break;
    case "not_equals":
      matched = actual !== c.value;
      break;
    case "greater_than":
      matched = typeof actual === "number" && typeof c.value === "number" && actual > c.value;
      break;
    case "greater_or_equal":
      matched = typeof actual === "number" && typeof c.value === "number" && actual >= c.value;
      break;
    case "less_than":
      matched = typeof actual === "number" && typeof c.value === "number" && actual < c.value;
      break;
    case "less_or_equal":
      matched = typeof actual === "number" && typeof c.value === "number" && actual <= c.value;
      break;
    case "contains":
      matched = typeof actual === "string" && typeof c.value === "string" && actual.includes(c.value);
      break;
    case "not_contains":
      matched = typeof actual === "string" && typeof c.value === "string" && !actual.includes(c.value);
      break;
    case "in":
      matched = Array.isArray(c.value) && c.value.includes(actual);
      break;
    case "not_in":
      matched = Array.isArray(c.value) && !c.value.includes(actual);
      break;
    case "between":
      if (Array.isArray(c.value) && c.value.length === 2 && typeof actual === "number") {
        matched = actual >= (c.value[0] as number) && actual <= (c.value[1] as number);
      }
      break;
    case "matches":
      if (typeof actual === "string" && typeof c.value === "string") {
        try { matched = new RegExp(c.value).test(actual); } catch { matched = false; }
      }
      break;
  }

  return {
    condition: c,
    matched,
    actualValue: actual,
    reason: matched
      ? `${c.field} ${c.operator} ${JSON.stringify(c.value)} → true (actual: ${JSON.stringify(actual)})`
      : `${c.field} ${c.operator} ${JSON.stringify(c.value)} → false (actual: ${JSON.stringify(actual)})`,
  };
}

function evaluateCompound(
  c: CompoundCondition,
  data: Record<string, unknown>,
): ConditionEvalResult {
  const results = c.conditions.map(sub => evaluateCondition(sub, data));

  let matched: boolean;
  switch (c.logic) {
    case "all":
      matched = results.every(r => r.matched);
      break;
    case "any":
      matched = results.some(r => r.matched);
      break;
    case "none":
      matched = results.every(r => !r.matched);
      break;
  }

  const matchedCount = results.filter(r => r.matched).length;
  return {
    condition: c,
    matched,
    actualValue: { matchedCount, totalCount: results.length },
    reason: `${c.logic}(${matchedCount}/${results.length})`,
  };
}
