/**
 * lib/tasks/task-types.ts
 *
 * Agentik — Universal Task Domain Types
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Central type system for all task-related structures in Agentik.
 * Consumed by: Copilot, Finance, Collections, Commercial, Marketing,
 *              Inventory, Operations, Agents, Alerts, Approvals.
 *
 * Architecture boundary:
 *   - No React
 *   - No Prisma
 *   - No Copilot imports
 *   - Pure domain types
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type TaskId      = string;
export type TaskDraftId = string;

// ── Enumerations ──────────────────────────────────────────────────────────────

export type TaskPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type TaskStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled";

export type TaskSource =
  | "copilot"
  | "manual"
  | "finance"
  | "collections"
  | "commercial"
  | "marketing"
  | "inventory"
  | "operations"
  | "system";

export type TaskCategory =
  | "followup"
  | "review"
  | "approval"
  | "investigation"
  | "reconciliation"
  | "customer"
  | "document"
  | "report"
  | "alert"
  | "general";

export type TaskOwnerType =
  | "user"
  | "agent"
  | "team"
  | "role"
  | "system";

export type TaskRelationshipType =
  | "created_from_copilot"
  | "related_to_module"
  | "related_to_customer"
  | "related_to_document"
  | "related_to_alert"
  | "related_to_approval"
  | "related_to_reconciliation"
  | "related_to_report";

export type TaskVisibility =
  | "private"
  | "team"
  | "organization";

export type TaskDueDateMode =
  | "none"
  | "specific_date"
  | "relative"
  | "recurring";

export type TaskAuditEventType =
  | "created"
  | "updated"
  | "assigned"
  | "status_changed"
  | "priority_changed"
  | "due_date_changed"
  | "comment_added"
  | "completed"
  | "cancelled";

// ── Owner ─────────────────────────────────────────────────────────────────────

export interface TaskOwner {
  /** Unique identifier: userId, agentId, teamId, roleId, or "system". */
  id:   string;
  type: TaskOwnerType;
  /** Human-readable display name: "Diego", "Equipo Finanzas", etc. */
  name: string;
}

// ── Assignment ────────────────────────────────────────────────────────────────

export interface TaskAssignment {
  assignedTo: TaskOwner;
  assignedBy: TaskOwner;
  assignedAt: string;
  /** Optional note explaining the assignment. */
  note?:      string;
}

// ── Relationship ──────────────────────────────────────────────────────────────

export interface TaskRelationship {
  type:          TaskRelationshipType;
  /** "copilot_action" | "module" | "customer" | "document" | etc. */
  entityType:    string;
  entityId:      string;
  entityLabel?:  string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface TaskAuditEvent {
  type:        TaskAuditEventType;
  occurredAt:  string;
  actorId:     string;
  actorType:   TaskOwnerType;
  /** Previous field values before the change. */
  previous?:   Record<string, unknown>;
  /** New field values after the change. */
  next?:       Record<string, unknown>;
  note?:       string;
}

// ── Business context ──────────────────────────────────────────────────────────

export interface TaskBusinessContext {
  /** Tenant slug: "castillitos". */
  orgSlug:               string;
  /** Module slug where the task was created: "conciliacion", "tesoreria", etc. */
  module?:               string;
  /** Accounting period: "2026-05", "Q2-2026". */
  period?:               string;
  customerRef?:          string;
  documentRef?:          string;
  alertRef?:             string;
  customData?:           Record<string, unknown>;

  // ── AGENTIK-TASK-CONTEXT-01 — Contextualized task fields ─────────────────
  /** Entity type referenced: "conciliation_exception", "approval_item", etc. */
  entityType?:           string;
  /** Identifier of the referenced entity. Required when entityType is set. */
  entityId?:             string;
  /** Agent that originated the task: "diego", "luca", etc. */
  sourceAgentId?:        string;
  /** Human-readable agent name for display: "Diego". */
  sourceAgentName?:      string;
  /** Drawer category that triggered the task: "attention", "pendingApprovals", etc. */
  sourceDrawerCategory?: string;
  /** Full navigation path: "/castillitos/finanzas/conciliacion". Must start with "/". */
  navigationTarget?:     string;
  /** One-line business impact: "$4.250.000 pendientes de validación". Max 300 chars. */
  impactSummary?:        string;
  /** Agent recommendation: "Revisar excepciones detectadas". Max 500 chars. */
  recommendation?:       string;
  /** Extra structured metadata from the originating context. */
  metadata?:             Record<string, unknown>;
}

// ── Draft ─────────────────────────────────────────────────────────────────────

/**
 * TaskDraft — a structured, transient task representation.
 * Not yet persisted. Produced by Copilot and other sources.
 * Ready to be converted to TaskRecord when persistence is added.
 */
export interface TaskDraft {
  id:              TaskDraftId;
  title:           string;
  description?:    string;
  priority:        TaskPriority;
  status:          TaskStatus;
  source:          TaskSource;
  category:        TaskCategory;
  owner:           TaskOwner;
  assignment?:     TaskAssignment;
  relationships:   TaskRelationship[];
  businessContext: TaskBusinessContext;
  visibility:      TaskVisibility;
  dueDateMode:     TaskDueDateMode;
  dueAt?:          string;
  createdAt:       string;
  createdBy:       TaskOwner;
  metadata:        Record<string, unknown>;
}

// ── Record ────────────────────────────────────────────────────────────────────

/**
 * TaskRecord — a persisted task.
 * Wraps a TaskDraft with persistence metadata and audit trail.
 * Used when the task layer is connected to a database.
 */
export interface TaskRecord {
  id:            TaskId;
  /** ID of the originating draft, if created via Copilot or import. */
  draftId?:      TaskDraftId;
  draft:         TaskDraft;
  createdAt:     string;
  updatedAt:     string;
  completedAt?:  string;
  cancelledAt?:  string;
  auditTrail:    TaskAuditEvent[];
}

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface TaskCreationInput {
  title:           string;
  description?:    string;
  priority?:       TaskPriority;
  source:          TaskSource;
  category?:       TaskCategory;
  owner:           TaskOwner;
  assignment?:     TaskAssignment;
  relationships?:  TaskRelationship[];
  businessContext: TaskBusinessContext;
  visibility?:     TaskVisibility;
  dueDateMode?:    TaskDueDateMode;
  dueAt?:          string;
  createdBy:       TaskOwner;
  metadata?:       Record<string, unknown>;
}

export interface TaskUpdateInput {
  title?:       string;
  description?: string;
  priority?:    TaskPriority;
  status?:      TaskStatus;
  assignment?:  TaskAssignment;
  visibility?:  TaskVisibility;
  dueDateMode?: TaskDueDateMode;
  dueAt?:       string;
  metadata?:    Record<string, unknown>;
}

// ── Filter ────────────────────────────────────────────────────────────────────

export interface TaskFilter {
  status?:         TaskStatus[];
  priority?:       TaskPriority[];
  source?:         TaskSource[];
  category?:       TaskCategory[];
  assignedToId?:   string;
  ownerId?:        string;
  orgSlug?:        string;
  module?:         string;
  dueBefore?:      string;
  dueAfter?:       string;
  createdBefore?:  string;
  createdAfter?:   string;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface TaskSummary {
  totalCount:       number;
  openCount:        number;
  inProgressCount:  number;
  blockedCount:     number;
  completedCount:   number;
  criticalCount:    number;
  overdueCount:     number;
}
