/**
 * lib/work/live/work-execution-router.ts
 *
 * Agentik — Work Execution Router
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Maps ApprovalCategory and module context to the appropriate executor type.
 * No React. No Prisma. Pure routing logic.
 */

import type { ApprovalApprovedEvent, WorkExecutorType } from "./work-execution-types";

// ── Category → Executor map ───────────────────────────────────────────────────

const CATEGORY_TO_EXECUTOR: Record<string, WorkExecutorType> = {
  FINANCIAL:   "CONCILIATION_APPROVAL",
  COLLECTIONS: "PORTFOLIO_TRANSFER",
  COMMERCIAL:  "TASK_ASSIGNMENT",
  MARKETING:   "CAMPAIGN_LAUNCH",
  OPERATIONS:  "TASK_ASSIGNMENT",
  COMPLIANCE:  "DOCUMENT_GENERATION",
  INVENTORY:   "TASK_ASSIGNMENT",
  CUSTOM:      "TASK_ASSIGNMENT",
};

// ── Module → Executor map (higher specificity than category) ──────────────────

const MODULE_TO_EXECUTOR: Record<string, WorkExecutorType> = {
  conciliacion: "CONCILIATION_APPROVAL",
  tesoreria:    "CONCILIATION_APPROVAL",
  cierre:       "CONCILIATION_APPROVAL",
  cobranza:     "PORTFOLIO_TRANSFER",
  comercial:    "TASK_ASSIGNMENT",
  marketing:    "CAMPAIGN_LAUNCH",
  documentos:   "DOCUMENT_GENERATION",
  planeacion:   "REPORT_GENERATION",
  reports:      "REPORT_GENERATION",
};

// ── Default fallback ──────────────────────────────────────────────────────────

const DEFAULT_EXECUTOR: WorkExecutorType = "TASK_ASSIGNMENT";

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Resolve the WorkExecutorType for a given ApprovalApprovedEvent.
 *
 * Resolution order:
 *   1. module context (most specific)
 *   2. approval category
 *   3. default (TASK_ASSIGNMENT)
 */
export function resolveExecutorForApproval(event: ApprovalApprovedEvent): WorkExecutorType {
  // Module-based resolution (highest specificity)
  if (event.module) {
    const moduleKey = event.module.toLowerCase().replace(/[^a-z]/g, "");
    for (const [key, executor] of Object.entries(MODULE_TO_EXECUTOR)) {
      if (moduleKey.includes(key)) return executor;
    }
  }

  // Category-based resolution
  if (event.approvalCategory) {
    const byCategory = CATEGORY_TO_EXECUTOR[event.approvalCategory.toUpperCase()];
    if (byCategory) return byCategory;
  }

  return DEFAULT_EXECUTOR;
}

/**
 * Returns all possible executor types this router can resolve.
 */
export function getSupportedExecutorTypes(): WorkExecutorType[] {
  return [
    ...new Set([
      ...Object.values(CATEGORY_TO_EXECUTOR),
      ...Object.values(MODULE_TO_EXECUTOR),
      DEFAULT_EXECUTOR,
    ]),
  ];
}
