/**
 * lib/marketing-studio/orchestrator/orchestrator-executor.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Execution engine
 *
 * Designed for queue/cron/webhook dispatch — pure simulation layer.
 * No real external calls. Architecture is prepared for:
 *   - Job queues (BullMQ / Inngest / n8n)
 *   - Cron scheduling
 *   - Webhook event bus
 *   - Real publishing runtime bridges
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type {
  OrchestratorPlan,
  OrchestratorStage,
  OrchestratorJob,
  OrchestratorStatus,
  OrchestratorStageStatus,
} from "./orchestrator-types";
import { computeReadyStages } from "./orchestrator-dependencies";
import { computePlanProgress } from "./orchestrator-plans";

// ── Execution result ──────────────────────────────────────────────────────────

export interface StageExecutionResult {
  stageId:        string;
  jobId:          string;
  dispatched:     boolean;
  executionJobId: string | null;
  errorMessage:   string | null;
}

export interface PlanExecutionResult {
  planId:         string;
  stagesDispatched: number;
  results:        StageExecutionResult[];
  newStatus:      OrchestratorStatus;
}

// ── Dispatch metadata (prepared for real queue integration) ───────────────────

export interface DispatchIntent {
  planId:           string;
  stageId:          string;
  jobId:            string;
  jobType:          string;
  organizationId:   string;
  sourceEntityId:   string | null;
  targetChannels:   string[];
  priority:         string;
  scheduledAt:      string | null;
  metadata:         Record<string, unknown>;
}

export function buildDispatchIntent(
  plan:  OrchestratorPlan,
  stage: OrchestratorStage,
  job:   OrchestratorJob,
): DispatchIntent {
  return {
    planId:         plan.id,
    stageId:        stage.id,
    jobId:          job.id,
    jobType:        job.type,
    organizationId: plan.organizationId,
    sourceEntityId: plan.sourceEntityId,
    targetChannels: plan.targetChannels,
    priority:       plan.priority,
    scheduledAt:    plan.scheduledAt,
    metadata:       plan.metadata,
  };
}

// ── Execute a single job (simulation) ────────────────────────────────────────

export function executeJob(
  plan:  OrchestratorPlan,
  stage: OrchestratorStage,
  job:   OrchestratorJob,
): StageExecutionResult {
  const intent = buildDispatchIntent(plan, stage, job);

  // Simulate dispatch — in production, push to queue / call execution bridge
  const dispatched     = true;
  const executionJobId = `orch-${intent.jobType}-${Date.now()}`;

  return {
    stageId:        stage.id,
    jobId:          job.id,
    dispatched,
    executionJobId,
    errorMessage:   null,
  };
}

// ── Execute a single stage ────────────────────────────────────────────────────

export function executeStage(
  plan:  OrchestratorPlan,
  stage: OrchestratorStage,
): StageExecutionResult[] {
  return stage.jobs
    .filter(j => j.status === "pending" || j.status === "ready")
    .map(j => executeJob(plan, stage, j));
}

// ── Advance plan: run all ready stages ────────────────────────────────────────

export function advancePlan(plan: OrchestratorPlan): PlanExecutionResult {
  const readyStageIds = computeReadyStages(plan);
  const results: StageExecutionResult[] = [];

  for (const stageId of readyStageIds) {
    const stage = plan.stages.find(s => s.id === stageId);
    if (!stage) continue;
    results.push(...executeStage(plan, stage));
  }

  const progress  = computePlanProgress(plan);
  const newStatus = deriveNewPlanStatus(plan, results);

  return {
    planId:           plan.id,
    stagesDispatched: readyStageIds.length,
    results,
    newStatus,
  };
}

// ── Execute full plan (all pending stages) ────────────────────────────────────

export function executePlan(plan: OrchestratorPlan): PlanExecutionResult {
  const results: StageExecutionResult[] = [];

  for (const stage of plan.stages) {
    if (stage.status === "pending" || stage.status === "ready") {
      results.push(...executeStage(plan, stage));
    }
  }

  const newStatus = deriveNewPlanStatus(plan, results);

  return {
    planId:           plan.id,
    stagesDispatched: results.length,
    results,
    newStatus,
  };
}

// ── Pause plan ────────────────────────────────────────────────────────────────

export function pausePlan(plan: OrchestratorPlan): OrchestratorStatus {
  if (["running", "queued", "validating"].includes(plan.status)) return "paused";
  return plan.status;
}

// ── Retry plan (all failed stages) ───────────────────────────────────────────

export function retryPlan(plan: OrchestratorPlan): PlanExecutionResult {
  const results: StageExecutionResult[] = [];

  for (const stage of plan.stages) {
    if (stage.status === "failed" || stage.status === "blocked") {
      results.push(...executeStage(plan, stage));
    }
  }

  return {
    planId:           plan.id,
    stagesDispatched: results.length,
    results,
    newStatus:        results.length > 0 ? "running" : plan.status,
  };
}

// ── Derive new plan status from execution results ─────────────────────────────

function deriveNewPlanStatus(
  plan:    OrchestratorPlan,
  results: StageExecutionResult[],
): OrchestratorStatus {
  if (results.some(r => !r.dispatched)) return "partially_completed";
  if (results.length > 0)              return "running";
  // No stages dispatched — check existing state
  const allDone   = plan.stages.every(s => s.status === "completed" || s.status === "skipped");
  const anyFailed = plan.stages.some(s => s.status === "failed");
  const anyBlocked = plan.stages.some(s => s.status === "blocked");
  if (allDone)    return "completed";
  if (anyFailed)  return "failed";
  if (anyBlocked) return "blocked";
  return plan.status;
}
