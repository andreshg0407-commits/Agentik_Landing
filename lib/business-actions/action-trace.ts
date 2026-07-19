/**
 * action-trace.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Trace — full provenance chain for an action.
 *
 * No execution without trace.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Action Trace -------------------------------------------------------------

/** Full provenance chain for an action. */
export interface ActionTrace {
  /** Source decision ID. */
  sourceDecisionId: string | null;
  /** Source plan ID. */
  sourcePlanId: string | null;
  /** Source rule evaluation IDs. */
  sourceRuleEvaluationIds: string[];
  /** Source event IDs. */
  sourceEventIds: string[];
  /** Source signal IDs. */
  sourceSignalIds: string[];
  /** Source reasoning chain IDs. */
  sourceReasoningChainIds: string[];
  /** Source entity IDs. */
  sourceEntityIds: string[];
  /** User who initiated or approved. */
  sourceUserId: string | null;
  /** Approval ID (if action required approval). */
  sourceApprovalId: string | null;
  /** Arbitrary trace metadata. */
  traceMetadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action trace. */
export function buildActionTrace(opts: {
  sourceDecisionId?: string | null;
  sourcePlanId?: string | null;
  sourceRuleEvaluationIds?: string[];
  sourceEventIds?: string[];
  sourceSignalIds?: string[];
  sourceReasoningChainIds?: string[];
  sourceEntityIds?: string[];
  sourceUserId?: string | null;
  sourceApprovalId?: string | null;
  traceMetadata?: Record<string, unknown>;
}): ActionTrace {
  return {
    sourceDecisionId: opts.sourceDecisionId ?? null,
    sourcePlanId: opts.sourcePlanId ?? null,
    sourceRuleEvaluationIds: opts.sourceRuleEvaluationIds ?? [],
    sourceEventIds: opts.sourceEventIds ?? [],
    sourceSignalIds: opts.sourceSignalIds ?? [],
    sourceReasoningChainIds: opts.sourceReasoningChainIds ?? [],
    sourceEntityIds: opts.sourceEntityIds ?? [],
    sourceUserId: opts.sourceUserId ?? null,
    sourceApprovalId: opts.sourceApprovalId ?? null,
    traceMetadata: opts.traceMetadata ?? {},
  };
}
