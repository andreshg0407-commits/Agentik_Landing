/**
 * workflow-transition.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Workflow transition contracts — connections between stages.
 *
 * Workflows are NOT linear-only. They support directed graphs:
 * branching, parallel paths, conditional routing, and merge points.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { WorkflowMetadata } from "./workflow-types";

// ── Transition Condition ─────────────────────────────────────────────────────

/** Operator for evaluating transition conditions. */
export type TransitionConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "in"
  | "not_in";

/**
 * A condition that must be true for a transition to be allowed.
 * Conditions are evaluated against the workflow instance context.
 */
export interface TransitionCondition {
  /** The field path in the instance context to evaluate. */
  field: string;
  /** Comparison operator. */
  operator: TransitionConditionOperator;
  /** Value to compare against. */
  value: unknown;
}

// ── Transition Rule ──────────────────────────────────────────────────────────

/**
 * A business rule attached to a transition.
 * Rules are more complex than conditions — they can reference
 * external state and trigger side effects.
 */
export interface TransitionRule {
  /** Rule identifier. */
  id: string;
  /** Human-readable rule name. */
  name: string;
  /** Rule description. */
  description: string;
  /** Whether this rule blocks the transition or is advisory. */
  blocking: boolean;
}

// ── Transition Mode ──────────────────────────────────────────────────────────

/** How a transition is triggered. */
export type TransitionMode =
  | "manual"     // operator explicitly advances
  | "automatic"  // system advances when conditions are met
  | "scheduled"  // advances at a scheduled time
  | "approval";  // advances only after approval

// ── Workflow Transition ──────────────────────────────────────────────────────

/**
 * A connection between two stages in a workflow definition.
 *
 * Transitions define the graph structure of the workflow.
 * A stage can have multiple outgoing transitions (branching)
 * and multiple incoming transitions (merging).
 *
 * Examples:
 * - Corte → Estampacion (linear)
 * - Corte → Estampacion OR Corte → Bordado (branch)
 * - Estampacion → Confeccion AND Bordado → Confeccion (merge)
 * - Confeccion → Terminacion (conditional: quality check passed)
 */
export interface WorkflowTransition {
  /** Unique transition ID. */
  id: string;
  /** Source stage code. */
  sourceStageCode: string;
  /** Target stage code. */
  targetStageCode: string;
  /** How this transition is triggered. */
  mode: TransitionMode;
  /** Conditions that must be true for this transition. */
  conditions: TransitionCondition[];
  /** Business rules attached to this transition. */
  rules: TransitionRule[];
  /** Permission codes required to execute this transition. */
  permissions: string[];
  /** Display label for this transition (e.g. "Enviar a bordado"). */
  label: string | null;
  /** Priority for ordering when multiple transitions are available. */
  priority: number;
  /** Whether this is the default transition from the source stage. */
  isDefault: boolean;
  /** Arbitrary transition-specific metadata. */
  metadata: WorkflowMetadata;
}

// ── Transition Builder ───────────────────────────────────────────────────────

/** Build a WorkflowTransition with sensible defaults. */
export function buildTransition(opts: {
  sourceStageCode: string;
  targetStageCode: string;
  mode?: TransitionMode;
  conditions?: TransitionCondition[];
  rules?: TransitionRule[];
  permissions?: string[];
  label?: string;
  priority?: number;
  isDefault?: boolean;
  metadata?: WorkflowMetadata;
}): WorkflowTransition {
  return {
    id: `t-${opts.sourceStageCode}-${opts.targetStageCode}`,
    sourceStageCode: opts.sourceStageCode,
    targetStageCode: opts.targetStageCode,
    mode: opts.mode ?? "manual",
    conditions: opts.conditions ?? [],
    rules: opts.rules ?? [],
    permissions: opts.permissions ?? [],
    label: opts.label ?? null,
    priority: opts.priority ?? 10,
    isDefault: opts.isDefault ?? false,
    metadata: opts.metadata ?? {},
  };
}

// ── Graph Helpers ────────────────────────────────────────────────────────────

/** Get all transitions from a given stage. */
export function transitionsFrom(
  transitions: WorkflowTransition[],
  stageCode: string,
): WorkflowTransition[] {
  return transitions.filter(t => t.sourceStageCode === stageCode);
}

/** Get all transitions into a given stage. */
export function transitionsTo(
  transitions: WorkflowTransition[],
  stageCode: string,
): WorkflowTransition[] {
  return transitions.filter(t => t.targetStageCode === stageCode);
}

/** Check if a stage has multiple outgoing transitions (branch point). */
export function isBranchPoint(
  transitions: WorkflowTransition[],
  stageCode: string,
): boolean {
  return transitionsFrom(transitions, stageCode).length > 1;
}

/** Check if a stage has multiple incoming transitions (merge point). */
export function isMergePoint(
  transitions: WorkflowTransition[],
  stageCode: string,
): boolean {
  return transitionsTo(transitions, stageCode).length > 1;
}
