/**
 * lib/copilot/actions/server/create-approval-from-action.ts
 *
 * Agentik Copilot — Server-Side Approval Creation Bridge
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * SERVER-ONLY bridge between a Copilot action context and real approval persistence.
 *
 * Flow:
 *   Server Action
 *     → createApprovalFromCopilotAction()
 *     → buildApprovalRequestFromCopilotAction()
 *     → approvalService.createApprovalFromRequest()
 *     → Approval persisted in PostgreSQL
 *
 * NOT imported by action-executor.ts (client-safe executor).
 * NOT exported from lib/copilot/actions/index.ts.
 * Called only from server contexts: Server Actions, API routes, background jobs.
 *
 * Returns a flat, JSON-serializable result — no Date objects, no Prisma types.
 */
import "server-only";

import { buildApprovalRequestFromCopilotAction } from "../approval-action-adapter";
import { approvalService }                        from "@/lib/approvals/approval-service";
import type { CopilotActionContext }               from "../action-types";

// ── Serializable result ───────────────────────────────────────────────────────

/** Flat, JSON-safe result returned to Server Actions and API routes. */
export interface CopilotApprovalCreationResult {
  success:      boolean;
  message:      string;
  approvalId?:  string;
  approvalTitle?: string;
  approvalStatus?: string;
  createdAt?:   string;
  errors?:      string[];
  warnings?:    string[];
}

// ── Bridge function ───────────────────────────────────────────────────────────

/**
 * Create a real, persisted ApprovalRequest from a Copilot action context.
 * Returns a flat serializable result.
 */
export async function createApprovalFromCopilotAction(
  context: CopilotActionContext,
): Promise<CopilotApprovalCreationResult> {
  try {
    const request = buildApprovalRequestFromCopilotAction(context);
    const result  = await approvalService.createApprovalFromRequest(request);

    if (result.success && result.approval) {
      return {
        success:         true,
        message:         "Solicitud de aprobación creada correctamente.",
        approvalId:      result.approval.id,
        approvalTitle:   result.approval.title,
        approvalStatus:  result.approval.status,
        createdAt:       result.approval.createdAt,
        warnings:        result.warnings,
      };
    }

    return {
      success:  false,
      message:  result.message || "No se pudo crear la solicitud de aprobación.",
      errors:   result.errors,
      warnings: result.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al crear aprobación.";
    return {
      success: false,
      message: "No se pudo crear la solicitud de aprobación.",
      errors:  [message],
    };
  }
}

/**
 * Convenience wrapper for minimal context objects.
 */
export async function createApprovalFromMinimalContext(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
}): Promise<CopilotApprovalCreationResult> {
  return createApprovalFromCopilotAction({
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
  });
}
