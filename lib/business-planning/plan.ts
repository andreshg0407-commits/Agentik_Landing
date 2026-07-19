/**
 * plan.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Core BusinessPlan interface — the top-level planning artifact.
 *
 * A plan contains alternatives, each with steps, costs, benefits,
 * risks, dependencies, constraints, and approval requirements.
 *
 * The Planning Engine produces plans in "proposed" status.
 * It NEVER produces "executed" plans.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type {
  PlanStatus,
  PlanSource,
  PlanPriority,
  PlanSeverity,
} from "./planning-types";
import { nextPlanId } from "./planning-types";
import type { PlanAlternative } from "./plan-alternative";

// -- Plan Trigger Reference ---------------------------------------------------

/** What triggered the creation of this plan. */
export interface PlanTriggerRef {
  /** Source engine/system that originated this plan. */
  source: PlanSource;
  /** ID of the triggering artifact (ruleResultId, eventId, signalId, etc.). */
  sourceId: string;
  /** Human-readable trigger description. */
  description: string;
  /** Arbitrary trigger metadata. */
  metadata: Record<string, unknown>;
}

// -- Business Plan ------------------------------------------------------------

/** A business plan with alternatives. */
export interface BusinessPlan {
  /** Unique plan ID. */
  planId: string;
  /** Organization this plan belongs to. */
  organizationId: string;
  /** Plan title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Current status. Planning Engine only produces draft/proposed. */
  status: PlanStatus;
  /** What triggered this plan. */
  source: PlanSource;
  /** Trigger reference. */
  trigger: PlanTriggerRef;
  /** Available alternatives. */
  alternatives: PlanAlternative[];
  /** ID of the recommended alternative (after evaluation). */
  selectedAlternativeId: string | null;
  /** Overall confidence (0–100). */
  confidence: number;
  /** Priority. */
  priority: PlanPriority;
  /** Severity of the situation this plan addresses. */
  severity: PlanSeverity;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Expiration timestamp (plans may become stale). */
  expiresAt: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
  /** MANDATORY: plans are suggestions only. */
  suggestedOnly: true;
}

// -- Builder ------------------------------------------------------------------

/** Build a business plan. */
export function buildBusinessPlan(opts: {
  organizationId: string;
  title: string;
  description: string;
  source: PlanSource;
  trigger: PlanTriggerRef;
  alternatives?: PlanAlternative[];
  priority?: PlanPriority;
  severity?: PlanSeverity;
  confidence?: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): BusinessPlan {
  const now = new Date().toISOString();
  return {
    planId: nextPlanId("plan"),
    organizationId: opts.organizationId,
    title: opts.title,
    description: opts.description,
    status: "proposed",
    source: opts.source,
    trigger: opts.trigger,
    alternatives: opts.alternatives ?? [],
    selectedAlternativeId: null,
    confidence: opts.confidence ?? 50,
    priority: opts.priority ?? "normal",
    severity: opts.severity ?? "medium",
    createdAt: now,
    updatedAt: now,
    expiresAt: opts.expiresAt ?? null,
    metadata: opts.metadata ?? {},
    suggestedOnly: true,
  };
}
