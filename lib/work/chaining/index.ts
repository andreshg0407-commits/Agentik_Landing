/**
 * lib/work/chaining/index.ts
 *
 * Agentik — Workflow Chaining Barrel (PURE — client-safe)
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Exports types, registry, audit, router, and result types.
 * All client-safe — no server-only imports here.
 *
 * For server-only (service + repository): import from individual files.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  WorkflowChainId,
  WorkflowStepId,
  WorkflowRunId,
  WorkflowStepStatus,
  WorkflowChainStatus,
  WorkflowTriggerType,
  WorkflowChainCategory,
  WorkflowStepCondition,
  WorkflowStepDefinition,
  WorkflowChainDefinition,
  WorkflowStepResult,
  WorkflowChainRun,
  WorkflowChainAuditEvent,
  WorkflowChainEventType,
  WorkflowStepOnFailure,
} from "./workflow-chain-types";

// ── Registry ──────────────────────────────────────────────────────────────────
export {
  WORKFLOW_CHAIN_REGISTRY,
  ACTIVE_WORKFLOW_CHAINS,
  getChainById,
  getChainsByCategory,
} from "./workflow-chain-registry";

// ── Router ────────────────────────────────────────────────────────────────────
export type { ChainMatchResult, NextStepDecision } from "./workflow-chain-router";
export {
  matchChainForFirstStep,
  findStepById,
  resolveNextStep,
  extractChainContextFromPayload,
  isChainTerminal,
  hasExceededStepLimit,
} from "./workflow-chain-router";

// ── Audit ─────────────────────────────────────────────────────────────────────
export type { ChainValidationIssue, ChainValidationReport } from "./workflow-chain-audit";
export { validateChainDefinition, validateAllChains }        from "./workflow-chain-audit";

// ── Factory ───────────────────────────────────────────────────────────────────
export {
  createWorkflowChainDefinition,
  createWorkflowStepDefinition,
  createWorkflowChainRun,
  createWorkflowStepResult,
  createWorkflowChainAuditEvent,
  createNextStepPayload,
  advanceRunToStep,
  completeRunStep,
  terminalizeRun,
} from "./workflow-chain-factory";

// ── Result types ──────────────────────────────────────────────────────────────
export type {
  ChainStartResult,
  ChainContinueResult,
  ChainActionResult,
  ChainQueryResult,
  ChainListResult,
} from "./workflow-chain-result";
