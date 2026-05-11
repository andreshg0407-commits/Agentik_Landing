/**
 * lib/reconciliation/audit-trail.ts
 *
 * AGENTIK-RECON-SESSIONS-01 — Task 7
 * Reconciliation Audit Trail
 *
 * Emits immutable audit events to the ReconciliationEvent table.
 *
 * Design principles:
 *   - All events are immutable. Never update or delete ReconciliationEvent rows.
 *   - Events are ordered by createdAt — together they form the session audit trail.
 *   - Failures are isolated: a failed event emission NEVER aborts a reconciliation run.
 *   - actorType distinguishes "system" (automated), "user" (operator), "agent" (AI).
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                  from "@/lib/prisma";
import type { ReconAuditEventType } from "./session-types";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Emit one reconciliation audit event.
 *
 * Safe to call without await in non-critical paths — the promise resolves after
 * the DB write completes. Failures are logged but do NOT throw.
 */
export async function emitReconEvent(params: {
  organizationId: string;
  sessionId:      string;
  eventType:      ReconAuditEventType;
  message:        string;
  actorType?:     "system" | "user" | "agent";
  actorId?:       string;
  metadata?:      Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.reconciliationEvent.create({
      data: {
        organizationId: params.organizationId,
        sessionId:      params.sessionId,
        actorType:      params.actorType ?? "system",
        actorId:        params.actorId   ?? null,
        eventType:      params.eventType,
        message:        params.message,
        metadataJson:   (params.metadata ?? null) as never,
      },
    });
  } catch (err) {
    // Audit trail failures must NEVER break the reconciliation flow.
    // Log to stderr for observability; do not rethrow.
    console.error(
      "[RECON_AUDIT]",
      JSON.stringify({
        level:         "error",
        organizationId: params.organizationId,
        sessionId:      params.sessionId,
        eventType:      params.eventType,
        error:          err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * Emit multiple audit events for the same session in one batch.
 * Events are created sequentially to preserve ordering.
 *
 * For internal use only — prefer individual emitReconEvent() calls for
 * clarity at call sites.
 */
export async function emitReconEventBatch(
  events: Array<Parameters<typeof emitReconEvent>[0]>,
): Promise<void> {
  for (const ev of events) {
    await emitReconEvent(ev);
  }
}

/**
 * Fetch the audit trail for a session, ordered by createdAt ascending.
 *
 * Tenant safety: organizationId is enforced via session join.
 */
export async function getSessionAuditTrail(
  organizationId: string,
  sessionId:      string,
): Promise<Array<{
  id:          string;
  actorType:   string;
  actorId:     string | null;
  eventType:   string;
  message:     string;
  createdAt:   Date;
}>> {
  return prisma.reconciliationEvent.findMany({
    where:   { organizationId, sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id:          true,
      actorType:   true,
      actorId:     true,
      eventType:   true,
      message:     true,
      createdAt:   true,
    },
  });
}
