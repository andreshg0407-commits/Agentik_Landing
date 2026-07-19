/**
 * lib/work/work-audit.ts
 *
 * Agentik — Work Domain Audit & Validation
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Validates WorkItem, WorkExecution, and WorkArtifact integrity.
 * Returns structured reports — never throws.
 * No React, no Prisma, no Copilot.
 */

import type {
  WorkItem,
  WorkExecution,
  WorkArtifact,
  WorkType,
  WorkStatus,
  WorkPriority,
  WorkExecutionMode,
} from "./work-types";
import { WORK_TYPE_REGISTRY } from "./work-registry";

// ── Issue types ───────────────────────────────────────────────────────────────

export interface WorkValidationIssue {
  field:    string;
  severity: "error" | "warning";
  message:  string;
}

export interface WorkValidationReport {
  valid:    boolean;
  errors:   WorkValidationIssue[];
  warnings: WorkValidationIssue[];
}

export interface WorkDomainAuditReport {
  checkedAt:        string;
  itemReport?:      WorkValidationReport;
  executionReport?: WorkValidationReport;
  artifactReports:  WorkValidationReport[];
  passed:           boolean;
  summary:          string;
}

// ── Valid value sets ──────────────────────────────────────────────────────────

const VALID_WORK_TYPES:      WorkType[]           = ["TASK", "REPORT", "DOCUMENT", "APPROVAL", "ALERT", "WORKFLOW", "MESSAGE", "EXPORT", "IMPORT", "ANALYSIS"];
const VALID_WORK_STATUSES:   WorkStatus[]         = ["PENDING", "RUNNING", "WAITING", "COMPLETED", "FAILED", "CANCELLED"];
const VALID_WORK_PRIORITIES: WorkPriority[]       = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_EXEC_MODES:      WorkExecutionMode[]  = ["STUB", "PREVIEW", "LIVE"];

// ── WorkItem validator ────────────────────────────────────────────────────────

export function validateWorkItem(item: WorkItem): WorkValidationReport {
  const errors:   WorkValidationIssue[] = [];
  const warnings: WorkValidationIssue[] = [];

  if (!item.title?.trim()) {
    errors.push({ field: "title", severity: "error", message: "El título del ítem de trabajo es requerido." });
  }
  if (!VALID_WORK_TYPES.includes(item.type)) {
    errors.push({ field: "type", severity: "error", message: `WorkType inválido: "${item.type}".` });
  }
  if (!VALID_WORK_STATUSES.includes(item.status)) {
    errors.push({ field: "status", severity: "error", message: `WorkStatus inválido: "${item.status}".` });
  }
  if (!VALID_WORK_PRIORITIES.includes(item.priority)) {
    errors.push({ field: "priority", severity: "error", message: `WorkPriority inválida: "${item.priority}".` });
  }
  if (!item.actor?.id) {
    errors.push({ field: "actor", severity: "error", message: "El actor del ítem de trabajo es requerido." });
  }
  if (!item.context?.orgSlug) {
    errors.push({ field: "context.orgSlug", severity: "error", message: "El contexto debe incluir orgSlug." });
  }
  if (!item.createdAt) {
    errors.push({ field: "createdAt", severity: "error", message: "La fecha de creación es requerida." });
  }

  // Warnings
  if ((item.priority === "HIGH" || item.priority === "CRITICAL") && !item.description) {
    warnings.push({ field: "description", severity: "warning", message: "Los ítems de prioridad alta deberían incluir descripción." });
  }

  const def = WORK_TYPE_REGISTRY[item.type];
  if (def?.supportsAssignments && !item.assignment) {
    warnings.push({ field: "assignment", severity: "warning", message: `Los ítems de tipo ${item.type} soportan asignación — considera asignar a un actor.` });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── WorkExecution validator ───────────────────────────────────────────────────

export function validateWorkExecution(exec: WorkExecution): WorkValidationReport {
  const errors:   WorkValidationIssue[] = [];
  const warnings: WorkValidationIssue[] = [];

  if (!exec.id) {
    errors.push({ field: "id", severity: "error", message: "El ID de ejecución es requerido." });
  }
  if (!exec.workItemId) {
    errors.push({ field: "workItemId", severity: "error", message: "workItemId es requerido." });
  }
  if (!VALID_EXEC_MODES.includes(exec.mode)) {
    errors.push({ field: "mode", severity: "error", message: `WorkExecutionMode inválido: "${exec.mode}".` });
  }
  if (!VALID_WORK_STATUSES.includes(exec.status)) {
    errors.push({ field: "status", severity: "error", message: `WorkStatus inválido: "${exec.status}".` });
  }
  if (!exec.startedAt) {
    errors.push({ field: "startedAt", severity: "error", message: "startedAt es requerido." });
  }
  if (exec.status === "COMPLETED" && !exec.completedAt) {
    errors.push({ field: "completedAt", severity: "error", message: "Las ejecuciones completadas deben tener completedAt." });
  }
  if (exec.status === "FAILED" && !exec.errorMessage) {
    warnings.push({ field: "errorMessage", severity: "warning", message: "Las ejecuciones fallidas deberían incluir errorMessage." });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── WorkArtifact validator ────────────────────────────────────────────────────

export function validateWorkArtifact(artifact: WorkArtifact): WorkValidationReport {
  const errors:   WorkValidationIssue[] = [];
  const warnings: WorkValidationIssue[] = [];

  if (!artifact.id) {
    errors.push({ field: "id", severity: "error", message: "El ID del artefacto es requerido." });
  }
  if (!artifact.title?.trim()) {
    errors.push({ field: "title", severity: "error", message: "El título del artefacto es requerido." });
  }
  if (!VALID_EXEC_MODES.includes(artifact.mode)) {
    errors.push({ field: "mode", severity: "error", message: `WorkExecutionMode inválido: "${artifact.mode}".` });
  }
  if (!artifact.producedAt) {
    errors.push({ field: "producedAt", severity: "error", message: "producedAt es requerido." });
  }

  if (Object.keys(artifact.payload).length === 0) {
    warnings.push({ field: "payload", severity: "warning", message: "El artefacto tiene payload vacío." });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Domain audit ──────────────────────────────────────────────────────────────

/**
 * Cross-validates an item, its execution, and all artifacts.
 *
 * Enforces structural rules:
 *   REPORT    → execution must have at least one REPORT artifact
 *   DOCUMENT  → execution must have at least one DOCUMENT artifact
 *   WORKFLOW  → must have an execution
 *   TASK      → must have an item
 */
export function auditWorkDomain(
  item:       WorkItem,
  execution?: WorkExecution,
  artifacts?: WorkArtifact[],
): WorkDomainAuditReport {
  const itemReport      = validateWorkItem(item);
  const executionReport = execution ? validateWorkExecution(execution) : undefined;
  const artifactReports = (artifacts ?? []).map(validateWorkArtifact);

  const structureErrors: WorkValidationIssue[] = [];

  // Rule: REPORT must produce artifact
  if (item.type === "REPORT" && execution && (artifacts ?? []).length === 0) {
    structureErrors.push({ field: "artifacts", severity: "error", message: "Los ítems de tipo REPORT deben producir al menos un artefacto." });
  }

  // Rule: DOCUMENT must produce artifact
  if (item.type === "DOCUMENT" && execution && (artifacts ?? []).length === 0) {
    structureErrors.push({ field: "artifacts", severity: "error", message: "Los ítems de tipo DOCUMENT deben producir al menos un artefacto." });
  }

  // Rule: WORKFLOW must have an execution
  if (item.type === "WORKFLOW" && !execution) {
    structureErrors.push({ field: "execution", severity: "error", message: "Los ítems de tipo WORKFLOW deben tener una ejecución asociada." });
  }

  // Rule: TASK must have an item (trivially satisfied if we have `item`)
  if (item.type === "TASK" && !item.id) {
    structureErrors.push({ field: "item.id", severity: "error", message: "Los ítems de tipo TASK deben tener un ID." });
  }

  const allErrors = [
    ...itemReport.errors,
    ...(executionReport?.errors ?? []),
    ...artifactReports.flatMap(r => r.errors),
    ...structureErrors,
  ];
  const allWarnings = [
    ...itemReport.warnings,
    ...(executionReport?.warnings ?? []),
    ...artifactReports.flatMap(r => r.warnings),
  ];

  const passed = allErrors.length === 0;

  return {
    checkedAt:        new Date().toISOString(),
    itemReport,
    executionReport,
    artifactReports,
    passed,
    summary: passed
      ? `Auditoría aprobada. ${allWarnings.length} advertencia(s).`
      : `Auditoría con ${allErrors.length} error(es) y ${allWarnings.length} advertencia(s).`,
  };
}
