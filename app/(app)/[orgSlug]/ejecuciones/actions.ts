"use server";

/**
 * app/(app)/[orgSlug]/ejecuciones/actions.ts
 *
 * Agentik — Ejecuciones Server Actions
 * Sprint: AGENTIK-WORK-EXECUTION-RETRY-01
 *
 * Server Actions for the /ejecuciones page.
 * Only callable from client components — never import workExecutionService client-side.
 */

import { revalidatePath }          from "next/cache";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { workExecutionService }    from "@/lib/work/live/work-execution-service";
import type { WorkExecutionRetryResult } from "@/lib/work/live/work-execution-service";

// ── Retry action result ───────────────────────────────────────────────────────

export interface RetryActionResult {
  success:             boolean;
  message:             string;
  originalExecutionId: string;
  retryExecutionId?:   string;
  retryAttempt?:       number;
  errors?:             string[];
  warnings?:           string[];
}

// ── retryWorkExecutionAction ──────────────────────────────────────────────────

/**
 * Retry a FAILED WorkExecution.
 *
 * Validates org access, delegates to workExecutionService.retryExecution,
 * revalidates the ejecuciones path, and returns a serializable result.
 *
 * Never exposes stack traces or Prisma errors to the client.
 */
export async function retryWorkExecutionAction(
  executionId: string,
  orgSlug:     string,
  reason?:     string,
): Promise<RetryActionResult> {
  try {
    const session = await requireOrgAccess(orgSlug);

    const actor = {
      id:   session.user?.id ?? "unknown",
      type: "USER" as const,
      name: session.user?.name ?? session.user?.email ?? "Usuario",
    };

    const result: WorkExecutionRetryResult = await workExecutionService.retryExecution(
      executionId,
      actor,
      reason,
    );

    if (result.success) {
      revalidatePath(`/${orgSlug}/ejecuciones`);
    }

    return {
      success:             result.success,
      message:             result.message,
      originalExecutionId: result.originalExecutionId,
      retryExecutionId:    result.retryExecutionId,
      retryAttempt:        result.retryAttempt,
      errors:              result.errors,
      warnings:            result.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al reintentar.";
    console.error("[retryWorkExecutionAction]", err);
    return {
      success:             false,
      message:             "No se pudo completar el reintento. Intenta de nuevo.",
      originalExecutionId: executionId,
      errors:              [message],
    };
  }
}
