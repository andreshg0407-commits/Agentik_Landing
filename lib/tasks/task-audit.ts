/**
 * lib/tasks/task-audit.ts
 *
 * Agentik — Task Domain Audit & Validation
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Validates TaskDraft and TaskRecord integrity.
 * Returns structured error/warning reports — never throws (except on null input).
 *
 * No React. No Prisma. No Copilot imports.
 */

import type { TaskDraft, TaskRecord, TaskPriority, TaskStatus, TaskSource, TaskCategory } from "./task-types";

// ── Report types ──────────────────────────────────────────────────────────────

export interface TaskValidationIssue {
  field:    string;
  severity: "error" | "warning";
  message:  string;
}

export interface TaskValidationReport {
  valid:    boolean;
  errors:   TaskValidationIssue[];
  warnings: TaskValidationIssue[];
}

export interface TaskDomainAuditReport {
  checkedAt:      string;
  draftReport?:   TaskValidationReport;
  recordReport?:  TaskValidationReport;
  passed:         boolean;
  summary:        string;
}

// ── Valid value sets ──────────────────────────────────────────────────────────

const VALID_PRIORITIES:  TaskPriority[]  = ["low", "medium", "high", "critical"];
const VALID_STATUSES:    TaskStatus[]    = ["open", "in_progress", "waiting", "blocked", "completed", "cancelled"];
const VALID_SOURCES:     TaskSource[]    = ["copilot", "manual", "finance", "collections", "commercial", "marketing", "inventory", "operations", "system"];
const VALID_CATEGORIES:  TaskCategory[]  = ["followup", "review", "approval", "investigation", "reconciliation", "customer", "document", "report", "alert", "general"];

// ── Draft validator ───────────────────────────────────────────────────────────

export function validateTaskDraft(draft: TaskDraft): TaskValidationReport {
  const errors:   TaskValidationIssue[] = [];
  const warnings: TaskValidationIssue[] = [];

  // Required: title
  if (!draft.title || draft.title.trim() === "") {
    errors.push({ field: "title", severity: "error", message: "El título de la tarea es requerido." });
  }

  // Required: priority
  if (!VALID_PRIORITIES.includes(draft.priority)) {
    errors.push({ field: "priority", severity: "error", message: `Prioridad inválida: "${draft.priority}".` });
  }

  // Required: status
  if (!VALID_STATUSES.includes(draft.status)) {
    errors.push({ field: "status", severity: "error", message: `Estado inválido: "${draft.status}".` });
  }

  // Required: source
  if (!VALID_SOURCES.includes(draft.source)) {
    errors.push({ field: "source", severity: "error", message: `Origen inválido: "${draft.source}".` });
  }

  // Required: category
  if (!VALID_CATEGORIES.includes(draft.category)) {
    errors.push({ field: "category", severity: "error", message: `Categoría inválida: "${draft.category}".` });
  }

  // Required: owner
  if (!draft.owner || !draft.owner.id) {
    errors.push({ field: "owner", severity: "error", message: "El propietario de la tarea es requerido." });
  }

  // Required: createdAt
  if (!draft.createdAt) {
    errors.push({ field: "createdAt", severity: "error", message: "La fecha de creación es requerida." });
  }

  // Required: businessContext.orgSlug
  if (!draft.businessContext?.orgSlug) {
    errors.push({ field: "businessContext.orgSlug", severity: "error", message: "El contexto empresarial debe incluir orgSlug." });
  }

  // Warning: high/critical without description
  if ((draft.priority === "high" || draft.priority === "critical") && !draft.description) {
    warnings.push({
      field:    "description",
      severity: "warning",
      message:  `Las tareas de prioridad ${draft.priority} deberían incluir descripción.`,
    });
  }

  // Warning: no relationships on Copilot-sourced tasks
  if (draft.source === "copilot" && draft.relationships.length === 0) {
    warnings.push({
      field:    "relationships",
      severity: "warning",
      message:  "Las tareas generadas por Copilot deberían incluir al menos una relación.",
    });
  }

  // AGENTIK-TASK-CONTEXT-01 — Context validation
  const bc = draft.businessContext;

  if (bc?.entityType && !bc?.entityId) {
    warnings.push({
      field:    "businessContext.entityId",
      severity: "warning",
      message:  "Si existe entityType debe existir entityId.",
    });
  }

  if (bc?.navigationTarget && !bc.navigationTarget.startsWith("/")) {
    warnings.push({
      field:    "businessContext.navigationTarget",
      severity: "warning",
      message:  "navigationTarget debe comenzar con '/'.",
    });
  }

  if (bc?.impactSummary && bc.impactSummary.length > 300) {
    warnings.push({
      field:    "businessContext.impactSummary",
      severity: "warning",
      message:  "impactSummary no debe superar 300 caracteres.",
    });
  }

  if (bc?.recommendation && bc.recommendation.length > 500) {
    warnings.push({
      field:    "businessContext.recommendation",
      severity: "warning",
      message:  "recommendation no debe superar 500 caracteres.",
    });
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}

// ── Record validator ──────────────────────────────────────────────────────────

export function validateTaskRecord(record: TaskRecord): TaskValidationReport {
  const draftReport = validateTaskDraft(record.draft);
  const errors:   TaskValidationIssue[] = [...draftReport.errors];
  const warnings: TaskValidationIssue[] = [...draftReport.warnings];

  // Required: record.id
  if (!record.id) {
    errors.push({ field: "id", severity: "error", message: "El ID del registro de tarea es requerido." });
  }

  // Required: createdAt, updatedAt
  if (!record.createdAt) {
    errors.push({ field: "createdAt", severity: "error", message: "La fecha de creación del registro es requerida." });
  }
  if (!record.updatedAt) {
    errors.push({ field: "updatedAt", severity: "error", message: "La fecha de actualización del registro es requerida." });
  }

  // completed status → completedAt required
  if (record.draft.status === "completed" && !record.completedAt) {
    errors.push({ field: "completedAt", severity: "error", message: "Las tareas completadas deben tener completedAt." });
  }

  // cancelled status → cancelledAt required
  if (record.draft.status === "cancelled" && !record.cancelledAt) {
    errors.push({ field: "cancelledAt", severity: "error", message: "Las tareas canceladas deben tener cancelledAt." });
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}

// ── Domain audit ──────────────────────────────────────────────────────────────

/**
 * Audit a TaskDraft and optionally its derived TaskRecord.
 * Returns a full structured report.
 */
export function auditTaskDomain(
  draft:   TaskDraft,
  record?: TaskRecord,
): TaskDomainAuditReport {
  const draftReport  = validateTaskDraft(draft);
  const recordReport = record ? validateTaskRecord(record) : undefined;

  const passed = draftReport.valid && (recordReport?.valid ?? true);

  const totalErrors =
    draftReport.errors.length + (recordReport?.errors.length ?? 0);
  const totalWarnings =
    draftReport.warnings.length + (recordReport?.warnings.length ?? 0);

  return {
    checkedAt:    new Date().toISOString(),
    draftReport,
    recordReport,
    passed,
    summary:      passed
      ? `Auditoría aprobada. ${totalWarnings} advertencia(s).`
      : `Auditoría con ${totalErrors} error(es) y ${totalWarnings} advertencia(s).`,
  };
}
