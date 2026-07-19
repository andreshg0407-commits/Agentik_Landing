/**
 * lib/comercial/business-policy/policy-resolution.ts
 *
 * Resolution Engine (FASE 4).
 * Given a set of policies and a context, resolves which policy applies.
 * Does NOT execute rules — only determines which one wins.
 *
 * Resolution algorithm:
 *   Tenant → Category → Scope → Conditions → Priority → Version → Active → Result
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicy,
  PolicyResolutionContext,
  PolicyResolutionResult,
  PolicyResolutionCandidate,
  PolicyResolutionDiscard,
  BusinessPolicyEvidence,
  PolicyScope,
  DiscardReason,
} from "./policy-types";
import { SCOPE_SPECIFICITY } from "./policy-types";

// ── Resolution ──────────────────────────────────────────────────────────────

export function resolvePolicy(
  policies: readonly BusinessPolicy[],
  context: PolicyResolutionContext,
): PolicyResolutionResult {
  const traceId = `bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const candidates: PolicyResolutionCandidate[] = [];
  const discarded: PolicyResolutionDiscard[] = [];
  const resolutionPath: string[] = [];

  resolutionPath.push(`START: tenant=${context.tenantId}, category=${context.category}`);

  for (const policy of policies) {
    // Step 1: Tenant filter
    if (policy.tenantId !== context.tenantId) {
      discarded.push(buildDiscard(policy, "WRONG_TENANT", `Policy tenant=${policy.tenantId}, context tenant=${context.tenantId}`));
      continue;
    }

    // Step 2: Category filter
    if (policy.category !== context.category) {
      discarded.push(buildDiscard(policy, "WRONG_CATEGORY", `Policy category=${policy.category}, context category=${context.category}`));
      continue;
    }

    // Step 3: Status filter
    if (policy.status !== "ACTIVE") {
      const reason: DiscardReason = policy.status === "DEPRECATED" ? "DEPRECATED" : "INACTIVE";
      discarded.push(buildDiscard(policy, reason, `Policy status=${policy.status}`));
      continue;
    }

    // Step 4: Scope matching
    const scopeMatch = matchScopes(policy.scopes, context.scopeBindings);
    if (scopeMatch.matchedScopes.length === 0 && policy.scopes.length > 0) {
      discarded.push(buildDiscard(policy, "SCOPE_MISMATCH", `No matching scopes`));
      continue;
    }

    // Step 5: Condition evaluation
    const conditionMatch = evaluateConditions(policy.conditions, context.contextData);
    if (conditionMatch.failed > 0) {
      discarded.push(buildDiscard(policy, "CONDITION_FAILED", `${conditionMatch.failed}/${conditionMatch.total} conditions failed`));
      continue;
    }

    candidates.push({
      policy,
      matchScore: computeMatchScore(scopeMatch.matchedScopes, conditionMatch.passed, conditionMatch.total, policy.priority),
      matchedScopes: scopeMatch.matchedScopes,
      matchedConditions: conditionMatch.passed,
      totalConditions: conditionMatch.total,
    });
  }

  resolutionPath.push(`FILTER: ${candidates.length} candidates, ${discarded.length} discarded`);

  // Step 6: Sort by match score (descending) then priority (ascending = higher priority)
  const sorted = [...candidates].sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.policy.priority - b.policy.priority;
  });

  // Mark lower-priority candidates as discarded
  const finalDiscarded = [...discarded];
  for (let i = 1; i < sorted.length; i++) {
    finalDiscarded.push(buildDiscard(
      sorted[i].policy,
      "LOWER_PRIORITY",
      `Score=${sorted[i].matchScore.toFixed(3)}, superseded by ${sorted[0].policy.name}`,
    ));
  }

  const winner = sorted[0] ?? null;

  if (winner) {
    resolutionPath.push(`SELECTED: ${winner.policy.name} (score=${winner.matchScore.toFixed(3)}, priority=${winner.policy.priority}, version=${winner.policy.versionInfo.version})`);
  } else {
    resolutionPath.push("SELECTED: none — no matching policy");
  }

  const evidence = buildResolutionEvidence({
    traceId,
    tenantId: context.tenantId,
    category: context.category,
    winner,
    candidateCount: candidates.length,
    discardedCount: finalDiscarded.length,
    discardReasons: [...new Set(finalDiscarded.map(d => d.reason))],
    resolutionPath,
  });

  return {
    resolved: winner !== null,
    selectedPolicy: winner?.policy ?? null,
    candidates: sorted,
    discarded: finalDiscarded,
    evidence,
    resolvedAt: new Date(),
  };
}

// ── Scope Matching ──────────────────────────────────────────────────────────

interface ScopeMatchResult {
  readonly matchedScopes: PolicyScope[];
}

function matchScopes(
  policyScopes: readonly { readonly scope: PolicyScope; readonly scopeValue: string | null }[],
  contextScopes: readonly { readonly scope: PolicyScope; readonly scopeValue: string | null }[],
): ScopeMatchResult {
  if (policyScopes.length === 0) {
    return { matchedScopes: ["GLOBAL" as PolicyScope] };
  }

  const matched: PolicyScope[] = [];

  for (const ps of policyScopes) {
    if (ps.scope === "GLOBAL") {
      matched.push("GLOBAL");
      continue;
    }

    const contextMatch = contextScopes.find(cs => cs.scope === ps.scope);
    if (!contextMatch) continue;

    if (ps.scopeValue === null || ps.scopeValue === contextMatch.scopeValue) {
      matched.push(ps.scope);
    }
  }

  return { matchedScopes: matched };
}

// ── Condition Evaluation ────────────────────────────────────────────────────

interface ConditionMatchResult {
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
}

function evaluateConditions(
  conditions: readonly { readonly field: string; readonly operator: string; readonly value: unknown }[],
  contextData: Record<string, unknown>,
): ConditionMatchResult {
  if (conditions.length === 0) {
    return { passed: 0, failed: 0, total: 0 };
  }

  let passed = 0;
  let failed = 0;

  for (const cond of conditions) {
    const actual = contextData[cond.field];
    const expected = cond.value;

    if (evaluateSingleCondition(actual, cond.operator, expected)) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed, total: conditions.length };
}

function evaluateSingleCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "EQUALS":
      return actual === expected;
    case "NOT_EQUALS":
      return actual !== expected;
    case "GREATER_THAN":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "LESS_THAN":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "GREATER_OR_EQUAL":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "LESS_OR_EQUAL":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "IN":
      return Array.isArray(expected) && expected.includes(actual);
    case "NOT_IN":
      return Array.isArray(expected) && !expected.includes(actual);
    case "CONTAINS":
      return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    case "STARTS_WITH":
      return typeof actual === "string" && typeof expected === "string" && actual.startsWith(expected);
    case "IS_NULL":
      return actual === null || actual === undefined;
    case "IS_NOT_NULL":
      return actual !== null && actual !== undefined;
    default:
      return false;
  }
}

// ── Match Scoring ───────────────────────────────────────────────────────────

function computeMatchScore(
  matchedScopes: readonly PolicyScope[],
  conditionsPassed: number,
  totalConditions: number,
  priority: number,
): number {
  // Scope specificity contributes most (0-1 range, lower specificity number = higher score)
  const maxSpecificity = 13;
  const bestScope = Math.min(...matchedScopes.map(s => SCOPE_SPECIFICITY[s] ?? maxSpecificity));
  const scopeScore = (maxSpecificity - bestScope + 1) / maxSpecificity;

  // Condition match ratio
  const conditionScore = totalConditions === 0 ? 0.5 : conditionsPassed / totalConditions;

  // Priority contribution (lower = better, normalize assuming max priority = 1000)
  const priorityScore = Math.max(0, (1000 - priority) / 1000);

  return scopeScore * 0.5 + conditionScore * 0.3 + priorityScore * 0.2;
}

// ── Evidence Builder ────────────────────────────────────────────────────────

function buildResolutionEvidence(params: {
  traceId: string;
  tenantId: string;
  category: string;
  winner: PolicyResolutionCandidate | null;
  candidateCount: number;
  discardedCount: number;
  discardReasons: string[];
  resolutionPath: string[];
}): BusinessPolicyEvidence {
  return {
    domain: "BUSINESS_POLICY",
    traceId: params.traceId,
    tenantId: params.tenantId,
    category: params.category as BusinessPolicyEvidence["category"],
    selectedPolicyId: params.winner?.policy.id ?? null,
    selectedPolicyName: params.winner?.policy.name ?? null,
    selectedPolicyVersion: params.winner?.policy.versionInfo.version ?? null,
    selectedPriority: params.winner?.policy.priority ?? null,
    candidateCount: params.candidateCount,
    discardedCount: params.discardedCount,
    discardReasons: params.discardReasons,
    resolutionPath: params.resolutionPath,
    confidence: params.winner ? params.winner.matchScore : 0,
    observedAt: new Date(),
    note: params.winner
      ? `Resolved to "${params.winner.policy.name}" v${params.winner.policy.versionInfo.version}`
      : "No matching policy found",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildDiscard(
  policy: BusinessPolicy,
  reason: DiscardReason,
  detail: string,
): PolicyResolutionDiscard {
  return { policy, reason, detail };
}
