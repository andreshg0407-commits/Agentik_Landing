/**
 * index.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Client-safe barrel export for the Business Rule Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// Types
export type {
  RuleCategory,
  RuleSeverity,
  RulePriority,
  RuleEntityRef,
} from "./rule-types";
export { nextRuleId, RULE_CATEGORIES } from "./rule-types";

// Rule
export type {
  BusinessRule,
  RuleStatus,
  RuleSuggestedAction,
  RuleSuggestedOutcome,
} from "./rule";

// Scope
export type { RuleScope, ScopeMatchContext } from "./rule-scope";
export { buildRuleScope, globalScope, orgScope, matchesScope } from "./rule-scope";

// Trigger
export type { RuleTriggerType, RuleTrigger, TriggerMatchContext } from "./rule-trigger";
export {
  buildRuleTrigger,
  eventTrigger,
  signalTrigger,
  workflowTrigger,
  manualTrigger,
  matchesTrigger,
} from "./rule-trigger";

// Condition
export type {
  ConditionOperator,
  ConditionSource,
  SimpleCondition,
  CompoundCondition,
  RuleCondition,
  ConditionEvalResult,
} from "./rule-condition";
export {
  simpleCondition,
  allConditions,
  anyConditions,
  noneConditions,
  evaluateCondition,
} from "./rule-condition";

// Context
export type { RuleEvaluationContext } from "./rule-context";
export { buildRuleEvaluationContext } from "./rule-context";

// Evidence
export type { RuleEvidenceItem, RuleEvidence } from "./rule-evidence";
export { buildEvidenceItem, buildRuleEvidence, emptyRuleEvidence } from "./rule-evidence";

// Evaluation
export type { RuleEvaluationStatus, RuleEvaluation } from "./rule-evaluation";

// Result
export type { RuleEvaluationResult } from "./rule-result";
export { buildRuleEvaluationResult } from "./rule-result";

// Engine
export type { IRuleEngine } from "./rule-engine";
export { InMemoryRuleEngine } from "./rule-engine";

// Registry
export type { RuleFilter } from "./rule-registry";
export { RuleRegistry } from "./rule-registry";

// Utils
export {
  matchedEvaluations,
  errorEvaluations,
  sortedSuggestedActions,
  hasMatchAtSeverity,
  uniqueActionTypes,
  countRulesByCategory,
  activeRules,
  configurableRules,
  evaluationSummary,
  averageConfidence,
} from "./rule-utils";
