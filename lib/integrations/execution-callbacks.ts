/**
 * lib/integrations/execution-callbacks.ts
 *
 * Agentik — Execution Callback Foundation
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block B3
 *
 * Architecture for n8n execution callbacks, workflow completion notifications,
 * incident callbacks, and execution trace callbacks.
 *
 * V1: contract definitions + validation — no real callback endpoints.
 *     Callback records are built and audited but not delivered.
 * V4: backed by real POST /api/orgs/[orgSlug]/agentik/callbacks/[callbackId]
 *
 * ALL callbacks are:
 *   - tenant-scoped (orgSlug in every payload)
 *   - supervised (human must review outcomes)
 *   - audited (correlation ID + execution ID in every record)
 */

// ── Callback type ─────────────────────────────────────────────────────────────

export type ExecutionCallbackType =
  | "n8n_status"         // n8n workflow status update
  | "workflow_completion" // n8n workflow completed (success or failure)
  | "incident"           // Operational incident triggered by execution
  | "execution_trace"    // Execution trace update for replay
  | "approval_request";  // Human approval request callback

// ── Callback status ───────────────────────────────────────────────────────────

export type ExecutionCallbackStatus =
  | "pending"     // Created but not yet delivered
  | "delivered"   // Successfully received
  | "failed"      // Delivery failed
  | "retrying"    // In retry window
  | "expired";    // Callback window expired

// ── Callback record ───────────────────────────────────────────────────────────

export interface ExecutionCallback {
  id:              string;
  orgSlug:         string;
  type:            ExecutionCallbackType;
  status:          ExecutionCallbackStatus;
  executionId:     string;
  correlationId:   string;
  workflowId?:     string;     // For n8n callbacks
  incidentRef?:    string;     // For incident callbacks
  replayRef?:      string;     // For trace callbacks
  payload:         CallbackPayload;
  auditTag:        string;
  createdAt:       string;     // ISO timestamp
  expiresAt:       string;     // ISO timestamp — delivery window
  deliveredAt?:    string;     // ISO timestamp — when received
}

// ── Callback payload ──────────────────────────────────────────────────────────

export interface CallbackPayload {
  orgSlug:       string;
  executionId:   string;
  correlationId: string;
  callbackType:  ExecutionCallbackType;
  supervised:    true;
  metadata:      Record<string, unknown>;
}

// ── Callback validation ───────────────────────────────────────────────────────

export interface CallbackValidation {
  valid:       boolean;
  errors:      string[];
  warnings:    string[];
  tenantSafe:  boolean;
  summary:     string;
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildCallbackParams {
  orgSlug:       string;
  type:          ExecutionCallbackType;
  executionId:   string;
  correlationId: string;
  workflowId?:   string;
  incidentRef?:  string;
  replayRef?:    string;
  metadata?:     Record<string, unknown>;
}

// ── Core: build execution callback ───────────────────────────────────────────

/**
 * Builds an execution callback record.
 * Does NOT deliver the callback — V4 delivers via real HTTP POST.
 */
export function buildExecutionCallback(
  params: BuildCallbackParams,
): ExecutionCallback {
  const {
    orgSlug, type, executionId, correlationId,
    workflowId, incidentRef, replayRef, metadata = {},
  } = params;

  const id        = `cb-${type.slice(0, 4)}-${orgSlug.slice(0, 4)}-${Date.now().toString(36)}`;
  const auditTag  = `callback:${type}:${correlationId.slice(-8)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1-hour delivery window

  const payload: CallbackPayload = {
    orgSlug,
    executionId,
    correlationId,
    callbackType: type,
    supervised:   true,
    metadata:     {
      ...metadata,
      workflowId,
      incidentRef,
      replayRef,
    },
  };

  return {
    id,
    orgSlug,
    type,
    status:      "pending",
    executionId,
    correlationId,
    workflowId,
    incidentRef,
    replayRef,
    payload,
    auditTag,
    createdAt,
    expiresAt,
  };
}

// ── Validate execution callback ───────────────────────────────────────────────

/**
 * Validates a callback record's structural integrity and tenant safety.
 */
export function validateExecutionCallback(
  callback: ExecutionCallback,
  orgSlug:  string,
): CallbackValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Tenant isolation
  const tenantSafe = callback.orgSlug === orgSlug;
  if (!tenantSafe) {
    errors.push("Violación de aislamiento de tenant — orgSlug no coincide");
  }

  // Required fields
  if (!callback.executionId) {
    errors.push("ID de ejecución requerido en callback");
  }
  if (!callback.correlationId) {
    errors.push("ID de correlación requerido para trace propagation");
  }

  // Status checks
  if (callback.status === "expired") {
    errors.push("Callback expirado — ventana de entrega cerrada");
  }
  if (callback.status === "failed") {
    warnings.push("Callback fallido — reintentar o escalar manualmente");
  }

  // Replay linkage
  if (callback.type === "execution_trace" && !callback.replayRef) {
    warnings.push("Callback de trace sin referencia de replay — auditoría reducida");
  }

  const valid   = errors.length === 0;
  const summary =
    !valid     ? `${errors.length} error${errors.length > 1 ? "es" : ""} en callback — no entregable`
    : callback.status === "delivered" ? "Callback entregado y verificado"
    : callback.status === "pending"   ? "Callback pendiente de entrega"
    : "Callback en estado de monitoreo";

  return { valid, errors, warnings, tenantSafe, summary };
}

// ── Summarize callback ────────────────────────────────────────────────────────

/**
 * Returns a compact human-readable summary for rail display.
 */
export function summarizeExecutionCallback(callback: ExecutionCallback): string {
  const typeLabels: Record<ExecutionCallbackType, string> = {
    n8n_status:          "Estado n8n",
    workflow_completion:  "Flujo completado",
    incident:            "Incidente",
    execution_trace:     "Traza de ejecución",
    approval_request:    "Solicitud de aprobación",
  };
  const typeLabel = typeLabels[callback.type] ?? callback.type;

  switch (callback.status) {
    case "pending":   return `${typeLabel} — pendiente de entrega`;
    case "delivered": return `${typeLabel} — entregado`;
    case "failed":    return `${typeLabel} — fallo de entrega`;
    case "retrying":  return `${typeLabel} — reintentando`;
    case "expired":   return `${typeLabel} — ventana expirada`;
    default:          return `${typeLabel} — estado desconocido`;
  }
}
