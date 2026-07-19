/**
 * lib/tasks/viewmodel/task-inbox-viewmodel.ts
 *
 * Agentik — Task Inbox ViewModel
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Converts TaskRecord[] into a serialisable ViewModel for the UI layer.
 * No React. No Prisma. No side effects.
 */

import type { TaskRecord, TaskPriority, TaskStatus, TaskAuditEvent, TaskRelationship } from "../task-types";

// ── Priority weight (highest first) ───────────────────────────────────────────

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

// ── Labels ────────────────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Media",
  low:      "Baja",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open:        "Pendiente",
  in_progress: "En proceso",
  waiting:     "En espera",
  blocked:     "Bloqueada",
  completed:   "Completada",
  cancelled:   "Cancelada",
};

export const SOURCE_LABEL: Record<string, string> = {
  copilot:     "Copilot",
  manual:      "Manual",
  finance:     "Finanzas",
  collections: "Cobranza",
  commercial:  "Comercial",
  marketing:   "Marketing",
  inventory:   "Inventario",
  operations:  "Operaciones",
  system:      "Sistema",
};

// ── Card type ─────────────────────────────────────────────────────────────────

export interface TaskInboxCard {
  id:             string;
  title:          string;
  description:    string | undefined;
  priority:       TaskPriority;
  priorityLabel:  string;
  status:         TaskStatus;
  statusLabel:    string;
  ownerLabel:     string;
  assignedLabel:  string | undefined;
  module:         string | undefined;
  source:         string;
  sourceLabel:    string;
  category:       string;
  createdAt:      string;
  updatedAt:      string;
  completedAt:    string | undefined;
  cancelledAt:    string | undefined;
  dueAt:          string | undefined;
  isOverdue:      boolean;
  relationships:  TaskRelationship[];
  auditTrail:     TaskAuditEvent[];
  // AGENTIK-TASK-CONTEXT-01
  navigationTarget?: string;
  impactSummary?:    string;
  recommendation?:   string;
  sourceAgentName?:  string;
  entityType?:       string;
}

// ── Summary type ──────────────────────────────────────────────────────────────

export interface TaskInboxSummary {
  total:       number;
  open:        number;
  inProgress:  number;
  waiting:     number;
  blocked:     number;
  completed:   number;
  cancelled:   number;
  critical:    number;
  overdue:     number;
}

// ── Filter key ────────────────────────────────────────────────────────────────

export type TaskInboxFilter =
  | "all"
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled";

// ── ViewModel ─────────────────────────────────────────────────────────────────

export interface TaskInboxViewModel {
  cards:   TaskInboxCard[];
  summary: TaskInboxSummary;
}

// ── Builder helpers ───────────────────────────────────────────────────────────

function isOverdue(dueAt: string | undefined, status: TaskStatus): boolean {
  if (!dueAt) return false;
  if (status === "completed" || status === "cancelled") return false;
  return new Date(dueAt) < new Date();
}

function toCard(record: TaskRecord): TaskInboxCard {
  const d = record.draft;
  return {
    id:            record.id,
    title:         d.title,
    description:   d.description,
    priority:      d.priority,
    priorityLabel: PRIORITY_LABEL[d.priority] ?? d.priority,
    status:        d.status,
    statusLabel:   STATUS_LABEL[d.status]    ?? d.status,
    ownerLabel:    d.owner.name,
    assignedLabel: d.assignment?.assignedTo.name,
    module:        d.businessContext.module,
    source:        d.source,
    sourceLabel:   SOURCE_LABEL[d.source]    ?? d.source,
    category:      d.category,
    createdAt:     record.createdAt,
    updatedAt:     record.updatedAt,
    completedAt:   record.completedAt,
    cancelledAt:   record.cancelledAt,
    dueAt:           d.dueAt,
    isOverdue:       isOverdue(d.dueAt, d.status),
    relationships:   d.relationships,
    auditTrail:      record.auditTrail,
    navigationTarget: d.businessContext.navigationTarget,
    impactSummary:    d.businessContext.impactSummary,
    recommendation:   d.businessContext.recommendation,
    sourceAgentName:  d.businessContext.sourceAgentName,
    entityType:       d.businessContext.entityType,
  };
}

function sortCards(cards: TaskInboxCard[]): TaskInboxCard[] {
  return [...cards].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pw !== 0) return pw;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function buildSummary(cards: TaskInboxCard[]): TaskInboxSummary {
  return {
    total:      cards.length,
    open:       cards.filter(c => c.status === "open").length,
    inProgress: cards.filter(c => c.status === "in_progress").length,
    waiting:    cards.filter(c => c.status === "waiting").length,
    blocked:    cards.filter(c => c.status === "blocked").length,
    completed:  cards.filter(c => c.status === "completed").length,
    cancelled:  cards.filter(c => c.status === "cancelled").length,
    critical:   cards.filter(c => c.priority === "critical").length,
    overdue:    cards.filter(c => c.isOverdue).length,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildTaskInboxViewModel(records: TaskRecord[]): TaskInboxViewModel {
  const cards   = sortCards(records.map(toCard));
  const summary = buildSummary(cards);
  return { cards, summary };
}
