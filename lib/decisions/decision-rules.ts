/**
 * lib/decisions/decision-rules.ts
 *
 * Agentik — Decision Rule Structure
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * A DecisionRule is a pure function-based policy:
 * given a context and a signal, it decides whether to recommend an action.
 *
 * Rules are pure — condition() has no side effects.
 * No Prisma. No React. No Next.
 */

import type { DecisionContext } from "./decision-context";
import type { DecisionSignal }  from "./decision-signals";
import type {
  DecisionRuleId,
  DecisionDomain,
  DecisionSeverity,
  DecisionConfidence,
  DecisionActionType,
} from "./decision-types";

// ── Rule ──────────────────────────────────────────────────────────────────────

export interface DecisionRule {
  /** Unique rule identifier. */
  id: DecisionRuleId;
  /** Domain this rule belongs to. */
  domain: DecisionDomain;
  /** Human-readable name. */
  name: string;
  /** What this rule detects. */
  description: string;
  /**
   * Signal types this rule applies to.
   * An empty array means the rule applies to ALL signal types.
   */
  signalTypes: string[];
  /**
   * Pure condition function.
   * Returns true if this rule should fire for the given context + signal.
   * Must never throw — return false on unexpected input.
   */
  condition: (context: DecisionContext, signal: DecisionSignal) => boolean;
  /** Action type to recommend when the rule fires. */
  recommendedAction: DecisionActionType;
  /** Severity level for the resulting recommendation. */
  severity: DecisionSeverity;
  /** Engine's confidence in this recommendation. */
  confidence: DecisionConfidence;
  /** Whether the resulting action requires human approval. */
  requiresApproval: boolean;
  /** Whether the action can be auto-executed without human intervention. */
  canAutoExecute: boolean;
  /**
   * Priority within the same domain (higher = evaluated first).
   * Used to order recommendations when scores are equal.
   */
  priority: number;
  /** Inactive rules are loaded but never evaluated. */
  isActive: boolean;
  /** Optional navigation target or workflow hint stored here. */
  metadata?: Record<string, unknown>;
}
