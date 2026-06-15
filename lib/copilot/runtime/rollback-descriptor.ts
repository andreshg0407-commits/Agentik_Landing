/**
 * lib/copilot/runtime/rollback-descriptor.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Rollback descriptor contracts.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Phase 1: rollback is DESCRIPTIVE, not executable.
 *     The runtime generates a RollbackDescriptor after execution — it describes
 *     what steps COULD be reversed and how, but does NOT actually reverse them.
 *   - Phase 2 (future): a RollbackExecutor will consume these descriptors.
 *   - Every compensation entry is domain-defined; the runtime only aggregates.
 *   - No compensation is mandatory — it is a "suggestion" for the operator.
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← rollback-descriptor ← action-runtime
 */
import "server-only";

import type { RuntimeStepResult, ExecutionContext } from "./runtime-types";

// ── Compensation ───────────────────────────────────────────────────────────────

/**
 * Reversibility classification for a completed step.
 *
 *   reversible    — can be fully undone (e.g. unpublish a product)
 *   partial       — can be partially undone (e.g. reduce a discount, not delete it)
 *   irreversible  — cannot be undone (e.g. sent notification, charged customer)
 *   unknown       — domain did not declare reversibility
 */
export type ReversibilityClass =
  | "reversible"
  | "partial"
  | "irreversible"
  | "unknown";

/**
 * A single compensation entry — describes how one completed step can be reversed.
 *
 * The runtime creates one entry per completed step. Entries are ordered
 * in REVERSE execution order (last step to complete = first to roll back).
 *
 * Future: `compensationActionId` will be dispatched by the RollbackExecutor.
 */
export interface CompensationEntry {
  /** Step that was executed */
  stepId:               string;
  /** The action that ran */
  actionId:             string;
  /** Domain that owns the action */
  domain:               string;
  /** Display name for human review */
  displayName:          string;
  /** Reversibility of this specific step */
  reversibility:        ReversibilityClass;
  /**
   * Future: action to invoke to reverse this step.
   * Format: "{namespace}.{functionName}" — same as actionId.
   * undefined = no compensation action available.
   */
  compensationActionId?: string;
  /**
   * Parameters to pass to the compensation action.
   * Usually derived from the original step's output data.
   */
  compensationParams?:  Record<string, unknown>;
  /** Human-readable note for the operator */
  note:                 string;
}

// ── Rollback descriptor ────────────────────────────────────────────────────────

/**
 * A complete rollback descriptor for a finished execution.
 *
 * Produced after `executeExecutionPlan()` completes — regardless of outcome.
 * Contains a compensation plan for all successfully completed steps.
 *
 * This is a READ-ONLY artifact. Nothing in Phase 1 executes it.
 */
export interface RollbackDescriptor {
  /** Links to the execution that produced this descriptor */
  executionId:          string;
  /** Tenant scope */
  tenantId:             string;
  /** When this descriptor was generated */
  generatedAt:          Date;
  /**
   * Whether any completed step is potentially reversible.
   * false = all steps were irreversible or no steps completed.
   */
  hasReversibleSteps:   boolean;
  /**
   * Whether ALL completed steps are reversible.
   * Useful for UI: "This execution can be fully undone."
   */
  fullyReversible:      boolean;
  /** Compensation plan — ordered in REVERSE execution order */
  compensationPlan:     CompensationEntry[];
  /**
   * Total number of completed steps included in this descriptor.
   * Skipped/failed/blocked steps are NOT included.
   */
  completedStepCount:   number;
  /** Summary for human review */
  summary:              string;
}

// ── Reversibility inference ────────────────────────────────────────────────────

/**
 * Infer reversibility for a step from its result and domain metadata.
 *
 * Phase 1 inference rules (heuristic — no domain-specific integration yet):
 *   - actionId includes "publish" or "create"   → reversible
 *   - actionId includes "delete" or "send"      → irreversible
 *   - actionId includes "update" or "complete"  → partial
 *   - everything else                           → unknown
 *
 * Phase 2: domain providers will return explicit reversibility declarations
 * as part of ActionHandlerResult, overriding these heuristics.
 */
function inferReversibility(stepResult: RuntimeStepResult): ReversibilityClass {
  const id = stepResult.actionId.toLowerCase();

  if (id.includes("delete") || id.includes("send") || id.includes("notify")) {
    return "irreversible";
  }
  if (id.includes("publish") || id.includes("create") || id.includes("generate")) {
    return "reversible";
  }
  if (id.includes("update") || id.includes("complete") || id.includes("enrich")) {
    return "partial";
  }
  return "unknown";
}

/**
 * Infer the compensation action ID from the original action.
 *
 * Phase 1: simple naming convention — prepend "undo" or "revert".
 * Only returns a value for reversible actions; undefined otherwise.
 *
 * Phase 2: domain providers will supply explicit `compensationActionId`.
 */
function inferCompensationActionId(
  actionId:      string,
  reversibility: ReversibilityClass,
): string | undefined {
  if (reversibility === "irreversible" || reversibility === "unknown") {
    return undefined;
  }

  const parts   = actionId.split(".");
  const ns      = parts.slice(0, -1).join(".");
  const fn      = parts.at(-1) ?? "";

  // Convention: if action is "catalog.publishProducts" → "catalog.unpublishProducts"
  if (fn.startsWith("publish")) {
    return ns ? `${ns}.un${fn}` : `un${fn}`;
  }
  if (fn.startsWith("create") || fn.startsWith("generate")) {
    return ns ? `${ns}.delete${fn.slice(fn.startsWith("create") ? 6 : 8)}` : undefined;
  }
  return undefined;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build a RollbackDescriptor from an execution's completed step results.
 *
 * Only `completed` steps are included — failed, skipped, and blocked steps
 * have no rollback relevance.
 *
 * The compensation plan is ordered in REVERSE execution order (last step first).
 *
 * @param ctx           - Execution context (for executionId / tenantId)
 * @param stepResults   - All step results from the execution (any status)
 */
export function buildRollbackDescriptor(
  ctx:         ExecutionContext,
  stepResults: RuntimeStepResult[],
): RollbackDescriptor {
  const completedResults = stepResults.filter(r => r.status === "completed");

  // Build compensation plan in reverse order
  const compensationPlan: CompensationEntry[] = [...completedResults]
    .reverse()
    .map((result): CompensationEntry => {
      const reversibility        = inferReversibility(result);
      const compensationActionId = inferCompensationActionId(result.actionId, reversibility);

      const note = reversibility === "irreversible"
        ? `Step "${result.displayName}" cannot be undone automatically.`
        : reversibility === "unknown"
          ? `Reversibility of "${result.displayName}" is unknown — manual review required.`
          : `Step "${result.displayName}" may be reversible via ${compensationActionId ?? "manual intervention"}.`;

      return {
        stepId:               result.stepId,
        actionId:             result.actionId,
        domain:               result.domain,
        displayName:          result.displayName,
        reversibility,
        compensationActionId,
        compensationParams:   undefined, // Phase 2: derive from result.data
        note,
      };
    });

  const hasReversibleSteps = compensationPlan.some(
    e => e.reversibility === "reversible" || e.reversibility === "partial",
  );

  const fullyReversible =
    compensationPlan.length > 0 &&
    compensationPlan.every(e => e.reversibility === "reversible");

  const irreversibleCount = compensationPlan.filter(
    e => e.reversibility === "irreversible",
  ).length;

  const summary = compensationPlan.length === 0
    ? "No completed steps — nothing to roll back."
    : fullyReversible
      ? `All ${compensationPlan.length} completed step(s) are potentially reversible.`
      : irreversibleCount > 0
        ? `${compensationPlan.length} step(s) completed; ${irreversibleCount} are irreversible and cannot be undone.`
        : `${compensationPlan.length} step(s) completed; rollback may be partial.`;

  return {
    executionId:        ctx.executionId,
    tenantId:           ctx.tenantId,
    generatedAt:        new Date(),
    hasReversibleSteps,
    fullyReversible,
    compensationPlan,
    completedStepCount: completedResults.length,
    summary,
  };
}
