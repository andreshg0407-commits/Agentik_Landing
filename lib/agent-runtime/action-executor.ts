/**
 * lib/agent-runtime/action-executor.ts
 *
 * Agentik Agent Runtime — Action Executor Contract
 *
 * The executor is the ONLY layer that may run an action handler.
 * UI components and API routes NEVER call handlers directly.
 *
 * Execution is gated by:
 *   1. Status must be "approved" (lifecycle enforced)
 *   2. requiresApproval check (double-gate)
 *   3. Permission check (tool permission vs caller role)
 *   4. Domain check (executor must be registered for the action's domain)
 *
 * V1: Handler registry is a static map of handlerRef → function.
 * V2: Mastra implements the executor contract — no interface changes.
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import type { AgentAction, AgentRuntimeId, ToolPermission, ToolExecutionMode } from "./agent-types";
import { markActionExecuting, markActionExecuted, markActionFailed } from "./action-lifecycle";

// ── Handler definition ────────────────────────────────────────────────────────

export interface ActionHandlerContext {
  organizationId: string;
  orgSlug:        string;
  userId:         string;
  agentId:        AgentRuntimeId;
}

export type ActionHandlerFn = (
  action:  AgentAction,
  context: ActionHandlerContext,
) => Promise<Record<string, unknown>>;

// ── Executor permission check result ──────────────────────────────────────────

export type ExecutionGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ── Handler registry ──────────────────────────────────────────────────────────
//
// Each action type maps to a handler reference string (from AgentTool.handlerRef).
// Handlers are registered at startup — never in UI or API route files.
// V2: Mastra tool definitions replace this map.

const _handlers = new Map<string, ActionHandlerFn>();

export function registerActionHandler(actionType: string, fn: ActionHandlerFn): void {
  _handlers.set(actionType, fn);
}

// ── Execution gates ───────────────────────────────────────────────────────────

/**
 * Check whether an action can be executed in the current context.
 * Call this before markActionExecuting + executing the handler.
 */
export function canExecuteAction(
  action:         AgentAction,
  callerRole:     string,
  callerUserId:   string,
): ExecutionGateResult {
  // Gate 1: status
  if (action.status !== "approved") {
    return { allowed: false, reason: `Action is ${action.status} — must be approved first` };
  }

  // Gate 2: approval flag (safety double-check)
  if (action.requiresApproval) {
    const approved = action.auditTrail.some(e => e.event === "action.approved" && e.actorType === "user");
    if (!approved) {
      return { allowed: false, reason: "Action requires explicit user approval — not yet present in audit trail" };
    }
  }

  // Gate 3: handler registered
  if (!_handlers.has(action.type)) {
    return { allowed: false, reason: `No handler registered for action type "${action.type}"` };
  }

  // Gate 4: role check — admin actions restricted to admin roles
  const toolPermission = (action.payload.toolPermission as ToolPermission | undefined) ?? "write";
  if (toolPermission === "admin" && !["SUPER_ADMIN", "AGENTIK_ADMIN"].includes(callerRole)) {
    return { allowed: false, reason: `Admin-level action requires SUPER_ADMIN or AGENTIK_ADMIN role (caller=${callerUserId})` };
  }

  return { allowed: true };
}

/**
 * Resolve the handler function for a given action type.
 * Returns null if no handler is registered.
 */
export function resolveActionHandler(actionType: string): ActionHandlerFn | null {
  return _handlers.get(actionType) ?? null;
}

/**
 * Execute an approved action.
 * Validates gates, transitions status, runs handler, records result.
 * Returns the updated action (executed | failed).
 *
 * This function MUST only be called from server-side execution layers
 * (API routes or background workers) — never from client components.
 */
export async function executeAgentAction(
  action:  AgentAction,
  context: ActionHandlerContext,
): Promise<AgentAction> {
  const gate = canExecuteAction(action, context.userId, context.userId);
  if (!gate.allowed) {
    // Return failed without transitioning executing (guard fired before start)
    return markActionFailed(
      { ...action, status: "approved" },
      `Execution gate blocked: ${gate.reason}`,
    );
  }

  const handler = resolveActionHandler(action.type)!;
  const executing = markActionExecuting(action, "system");

  try {
    const result = await handler(executing, context);
    return markActionExecuted(executing, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return markActionFailed(executing, msg);
  }
}

// ── Execution mode helpers ────────────────────────────────────────────────────

/**
 * Determine the appropriate execution mode for an action.
 * Used by callers to decide whether to run inline or enqueue.
 */
export function resolveExecutionMode(action: AgentAction): ToolExecutionMode {
  if (action.requiresApproval) return "supervised";
  if ((action.payload.executionMode as ToolExecutionMode | undefined) === "queued") return "queued";
  return "instant";
}
