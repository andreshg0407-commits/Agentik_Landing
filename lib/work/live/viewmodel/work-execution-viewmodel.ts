/**
 * lib/work/live/viewmodel/work-execution-viewmodel.ts
 *
 * Agentik — Work Execution ViewModel
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 *
 * Converts PersistedWorkExecution records to a serializable UI shape.
 * No React. No Prisma. No side effects. Pure transformation.
 */

import type { PersistedWorkExecution } from "../persistence/work-execution-repository";
import { WORK_EXECUTOR_REGISTRY }      from "../work-execution-registry";
import type { WorkExecutorType }       from "../work-execution-types";
import { MODULE_ACTION_LABELS }        from "../../executors/module-executor-contract";

// ── Card ──────────────────────────────────────────────────────────────────────

export interface WorkExecutionCard {
  id:                 string;
  approvalId:         string;
  executorType:       string;
  executorLabel:      string;
  module:             string;
  isLive:             boolean;
  status:             string;
  statusLabel:        string;
  success:            boolean | null;
  message:            string | null;
  durationMs:         number | null;
  durationLabel:      string | null;
  trigger:            string;
  triggerLabel:       string;
  createdAt:          string;
  startedAt:          string | null;
  completedAt:        string | null;
  failedAt:           string | null;
  approvalTitle:      string;
  approvalStatus:     string;
  organizationId:     string;
  payload:            unknown;
  result:             unknown;
  auditTrail:         unknown;
  errors:             unknown;
  // Module executor fields
  actionType:         string | null;
  actionTypeLabel:    string | null;
  // Workflow chaining fields
  workflowMetadata:   {
    chainId:             string;
    workflowRunId:       string;
    stepId:              string;
    previousExecutionId: string | null;
  } | null;
  // Retry fields
  retryOfExecutionId: string | null;
  retryAttempt:       number;
  maxRetryAttempts:   number;
  canRetry:           boolean;
  retryReason:        string | null;
  retriedAt:          string | null;
  retriedByLabel:     string | null;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface WorkExecutionSummary {
  total:            number;
  completed:        number;
  failed:           number;
  running:          number;
  pending:          number;
  cancelled:        number;
  today:            number;
  averageDurationMs: number;
  retries:          number;
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

export interface WorkExecutionViewModel {
  cards:   WorkExecutionCard[];
  summary: WorkExecutionSummary;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING:   "Pendiente",
  QUEUED:    "En cola",
  RUNNING:   "En ejecución",
  COMPLETED: "Completada",
  FAILED:    "Fallida",
  CANCELLED: "Cancelada",
};

const TRIGGER_LABELS: Record<string, string> = {
  APPROVAL_APPROVED: "Aprobación humana",
  MANUAL:            "Manual",
  SCHEDULED:         "Programada",
  WEBHOOK:           "Webhook",
  SYSTEM:            "Sistema",
};

const STATUS_ORDER: Record<string, number> = {
  RUNNING:   0,
  FAILED:    1,
  PENDING:   2,
  QUEUED:    2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms === undefined) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function extractApprovalTitle(payloadJson: unknown): string {
  if (!payloadJson || typeof payloadJson !== "object") return "—";
  const p = payloadJson as Record<string, unknown>;
  const trigger = p["trigger"] as Record<string, unknown> | undefined;
  return (trigger?.["approvalTitle"] as string) ?? "—";
}

function extractRetrivedByLabel(retriedByJson: unknown): string | null {
  if (!retriedByJson || typeof retriedByJson !== "object") return null;
  const a = retriedByJson as Record<string, unknown>;
  return (a["name"] as string) ?? (a["id"] as string) ?? null;
}

function extractWorkflowMetadata(payloadJson: unknown): WorkExecutionCard["workflowMetadata"] {
  if (!payloadJson || typeof payloadJson !== "object") return null;
  const p    = payloadJson as Record<string, unknown>;
  const meta = p["metadata"] as Record<string, unknown> | undefined;
  if (!meta?.["workflowRunId"]) return null;
  return {
    chainId:             (meta["chainId"]             as string) ?? "",
    workflowRunId:       (meta["workflowRunId"]       as string),
    stepId:              (meta["stepId"]               as string) ?? "",
    previousExecutionId: (meta["previousExecutionId"] as string) ?? null,
  };
}

function extractApprovalStatus(payloadJson: unknown): string {
  if (!payloadJson || typeof payloadJson !== "object") return "—";
  const p = payloadJson as Record<string, unknown>;
  const trigger = p["trigger"] as Record<string, unknown> | undefined;
  return (trigger?.["approvalStatus"] as string) ?? "—";
}

function toCard(record: PersistedWorkExecution): WorkExecutionCard {
  const def           = WORK_EXECUTOR_REGISTRY[record.executorType as WorkExecutorType];
  const executorLabel = def?.label  ?? record.executorType;
  const module        = record.module ?? def?.module ?? "—";
  const isLive        = def?.isLive  ?? false;
  const actionType    = record.actionType ?? null;
  const actionTypeLabel = actionType ? (MODULE_ACTION_LABELS[actionType] ?? actionType) : null;

  return {
    id:             record.id,
    approvalId:     record.approvalId,
    executorType:   record.executorType,
    executorLabel,
    module,
    isLive,
    status:         record.status,
    statusLabel:    STATUS_LABELS[record.status] ?? record.status,
    success:        record.success,
    message:        record.message,
    durationMs:     record.durationMs,
    durationLabel:  formatDuration(record.durationMs),
    trigger:        record.trigger,
    triggerLabel:   TRIGGER_LABELS[record.trigger] ?? record.trigger,
    createdAt:      record.createdAt.toISOString(),
    startedAt:      record.startedAt   ? record.startedAt.toISOString()   : null,
    completedAt:    record.completedAt ? record.completedAt.toISOString() : null,
    failedAt:       record.failedAt    ? record.failedAt.toISOString()    : null,
    approvalTitle:  extractApprovalTitle(record.payloadJson),
    approvalStatus: extractApprovalStatus(record.payloadJson),
    organizationId: record.organizationId,
    payload:        record.payloadJson,
    result:         record.resultJson,
    auditTrail:     record.auditTrailJson,
    errors:         record.errorsJson,
    // Module executor fields
    actionType,
    actionTypeLabel,
    // Workflow chaining fields
    workflowMetadata: extractWorkflowMetadata(record.payloadJson),
    // Retry fields
    retryOfExecutionId: record.retryOfExecutionId,
    retryAttempt:       record.retryAttempt,
    maxRetryAttempts:   record.maxRetryAttempts,
    retryReason:        record.retryReason,
    retriedAt:          record.retriedAt ? record.retriedAt.toISOString() : null,
    retriedByLabel:     extractRetrivedByLabel(record.retriedByJson),
    canRetry:
      record.status === "FAILED" &&
      record.retryAttempt < record.maxRetryAttempts &&
      extractApprovalStatus(record.payloadJson) === "APPROVED",
  };
}

function buildSummary(cards: WorkExecutionCard[]): WorkExecutionSummary {
  const todayStr = new Date().toDateString();

  const completedWithDuration = cards.filter(
    c => c.status === "COMPLETED" && c.durationMs !== null,
  );

  const averageDurationMs =
    completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((sum, c) => sum + (c.durationMs ?? 0), 0) /
            completedWithDuration.length,
        )
      : 0;

  return {
    total:     cards.length,
    completed: cards.filter(c => c.status === "COMPLETED").length,
    failed:    cards.filter(c => c.status === "FAILED").length,
    running:   cards.filter(c => c.status === "RUNNING").length,
    pending:   cards.filter(c => c.status === "PENDING" || c.status === "QUEUED").length,
    cancelled: cards.filter(c => c.status === "CANCELLED").length,
    today:     cards.filter(c => new Date(c.createdAt).toDateString() === todayStr).length,
    averageDurationMs,
    retries:   cards.filter(c => !!c.retryOfExecutionId).length,
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildWorkExecutionViewModel(
  records: PersistedWorkExecution[],
): WorkExecutionViewModel {
  const cards = records
    .map(toCard)
    .sort((a, b) => {
      const orderA = STATUS_ORDER[a.status] ?? 99;
      const orderB = STATUS_ORDER[b.status] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // Within same group: newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return {
    cards,
    summary: buildSummary(cards),
  };
}
