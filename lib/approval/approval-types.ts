/**
 * lib/approval/approval-types.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Tipos del Flujo Formal de Aprobación
 *
 * Tipos serializables — seguros para boundary RSC → client.
 * Agnósticos de módulo: usables por Anuncios, Shopify, WhatsApp,
 * DIAN, Conciliación y cualquier acción futura de Copilot.
 *
 * Principio fundamental:
 *   Validar ≠ Aprobar ≠ Ejecutar
 *
 * Ciclo obligatorio para toda acción con efecto externo:
 *   Borrador → Validación → Listo para aprobación →
 *   Aprobado → En ejecución → Completado | Falló | Cancelado
 */

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

/**
 * Estados canónicos del flujo de aprobación.
 * Mapeados 1:1 desde ExecutionStatus de AgentExecution.
 *
 * pending            → Borrador
 * validating         → Validando
 * awaiting_approval  → Listo para aprobación
 * approved           → Aprobado
 * executing          → En ejecución
 * completed          → Completado
 * failed             → Falló
 * cancelled          → Cancelado
 */
export type ApprovalStatus =
  | "pending"
  | "validating"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

/** Etiquetas en español empresarial LATAM para mostrar en UI. */
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending:            "Borrador",
  validating:         "Validando",
  awaiting_approval:  "Listo para aprobación",
  approved:           "Aprobado",
  executing:          "En ejecución",
  completed:          "Completado",
  failed:             "Falló",
  cancelled:          "Cancelado",
};

/** Variante visual para cada estado — usada en ag-op-status CSS classes. */
export const APPROVAL_STATUS_VARIANT: Record<ApprovalStatus, string> = {
  pending:            "draft",
  validating:         "active",
  awaiting_approval:  "review",
  approved:           "scheduled",
  executing:          "active",
  completed:          "done",
  failed:             "error",
  cancelled:          "paused",
};

// ── Decisión de aprobación ────────────────────────────────────────────────────

/**
 * Decisión formal del actor humano.
 *
 * approve  — aprueba la acción; avanza a "approved".
 * cancel   — cancela la acción; avanza a "cancelled".
 */
export type ApprovalDecision = "approve" | "cancel";

// ── Solicitud de aprobación ───────────────────────────────────────────────────

/**
 * Input para aprobar o cancelar una ejecución.
 * Recibido por approveExecution() y cancelExecution().
 */
export interface ApprovalRequest {
  /** ID del AgentExecution en estado awaiting_approval. */
  executionId: string;
  /** Tenant owner. Obligatorio para isolation. */
  tenantId:    string;
  /** Actor que toma la decisión (userId o "system"). */
  decidedBy:   string;
  /** Decisión tomada. */
  decision:    ApprovalDecision;
}

// ── Resumen de aprobación ─────────────────────────────────────────────────────

/**
 * Resumen del estado de aprobación de una ejecución.
 * Safe para RSC → client. No contiene secretos.
 */
export interface ApprovalSummary {
  executionId:        string;
  status:             ApprovalStatus;
  statusLabel:        string;
  /** Actor que creó la ejecución. */
  createdBy:          string;
  /** Actor que aprobó (null si aún no está aprobada). */
  approvedBy:         string | null;
  /** Cuándo fue aprobada (ISO string). Null si no aplica. */
  approvedAt:         string | null;
  /** Cuándo se registró la ejecución (ISO string). */
  createdAt:          string;
  /** Módulo propietario (e.g. "ads", "shopify"). */
  module:             string;
  /** Proveedor externo (e.g. "meta", "tiktok"). Null para ops internas. */
  provider:           string | null;
  /** Descripción de la intención (human-readable, sin secretos). */
  intent:             string | null;
  /** Si la ejecución puede ser aprobada ahora. */
  canApprove:         boolean;
  /** Si la ejecución puede ser cancelada ahora. */
  canCancel:          boolean;
}

// ── Resultado de operación de aprobación ──────────────────────────────────────

/**
 * Resultado de approveExecution() o cancelExecution().
 * Nunca contiene tokens ni secretos.
 */
export interface ApprovalResult {
  /** true si la operación tuvo éxito. */
  success:     boolean;
  /** ID del AgentExecution actualizado. */
  executionId: string;
  /** Nuevo estado después de la operación. */
  status:      ApprovalStatus;
  /** Etiqueta legible del nuevo estado. */
  statusLabel: string;
  /** Mensaje descriptivo para mostrar al operador. */
  message:     string;
  /** Cuándo se aprobó (ISO). Presente cuando success=true y decision=approve. */
  approvedAt:  string | null;
  /** Actor que aprobó. */
  approvedBy:  string | null;
  /** Código de error si success=false. */
  errorCode?:  string;
}

// ── Códigos de error de aprobación ───────────────────────────────────────────

export const APPROVAL_ERROR_CODES = {
  EXECUTION_NOT_FOUND:         "EXECUTION_NOT_FOUND",
  TENANT_MISMATCH:             "TENANT_MISMATCH",
  INVALID_STATUS_FOR_APPROVAL: "INVALID_STATUS_FOR_APPROVAL",
  ALREADY_APPROVED:            "ALREADY_APPROVED",
  ALREADY_CANCELLED:           "ALREADY_CANCELLED",
  PERMISSION_DENIED:           "PERMISSION_DENIED",
  REGISTRY_UNAVAILABLE:        "REGISTRY_UNAVAILABLE",
} as const;

export type ApprovalErrorCode = typeof APPROVAL_ERROR_CODES[keyof typeof APPROVAL_ERROR_CODES];

// ── Helpers de estado ─────────────────────────────────────────────────────────

/** Los estados desde los que se puede aprobar. */
export const APPROVABLE_STATUSES: ReadonlyArray<ApprovalStatus> = ["awaiting_approval"];

/** Los estados desde los que se puede cancelar. */
export const CANCELLABLE_STATUSES: ReadonlyArray<ApprovalStatus> = [
  "pending",
  "validating",
  "awaiting_approval",
  "approved",
];

export function canApprove(status: ApprovalStatus): boolean {
  return APPROVABLE_STATUSES.includes(status);
}

export function canCancel(status: ApprovalStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}
