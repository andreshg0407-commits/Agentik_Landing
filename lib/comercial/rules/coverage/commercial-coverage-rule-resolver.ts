/**
 * lib/comercial/rules/coverage/commercial-coverage-rule-resolver.ts
 *
 * Rule resolution with explicit precedence.
 * Selects the most specific applicable rule for a given input.
 *
 * Precedence order (most specific wins):
 *   1. Store + exact reference (variant_override or reference scope)
 *   2. Store + strategy match (line_subgroup, class_size)
 *   3. Store-level default
 *   4. General (no store filter) + exact reference
 *   5. General + strategy match
 *   6. General default
 *   7. No rule found
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type { StorePolicyRule } from "@/lib/comercial/tiendas/store-policy-types";
import type { CommercialCoverageInput, CommercialCoverageRuleMatch, DiscardedRule } from "./commercial-coverage-types";
import type { RejectionReason } from "./commercial-evidence-types";
import { SCOPE_PRIORITY } from "./commercial-coverage-config";

// ── Rule matching ───────────────────────────────────────────────────────────

function ruleMatchesInput(rule: StorePolicyRule, input: CommercialCoverageInput): boolean {
  if (!rule.active) return false;

  // Store match: rule.storeId must equal input.storeId OR be a general rule (empty storeId means global)
  const storeMatch = !rule.storeId || rule.storeId === input.storeId;
  if (!storeMatch) return false;

  switch (rule.scope) {
    case "variant_override":
      return (
        !!rule.referenceCode &&
        rule.referenceCode.toUpperCase() === input.referenceCode.toUpperCase() &&
        (rule.size ?? "") === (input.metadata?.size as string ?? "") &&
        (rule.color ?? "") === (input.color ?? "")
      );

    case "reference":
      return (
        !!rule.referenceCode &&
        rule.referenceCode.toUpperCase() === input.referenceCode.toUpperCase()
      );

    case "line_subgroup":
      return (
        rule.productClass === input.productClass &&
        (rule.line ?? "").toLowerCase() === (input.businessLine ?? "").toLowerCase() &&
        (!rule.subgroup || (rule.subgroup ?? "").toLowerCase() === (input.subgroup ?? "").toLowerCase())
      );

    case "subgroup":
      return (
        !!rule.subgroup &&
        (rule.subgroup ?? "").toLowerCase() === (input.subgroup ?? "").toLowerCase()
      );

    case "line":
      return (
        !!rule.line &&
        (rule.line ?? "").toLowerCase() === (input.businessLine ?? "").toLowerCase()
      );

    case "class_size":
      return (
        rule.productClass === input.productClass &&
        !!rule.sizeClass &&
        rule.sizeClass === input.sizeClass
      );

    case "productClass":
      return rule.productClass === input.productClass;

    case "store":
      return true; // Store-wide default matches everything for that store

    default:
      return false;
  }
}

function rulePriority(rule: StorePolicyRule): number {
  const scopePriority = SCOPE_PRIORITY[rule.scope] ?? 99;
  // Prefer store-specific rules over general ones
  const storeBonus = rule.storeId ? 0 : 100;
  // Lower rule.priority = higher actual priority
  return scopePriority + storeBonus - (rule.priority ?? 0) * 0.01;
}

// ── Rejection reason inference ───────────────────────────────────────────────

function inferRejectionReason(
  rule: StorePolicyRule,
  selected: StorePolicyRule,
  input: CommercialCoverageInput,
): RejectionReason {
  // Store mismatch (rule is for a different store)
  if (rule.storeId && rule.storeId !== input.storeId) return "STORE_MISMATCH";

  // Strategy mismatch (SIZE rule for textile input or vice-versa)
  if (rule.coverageStrategy === "SIZE" && input.productClass === "textile") return "STRATEGY_MISMATCH";
  if (rule.coverageStrategy === "SUBGROUP" && input.productClass === "accessory" && rule.scope === "line_subgroup") {
    if ((rule.line ?? "").toLowerCase() !== (input.businessLine ?? "").toLowerCase()) return "LINE_MISMATCH";
  }

  // Scope specificity: selected has more specific scope
  const ruleSpecificity = SCOPE_PRIORITY[rule.scope] ?? 99;
  const selectedSpecificity = SCOPE_PRIORITY[selected.scope] ?? 99;
  if (ruleSpecificity > selectedSpecificity) return "LESS_SPECIFIC";

  // Store-specific wins over general
  if (!rule.storeId && selected.storeId) return "LESS_SPECIFIC";

  // Same specificity but lower priority value
  if (ruleSpecificity === selectedSpecificity) return "LOWER_PRIORITY";

  return "LOWER_PRIORITY";
}

function inferNonMatchRejection(rule: StorePolicyRule, input: CommercialCoverageInput): RejectionReason {
  if (!rule.active) return "INACTIVE";
  if (rule.storeId && rule.storeId !== input.storeId) return "STORE_MISMATCH";

  // Check strategy/type mismatches
  if (rule.scope === "class_size" && rule.sizeClass !== input.sizeClass) return "SIZE_MISMATCH";
  if (rule.scope === "line_subgroup") {
    if ((rule.line ?? "").toLowerCase() !== (input.businessLine ?? "").toLowerCase()) return "LINE_MISMATCH";
    if (rule.subgroup && (rule.subgroup ?? "").toLowerCase() !== (input.subgroup ?? "").toLowerCase()) return "SUBGROUP_MISMATCH";
  }
  if (rule.productClass !== input.productClass) return "STRATEGY_MISMATCH";

  return "INVALID_RULE";
}

// ── Main resolver ───────────────────────────────────────────────────────────

export function resolveRule(input: CommercialCoverageInput): CommercialCoverageRuleMatch {
  const candidates = input.activeRules.filter(r => ruleMatchesInput(r, input));

  // Build discarded rules: rules that were available but didn't match
  const nonMatching = input.activeRules.filter(r => !candidates.includes(r));

  if (candidates.length === 0) {
    const discardedRules: DiscardedRule[] = nonMatching.map((r, idx) => ({
      rule: r,
      rejectionReason: inferNonMatchRejection(r, input),
      specificityRank: idx + 1,
    }));

    return {
      selectedRule: null,
      candidateRules: [],
      discardedRules,
      selectionReason: "No matching rule found for this product/store combination",
      hadConflict: false,
      matchConfidence: 0,
    };
  }

  // Sort by priority (lower = more specific)
  const sorted = [...candidates].sort((a, b) => rulePriority(a) - rulePriority(b));

  const selected = sorted[0];
  const hadConflict = sorted.length > 1 && rulePriority(sorted[0]) === rulePriority(sorted[1]);

  // Build discarded: non-matching + matching-but-not-selected
  const discardedRules: DiscardedRule[] = [];

  // Candidates that lost (matched but less specific/priority)
  for (let i = 1; i < sorted.length; i++) {
    discardedRules.push({
      rule: sorted[i],
      rejectionReason: inferRejectionReason(sorted[i], selected, input),
      specificityRank: i + 1,
    });
  }

  // Rules that didn't match at all
  for (const r of nonMatching) {
    discardedRules.push({
      rule: r,
      rejectionReason: inferNonMatchRejection(r, input),
      specificityRank: discardedRules.length + 2,
    });
  }

  // Confidence based on scope specificity
  const scopeIdx = SCOPE_PRIORITY[selected.scope] ?? 8;
  const matchConfidence = Math.max(0.3, 1 - (scopeIdx - 1) * 0.1);

  let selectionReason: string;
  if (hadConflict) {
    selectionReason = `Selected rule (scope: ${selected.scope}, priority: ${selected.priority}) from ${sorted.length} conflicting candidates`;
  } else if (sorted.length === 1) {
    selectionReason = `Only matching rule (scope: ${selected.scope})`;
  } else {
    selectionReason = `Most specific rule (scope: ${selected.scope}) selected over ${sorted.length - 1} less specific alternatives`;
  }

  return {
    selectedRule: selected,
    candidateRules: candidates,
    discardedRules,
    selectionReason,
    hadConflict,
    matchConfidence,
  };
}
