/**
 * lib/reconciliation/rules/rule-types.ts
 *
 * AGENTIK-RECON-RULES-ENGINE-01 — Phase 1: Rule Domain Model
 *
 * Formal generic type surface for configurable reconciliation rules.
 *
 * Design principles:
 *   - Rules are DATA, not code. They are configured, stored, and executed.
 *   - Each rule maps a sourceField → targetField comparison via an operator.
 *   - Rules carry their own weight — no hardcoded scoring constants in the UI layer.
 *   - RuleExecutionResult references ScoreItem from engine-types to stay compatible
 *     with the existing MatchScore / MatchExplanation surface.
 *   - No Prisma, no DB, no side effects. Pure TypeScript.
 *
 * Relationship to existing engine:
 *   - scoring.ts has hardcoded field weights for the UNIVERSAL engine pass.
 *   - These rule types provide a CONFIGURABLE layer on top: operators and weights
 *     can be adjusted per-tenant, per-source-pair, or per-session.
 *   - rule-engine.ts maps RuleCondition results → ScoreItem[] so results are
 *     consumable by the same MatchScore / MatchExplanation surface.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { ScoreItem, MatchScore } from "../engine/engine-types";

// ── Operators ─────────────────────────────────────────────────────────────────

/**
 * Comparison operator for a rule condition.
 *
 *   equals              — exact string equality (after normalization)
 *   contains            — sourceValue contains targetValue (normalized)
 *   starts_with         — sourceValue starts with targetValue (normalized)
 *   numeric_tolerance   — |a - b| / |a| <= tolerance (fractional)
 *   date_window         — |date_a - date_b| <= windowDays
 *   exact_match         — alias for equals, signals zero-tolerance intent explicitly
 */
export type RuleOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "numeric_tolerance"
  | "date_window"
  | "exact_match";

// ── Rule condition ─────────────────────────────────────────────────────────────

/**
 * A single comparison condition within a rule.
 *
 * `sourceField` and `targetField` reference fields on CanonicalReconRecord:
 *   documentNumber | amount | thirdPartyId | thirdPartyName | reference | date
 *
 * For numeric_tolerance: `tolerance` is a fractional value (e.g. 0.001 = 0.1%).
 * For date_window:        `windowDays` is the maximum allowed day difference.
 */
export interface RuleCondition {
  /** Field on the source-A record to compare. */
  sourceField:   string;
  /** Field on the source-B record to compare against. May differ from sourceField. */
  targetField:   string;
  operator:      RuleOperator;
  /** Fractional tolerance — used when operator === "numeric_tolerance". */
  tolerance?:    number;
  /** Day window — used when operator === "date_window". */
  windowDays?:   number;
  /** Whether normalization (lowercase, trim, remove diacritics) is applied before comparison. */
  normalize?:    boolean;
}

// ── Rule weight ────────────────────────────────────────────────────────────────

/**
 * Weight of a rule's contribution to the total match score.
 *
 *   maxPoints — maximum points this rule can contribute (0–100 range scale)
 *   partial   — if the rule matches partially (e.g. only one condition of many), award this fraction
 */
export interface RuleWeight {
  maxPoints: number;
  /** Optional: fraction (0–1) of maxPoints to award for partial satisfaction. Default: 0 */
  partial?:  number;
}

// ── Rule group ────────────────────────────────────────────────────────────────

/**
 * A named category grouping related rules.
 * Used for reporting, conflict classification, and governance.
 *
 *   identity    — rules about document identity (number, reference, type)
 *   financial   — rules about monetary values
 *   temporal    — rules about dates
 *   counterpart — rules about the third party (NIT, name)
 *   custom      — tenant-defined rules outside the standard groups
 */
export type RuleGroup =
  | "identity"
  | "financial"
  | "temporal"
  | "counterpart"
  | "custom";

// ── Reconciliation rule ───────────────────────────────────────────────────────

/**
 * A configurable reconciliation rule.
 *
 * Rules are the declarative configuration layer above the engine scoring.
 * They can be persisted to DB, edited by operators, and versioned.
 *
 * ALL conditions must pass for the rule to be considered satisfied.
 * If any condition fails, the rule result is "failed" (or "partial" if
 * the rule has partial weight defined and at least one condition passed).
 */
export interface ReconciliationRule {
  /** Unique stable identifier. Example: "doc_exact_match", "amount_tolerance_01pct" */
  ruleId:      string;
  /** Human-readable name shown in audit trails and governance panels. */
  label:       string;
  /** Brief description of what this rule checks. */
  description: string;
  group:       RuleGroup;
  conditions:  RuleCondition[];
  weight:      RuleWeight;
  /** Whether this rule participates in the current run. Disabled rules are skipped. */
  enabled:     boolean;
  /**
   * Priority order within the group. Lower = evaluated first.
   * Only affects execution order and conflict classification priority.
   */
  priority?:   number;
}

// ── Per-condition result ──────────────────────────────────────────────────────

/** Outcome of evaluating one condition within a rule. */
export type ConditionOutcome = "passed" | "failed" | "skipped";

export interface ConditionEvaluationResult {
  sourceField:   string;
  targetField:   string;
  operator:      RuleOperator;
  outcome:       ConditionOutcome;
  /** The normalized value extracted from record A (for audit trail). */
  valueA:        string | number | null;
  /** The normalized value extracted from record B (for audit trail). */
  valueB:        string | number | null;
  /** Human-readable reason for this condition's outcome. */
  reason:        string;
}

// ── Rule execution result ─────────────────────────────────────────────────────

/** Outcome of evaluating one ReconciliationRule against a record pair. */
export type RuleOutcome = "passed" | "partial" | "failed" | "skipped";

/**
 * Result of running a single ReconciliationRule against one record pair.
 *
 * - `scoreItem` is null when outcome is "failed" or "skipped" (0 points awarded).
 * - `scoreItem.points` is `weight.maxPoints` when "passed", or
 *   `weight.maxPoints * weight.partial` when "partial".
 */
export interface RuleExecutionResult {
  ruleId:       string;
  ruleLabel:    string;
  group:        RuleGroup;
  outcome:      RuleOutcome;
  /**
   * ScoreItem compatible with engine-types MatchScore.breakdown.
   * Null when the rule contributes 0 points.
   */
  scoreItem:    ScoreItem | null;
  /** Per-condition evaluation detail. */
  conditions:   ConditionEvaluationResult[];
  /** One-sentence summary for audit trail / explainability panel. */
  summary:      string;
}

// ── Aggregate rule set result ─────────────────────────────────────────────────

/**
 * Aggregated result of evaluating ALL rules in a rule set against one record pair.
 *
 * `score` is a MatchScore compatible with engine-types — the breakdown contains
 * one ScoreItem per rule that contributed points.
 *
 * This is the primary output consumed by:
 *   - rule-conflict-classifier.ts (determines reconciliation verdict)
 *   - rule-explainability.ts (generates human-readable explanation)
 *   - rule-governance.ts (persisted for audit)
 */
export interface RuleSetExecutionResult {
  /** ISO timestamp of evaluation. */
  evaluatedAt:   string;
  /** Rules that were enabled and evaluated. */
  rulesEvaluated: number;
  /** Rules that passed (all conditions satisfied). */
  rulesPassed:    number;
  /** Rules that partially passed. */
  rulesPartial:   number;
  /** Rules that failed. */
  rulesFailed:    number;
  /** Rules that were skipped (disabled or field missing). */
  rulesSkipped:   number;
  /** Per-rule results, ordered by priority then group. */
  ruleResults:    RuleExecutionResult[];
  /**
   * Aggregated MatchScore — compatible with engine-types MatchScore.
   * breakdown = scoreItems from each rule that contributed points.
   */
  score:          MatchScore;
}
