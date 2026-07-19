/**
 * lib/execution/index.ts
 *
 * AGENTIK-EXECUTION-REGISTRY-01 — Public barrel
 *
 * Client-safe types are re-exported from execution-types.
 * Server-only functions are re-exported from execution-registry.
 *
 * Import pattern:
 *   import type { AgentExecutionRecord } from "@/lib/execution";
 *   import { createExecution, completeExecution } from "@/lib/execution";
 */

// ── Client-safe types ─────────────────────────────────────────────────────────
export type {
  ExecutionModule,
  ExecutionProvider,
  ExecutionStatus,
  AgentExecutionRecord,
  CreateExecutionInput,
  CompleteExecutionOptions,
  FailExecutionOptions,
  ListExecutionsFilter,
  ExecutionErrorCode,
} from "./execution-types";

export {
  EXECUTION_TERMINAL_STATUSES,
  EXECUTION_ACTIVE_STATUSES,
  EXECUTION_ERROR_CODES,
  isTerminalStatus,
  isActiveStatus,
} from "./execution-types";

// ── Server-only functions ─────────────────────────────────────────────────────
// These re-exports carry the server-only constraint from execution-registry.ts
export {
  createExecution,
  updateExecutionStatus,
  completeExecution,
  failExecution,
  appendMetadata,
  recordApproval,
  getExecution,
  listExecutions,
} from "./execution-registry";
