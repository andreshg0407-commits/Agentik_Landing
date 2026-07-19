/**
 * lib/work/work-types.ts
 *
 * Agentik — Universal Work Execution Domain Types
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * The universal type system for all work produced by agents and modules.
 * A Task is a WorkType. A Report is a WorkType. A Document is a WorkType.
 * Everything an agent does is representable as a WorkExecution.
 *
 * Architecture boundary:
 *   - No React
 *   - No Prisma
 *   - No Copilot imports
 *   - No lib/tasks imports (parallel, not dependent)
 *   - Pure domain types
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type WorkItemId       = string;
export type WorkExecutionId  = string;
export type WorkArtifactId   = string;
export type WorkAssignmentId = string;

// ── Work type ─────────────────────────────────────────────────────────────────

/**
 * The semantic type of work being executed.
 * SCREAMING_SNAKE_CASE — these are domain constants, not display labels.
 */
export type WorkType =
  | "TASK"
  | "REPORT"
  | "DOCUMENT"
  | "APPROVAL"
  | "ALERT"
  | "WORKFLOW"
  | "MESSAGE"
  | "EXPORT"
  | "IMPORT"
  | "ANALYSIS";

// ── Work status ───────────────────────────────────────────────────────────────

export type WorkStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

// ── Work priority ─────────────────────────────────────────────────────────────

export type WorkPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

// ── Work source ───────────────────────────────────────────────────────────────

export type WorkSource =
  | "COPILOT"
  | "MANUAL"
  | "AGENT"
  | "FINANCE"
  | "COLLECTIONS"
  | "COMMERCIAL"
  | "MARKETING"
  | "INVENTORY"
  | "OPERATIONS"
  | "SYSTEM";

// ── Actor type ────────────────────────────────────────────────────────────────

export type WorkActorType =
  | "USER"
  | "AGENT"
  | "TEAM"
  | "SYSTEM";

// ── Artifact type ─────────────────────────────────────────────────────────────

export type WorkArtifactType =
  | "TASK"
  | "REPORT"
  | "DOCUMENT"
  | "FILE"
  | "EXPORT"
  | "MESSAGE"
  | "APPROVAL"
  | "ALERT"
  | "WORKFLOW_RESULT";

// ── Execution mode ────────────────────────────────────────────────────────────

export type WorkExecutionMode =
  | "STUB"      // Simulated — no side effects
  | "PREVIEW"   // Dry-run — minimal side effects
  | "LIVE";     // Real execution — full side effects

// ── Visibility ────────────────────────────────────────────────────────────────

export type WorkVisibility =
  | "PRIVATE"
  | "TEAM"
  | "ORGANIZATION";

// ── Relationship type ─────────────────────────────────────────────────────────

export type WorkRelationshipType =
  | "PRODUCED_BY_COPILOT"
  | "PRODUCED_BY_AGENT"
  | "RELATED_TO_MODULE"
  | "RELATED_TO_TASK"
  | "RELATED_TO_DOCUMENT"
  | "RELATED_TO_CUSTOMER"
  | "RELATED_TO_ALERT"
  | "RELATED_TO_APPROVAL"
  | "RELATED_TO_RECONCILIATION"
  | "RELATED_TO_REPORT"
  | "RELATED_TO_WORKFLOW";

// ── Core structures ───────────────────────────────────────────────────────────

export interface WorkActor {
  id:   string;
  type: WorkActorType;
  name: string;
}

export interface WorkRelationship {
  type:         WorkRelationshipType;
  entityType:   string;
  entityId:     string;
  entityLabel?: string;
}

export interface WorkContext {
  /** Tenant identifier. */
  orgSlug:         string;
  /** Agent executing this work. */
  agentId:         string;
  /** Module or route where the work was triggered. */
  moduleSlug:      string;
  /** Drawer category that triggered this work, if any. */
  drawerCategory?: string;
  /** Period context, if applicable. */
  period?:         string;
  /** Arbitrary key-value operational context. */
  contextData?:    Record<string, unknown>;
}

export interface WorkAssignment {
  id:          WorkAssignmentId;
  assignedTo:  WorkActor;
  assignedBy:  WorkActor;
  assignedAt:  string;
  note?:       string;
}

// ── Work item ─────────────────────────────────────────────────────────────────

/**
 * A discrete unit of work — the "what needs to be done".
 * Analogous to a ticket or request before execution begins.
 */
export interface WorkItem {
  id:              WorkItemId;
  type:            WorkType;
  title:           string;
  description?:    string;
  priority:        WorkPriority;
  status:          WorkStatus;
  source:          WorkSource;
  visibility:      WorkVisibility;
  actor:           WorkActor;
  assignment?:     WorkAssignment;
  relationships:   WorkRelationship[];
  context:         WorkContext;
  scheduledAt?:    string;
  dueAt?:          string;
  createdAt:       string;
  metadata:        Record<string, unknown>;
}

// ── Work artifact ─────────────────────────────────────────────────────────────

/**
 * The output produced by executing a WorkItem.
 * Could be a task, report, document, alert, etc.
 */
export interface WorkArtifact {
  id:              WorkArtifactId;
  workItemId:      WorkItemId;
  executionId:     WorkExecutionId;
  type:            WorkArtifactType;
  title:           string;
  description?:    string;
  /** Structured output payload. */
  payload:         Record<string, unknown>;
  /** External reference if the artifact was persisted. */
  externalRef?:    string;
  /** Whether this was generated in stub/preview/live mode. */
  mode:            WorkExecutionMode;
  producedAt:      string;
  metadata:        Record<string, unknown>;
}

// ── Work execution ────────────────────────────────────────────────────────────

/**
 * The execution instance — the "how it ran".
 * Records timing, mode, errors, and produced artifacts.
 */
export interface WorkExecution {
  id:            WorkExecutionId;
  workItemId:    WorkItemId;
  mode:          WorkExecutionMode;
  status:        WorkStatus;
  actor:         WorkActor;
  startedAt:     string;
  completedAt?:  string;
  failedAt?:     string;
  errorMessage?: string;
  artifacts:     WorkArtifact[];
  metadata:      Record<string, unknown>;
}

// ── Work result ───────────────────────────────────────────────────────────────

/**
 * High-level result envelope returned to callers.
 */
export interface WorkResult {
  success:      boolean;
  status:       WorkStatus;
  message:      string;
  workItem?:    WorkItem;
  execution?:   WorkExecution;
  artifacts:    WorkArtifact[];
  errors?:      string[];
  warnings?:    string[];
}

// ── Execution request / response ──────────────────────────────────────────────

export interface WorkExecutionRequest {
  workType:    WorkType;
  title:       string;
  description?: string;
  priority?:   WorkPriority;
  mode:        WorkExecutionMode;
  context:     WorkContext;
  params?:     Record<string, unknown>;
  /** Required for APPROVAL-type work. */
  confirmed?:  boolean;
}

export interface WorkExecutionResponse {
  result:      WorkResult;
  executedAt:  string;
}
