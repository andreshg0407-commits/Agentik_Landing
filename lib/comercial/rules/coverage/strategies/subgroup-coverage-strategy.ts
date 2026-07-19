/**
 * lib/comercial/rules/coverage/strategies/subgroup-coverage-strategy.ts
 *
 * SUBGROUP coverage strategy for Textil.
 * Rules resolved by businessLine + subgroup.
 * Evaluation per talla/color combination.
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type { CommercialCoverageInput, CommercialCoverageEvaluation, CoverageState } from "../commercial-coverage-types";
import type { CommercialCoverageRuleMatch } from "../commercial-coverage-types";

export function evaluateSubgroupStrategy(
  input: CommercialCoverageInput,
  ruleMatch: CommercialCoverageRuleMatch,
): CommercialCoverageEvaluation {
  const rule = ruleMatch.selectedRule;

  if (!rule) {
    return {
      strategy: "SUBGROUP",
      state: "NO_RULE",
      ruleMatch,
      currentCoverage: input.currentUnits + (input.incomingUnits ?? 0),
      gapToMin: 0,
      gapToIdeal: 0,
      excessOverMax: 0,
      minQty: null,
      idealQty: null,
      maxQty: null,
    };
  }

  if (!input.subgroup) {
    return {
      strategy: "SUBGROUP",
      state: "INSUFFICIENT_DATA",
      ruleMatch,
      currentCoverage: input.currentUnits + (input.incomingUnits ?? 0),
      gapToMin: 0,
      gapToIdeal: 0,
      excessOverMax: 0,
      minQty: rule.minQty,
      idealQty: rule.idealQty,
      maxQty: rule.maxQty,
    };
  }

  const currentCoverage = input.currentUnits + (input.incomingUnits ?? 0);
  const { minQty, idealQty, maxQty } = rule;

  const gapToMin = Math.max(0, minQty - currentCoverage);
  const gapToIdeal = Math.max(0, idealQty - currentCoverage);
  const excessOverMax = Math.max(0, currentCoverage - maxQty);

  let state: CoverageState;
  if (currentCoverage < minQty) state = "BELOW_MIN";
  else if (currentCoverage < idealQty) state = "BELOW_IDEAL";
  else if (currentCoverage === idealQty) state = "AT_IDEAL";
  else if (currentCoverage <= maxQty) state = "ABOVE_IDEAL";
  else state = "ABOVE_MAX";

  return {
    strategy: "SUBGROUP",
    state,
    ruleMatch,
    currentCoverage,
    gapToMin,
    gapToIdeal,
    excessOverMax,
    minQty,
    idealQty,
    maxQty,
  };
}
