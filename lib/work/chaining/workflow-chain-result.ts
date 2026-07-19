/**
 * lib/work/chaining/workflow-chain-result.ts
 *
 * Agentik — Workflow Chain Result Types
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Serializable result envelopes returned by the chain service.
 * Pure TypeScript. No Prisma. No React.
 */

import type { WorkflowChainRun, WorkflowChainStatus } from "./workflow-chain-types";

// ── Chain start result ─────────────────────────────────────────────────────────

export interface ChainStartResult {
  started:          boolean;
  /** True if a new chain run was created. False if no chain matched. */
  chainMatched:     boolean;
  workflowRunId?:   string;
  chainId?:         string;
  chainName?:       string;
  currentStep?:     string;
  nextStatus?:      WorkflowChainStatus;
  message:          string;
  errors?:          string[];
  warnings?:        string[];
}

// ── Chain continue result ──────────────────────────────────────────────────────

export interface ChainContinueResult {
  continued:        boolean;
  workflowRunId?:   string;
  chainId?:         string;
  stepCompleted?:   string;
  nextStep?:        string;
  nextStatus?:      string;
  approvalId?:      string;
  executionDispatched?: boolean;
  message:          string;
  errors?:          string[];
}

// ── Chain action result ────────────────────────────────────────────────────────

export interface ChainActionResult {
  success:         boolean;
  workflowRunId:   string;
  chainId:         string;
  previousStatus?: WorkflowChainStatus;
  currentStatus:   WorkflowChainStatus;
  message:         string;
  errors?:         string[];
}

// ── Chain query result ─────────────────────────────────────────────────────────

export interface ChainQueryResult {
  found: boolean;
  run?:  WorkflowChainRun;
  error?: string;
}

export interface ChainListResult {
  runs:   WorkflowChainRun[];
  total:  number;
}
