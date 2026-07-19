/**
 * lib/approval/approval-smoke.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Smoke Checks del Flujo de Aprobación
 *
 * Checks determinísticos sin llamadas externas (no Prisma, no DB, no AI).
 * Valida la lógica de tipos, transiciones de estado y reglas de seguridad.
 */

import {
  canApprove,
  canCancel,
  APPROVAL_STATUS_LABEL,
  APPROVABLE_STATUSES,
  CANCELLABLE_STATUSES,
  APPROVAL_ERROR_CODES,
} from "./approval-types";
import type { ApprovalStatus, ApprovalResult } from "./approval-types";

// ── Resultado de smoke ────────────────────────────────────────────────────────

export interface ApprovalSmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: { name: string; passed: boolean; reason?: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(
  name:   string,
  passed: boolean,
  reason?: string,
): { name: string; passed: boolean; reason?: string } {
  return { name, passed, reason: passed ? undefined : (reason ?? `"${name}" falló`) };
}

// ── Simulación de transiciones sin DB ────────────────────────────────────────

function simulateApprove(
  currentStatus: ApprovalStatus,
  approvedBy:    string,
  tenantMatch:   boolean,
): ApprovalResult {
  if (!tenantMatch) {
    return {
      success: false, executionId: "exec-1",
      status: "failed", statusLabel: "Falló",
      message: "Tenant no coincide.", approvedAt: null, approvedBy: null,
      errorCode: APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND,
    };
  }
  if (!approvedBy || approvedBy === "system" || approvedBy === "copilot") {
    return {
      success: false, executionId: "exec-1",
      status: "awaiting_approval", statusLabel: APPROVAL_STATUS_LABEL["awaiting_approval"],
      message: "La aprobación requiere un actor humano identificado.", approvedAt: null, approvedBy: null,
      errorCode: APPROVAL_ERROR_CODES.PERMISSION_DENIED,
    };
  }
  if (currentStatus === "approved") {
    return {
      success: true, executionId: "exec-1",
      status: "approved", statusLabel: APPROVAL_STATUS_LABEL["approved"],
      message: "La ejecución ya estaba aprobada.",
      approvedAt: new Date().toISOString(), approvedBy,
    };
  }
  if (currentStatus === "cancelled") {
    return {
      success: false, executionId: "exec-1",
      status: "cancelled", statusLabel: APPROVAL_STATUS_LABEL["cancelled"],
      message: "No se puede aprobar una ejecución cancelada.", approvedAt: null, approvedBy: null,
      errorCode: APPROVAL_ERROR_CODES.ALREADY_CANCELLED,
    };
  }
  if (!canApprove(currentStatus)) {
    return {
      success: false, executionId: "exec-1",
      status: currentStatus, statusLabel: APPROVAL_STATUS_LABEL[currentStatus] ?? currentStatus,
      message: `Solo se puede aprobar desde "Listo para aprobación".`, approvedAt: null, approvedBy: null,
      errorCode: APPROVAL_ERROR_CODES.INVALID_STATUS_FOR_APPROVAL,
    };
  }
  // awaiting_approval + valid human approver → approve
  return {
    success: true, executionId: "exec-1",
    status: "approved", statusLabel: APPROVAL_STATUS_LABEL["approved"],
    message: "El anuncio fue aprobado.",
    approvedAt: new Date().toISOString(), approvedBy,
  };
}

// ── Casos de prueba ───────────────────────────────────────────────────────────

export function runApprovalSmokeChecks(): ApprovalSmokeResult {
  const results: ApprovalSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── 1. Estado awaiting_approval es aprobable ────────────────────────────
  assert(
    "awaiting_approval es aprobable",
    canApprove("awaiting_approval"),
    "canApprove() debe ser true para awaiting_approval",
  );

  // ── 2. Otros estados no son aprobables ─────────────────────────────────
  const notApprovable: ApprovalStatus[] = ["pending", "validating", "approved", "executing", "completed", "failed", "cancelled"];
  for (const s of notApprovable) {
    assert(`"${s}" no es directamente aprobable`, !canApprove(s), `canApprove("${s}") debe ser false`);
  }

  // ── 3. Estados cancelables ──────────────────────────────────────────────
  for (const s of CANCELLABLE_STATUSES) {
    assert(`"${s}" es cancelable`, canCancel(s), `canCancel("${s}") debe ser true`);
  }
  const notCancellable: ApprovalStatus[] = ["executing", "completed", "failed"];
  for (const s of notCancellable) {
    assert(`"${s}" no es cancelable`, !canCancel(s), `canCancel("${s}") debe ser false`);
  }

  // ── 4. Todas las etiquetas de estado están definidas ───────────────────
  const allStatuses: ApprovalStatus[] = [
    "pending", "validating", "awaiting_approval", "approved",
    "executing", "completed", "failed", "cancelled",
  ];
  for (const s of allStatuses) {
    assert(`Etiqueta definida para "${s}"`, !!APPROVAL_STATUS_LABEL[s], `Falta etiqueta para "${s}"`);
  }

  // ── 5. Simulación: awaiting_approval + human → approved ────────────────
  {
    const r = simulateApprove("awaiting_approval", "user-123", true);
    assert("awaiting_approval + human → approved", r.success && r.status === "approved");
    assert("approvedAt presente después de aprobar", r.approvedAt !== null);
    assert("approvedBy registrado después de aprobar", r.approvedBy === "user-123");
  }

  // ── 6. Ejecución ya aprobada → no duplicar (idempotencia) ──────────────
  {
    const r = simulateApprove("approved", "user-123", true);
    assert(
      "ejecución ya aprobada → success=true sin duplicar",
      r.success && r.status === "approved",
      "Debe retornar success=true para idempotencia",
    );
  }

  // ── 7. Tenant incorrecto → rechazo ─────────────────────────────────────
  {
    const r = simulateApprove("awaiting_approval", "user-123", false);
    assert("tenant incorrecto → rechazo", !r.success && r.errorCode === APPROVAL_ERROR_CODES.EXECUTION_NOT_FOUND);
  }

  // ── 8. Copilot no puede aprobar ─────────────────────────────────────────
  {
    const r = simulateApprove("awaiting_approval", "copilot", true);
    assert(
      "copilot no puede aprobar",
      !r.success && r.errorCode === APPROVAL_ERROR_CODES.PERMISSION_DENIED,
      "Copilot nunca debe aprobar automáticamente",
    );
  }

  // ── 9. system no puede aprobar ──────────────────────────────────────────
  {
    const r = simulateApprove("awaiting_approval", "system", true);
    assert(
      "system no puede aprobar",
      !r.success && r.errorCode === APPROVAL_ERROR_CODES.PERMISSION_DENIED,
    );
  }

  // ── 10. Estado incorrecto (pending) → no aprobable ─────────────────────
  {
    const r = simulateApprove("pending", "user-123", true);
    assert(
      "pending → no aprobable",
      !r.success && r.errorCode === APPROVAL_ERROR_CODES.INVALID_STATUS_FOR_APPROVAL,
    );
  }

  // ── 11. Cancelada → no aprobable ────────────────────────────────────────
  {
    const r = simulateApprove("cancelled", "user-123", true);
    assert(
      "cancelada → no aprobable",
      !r.success && r.errorCode === APPROVAL_ERROR_CODES.ALREADY_CANCELLED,
    );
  }

  // ── 12. Resultado no expone secretos ────────────────────────────────────
  {
    const r = simulateApprove("awaiting_approval", "user-123", true);
    const serialized = JSON.stringify(r).toLowerCase();
    const forbidden = ["accesstoken", "token", "secret", "password", "bearer"];
    const found = forbidden.filter(f => serialized.includes(f));
    assert("resultado de aprobación no expone secretos", found.length === 0,
      `Campos prohibidos encontrados: ${found.join(", ")}`);
  }

  // ── 13. APPROVABLE_STATUSES contiene awaiting_approval ─────────────────
  assert(
    "APPROVABLE_STATUSES contiene awaiting_approval",
    APPROVABLE_STATUSES.includes("awaiting_approval"),
  );

  // ── 14. CANCELLABLE_STATUSES no contiene executing/completed/failed ─────
  const cantCancel: ApprovalStatus[] = ["executing", "completed", "failed"];
  for (const s of cantCancel) {
    assert(`CANCELLABLE_STATUSES no contiene "${s}"`, !CANCELLABLE_STATUSES.includes(s));
  }

  return { total: results.length, passed, failed, results };
}
