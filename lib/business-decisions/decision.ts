/**
 * decision.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Core BusinessDecision interface — the top-level decision artifact.
 *
 * The Decision Engine produces decisions in "recommended" status.
 * It NEVER produces "executed" decisions.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type {
  DecisionStatus,
  DecisionSource,
  DecisionPriority,
  DecisionSeverity,
} from "./decision-types";
import { nextDecisionId } from "./decision-types";
import type { DecisionOption } from "./decision-option";
import type { DecisionCriterion } from "./decision-criteria";
import type { DecisionJustification } from "./decision-justification";
import type { DecisionTradeoff } from "./decision-tradeoff";
import type { DecisionApproval } from "./decision-approval";
import type { DecisionConfidence } from "./decision-confidence";
import type { DecisionAudit } from "./decision-audit";

// -- Decision Trigger Reference -----------------------------------------------

/** What triggered the creation of this decision. */
export interface DecisionTriggerRef {
  /** Source engine/system. */
  source: DecisionSource;
  /** ID of the triggering artifact. */
  sourceId: string;
  /** Human-readable description. */
  description: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Business Decision --------------------------------------------------------

/** A business decision with evaluated options and justification. */
export interface BusinessDecision {
  /** Unique decision ID. */
  decisionId: string;
  /** Organization this decision belongs to. */
  organizationId: string;
  /** Decision title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Current status. Decision Engine only produces recommended/under_review. */
  status: DecisionStatus;
  /** Where this decision originated. */
  source: DecisionSource;
  /** What triggered this decision. */
  trigger: DecisionTriggerRef;
  /** ID of the recommended option. */
  recommendedOptionId: string | null;
  /** Evaluated options. */
  options: DecisionOption[];
  /** Criteria used for evaluation. */
  criteria: DecisionCriterion[];
  /** Justification for the recommendation. */
  justification: DecisionJustification;
  /** Tradeoffs of the recommended option. */
  tradeoffs: DecisionTradeoff[];
  /** Approval requirements. */
  approval: DecisionApproval;
  /** Confidence assessment. */
  confidence: DecisionConfidence;
  /** Audit trail. */
  audit: DecisionAudit;
  /** Priority. */
  priority: DecisionPriority;
  /** Severity of the situation. */
  severity: DecisionSeverity;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Expiration timestamp. */
  expiresAt: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
  /** MANDATORY: decisions are suggestions only. */
  suggestedOnly: true;
}

// -- Builder ------------------------------------------------------------------

/** Build a business decision. */
export function buildBusinessDecision(opts: {
  organizationId: string;
  title: string;
  description: string;
  source: DecisionSource;
  trigger: DecisionTriggerRef;
  options: DecisionOption[];
  criteria: DecisionCriterion[];
  justification: DecisionJustification;
  tradeoffs: DecisionTradeoff[];
  approval: DecisionApproval;
  confidence: DecisionConfidence;
  audit: DecisionAudit;
  recommendedOptionId?: string | null;
  priority?: DecisionPriority;
  severity?: DecisionSeverity;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): BusinessDecision {
  const now = new Date().toISOString();
  return {
    decisionId: nextDecisionId("dec"),
    organizationId: opts.organizationId,
    title: opts.title,
    description: opts.description,
    status: "recommended",
    source: opts.source,
    trigger: opts.trigger,
    recommendedOptionId: opts.recommendedOptionId ?? null,
    options: opts.options,
    criteria: opts.criteria,
    justification: opts.justification,
    tradeoffs: opts.tradeoffs,
    approval: opts.approval,
    confidence: opts.confidence,
    audit: opts.audit,
    priority: opts.priority ?? "normal",
    severity: opts.severity ?? "medium",
    createdAt: now,
    updatedAt: now,
    expiresAt: opts.expiresAt ?? null,
    metadata: opts.metadata ?? {},
    suggestedOnly: true,
  };
}
