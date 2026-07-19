/**
 * lib/agent-runtime/tool-execution-kernel.ts
 *
 * Agentik Runtime Tool Execution Kernel — Main Execution Engine
 *
 * The ONLY place where tools execute. No UI, no agent code,
 * no route handler may call tool handlers directly.
 *
 * Execution flow:
 *   createToolExecutionRequest()
 *   → validateToolExecution()   (guard)
 *   → executeToolRequest()      (handler + lifecycle + events + audit)
 *
 * Action lifecycle transitions managed here:
 *   approved → executing → executed | failed
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import type { ActionEnvelope }        from "./action-envelope";
import type { AgentDelegation }       from "@/lib/agent-orchestration/delegation-types";
import type {
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolExecutionAuditRecord,
} from "./tool-execution-types";
import { terId, terIdKey }            from "./tool-execution-types";
import { validateToolExecution }      from "./tool-execution-guard";
import {
  resolveToolHandler,
  checkIdempotencyKey,
  markIdempotencyKey,
  recordExecutionAttempt,
  recordExecutionSuccess,
  recordExecutionFailure,
}                                     from "./tool-handler-registry";
import { emitAgentRuntimeEvent }      from "./runtime-events";
import { appendRuntimeEvent }         from "./event-store";
import { normalizeRuntimeEvent }      from "./event-normalizer";
import type { RuntimeEvent }          from "./runtime-events";
import {
  buildNewSession,
  createExecutionSession,
  getExecutionSession,
  acquireExecutionLease,
  releaseExecutionLease,
}                                     from "./execution-session-store";
import {
  markExecutionLeasing,
  markExecutionValidating,
  markExecutionRunning,
  markExecutionSucceeded,
  markExecutionFailed,
  markExecutionTimedOut,
  markExecutionSkipped,
  markExecutionRejected,
  markAttemptSucceeded,
  markAttemptFailed,
  markAttemptTimedOut,
  getLatestAttempt,
}                                     from "./execution-lifecycle";
import {
  checkSessionIdempotency,
  buildExecutionIdempotencyKey,
}                                     from "./execution-idempotency";
import { withExecutionTimeout }       from "./execution-timeout";
import {
  startExecutionHeartbeat,
  getActiveHeartbeatCount,
}                                     from "./execution-heartbeat";

// ── Request builder ───────────────────────────────────────────────────────────

export function createToolExecutionRequest(
  opts: {
    orgId:         string;
    actionId:      string;
    toolId:        string;
    agentId:       string;
    moduleKey:     string;
    requestedBy:   string;
    payload:       Record<string, unknown>;
    correlationId?: string | null;
    causationId?:  string | null;
    userRole?:     string;
    actionApproved?: boolean;
    actionApprovedBy?: string;
  },
): ToolExecutionRequest {
  return {
    id:            terId(),
    orgId:         opts.orgId,
    actionId:      opts.actionId,
    toolId:        opts.toolId,
    agentId:       opts.agentId,
    moduleKey:     opts.moduleKey,
    requestedBy:   opts.requestedBy,
    payload:       opts.payload,
    permissionContext: {
      orgId:            opts.orgId,
      agentId:          opts.agentId,
      moduleKey:        opts.moduleKey,
      actionApproved:   opts.actionApproved ?? false,
      actionApprovedBy: opts.actionApprovedBy,
      userRole:         opts.userRole,
    },
    correlationId: opts.correlationId ?? null,
    causationId:   opts.causationId ?? null,
    createdAt:     new Date().toISOString(),
  };
}

// ── Internal event helpers ────────────────────────────────────────────────────

function emitSessionEvent(
  type:      string,
  orgId:     string,
  agentId:   string,
  moduleKey: string,
  extra:     Record<string, unknown> = {},
): void {
  const partial = {
    type:           type as import("./runtime-events").RuntimeEventType,
    organizationId: orgId,
    agentId:        agentId as import("./agent-types").AgentRuntimeId,
    domain:         "commercial" as import("./agent-types").AgentDomain,
    moduleKey,
    metadata:       extra,
  };
  try { emitAgentRuntimeEvent<RuntimeEvent>(partial); } catch { /* best-effort */ }
}

function emitToolEvent(
  type:      string,
  request:   ToolExecutionRequest,
  extra:     Record<string, unknown> = {},
): void {
  const partial = {
    type:           type as import("./runtime-events").RuntimeEventType,
    organizationId: request.orgId,
    agentId:        request.agentId as import("./agent-types").AgentRuntimeId,
    domain:         "commercial" as import("./agent-types").AgentDomain,
    moduleKey:      request.moduleKey,
    correlationId:  request.correlationId ?? undefined,
    metadata: {
      actionId:    request.actionId,
      toolId:      request.toolId,
      requestId:   request.id,
      requestedBy: request.requestedBy,
      ...extra,
    },
  };

  try {
    // emitAgentRuntimeEvent also persists to event store (best-effort)
    emitAgentRuntimeEvent<RuntimeEvent>(partial);
  } catch {
    // Never block execution due to event emission failure
  }
}

function auditEntry(
  event:   string,
  actor:   string,
  details: Record<string, unknown> = {},
): ToolExecutionAuditRecord {
  return { timestamp: new Date().toISOString(), event, actor, details };
}

// ── Kernel: validate ──────────────────────────────────────────────────────────

export function validateToolExecutionRequest(
  request:     ToolExecutionRequest,
  envelope:    ActionEnvelope | null,
  delegations: AgentDelegation[],
): ReturnType<typeof validateToolExecution> {
  return validateToolExecution(request, envelope, delegations);
}

// ── Kernel: main execution ────────────────────────────────────────────────────

export async function executeToolRequest(
  request:     ToolExecutionRequest,
  envelope:    ActionEnvelope | null,
  delegations: AgentDelegation[],
): Promise<ToolExecutionResult> {
  const startedAt    = new Date().toISOString();
  const eventIds:    string[] = [];
  const audit:       ToolExecutionAuditRecord[] = [];

  audit.push(auditEntry("tool.execution_requested", request.requestedBy, { toolId: request.toolId }));

  // ── Validating ───────────────────────────────────────────────────────────
  emitToolEvent("tool.called", request, { phase: "validating" });
  audit.push(auditEntry("tool.execution_validating", "kernel", { actionId: request.actionId }));

  const guard = validateToolExecution(request, envelope, delegations);

  if (!guard.allowed) {
    const completedAt = new Date().toISOString();
    emitToolEvent("tool.failed", request, {
      phase:   "rejected",
      reasons: guard.reasons,
    });
    audit.push(auditEntry("tool.execution_rejected", "kernel", { reasons: guard.reasons }));
    recordExecutionFailure(request.toolId);

    return {
      requestId:    request.id,
      actionId:     request.actionId,
      toolId:       request.toolId,
      status:       "rejected",
      output:       null,
      error: {
        code:      "GUARD_DENIED",
        message:   guard.reasons[0] ?? "Execution denied by guard.",
        retryable: false,
        details:   { reasons: guard.reasons, blockingDeps: guard.blockingDependencies },
      },
      startedAt,
      completedAt,
      durationMs:   new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      events:       eventIds,
      auditRecords: audit,
    };
  }

  // ── Idempotency ───────────────────────────────────────────────────────────
  const handler = resolveToolHandler(request.toolId)!;
  if (handler.policy.idempotencyKey) {
    const key = terIdKey(request.actionId, request.toolId);
    if (checkIdempotencyKey(key)) {
      const completedAt = new Date().toISOString();
      audit.push(auditEntry("tool.execution_skipped", "kernel", { reason: "idempotency", key }));
      return {
        requestId:    request.id,
        actionId:     request.actionId,
        toolId:       request.toolId,
        status:       "skipped",
        output:       null,
        error:        null,
        startedAt,
        completedAt,
        durationMs:   0,
        events:       eventIds,
        auditRecords: audit,
      };
    }
  }

  // ── Executing ────────────────────────────────────────────────────────────
  recordExecutionAttempt(request.toolId);
  emitToolEvent("tool.called", request, { phase: "executing" });
  audit.push(auditEntry("tool.execution_started", "kernel", { toolId: request.toolId }));

  let output:      Record<string, unknown> | null = null;
  let execError:   { code: string; message: string; retryable: boolean } | null = null;
  let execStatus:  "succeeded" | "failed" = "succeeded";

  const handlerTimeoutMs = handler.policy.timeoutMs ?? 30_000;
  try {
    const timeoutResult = await withExecutionTimeout(
      () => handler.execute(request.payload, {
        orgId:         request.orgId,
        agentId:       request.agentId,
        moduleKey:     request.moduleKey,
        actionId:      request.actionId,
        requestedBy:   request.requestedBy,
        correlationId: request.correlationId,
      }),
      handlerTimeoutMs,
    );

    if (timeoutResult.timedOut) {
      execStatus = "failed";
      execError  = {
        code:      "TIMEOUT",
        message:   `Execution timed out after ${handlerTimeoutMs}ms`,
        retryable: true,
      };
    } else {
      output     = timeoutResult.result;
      execStatus = "succeeded";
      if (handler.policy.idempotencyKey) {
        markIdempotencyKey(terIdKey(request.actionId, request.toolId));
      }
    }
  } catch (err) {
    execStatus = "failed";
    execError = {
      code:      "EXECUTION_ERROR",
      message:   (err as Error).message ?? "Unknown execution error",
      retryable: false,
    };
  }

  const completedAt = new Date().toISOString();
  const durationMs  = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  if (execStatus === "succeeded") {
    emitToolEvent("tool.completed", request, { output: output ?? {}, durationMs });
    audit.push(auditEntry("tool.execution_succeeded", "kernel", { durationMs }));
    recordExecutionSuccess(request.toolId, durationMs);
  } else {
    emitToolEvent("tool.failed", request, { error: execError?.message, durationMs });
    audit.push(auditEntry("tool.execution_failed", "kernel", { error: execError?.message }));
    recordExecutionFailure(request.toolId);
  }

  return {
    requestId:    request.id,
    actionId:     request.actionId,
    toolId:       request.toolId,
    status:       execStatus,
    output,
    error:        execError,
    startedAt,
    completedAt,
    durationMs,
    events:       eventIds,
    auditRecords: audit,
  };
}

// ── High-level: execute approved action ───────────────────────────────────────
// Single entry point for API routes.
//
// Lifecycle (HARDENING-01 compliant):
//   queued → leasing → [heartbeat starts] → validating →
//   (guard rejected → rejected | idempotency → skipped) |
//   (running [← attempt created HERE, BEFORE handler] → handler → succeeded | failed | timed_out)
//   → [heartbeat stops] → lease released

export async function executeApprovedAction(opts: {
  orgId:          string;
  actionId:       string;
  toolId:         string;
  envelope:       ActionEnvelope | null;
  delegations:    AgentDelegation[];
  requestedBy:    string;
  userRole?:      string;
  payload?:       Record<string, unknown>;
  correlationId?: string | null;
}): Promise<ToolExecutionResult> {
  const agentId   = String(opts.envelope?.sourceAgentId ?? "unknown");
  const moduleKey = opts.envelope?.moduleKey ?? "unknown";
  const payload   = opts.payload ?? (opts.envelope?.payloadSummary as Record<string, unknown>) ?? {};

  // ── Session-level idempotency ─────────────────────────────────────────────
  try {
    const existing = await checkSessionIdempotency(opts.orgId, opts.actionId, opts.toolId);
    if (existing && existing.status === "succeeded") {
      return {
        requestId:    existing.id,
        actionId:     opts.actionId,
        toolId:       opts.toolId,
        status:       "skipped",
        output:       existing.result,
        error:        null,
        startedAt:    existing.startedAt ?? existing.createdAt,
        completedAt:  existing.completedAt ?? existing.updatedAt,
        durationMs:   existing.durationMs ?? 0,
        events:       existing.events,
        auditRecords: [],
      };
    }
  } catch {
    // Best-effort — proceed if idempotency check fails
  }

  // ── Create execution session ──────────────────────────────────────────────
  const sessionIdempotencyKey = buildExecutionIdempotencyKey(opts.orgId, opts.actionId, opts.toolId);
  let session = buildNewSession({
    orgId:          opts.orgId,
    actionId:       opts.actionId,
    toolId:         opts.toolId,
    agentId,
    moduleKey,
    payload,
    idempotencyKey: sessionIdempotencyKey,
    correlationId:  opts.correlationId ?? null,
    causationId:    null,
    maxAttempts:    3,
  });

  try {
    session = await createExecutionSession(session);
    emitSessionEvent("execution.session_created", opts.orgId, agentId, moduleKey, {
      sessionId: session.id, actionId: opts.actionId, toolId: opts.toolId,
    });
  } catch {
    // Best-effort
  }

  // ── Acquire lease → leasing ───────────────────────────────────────────────
  try {
    await acquireExecutionLease(session.id, opts.requestedBy, 36_000);
    session = await markExecutionLeasing(session);
    emitSessionEvent("execution.lease_acquired", opts.orgId, agentId, moduleKey, { sessionId: session.id });
  } catch {
    // Best-effort
  }

  // ── Start heartbeat ───────────────────────────────────────────────────────
  // Keeps the lease alive for long-running handlers. Stopped in finally.
  const stopHeartbeat = startExecutionHeartbeat(session.id, opts.requestedBy, {
    intervalMs: 10_000,
    ttlMs:      36_000,
    orgId:      opts.orgId,
    agentId,
    moduleKey,
  });

  // ── Build request ─────────────────────────────────────────────────────────
  const request = createToolExecutionRequest({
    orgId:            opts.orgId,
    actionId:         opts.actionId,
    toolId:           opts.toolId,
    agentId,
    moduleKey,
    requestedBy:      opts.requestedBy,
    payload,
    correlationId:    opts.correlationId,
    userRole:         opts.userRole,
    actionApproved:   opts.envelope?.agentStatus === "approved",
    actionApprovedBy: opts.envelope?.approvedBy ?? undefined,
  });

  const startedAt = new Date().toISOString();
  const audit: ToolExecutionAuditRecord[] = [];
  audit.push(auditEntry("tool.execution_requested", opts.requestedBy, { toolId: opts.toolId }));

  let output:     Record<string, unknown> | null = null;
  let execError:  { code: string; message: string; retryable: boolean; details?: Record<string, unknown> } | null = null;
  let execStatus: "succeeded" | "failed" | "timed_out" | "rejected" | "skipped" = "succeeded";

  try {
    // ── validating ───────────────────────────────────────────────────────────
    try { session = await markExecutionValidating(session); } catch { /* best-effort */ }
    emitToolEvent("tool.called", request, { phase: "validating" });
    audit.push(auditEntry("tool.execution_validating", "kernel", { actionId: opts.actionId }));

    // ── Guard ─────────────────────────────────────────────────────────────
    const guard = validateToolExecution(request, opts.envelope, opts.delegations);

    if (!guard.allowed) {
      execStatus = "rejected";
      execError  = {
        code:      "GUARD_DENIED",
        message:   guard.reasons[0] ?? "Execution denied by guard.",
        retryable: false,
        details:   { reasons: guard.reasons, blockingDeps: guard.blockingDependencies },
      };
      emitToolEvent("tool.failed", request, { phase: "rejected", reasons: guard.reasons });
      audit.push(auditEntry("tool.execution_rejected", "kernel", { reasons: guard.reasons }));
      recordExecutionFailure(request.toolId);
      try {
        session = await markExecutionRejected(session, guard.reasons[0] ?? "Guard rejected");
        emitToolEvent("execution.rejected", request, { sessionId: session.id });
      } catch { /* best-effort */ }
      const completedAt = new Date().toISOString();
      return {
        requestId:    request.id,
        actionId:     opts.actionId,
        toolId:       opts.toolId,
        status:       "rejected",
        output:       null,
        error:        execError,
        startedAt,
        completedAt,
        durationMs:   new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        events:       session.events,
        auditRecords: audit,
      };
    }

    // ── Tool-level idempotency ────────────────────────────────────────────
    const handler = resolveToolHandler(request.toolId)!;
    if (handler.policy.idempotencyKey) {
      const key = terIdKey(request.actionId, request.toolId);
      if (checkIdempotencyKey(key)) {
        execStatus = "skipped";
        audit.push(auditEntry("tool.execution_skipped", "kernel", { reason: "idempotency", key }));
        try {
          session = await markExecutionSkipped(session, "idempotency");
          emitToolEvent("execution.skipped", request, { sessionId: session.id });
        } catch { /* best-effort */ }
        const completedAt = new Date().toISOString();
        return {
          requestId:    request.id,
          actionId:     opts.actionId,
          toolId:       opts.toolId,
          status:       "skipped",
          output:       null,
          error:        null,
          startedAt,
          completedAt,
          durationMs:   0,
          events:       session.events,
          auditRecords: audit,
        };
      }
    }

    // ── MARK RUNNING BEFORE HANDLER ──────────────────────────────────────
    // This is the critical fix: session.status = "running" and attempt record
    // is created HERE, before any handler code executes.
    recordExecutionAttempt(request.toolId);
    try {
      session = await markExecutionRunning(session);
      const latestAttempt = getLatestAttempt(session);
      emitToolEvent("execution.attempt_started", request, {
        sessionId:     session.id,
        attemptId:     latestAttempt?.id,
        attemptNumber: session.attempt,
      });
      emitSessionEvent("execution.running", opts.orgId, agentId, moduleKey, {
        sessionId: session.id, attempt: session.attempt,
      });
    } catch { /* best-effort */ }
    emitToolEvent("tool.called", request, { phase: "executing", attempt: session.attempt });
    audit.push(auditEntry("tool.execution_started", "kernel", { toolId: opts.toolId, attempt: session.attempt }));

    // ── Execute handler with timeout ──────────────────────────────────────
    const handlerTimeoutMs = (handler as { policy: { timeoutMs?: number } }).policy.timeoutMs ?? 30_000;
    const handlerCtx = {
      orgId:         opts.orgId,
      agentId,
      moduleKey,
      actionId:      opts.actionId,
      requestedBy:   opts.requestedBy,
      correlationId: opts.correlationId ?? null,
    };

    try {
      const timeoutResult = await withExecutionTimeout(
        () => handler.execute(payload, handlerCtx),
        handlerTimeoutMs,
      );
      const completedAt = new Date().toISOString();
      const durationMs  = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      if (timeoutResult.timedOut) {
        execStatus = "timed_out";
        execError  = {
          code:      "TIMEOUT",
          message:   `Execution timed out after ${handlerTimeoutMs}ms`,
          retryable: true,
        };
        try {
          session = await markAttemptTimedOut(session, durationMs);
          session = await markExecutionTimedOut(session);
          const latestAttempt = getLatestAttempt(session);
          emitToolEvent("execution.attempt_timed_out", request, {
            sessionId: session.id, attemptId: latestAttempt?.id, durationMs,
          });
          emitToolEvent("execution.timed_out", request, { sessionId: session.id, durationMs });
        } catch { /* best-effort */ }
        emitToolEvent("tool.failed", request, { error: execError.message, timeout: true, durationMs });
        audit.push(auditEntry("tool.execution_failed", "kernel", { error: execError.message, timeout: true, durationMs }));
        recordExecutionFailure(request.toolId);
      } else {
        output     = timeoutResult.result;
        execStatus = "succeeded";
        if (handler.policy.idempotencyKey) {
          markIdempotencyKey(terIdKey(request.actionId, request.toolId));
        }
        try {
          session = await markAttemptSucceeded(session, durationMs);
          session = await markExecutionSucceeded(session, output ?? {});
          const latestAttempt = getLatestAttempt(session);
          emitToolEvent("execution.attempt_succeeded", request, {
            sessionId: session.id, attemptId: latestAttempt?.id, durationMs,
          });
          emitToolEvent("execution.succeeded", request, { sessionId: session.id, durationMs });
        } catch { /* best-effort */ }
        emitToolEvent("tool.completed", request, { output: output ?? {}, durationMs });
        audit.push(auditEntry("tool.execution_succeeded", "kernel", { durationMs }));
        recordExecutionSuccess(request.toolId, durationMs);
      }

    } catch (err) {
      const completedAt = new Date().toISOString();
      const durationMs  = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      execStatus = "failed";
      execError  = {
        code:      "EXECUTION_ERROR",
        message:   (err as Error).message ?? "Unknown execution error",
        retryable: false,
      };
      try {
        session = await markAttemptFailed(session, execError.message, durationMs, false);
        session = await markExecutionFailed(session, execError.message, execError.code, false);
        const latestAttempt = getLatestAttempt(session);
        emitToolEvent("execution.attempt_failed", request, {
          sessionId: session.id, attemptId: latestAttempt?.id, error: execError.message, durationMs,
        });
        emitToolEvent("execution.failed", request, { sessionId: session.id, error: execError.message });
      } catch { /* best-effort */ }
      emitToolEvent("tool.failed", request, { error: execError.message, durationMs });
      audit.push(auditEntry("tool.execution_failed", "kernel", { error: execError.message }));
      recordExecutionFailure(request.toolId);
    }

  } finally {
    // ── Stop heartbeat FIRST, then release lease ──────────────────────────
    // Order matters: stop the interval before releasing, so no refresh races
    // with a released lease.
    stopHeartbeat();
    try {
      await releaseExecutionLease(session.id);
      emitSessionEvent("execution.lease_released", opts.orgId, agentId, moduleKey, { sessionId: session.id });
    } catch { /* best-effort */ }
  }

  const completedAt = new Date().toISOString();
  const durationMs  = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  return {
    requestId:    request.id,
    actionId:     opts.actionId,
    toolId:       opts.toolId,
    status:       execStatus === "timed_out" ? "failed" : execStatus,
    output,
    error:        execError,
    startedAt,
    completedAt,
    durationMs,
    events:       session.events,
    auditRecords: audit,
  };
}
