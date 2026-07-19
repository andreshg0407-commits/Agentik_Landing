/**
 * lib/approval/approval-service.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Servicio Transversal de Aprobación
 * SERVER ONLY — @server-only
 *
 * Gestiona el flujo formal de aprobación para toda acción con efecto externo.
 * Trabaja exclusivamente sobre AgentExecution — no crea tablas paralelas.
 *
 * Principio:
 *   Validar ≠ Aprobar ≠ Ejecutar
 *
 * Toda acción que genere un efecto externo (publicar, enviar, facturar,
 * sincronizar, cobrar o modificar datos en terceros) debe pasar por:
 *   Validar → Aprobar → Ejecutar → Registrar
 *
 * Módulos consumidores:
 *   - Anuncios (MARKETING-ADS-EXECUTION-01)
 *   - Shopify (SHOPIFY-EXECUTION-01)
 *   - WhatsApp (WHATSAPP-EXECUTION-01)
 *   - DIAN (DIAN-EXECUTION-01)
 *   - Conciliación (RECONCILIATION-EXECUTION-01)
 *   - Copilot (COPILOT-ACTION-EXECUTION-01)
 *
 * Reglas de seguridad:
 *   - Copilot NUNCA aprueba ni ejecuta automáticamente. Solo recomienda.
 *   - Toda aprobación requiere un actor humano identificado (userId).
 *   - Idempotencia: aprobar una ejecución ya aprobada retorna null (no duplica).
 *   - Aislamiento de tenant: todas las operaciones verifican tenantId.
 */
import "server-only";

import {
  updateExecutionStatus,
  recordApproval,
  getExecution,
  appendMetadata,
}                              from "@/lib/execution/execution-registry";
import type { AgentExecutionRecord } from "@/lib/execution/execution-types";
import {
  APPROVAL_ERROR_CODES,
  APPROVAL_STATUS_LABEL,
  canApprove,
  canCancel,
}                              from "./approval-types";
import type {
  ApprovalSummary,
  ApprovalResult,
  ApprovalStatus,
} from "./approval-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toApprovalStatus(executionStatus: string): ApprovalStatus {
  // All AgentExecution statuses map 1:1 to ApprovalStatus
  return executionStatus as ApprovalStatus;
}

function toSummary(record: AgentExecutionRecord): ApprovalSummary {
  const status = toApprovalStatus(record.status);
  return {
    executionId: record.id,
    status,
    statusLabel: APPROVAL_STATUS_LABEL[status] ?? record.status,
    createdBy:   record.createdBy,
    approvedBy:  record.approvedBy,
    approvedAt:  record.approvedAt,
    createdAt:   record.createdAt,
    module:      record.module,
    provider:    record.provider,
    intent:      record.intent,
    canApprove:  canApprove(status),
    canCancel:   canCancel(status),
  };
}

// ── markReadyForApproval ──────────────────────────────────────────────────────

/**
 * Transiciona una ejecución al estado "awaiting_approval" (listo para aprobación).
 *
 * Llamado por los servicios de validación cuando el resultado es READY.
 * Opcionalmente adjunta metadata de validación al registro.
 *
 * @param id        — ID del AgentExecution.
 * @param tenantId  — Tenant owner (obligatorio).
 * @param metadata  — Metadata segura de validación (sin secretos).
 * @returns AgentExecutionRecord actualizado, o null si falla.
 */
export async function markReadyForApproval(
  id:        string,
  tenantId:  string,
  metadata?: Record<string, unknown>,
): Promise<AgentExecutionRecord | null> {
  if (!id || !tenantId) return null;

  const updated = await updateExecutionStatus(id, tenantId, "awaiting_approval");
  if (!updated) return null;

  if (metadata && Object.keys(metadata).length > 0) {
    await appendMetadata(id, tenantId, metadata);
  }

  return updated;
}

// ── approveExecution ──────────────────────────────────────────────────────────

/**
 * Aprueba formalmente una ejecución pendiente de aprobación.
 *
 * Solo puede aprobar ejecuciones en estado "awaiting_approval".
 * Registra approvedBy y approvedAt de forma atómica.
 * Copilot NUNCA es un actor válido de aprobación — siempre debe ser un userId humano.
 *
 * @param id         — ID del AgentExecution en awaiting_approval.
 * @param tenantId   — Tenant owner. Verifica aislamiento.
 * @param approvedBy — userId del actor humano que aprueba. Obligatorio.
 * @returns ApprovalResult con success=true si aprobó correctamente.
 */
export async function approveExecution(
  id:         string,
  tenantId:   string,
  approvedBy: string,
): Promise<ApprovalResult> {
  if (!id) {
    return {
      success:     false,
      executionId: id ?? "",
      status:      "failed",
      statusLabel: "Falló",
      message:     "ID de ejecución requerido.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }

  if (!tenantId) {
    return {
      success:     false,
      executionId: id,
      status:      "failed",
      statusLabel: "Falló",
      message:     "Tenant requerido.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.TENANT_MISMATCH,
    };
  }

  if (!approvedBy || approvedBy === "system" || approvedBy === "copilot") {
    return {
      success:     false,
      executionId: id,
      status:      "awaiting_approval",
      statusLabel: APPROVAL_STATUS_LABEL["awaiting_approval"],
      message:     "La aprobación requiere un actor humano identificado. Copilot no puede aprobar automáticamente.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.PERMISSION_DENIED,
    };
  }

  // Fetch current state to validate transition
  const current = await getExecution(id, tenantId);

  if (!current) {
    return {
      success:     false,
      executionId: id,
      status:      "failed",
      statusLabel: "Falló",
      message:     "No se encontró la ejecución o el tenant no coincide.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }

  if (current.status === "approved") {
    // Idempotency: already approved — return current state without error
    return {
      success:     true,
      executionId: id,
      status:      "approved",
      statusLabel: APPROVAL_STATUS_LABEL["approved"],
      message:     "La ejecución ya estaba aprobada.",
      approvedAt:  current.approvedAt,
      approvedBy:  current.approvedBy,
    };
  }

  if (current.status === "cancelled") {
    return {
      success:     false,
      executionId: id,
      status:      "cancelled",
      statusLabel: APPROVAL_STATUS_LABEL["cancelled"],
      message:     "No se puede aprobar una ejecución que fue cancelada.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.ALREADY_CANCELLED,
    };
  }

  if (!canApprove(toApprovalStatus(current.status))) {
    return {
      success:     false,
      executionId: id,
      status:      toApprovalStatus(current.status),
      statusLabel: APPROVAL_STATUS_LABEL[toApprovalStatus(current.status)] ?? current.status,
      message:     `Solo se puede aprobar desde el estado "Listo para aprobación". Estado actual: "${APPROVAL_STATUS_LABEL[toApprovalStatus(current.status)] ?? current.status}".`,
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.INVALID_STATUS_FOR_APPROVAL,
    };
  }

  // Perform atomic approval
  const approved = await recordApproval(id, tenantId, approvedBy);

  if (!approved) {
    return {
      success:     false,
      executionId: id,
      status:      "awaiting_approval",
      statusLabel: APPROVAL_STATUS_LABEL["awaiting_approval"],
      message:     "Error al registrar la aprobación. Intenta nuevamente.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.REGISTRY_UNAVAILABLE,
    };
  }

  return {
    success:     true,
    executionId: approved.id,
    status:      "approved",
    statusLabel: APPROVAL_STATUS_LABEL["approved"],
    message:     "El anuncio fue aprobado y está listo para ejecutarse cuando se confirme la publicación.",
    approvedAt:  approved.approvedAt,
    approvedBy:  approved.approvedBy,
  };
}

// ── cancelExecution ───────────────────────────────────────────────────────────

/**
 * Cancela una ejecución que aún no ha llegado a estado terminal.
 *
 * Se puede cancelar desde: pending, validating, awaiting_approval, approved.
 * No se puede cancelar lo que ya está en: executing, completed, failed, cancelled.
 *
 * @param id          — ID del AgentExecution.
 * @param tenantId    — Tenant owner.
 * @param cancelledBy — Actor que cancela (userId o "system").
 * @returns ApprovalResult con success=true si canceló correctamente.
 */
export async function cancelExecution(
  id:          string,
  tenantId:    string,
  cancelledBy: string,
): Promise<ApprovalResult> {
  if (!id || !tenantId) {
    return {
      success:     false,
      executionId: id ?? "",
      status:      "failed",
      statusLabel: "Falló",
      message:     "ID de ejecución y tenant son obligatorios.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }

  const current = await getExecution(id, tenantId);

  if (!current) {
    return {
      success:     false,
      executionId: id,
      status:      "failed",
      statusLabel: "Falló",
      message:     "No se encontró la ejecución.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }

  if (current.status === "cancelled") {
    return {
      success:     true,
      executionId: id,
      status:      "cancelled",
      statusLabel: APPROVAL_STATUS_LABEL["cancelled"],
      message:     "La ejecución ya estaba cancelada.",
      approvedAt:  null,
      approvedBy:  null,
    };
  }

  if (!canCancel(toApprovalStatus(current.status))) {
    return {
      success:     false,
      executionId: id,
      status:      toApprovalStatus(current.status),
      statusLabel: APPROVAL_STATUS_LABEL[toApprovalStatus(current.status)] ?? current.status,
      message:     `No se puede cancelar una ejecución en estado "${APPROVAL_STATUS_LABEL[toApprovalStatus(current.status)] ?? current.status}".`,
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.INVALID_STATUS_FOR_APPROVAL,
    };
  }

  const cancelled = await updateExecutionStatus(id, tenantId, "cancelled");

  if (cancelled && cancelledBy) {
    await appendMetadata(id, tenantId, { cancelledBy, cancelledAt: new Date().toISOString() });
  }

  if (!cancelled) {
    return {
      success:     false,
      executionId: id,
      status:      toApprovalStatus(current.status),
      statusLabel: APPROVAL_STATUS_LABEL[toApprovalStatus(current.status)] ?? current.status,
      message:     "Error al cancelar la ejecución. Intenta nuevamente.",
      approvedAt:  null,
      approvedBy:  null,
      errorCode:   APPROVAL_ERROR_CODES.REGISTRY_UNAVAILABLE,
    };
  }

  return {
    success:     true,
    executionId: id,
    status:      "cancelled",
    statusLabel: APPROVAL_STATUS_LABEL["cancelled"],
    message:     "La ejecución fue cancelada.",
    approvedAt:  null,
    approvedBy:  null,
  };
}

// ── getApprovalStatus ─────────────────────────────────────────────────────────

/**
 * Obtiene el resumen del estado de aprobación de una ejecución.
 * Seguro para pasar RSC → client.
 *
 * @param id       — ID del AgentExecution.
 * @param tenantId — Tenant owner.
 * @returns ApprovalSummary, o null si no se encuentra.
 */
export async function getApprovalStatus(
  id:       string,
  tenantId: string,
): Promise<ApprovalSummary | null> {
  if (!id || !tenantId) return null;

  const record = await getExecution(id, tenantId);
  if (!record) return null;

  return toSummary(record);
}
