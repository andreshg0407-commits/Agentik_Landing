/**
 * lib/work/live/work-executor-contract.ts
 *
 * Agentik — Live Work Executor Contract
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Universal interface that all executor implementations must satisfy.
 * No React. No Prisma. Pure TypeScript interface.
 */

import type {
  WorkExecutionJob,
  WorkExecutionResult,
  WorkExecutorType,
} from "./work-execution-types";
import type { WorkExecutionAuditReport } from "./work-execution-audit";

// ── Health status ─────────────────────────────────────────────────────────────

export interface ExecutorHealthStatus {
  executorType: WorkExecutorType;
  healthy:      boolean;
  message:      string;
  checkedAt:    string;
}

// ── Rollback result ───────────────────────────────────────────────────────────

export interface ExecutorRollbackResult {
  success:  boolean;
  message:  string;
  jobId:    string;
  errors?:  string[];
}

// ── Executor contract ─────────────────────────────────────────────────────────

/**
 * All live work executors must implement this interface.
 *
 * execute()     — run the job and return a result
 * validate()    — pre-flight validation without side effects
 * rollback()    — undo the execution (if supported)
 * healthCheck() — confirm the executor is operational
 */
export interface WorkExecutorContract {
  readonly type: WorkExecutorType;

  /**
   * Execute the given job.
   * Must not throw — all errors must be captured in WorkExecutionResult.errors.
   */
  execute(job: WorkExecutionJob): Promise<WorkExecutionResult>;

  /**
   * Validate the job without executing it.
   * Returns an audit report with errors and warnings.
   */
  validate(job: WorkExecutionJob): WorkExecutionAuditReport;

  /**
   * Rollback a completed execution.
   * Only supported by executors where supportsRollback === true.
   * Returns an error if rollback is not supported.
   */
  rollback(jobId: string): Promise<ExecutorRollbackResult>;

  /**
   * Check if this executor is healthy and ready to accept jobs.
   */
  healthCheck(): Promise<ExecutorHealthStatus>;
}
