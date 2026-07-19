/**
 * lib/agent-runtime/tool-handler-registry.ts
 *
 * Agentik Runtime Tool Execution Kernel — Handler Registry
 *
 * Registers and resolves executable tool handlers.
 * Separate from tool-registry.ts (catalog/declarative).
 *
 * tool-registry.ts     = declarative catalog (ids, descriptions, schemas)
 * tool-handler-registry.ts = executable handlers (actual implementation)
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import type { ToolExecutionPolicy } from "./tool-execution-types";

// ── Handler context ────────────────────────────────────────────────────────────

export interface ToolHandlerContext {
  orgId:       string;
  agentId:     string;
  moduleKey:   string;
  actionId:    string;
  requestedBy: string;
  correlationId: string | null;
}

// ── Handler definition ────────────────────────────────────────────────────────

export interface ToolHandlerDefinition {
  toolId:      string;
  domain:      string;
  description: string;
  executionMode: "instant" | "supervised" | "queued";
  policy:      ToolExecutionPolicy;
  execute(
    input:   Record<string, unknown>,
    context: ToolHandlerContext,
  ): Promise<Record<string, unknown>>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, ToolHandlerDefinition>();
const _executionAttempts = new Map<string, number>();    // toolId → count
const _executionSuccesses = new Map<string, number>();   // toolId → count
const _executionFailures  = new Map<string, number>();   // toolId → count
const _idempotencyKeys    = new Set<string>();
let   _lastExecutionDurationMs: number | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function registerToolHandler(def: ToolHandlerDefinition): void {
  _registry.set(def.toolId, def);
}

export function resolveToolHandler(toolId: string): ToolHandlerDefinition | null {
  return _registry.get(toolId) ?? null;
}

export function listRegisteredToolHandlers(): ToolHandlerDefinition[] {
  return [..._registry.values()];
}

export function assertToolHandlerRegistered(toolId: string): ToolHandlerDefinition {
  const handler = _registry.get(toolId);
  if (!handler) {
    throw new Error(`HANDLER_NOT_FOUND: No handler registered for tool "${toolId}"`);
  }
  return handler;
}

// ── Idempotency ───────────────────────────────────────────────────────────────

export function checkIdempotencyKey(key: string): boolean {
  return _idempotencyKeys.has(key);
}

export function markIdempotencyKey(key: string): void {
  _idempotencyKeys.add(key);
}

// ── Execution metrics (for diagnostics) ──────────────────────────────────────

export function recordExecutionAttempt(toolId: string): void {
  _executionAttempts.set(toolId, (_executionAttempts.get(toolId) ?? 0) + 1);
}

export function recordExecutionSuccess(toolId: string, durationMs: number): void {
  _executionSuccesses.set(toolId, (_executionSuccesses.get(toolId) ?? 0) + 1);
  _lastExecutionDurationMs = durationMs;
}

export function recordExecutionFailure(toolId: string): void {
  _executionFailures.set(toolId, (_executionFailures.get(toolId) ?? 0) + 1);
}

export interface HandlerRegistryDiagnostics {
  registeredHandlers:          number;
  handlerIds:                  string[];
  executionsAttempted:         number;
  executionsSucceeded:         number;
  executionsFailed:            number;
  idempotencyPrevented:        number;
  lastExecutionDurationMs:     number | null;
}

export function getHandlerRegistryDiagnostics(): HandlerRegistryDiagnostics {
  const attempted = [..._executionAttempts.values()].reduce((s, v) => s + v, 0);
  const succeeded = [..._executionSuccesses.values()].reduce((s, v) => s + v, 0);
  const failed    = [..._executionFailures.values()].reduce((s, v) => s + v, 0);

  return {
    registeredHandlers:      _registry.size,
    handlerIds:              [..._registry.keys()],
    executionsAttempted:     attempted,
    executionsSucceeded:     succeeded,
    executionsFailed:        failed,
    idempotencyPrevented:    0, // counted externally by kernel
    lastExecutionDurationMs: _lastExecutionDurationMs,
  };
}
