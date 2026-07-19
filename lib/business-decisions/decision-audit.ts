/**
 * decision-audit.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Audit trail — enables full reconstruction of how a decision was made.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Audit Trail Entry --------------------------------------------------------

/** A single entry in the decision audit trail. */
export interface DecisionAuditEntry {
  /** Timestamp. */
  timestamp: string;
  /** What happened. */
  action: string;
  /** Details. */
  detail: string;
}

// -- Decision Audit -----------------------------------------------------------

/** Complete audit record for a decision. */
export interface DecisionAudit {
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
  /** All option IDs that were evaluated. */
  evaluatedOptionIds: string[];
  /** The option ID that was selected. */
  selectedOptionId: string | null;
  /** Option IDs that were rejected. */
  rejectedOptionIds: string[];
  /** Who or what created this decision. */
  createdBy: string;
  /** Ordered audit trail. */
  auditTrail: DecisionAuditEntry[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision audit. */
export function buildDecisionAudit(opts: {
  sourcePlanId?: string | null;
  sourceRuleEvaluationIds?: string[];
  sourceEventIds?: string[];
  sourceSignalIds?: string[];
  sourceReasoningChainIds?: string[];
  sourceEntityIds?: string[];
  evaluatedOptionIds?: string[];
  selectedOptionId?: string | null;
  rejectedOptionIds?: string[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): DecisionAudit {
  return {
    sourcePlanId: opts.sourcePlanId ?? null,
    sourceRuleEvaluationIds: opts.sourceRuleEvaluationIds ?? [],
    sourceEventIds: opts.sourceEventIds ?? [],
    sourceSignalIds: opts.sourceSignalIds ?? [],
    sourceReasoningChainIds: opts.sourceReasoningChainIds ?? [],
    sourceEntityIds: opts.sourceEntityIds ?? [],
    evaluatedOptionIds: opts.evaluatedOptionIds ?? [],
    selectedOptionId: opts.selectedOptionId ?? null,
    rejectedOptionIds: opts.rejectedOptionIds ?? [],
    createdBy: opts.createdBy ?? "system",
    auditTrail: [],
    metadata: opts.metadata ?? {},
  };
}

/** Add an entry to the audit trail. */
export function addAuditEntry(
  audit: DecisionAudit,
  action: string,
  detail: string,
): void {
  audit.auditTrail.push({
    timestamp: new Date().toISOString(),
    action,
    detail,
  });
}
