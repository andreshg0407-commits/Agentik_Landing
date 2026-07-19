/**
 * lib/agent-runtime/tool-execution-types.ts
 *
 * Agentik Runtime Tool Execution Kernel — Type Definitions
 *
 * Defines the full contract for controlled tool execution:
 * request → validation → execution → result → audit.
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

// ── Execution status ───────────────────────────────────────────────────────────

export type ToolExecutionStatus =
  | "queued"      // Request received, not yet validated
  | "validating"  // Guard running
  | "executing"   // Tool handler invoked
  | "succeeded"   // Tool completed successfully
  | "failed"      // Tool threw or returned error
  | "rejected"    // Guard denied execution
  | "skipped";    // Already executed (idempotency) or dependency not ready

// ── Execution error ───────────────────────────────────────────────────────────

export interface ToolExecutionError {
  code:      string;   // e.g. "GUARD_DENIED", "HANDLER_NOT_FOUND", "EXECUTION_TIMEOUT"
  message:   string;
  retryable: boolean;
  details?:  Record<string, unknown>;
}

// ── Execution policy ──────────────────────────────────────────────────────────

export interface ToolExecutionPolicy {
  requiresApproval:  boolean;
  requiredPermission: "read" | "write" | "admin";
  allowedAgents:     string[];      // empty = all agents
  allowedModules:    string[];      // empty = all modules
  maxRetries:        number;
  timeoutMs:         number;
  idempotencyKey:    string | null; // null = not idempotent
}

// ── Permission context ────────────────────────────────────────────────────────

export interface ToolPermissionContext {
  userId?:        string;
  userRole?:      string;
  orgId:          string;
  agentId:        string;
  moduleKey:      string;
  actionApproved: boolean;
  actionApprovedBy?: string;
}

// ── Execution request ─────────────────────────────────────────────────────────

export interface ToolExecutionRequest {
  id:                string;   // ter_...
  orgId:             string;
  actionId:          string;
  toolId:            string;
  agentId:           string;
  moduleKey:         string;
  requestedBy:       string;   // userId or agentId
  payload:           Record<string, unknown>;
  permissionContext: ToolPermissionContext;
  correlationId:     string | null;
  causationId:       string | null;
  createdAt:         string;   // ISO
}

// ── Audit record ──────────────────────────────────────────────────────────────

export interface ToolExecutionAuditRecord {
  timestamp: string;
  event:     string;
  actor:     string;
  details:   Record<string, unknown>;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  requestId:    string;
  actionId:     string;
  toolId:       string;
  status:       ToolExecutionStatus;
  output:       Record<string, unknown> | null;
  error:        ToolExecutionError | null;
  startedAt:    string;
  completedAt:  string;
  durationMs:   number;
  events:       string[];          // event IDs emitted
  auditRecords: ToolExecutionAuditRecord[];
}

// ── ID generators ─────────────────────────────────────────────────────────────

let _seq = 0;
export function terId(): string  { return `ter_${Date.now()}_${++_seq}`; }
export function terIdKey(actionId: string, toolId: string): string {
  // Stable idempotency key from actionId + toolId
  return `idem_${actionId}_${toolId}`;
}
