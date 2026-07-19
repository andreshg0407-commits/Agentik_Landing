/**
 * lib/approvals/approval-audit.ts
 *
 * Agentik — Approval Domain Audit & Validation
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Validates ApprovalRequest integrity.
 * Returns structured reports — never throws.
 *
 * No React. No Prisma. No side effects.
 */

import type {
  ApprovalRequest,
  ApprovalPriority,
  ApprovalStatus,
  ApprovalSource,
  ApprovalCategory,
} from "./approval-types";

// ── Report types ──────────────────────────────────────────────────────────────

export interface ApprovalValidationIssue {
  field:    string;
  severity: "error" | "warning";
  message:  string;
}

export interface ApprovalAuditReport {
  valid:    boolean;
  errors:   ApprovalValidationIssue[];
  warnings: ApprovalValidationIssue[];
}

// ── Valid value sets ──────────────────────────────────────────────────────────

const VALID_PRIORITIES:  ApprovalPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_STATUSES:    ApprovalStatus[]   = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
const VALID_SOURCES:     ApprovalSource[]   = ["COPILOT", "AGENT", "MODULE", "USER", "SYSTEM"];
const VALID_CATEGORIES:  ApprovalCategory[] = [
  "FINANCIAL", "COLLECTIONS", "COMMERCIAL", "INVENTORY",
  "MARKETING", "OPERATIONS", "COMPLIANCE", "CUSTOM",
];

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Validate an ApprovalRequest for structural and business integrity.
 * Returns a flat report of errors and warnings — never throws.
 */
export function validateApprovalRequest(
  request: ApprovalRequest,
): ApprovalAuditReport {
  const errors:   ApprovalValidationIssue[] = [];
  const warnings: ApprovalValidationIssue[] = [];

  // Required: title
  if (!request.title || request.title.trim() === "") {
    errors.push({
      field:    "title",
      severity: "error",
      message:  "El título de la solicitud de aprobación es obligatorio.",
    });
  }

  // Required: approver
  if (!request.approver || !request.approver.id) {
    errors.push({
      field:    "approver",
      severity: "error",
      message:  "La solicitud de aprobación debe tener un aprobador asignado.",
    });
  }

  // Required: requestor
  if (!request.requestor || !request.requestor.id) {
    errors.push({
      field:    "requestor",
      severity: "error",
      message:  "La solicitud de aprobación debe tener un solicitante.",
    });
  }

  // Required: priority
  if (!VALID_PRIORITIES.includes(request.priority)) {
    errors.push({
      field:    "priority",
      severity: "error",
      message:  `Prioridad inválida: "${request.priority}".`,
    });
  }

  // Required: status
  if (!VALID_STATUSES.includes(request.status)) {
    errors.push({
      field:    "status",
      severity: "error",
      message:  `Estado inválido: "${request.status}".`,
    });
  }

  // Required: source
  if (!VALID_SOURCES.includes(request.source)) {
    errors.push({
      field:    "source",
      severity: "error",
      message:  `Origen inválido: "${request.source}".`,
    });
  }

  // Required: category
  if (!VALID_CATEGORIES.includes(request.category)) {
    errors.push({
      field:    "category",
      severity: "error",
      message:  `Categoría inválida: "${request.category}".`,
    });
  }

  // Required: context.orgSlug
  if (!request.context?.orgSlug) {
    errors.push({
      field:    "context.orgSlug",
      severity: "error",
      message:  "El contexto de aprobación debe incluir orgSlug.",
    });
  }

  // Context: entityType requires entityId
  const ctx = request.context;
  if (ctx?.entityType && !ctx?.entityId) {
    warnings.push({
      field:    "context.entityId",
      severity: "warning",
      message:  "Si existe entityType debe existir entityId.",
    });
  }

  // navigationTarget must start with "/"
  if (ctx?.navigationTarget && !ctx.navigationTarget.startsWith("/")) {
    warnings.push({
      field:    "context.navigationTarget",
      severity: "warning",
      message:  "navigationTarget debe comenzar con '/'.",
    });
  }

  // impactSummary max 300 chars
  if (ctx?.impactSummary && ctx.impactSummary.length > 300) {
    warnings.push({
      field:    "context.impactSummary",
      severity: "warning",
      message:  "impactSummary no debe superar 300 caracteres.",
    });
  }

  // recommendation max 500 chars
  if (ctx?.recommendation && ctx.recommendation.length > 500) {
    warnings.push({
      field:    "context.recommendation",
      severity: "warning",
      message:  "recommendation no debe superar 500 caracteres.",
    });
  }

  // Warning: CRITICAL without description
  if (request.priority === "CRITICAL" && !request.description) {
    warnings.push({
      field:    "description",
      severity: "warning",
      message:  "Las aprobaciones de prioridad CRITICAL deberían incluir descripción.",
    });
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}
