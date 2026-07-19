/**
 * rule-engine.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Rule engine contract and in-memory implementation.
 *
 * The engine evaluates rules against a context, producing auditable results.
 * It does NOT execute actions — only suggests outcomes.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessRule } from "./rule";
import type { RuleEvaluationContext } from "./rule-context";
import type { RuleEvaluation, RuleEvaluationStatus } from "./rule-evaluation";
import type { RuleEvaluationResult } from "./rule-result";
import { buildRuleEvaluationResult } from "./rule-result";
import { matchesTrigger, type TriggerMatchContext } from "./rule-trigger";
import { matchesScope } from "./rule-scope";
import { evaluateCondition, type ConditionEvalResult } from "./rule-condition";
import { buildEvidenceItem, buildRuleEvidence, emptyRuleEvidence } from "./rule-evidence";
import type { RuleEvidence, RuleEvidenceItem } from "./rule-evidence";
import { nextRuleId } from "./rule-types";

// -- Engine Contract ----------------------------------------------------------

/** Rule engine contract. */
export interface IRuleEngine {
  /** Evaluate all applicable rules for a given context. */
  evaluate(ctx: RuleEvaluationContext, rules: BusinessRule[]): RuleEvaluationResult;

  /** Evaluate a single rule against a context. */
  evaluateRule(rule: BusinessRule, ctx: RuleEvaluationContext): RuleEvaluation;

  /** Find rules that match a trigger context. */
  findApplicableRules(
    rules: BusinessRule[],
    triggerCtx: TriggerMatchContext,
    scopeCtx: RuleEvaluationContext["scopeContext"],
  ): BusinessRule[];
}

// -- In-Memory Implementation -------------------------------------------------

/** In-memory rule engine. */
export class InMemoryRuleEngine implements IRuleEngine {
  evaluate(ctx: RuleEvaluationContext, rules: BusinessRule[]): RuleEvaluationResult {
    const start = Date.now();

    const triggerCtx: TriggerMatchContext = {
      triggerType: ctx.triggerType,
      eventType: ctx.triggerEventType,
      signalCategory: ctx.triggerSignalCategory,
      signalType: ctx.triggerSignalType,
      entityType: ctx.triggerEntityType,
      workflowEventType: ctx.triggerWorkflowEventType,
    };

    const applicable = this.findApplicableRules(rules, triggerCtx, ctx.scopeContext);

    // Sort by priority: highest first
    const priorityOrder: Record<string, number> = {
      highest: 0, high: 1, normal: 2, low: 3, lowest: 4,
    };
    const sorted = [...applicable].sort(
      (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
    );

    const evaluations = sorted.map(rule => this.evaluateRule(rule, ctx));

    return buildRuleEvaluationResult({
      orgSlug: ctx.scopeContext.organizationId ?? "system",
      evaluations,
      correlationId: ctx.correlationId,
      durationMs: Date.now() - start,
    });
  }

  evaluateRule(rule: BusinessRule, ctx: RuleEvaluationContext): RuleEvaluation {
    const start = Date.now();
    const evaluationId = nextRuleId("eval");

    // Skip if rule is not active
    if (rule.status !== "active") {
      return {
        evaluationId,
        ruleId: rule.ruleId,
        ruleName: rule.name,
        status: "skipped",
        conditionMatched: false,
        conditionResults: [],
        evidence: emptyRuleEvidence(),
        suggestedOutcome: null,
        skipReason: `Rule status is "${rule.status}"`,
        errorMessage: null,
        durationMs: Date.now() - start,
        evaluatedAt: new Date().toISOString(),
      };
    }

    try {
      // Evaluate root condition
      const conditionResult = evaluateCondition(rule.condition, ctx.data);
      const conditionResults = [conditionResult];

      // Build evidence from condition results
      const evidence = this.buildEvidenceFromResults(conditionResults, ctx.data, rule);

      const status: RuleEvaluationStatus = conditionResult.matched ? "matched" : "not_matched";

      return {
        evaluationId,
        ruleId: rule.ruleId,
        ruleName: rule.name,
        status,
        conditionMatched: conditionResult.matched,
        conditionResults,
        evidence,
        suggestedOutcome: conditionResult.matched ? rule.outcome : null,
        skipReason: null,
        errorMessage: null,
        durationMs: Date.now() - start,
        evaluatedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        evaluationId,
        ruleId: rule.ruleId,
        ruleName: rule.name,
        status: "error",
        conditionMatched: false,
        conditionResults: [],
        evidence: emptyRuleEvidence(),
        suggestedOutcome: null,
        skipReason: null,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        evaluatedAt: new Date().toISOString(),
      };
    }
  }

  findApplicableRules(
    rules: BusinessRule[],
    triggerCtx: TriggerMatchContext,
    scopeCtx: RuleEvaluationContext["scopeContext"],
  ): BusinessRule[] {
    return rules.filter(rule => {
      // Must be active
      if (rule.status !== "active") return false;

      // At least one trigger must match
      const triggerMatch = rule.triggers.some(t => matchesTrigger(t, triggerCtx));
      if (!triggerMatch) return false;

      // Scope must match
      if (!matchesScope(rule.scope, scopeCtx)) return false;

      return true;
    });
  }

  // -- Private helpers --------------------------------------------------------

  private buildEvidenceFromResults(
    results: ConditionEvalResult[],
    data: Record<string, unknown>,
    rule: BusinessRule,
  ): RuleEvidence {
    const items: RuleEvidenceItem[] = [];
    const missingFields: string[] = [];
    const dataSources = new Set<string>();

    for (const result of results) {
      if (result.condition.kind === "simple") {
        const c = result.condition;
        dataSources.add(c.source);

        if (result.actualValue === null && !result.matched) {
          missingFields.push(c.field);
        }

        items.push(
          buildEvidenceItem(
            c.field,
            result.actualValue,
            c.value,
            result.matched,
            result.reason,
          ),
        );
      } else {
        // Compound — summarize
        const actual = result.actualValue as { matchedCount: number; totalCount: number };
        items.push(
          buildEvidenceItem(
            `compound:${result.condition.logic}`,
            actual,
            `${result.condition.logic} of ${actual.totalCount}`,
            result.matched,
            result.reason,
          ),
        );
      }
    }

    return buildRuleEvidence({
      items,
      missingFields,
      dataSources: Array.from(dataSources),
    });
  }
}
