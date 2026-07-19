/**
 * workflow-instance.ts
 *
 * PRODUCTION-WORKFLOW-01
 * A running execution of a workflow definition.
 *
 * Example: a specific OP going through production stages.
 * The instance tracks current state, progress, history, and health.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { WorkflowStatus, WorkflowPriority, WorkflowEntityBinding, WorkflowMetadata } from "./workflow-types";
import type { WorkflowDefinition } from "./workflow-definition";
import type { StageProgress, WorkflowProgress } from "./workflow-state";
import type { WorkflowHistoryEntry } from "./workflow-history";
import type { WorkflowInstanceMetrics } from "./workflow-metrics";

// ── Workflow Instance ────────────────────────────────────────────────────────

/**
 * A running instance of a workflow definition.
 *
 * Examples:
 * - OP #2891 going through "Flujo de Produccion Castillitos"
 * - OC #145 going through "Flujo de Compras"
 * - Factura #892 going through "Flujo de Cobranza"
 */
export interface WorkflowInstance {
  /** Unique instance ID. */
  id: string;
  /** Reference to the workflow definition. */
  workflowDefinitionId: string;
  /** Workflow definition code (denormalized for queries). */
  workflowCode: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** The business entity this workflow tracks. */
  entityBinding: WorkflowEntityBinding;
  /** Current workflow status. */
  status: WorkflowStatus;
  /** Priority level. */
  priority: WorkflowPriority;

  // ── Stage Tracking ────────────────────────────────────────────────────

  /** Current stage code. */
  currentStageCode: string;
  /** Progress per stage (stage code → progress). */
  stageProgress: Record<string, StageProgress>;
  /** Overall workflow progress. */
  progress: WorkflowProgress;

  // ── History ───────────────────────────────────────────────────────────

  /** Complete audit trail. */
  history: WorkflowHistoryEntry[];

  // ── Metrics ───────────────────────────────────────────────────────────

  /** Computed performance metrics. */
  metrics: WorkflowInstanceMetrics;

  // ── Temporal ──────────────────────────────────────────────────────────

  /** ISO timestamp when the instance was created. */
  createdAt: string;
  /** ISO timestamp when the workflow started running. */
  startedAt: string | null;
  /** Expected completion date. */
  expectedFinishAt: string | null;
  /** Actual completion date. */
  completedAt: string | null;

  // ── Assignment ────────────────────────────────────────────────────────

  /** Current assignee (user ID or role). */
  assignedTo: string | null;
  /** User who created this instance. */
  createdBy: string | null;

  /** Arbitrary instance-level metadata. */
  metadata: WorkflowMetadata;
}

// ── Instance Builder ─────────────────────────────────────────────────────────

let _instSeq = 0;

/** Generate a unique instance ID. */
export function nextInstanceId(): string {
  return `wi-${Date.now()}-${++_instSeq}`;
}

/** Create a new workflow instance from a definition. */
export function createInstance(opts: {
  definition: WorkflowDefinition;
  organizationId: string;
  entityBinding: WorkflowEntityBinding;
  priority?: WorkflowPriority;
  assignedTo?: string;
  createdBy?: string;
  metadata?: WorkflowMetadata;
}): WorkflowInstance {
  const def = opts.definition;
  const now = new Date().toISOString();

  // Initialize stage progress for all stages
  const stageProgress: Record<string, StageProgress> = {};
  for (const stage of def.stages) {
    stageProgress[stage.code] = {
      status: stage.code === def.initialStageCode ? "active" : "pending",
      completionPercent: 0,
      enteredAt: stage.code === def.initialStageCode ? now : null,
      exitedAt: null,
      durationMinutes: null,
      activatedBy: opts.createdBy ?? null,
      completedBy: null,
      notes: null,
    };
  }

  return {
    id: nextInstanceId(),
    workflowDefinitionId: def.id,
    workflowCode: def.code,
    organizationId: opts.organizationId,
    entityBinding: opts.entityBinding,
    status: "running",
    priority: opts.priority ?? "normal",
    currentStageCode: def.initialStageCode,
    stageProgress,
    progress: {
      totalStages: def.stages.length,
      completedStages: 0,
      skippedStages: 0,
      completionPercent: 0,
      onTrack: true,
      estimatedCompletion: null,
    },
    history: [{
      id: `wh-${Date.now()}-init`,
      instanceId: "",  // will be set after ID assignment
      eventType: "workflow_started",
      stageCode: def.initialStageCode,
      fromStageCode: null,
      toStageCode: def.initialStageCode,
      actor: opts.createdBy ?? null,
      description: `Flujo '${def.name}' iniciado en etapa '${def.initialStageCode}'`,
      durationMinutes: null,
      occurredAt: now,
      metadata: {},
    }],
    metrics: {
      totalDurationMinutes: 0,
      activeDurationMinutes: 0,
      pausedDurationMinutes: 0,
      blockedDurationMinutes: 0,
      stagesCompleted: 0,
      stagesSkipped: 0,
      approvalCount: 0,
      rejectionCount: 0,
      blockCount: 0,
      retryCount: 0,
      slaBreachCount: 0,
      averageStageMinutes: null,
      longestStageCode: null,
      longestStageMinutes: null,
    },
    createdAt: now,
    startedAt: now,
    expectedFinishAt: null,
    completedAt: null,
    assignedTo: opts.assignedTo ?? null,
    createdBy: opts.createdBy ?? null,
    metadata: opts.metadata ?? {},
  };
}
