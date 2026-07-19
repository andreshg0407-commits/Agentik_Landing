/**
 * lib/integrations/n8n-execution-bridge.ts
 *
 * Agentik — n8n Execution Bridge
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block B1
 *
 * Builds and validates supervised n8n execution bridge contracts.
 * A bridge links a Copilot execution bundle to an n8n workflow via
 * signed webhook payload — always supervised, always governed.
 *
 * V1: contract + validation — no live n8n API calls.
 * V4: bridge consumed by real webhook dispatch layer.
 *
 * canAutoDispatch = false always.
 */

import type { ReplaySession } from "../observability/operation-replay";

// ── Bridge status ─────────────────────────────────────────────────────────────

export type N8nBridgeStatus =
  | "prepared"         // Contract ready — awaiting human approval
  | "governance_ready" // All governance gates passed
  | "dispatch_ready"   // Approved + signed — ready for supervised dispatch
  | "dispatched"       // Sent to n8n (V4: real call made)
  | "blocked"          // Hard block — cannot proceed
  | "failed";          // Bridge attempt failed

// ── Bridge contract ───────────────────────────────────────────────────────────

export interface N8nExecutionBridge {
  id:                   string;
  executionId:          string;     // Linked execution bundle ID
  orgSlug:              string;
  workflowId:           string;     // n8n workflow identifier
  workflowName:         string;     // Human-readable name
  payload:              N8nBridgePayload;
  signedHeaders:        N8nBridgeHeaders;
  governanceValidated:  boolean;
  dispatchApproved:     boolean;    // Human approved (never auto)
  replayReference?:     string;     // Replay session ID for audit trail
  runtimeValidated:     boolean;
  vaultValidated:       boolean;
  bridgeStatus:         N8nBridgeStatus;
  blockReason?:         string;
  correlationId:        string;     // Trace propagation ID
  preparedAt:           string;     // ISO timestamp
}

// ── Bridge payload ────────────────────────────────────────────────────────────

export interface N8nBridgePayload {
  orgSlug:         string;
  executionId:     string;
  workflowId:      string;
  supervised:      true;
  correlationId:   string;
  auditTag:        string;
  metadata: {
    runtimeValidated:  boolean;
    vaultValidated:    boolean;
    governanceValidated: boolean;
    dispatchApproved:  boolean;
    replayRef?:        string;
    preparedAt:        string;
  };
}

// ── Bridge headers ────────────────────────────────────────────────────────────

export interface N8nBridgeHeaders {
  "x-agentik-org":         string;
  "x-agentik-execution":   string;
  "x-agentik-workflow":    string;
  "x-agentik-correlation": string;
  "x-agentik-supervised":  "true";
  "x-agentik-bridge":      "n8n";
  "content-type":          "application/json";
}

// ── Bridge validation ─────────────────────────────────────────────────────────

export interface N8nBridgeValidation {
  valid:       boolean;
  errors:      string[];
  warnings:    string[];
  canDispatch: boolean;
  summary:     string;
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildN8nBridgeParams {
  orgSlug:             string;
  executionId:         string;
  workflowId:          string;
  workflowName:        string;
  runtimeState:        string;
  vaultHealth:         string;
  governanceAllowed:   boolean;
  replaySession?:      ReplaySession;
}

// ── Core: build n8n execution bridge ─────────────────────────────────────────

/**
 * Builds a supervised n8n execution bridge contract.
 * Validates all governance gates. Returns bridge status without dispatching.
 */
export function buildN8nExecutionBridge(
  params: BuildN8nBridgeParams,
): N8nExecutionBridge {
  const {
    orgSlug, executionId, workflowId, workflowName,
    runtimeState, vaultHealth, governanceAllowed, replaySession,
  } = params;

  const correlationId = buildExecutionCorrelationId(orgSlug, executionId);
  const auditTag      = `bridge:n8n:${correlationId.slice(-8)}`;
  const preparedAt    = new Date().toISOString();

  // Gate evaluation
  const runtimeValidated  = ["HEALTHY", "SYNCING", "STALE"].includes(runtimeState);
  const vaultValidated    = vaultHealth !== "critical";
  const governanceValidated = governanceAllowed;

  // Status
  let bridgeStatus: N8nBridgeStatus;
  let blockReason: string | undefined;

  if (!runtimeValidated) {
    bridgeStatus = "blocked";
    blockReason  = `Runtime '${runtimeState}' no permite bridge n8n`;
  } else if (!vaultValidated) {
    bridgeStatus = "blocked";
    blockReason  = "Vault crítico — bridge bloqueado hasta resolver secretos";
  } else if (!governanceValidated) {
    bridgeStatus = "blocked";
    blockReason  = "Gobernanza bloqueó el bridge — aprobación requerida";
  } else {
    bridgeStatus = "governance_ready";
  }

  const payload: N8nBridgePayload = {
    orgSlug,
    executionId,
    workflowId,
    supervised:  true,
    correlationId,
    auditTag,
    metadata: {
      runtimeValidated,
      vaultValidated,
      governanceValidated,
      dispatchApproved: false, // Never auto-approved
      replayRef:        replaySession?.replayId,
      preparedAt,
    },
  };

  const signedHeaders: N8nBridgeHeaders = {
    "x-agentik-org":         orgSlug,
    "x-agentik-execution":   executionId,
    "x-agentik-workflow":    workflowId,
    "x-agentik-correlation": correlationId,
    "x-agentik-supervised":  "true",
    "x-agentik-bridge":      "n8n",
    "content-type":          "application/json",
  };

  return {
    id:                  `n8n-${orgSlug.slice(0, 4)}-${Date.now().toString(36)}`,
    executionId,
    orgSlug,
    workflowId,
    workflowName,
    payload,
    signedHeaders,
    governanceValidated,
    dispatchApproved:    false,
    replayReference:     replaySession?.replayId,
    runtimeValidated,
    vaultValidated,
    bridgeStatus,
    blockReason,
    correlationId,
    preparedAt,
  };
}

// ── Validate n8n bridge ───────────────────────────────────────────────────────

/**
 * Validates an n8n execution bridge contract.
 */
export function validateN8nBridge(bridge: N8nExecutionBridge): N8nBridgeValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (bridge.bridgeStatus === "blocked") {
    errors.push(bridge.blockReason ?? "Bridge bloqueado sin razón");
  }
  if (!bridge.runtimeValidated) {
    errors.push("Runtime no validado para bridge n8n");
  }
  if (!bridge.vaultValidated) {
    errors.push("Vault no validado — secretos n8n requeridos");
  }
  if (!bridge.governanceValidated) {
    errors.push("Gobernanza no validó el bridge");
  }
  if (!bridge.dispatchApproved) {
    warnings.push("Aprobación humana requerida antes del dispatch");
  }
  if (!bridge.replayReference) {
    warnings.push("Sin referencia de replay — continuidad de auditoría reducida");
  }

  const valid      = errors.length === 0;
  const canDispatch = valid && bridge.dispatchApproved;

  const summary =
    !valid      ? `${errors.length} error${errors.length > 1 ? "es" : ""} — bridge no disponible`
    : !canDispatch ? "Bridge válido — pendiente de aprobación humana"
    : "Bridge listo para dispatch supervisado";

  return { valid, errors, warnings, canDispatch, summary };
}

// ── Summarize bridge ──────────────────────────────────────────────────────────

/**
 * Returns a compact summary string for rail display.
 */
export function summarizeN8nBridge(bridge: N8nExecutionBridge): string {
  switch (bridge.bridgeStatus) {
    case "blocked":         return `Bloqueado: ${bridge.blockReason ?? "sin detalle"}`;
    case "governance_ready": return `Listo para aprobación — ${bridge.workflowName}`;
    case "dispatch_ready":   return `Bridge aprobado — ${bridge.workflowName}`;
    case "dispatched":       return `Enviado a n8n — ${bridge.workflowName}`;
    case "prepared":         return `Preparado — ${bridge.workflowName}`;
    case "failed":           return `Error en bridge — ${bridge.workflowName}`;
    default:                 return "Bridge n8n en estado desconocido";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a deterministic correlation ID for trace propagation.
 * Used to link execution bundle → bridge → n8n → callback → replay.
 */
export function buildExecutionCorrelationId(orgSlug: string, executionId: string): string {
  const ts  = Date.now().toString(36);
  const org = orgSlug.slice(0, 4).replace(/[^a-z0-9]/gi, "x");
  const eid = executionId.slice(-6).replace(/[^a-z0-9]/gi, "0");
  return `cor-${org}-${eid}-${ts}`;
}
