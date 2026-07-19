/**
 * lib/reconciliation/rules/rule-governance.ts
 *
 * AGENTIK-RECON-RULES-ENGINE-01 — Phase 5: Governance Ready
 *
 * Governance snapshot types for persisting rule engine decisions.
 *
 * A RuleGovernanceSnapshot captures EVERYTHING needed to reproduce and audit
 * a reconciliation decision: which rules were used, what each rule decided,
 * the aggregate score, the verdict, the explanation, and the source context.
 *
 * Design:
 *   - Snapshots are immutable records of a point-in-time evaluation.
 *   - They reference rule IDs + versions — not embedded rule objects —
 *     so they remain valid even after rule configurations change.
 *   - JSON-serializable — safe to store in Prisma Json fields.
 *   - No Prisma imports here. The persistence layer uses this type.
 *
 * Usage:
 *   buildGovernanceSnapshot(ruleSetResult, verdictMeta, explanation, context)
 *   → RuleGovernanceSnapshot  (persist to DB or attach to session audit event)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { RuleSetExecutionResult } from "./rule-types";
import type { VerdictMeta }            from "./rule-conflict-classifier";
import type { RuleExplanation }        from "./rule-explainability";

// ── Snapshot types ────────────────────────────────────────────────────────────

/**
 * Serialized summary of one rule's contribution to a governance snapshot.
 * Does NOT include full condition detail — see ruleResults in RuleSetExecutionResult.
 */
export interface GovernanceRuleEntry {
  ruleId:    string;
  ruleLabel: string;
  group:     string;
  outcome:   "passed" | "partial" | "failed" | "skipped";
  points:    number;
  summary:   string;
}

/**
 * Source context for a governance snapshot.
 * Carries the minimum required to identify the sources and tenant.
 */
export interface GovernanceSourceContext {
  organizationId: string;
  sessionId:      string | null;
  sourceAType:    string;
  sourceBType:    string;
  sourceALabel:   string;
  sourceBLabel:   string;
  recordAId:      string;
  recordBId:      string;
}

/**
 * Immutable governance snapshot for one record pair evaluation.
 *
 * Persisted to DB (as JSON) when:
 *   - A pair is auto-reconciled (verdict = "reconciled")
 *   - A pair is marked for review (verdict = "pending_review" | "suspicious")
 *   - An operator overrides the verdict (then snapshot includes override context)
 */
export interface RuleGovernanceSnapshot {
  /** ISO timestamp of the evaluation. */
  evaluatedAt:     string;
  /** Engine version string — for forward-compatibility checks. */
  engineVersion:   string;
  /** Which rules were evaluated and their outcomes. */
  rules:           GovernanceRuleEntry[];
  /** Total score (0–100). */
  score:           number;
  /** Confidence tier. */
  confidence:      "high" | "medium" | "low";
  /** Reconciliation verdict. */
  verdict:         string;
  /** Verdict label (human-readable). */
  verdictLabel:    string;
  /** Whether operator action was required. */
  requiresAction:  boolean;
  /** Severity. */
  severity:        "ok" | "watch" | "elevated" | "critical";
  /** Top-line explanation headline. */
  headline:        string;
  /** Ordered reasons (passed first, failed last). */
  reasons:         string[];
  /** Source context. */
  source:          GovernanceSourceContext;
  /**
   * Optional: operator override context.
   * Present when an operator manually changed the verdict after the engine ran.
   */
  operatorOverride?: {
    operatorId:    string;
    overriddenAt:  string;
    originalVerdict: string;
    newVerdict:    string;
    justification: string;
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

const ENGINE_VERSION = "rules-engine-01";

/**
 * Build a governance snapshot from the engine outputs.
 *
 * @param ruleSetResult  Output from executeRuleSet()
 * @param verdictMeta    Output from classifyConflict()
 * @param explanation    Output from buildRuleExplanation()
 * @param context        Source and tenant context for this evaluation
 */
export function buildGovernanceSnapshot(
  ruleSetResult: RuleSetExecutionResult,
  verdictMeta:   VerdictMeta,
  explanation:   RuleExplanation,
  context:       GovernanceSourceContext,
): RuleGovernanceSnapshot {
  const rules: GovernanceRuleEntry[] = ruleSetResult.ruleResults.map(r => ({
    ruleId:    r.ruleId,
    ruleLabel: r.ruleLabel,
    group:     r.group,
    outcome:   r.outcome,
    points:    r.scoreItem?.points ?? 0,
    summary:   r.summary,
  }));

  return {
    evaluatedAt:    ruleSetResult.evaluatedAt,
    engineVersion:  ENGINE_VERSION,
    rules,
    score:          ruleSetResult.score.total,
    confidence:     explanation.confidence,
    verdict:        verdictMeta.verdict,
    verdictLabel:   verdictMeta.label,
    requiresAction: verdictMeta.requiresAction,
    severity:       verdictMeta.severity,
    headline:       explanation.headline,
    reasons:        explanation.reasons,
    source:         context,
  };
}

// ── Convenience: full pipeline snapshot ──────────────────────────────────────

/**
 * Run the full governance pipeline from raw rule results.
 *
 * This is the primary integration point for the reconciliation session layer.
 * It calls buildGovernanceSnapshot with the correct sub-results so callers
 * don't need to import all three functions separately.
 *
 * Import order:
 *   import { executeRuleSet }        from "./rule-engine";
 *   import { classifyConflict }      from "./rule-conflict-classifier";
 *   import { buildRuleExplanation }  from "./rule-explainability";
 *   import { buildGovernanceSnapshot } from "./rule-governance";
 *
 * Usage:
 *   const ruleSetResult = executeRuleSet(rules, recordA, recordB);
 *   const verdictMeta   = classifyConflict(ruleSetResult, sourceALabel, sourceBLabel);
 *   const explanation   = buildRuleExplanation(ruleSetResult, sourceALabel, sourceBLabel);
 *   const snapshot      = buildGovernanceSnapshot(ruleSetResult, verdictMeta, explanation, context);
 */
export type { RuleGovernanceSnapshot as GovernanceSnapshot };
