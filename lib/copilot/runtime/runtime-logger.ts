/**
 * lib/copilot/runtime/runtime-logger.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Structured execution event logger.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Every significant runtime event is captured as a structured RuntimeEvent.
 *   - Logs carry executionId + tenantId on every line — no context loss.
 *   - The logger is a pure sink: it appends events and emits to console.
 *   - Future: swap the console sink for a database sink or streaming transport
 *     without changing callers — just replace the sink function.
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← runtime-logger ← action-runtime
 */
import "server-only";

import type { ExecutionContext, ExecutionStatus, ApprovalStatus } from "./runtime-types";

// ── Event types ────────────────────────────────────────────────────────────────

/**
 * All runtime event types — covers the full execution lifecycle.
 *
 * Naming convention: "{subject}_{verb_past}" — e.g. "execution_started".
 */
export type RuntimeEventType =
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "execution_cancelled"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_skipped"
  | "step_blocked"
  | "step_approval_pending"
  | "step_approval_granted"
  | "step_approval_denied"
  | "dispatcher_not_found"
  | "dispatcher_context_error"
  | "dispatcher_handler_error"
  | "policy_stop_on_failure"
  | "policy_stop_on_block";

/**
 * Structured runtime event — the unit of observability.
 *
 * All events carry:
 *   - executionId + tenantId for cross-referencing
 *   - eventType + timestamp for sequencing
 *   - optional stepId for step-level events
 *   - optional data payload (domain-specific, opaque)
 */
export interface RuntimeEvent {
  eventType:    RuntimeEventType;
  executionId:  string;
  tenantId:     string;
  timestamp:    Date;
  stepId?:      string;
  actionId?:    string;
  domain?:      string;
  status?:      ExecutionStatus;
  approvalStatus?: ApprovalStatus;
  durationMs?:  number;
  message?:     string;
  data?:        unknown;
}

// ── Logger interface ───────────────────────────────────────────────────────────

/**
 * The RuntimeLogger is passed through the execution pipeline.
 * All runtime components call `log()` — they never write directly to console.
 *
 * Future: `events` will be persisted to DB for async queues and audit replay.
 */
export interface RuntimeLogger {
  /** Append a structured event */
  log(event: Omit<RuntimeEvent, "executionId" | "tenantId" | "timestamp">): void;
  /** Return all events logged so far (in order) */
  getEvents(): Readonly<RuntimeEvent[]>;
  /** Export events as a flat array of human-readable strings (for ExecutionReport.warnings) */
  getWarnings(): string[];
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create a RuntimeLogger bound to a specific execution context.
 *
 * The logger automatically stamps every event with executionId, tenantId,
 * and timestamp — callers only provide the variable fields.
 *
 * @param ctx     - The current execution context
 * @param options - Optional: suppress console output (e.g. in tests)
 */
export function createRuntimeLogger(
  ctx:     ExecutionContext,
  options: { silent?: boolean } = {},
): RuntimeLogger {
  const events: RuntimeEvent[] = [];

  function log(
    partial: Omit<RuntimeEvent, "executionId" | "tenantId" | "timestamp">,
  ): void {
    const event: RuntimeEvent = {
      ...partial,
      executionId: ctx.executionId,
      tenantId:    ctx.tenantId,
      timestamp:   new Date(),
    };
    events.push(event);

    if (!options.silent) {
      emitToConsole(event);
    }
  }

  return {
    log,
    getEvents: () => events as Readonly<RuntimeEvent[]>,
    getWarnings: () =>
      events
        .filter(e =>
          e.eventType === "step_failed" ||
          e.eventType === "step_blocked" ||
          e.eventType === "step_approval_pending" ||
          e.eventType === "dispatcher_not_found" ||
          e.eventType === "dispatcher_context_error" ||
          e.eventType === "dispatcher_handler_error" ||
          e.eventType === "policy_stop_on_failure" ||
          e.eventType === "policy_stop_on_block",
        )
        .map(e => formatEvent(e)),
  };
}

// ── Console sink ───────────────────────────────────────────────────────────────

/**
 * Format and emit a structured event to the console.
 *
 * Future: replace this with a DB sink or streaming transport.
 * The format is intentionally machine-parseable: `[RUNTIME] {level} | {event}`.
 */
function emitToConsole(event: RuntimeEvent): void {
  const level = getLogLevel(event.eventType);
  const ts    = event.timestamp.toISOString();
  const step  = event.stepId ? ` step=${event.stepId}` : "";
  const dur   = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : "";
  const msg   = event.message ? ` — ${event.message}` : "";

  const line = `[RUNTIME] ${level} | exec=${event.executionId} tenant=${event.tenantId}${step} | ${event.eventType}${dur}${msg} | ${ts}`;

  switch (level) {
    case "ERROR": console.error(line); break;
    case "WARN":  console.warn(line);  break;
    default:      console.log(line);
  }
}

function getLogLevel(eventType: RuntimeEventType): "INFO" | "WARN" | "ERROR" {
  switch (eventType) {
    case "step_failed":
    case "execution_failed":
    case "dispatcher_not_found":
    case "dispatcher_context_error":
    case "dispatcher_handler_error":
      return "ERROR";

    case "step_blocked":
    case "step_approval_pending":
    case "step_approval_denied":
    case "policy_stop_on_failure":
    case "policy_stop_on_block":
    case "execution_cancelled":
      return "WARN";

    default:
      return "INFO";
  }
}

function formatEvent(event: RuntimeEvent): string {
  const step = event.stepId ? ` [${event.stepId}]` : "";
  const msg  = event.message ? `: ${event.message}` : "";
  return `${event.eventType}${step}${msg}`;
}
