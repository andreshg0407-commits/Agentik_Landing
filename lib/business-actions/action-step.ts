/**
 * action-step.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Granular execution step within an action.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionStatus, ActionTargetKind, ActionEntityRef } from "./action-types";
import { nextActionId } from "./action-types";

// -- Action Target ------------------------------------------------------------

/** Where an action step is directed. */
export interface ActionTarget {
  /** Target kind. */
  kind: ActionTargetKind;
  /** Target identifier. */
  targetId: string;
  /** Human-readable label. */
  label: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Action Step --------------------------------------------------------------

/** A granular execution step within an action. */
export interface ActionStep {
  /** Unique step ID. */
  stepId: string;
  /** Action this step belongs to. */
  actionId: string;
  /** Execution order (1-based). */
  order: number;
  /** Step title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Step type. */
  stepType: string;
  /** Target of this step. */
  target: ActionTarget | null;
  /** Whether this step is required. */
  required: boolean;
  /** Current status. */
  status: ActionStatus;
  /** Input data for this step. */
  input: Record<string, unknown>;
  /** Output data from execution. */
  output: Record<string, unknown>;
  /** Error if failed. */
  error: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action step. */
export function buildActionStep(opts: {
  actionId: string;
  order: number;
  title: string;
  description: string;
  stepType: string;
  target?: ActionTarget | null;
  required?: boolean;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ActionStep {
  return {
    stepId: nextActionId("astp"),
    actionId: opts.actionId,
    order: opts.order,
    title: opts.title,
    description: opts.description,
    stepType: opts.stepType,
    target: opts.target ?? null,
    required: opts.required ?? true,
    status: "draft",
    input: opts.input ?? {},
    output: {},
    error: null,
    metadata: opts.metadata ?? {},
  };
}
