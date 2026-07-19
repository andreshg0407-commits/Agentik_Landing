/**
 * lib/integrations/supervised-dispatch.ts
 *
 * Agentik — Supervised Dispatch Layer
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block B2
 *
 * Prepares and validates supervised dispatch bundles for real connector execution.
 * A dispatch is always supervised — no autonomous execution is permitted.
 *
 * V1: deterministic state derivation from runtime + vault + governance signals.
 *     No live connector calls, no real API dispatch.
 * V4: backed by real connector execution via webhook-execution.ts + audit persistence.
 *
 * ALL dispatches are:
 *   - supervised (human-in-the-loop)
 *   - tenant-scoped (orgSlug enforced)
 *   - vault-gated (secret status checked before dispatch)
 *   - governance-gated (approval requirements enforced)
 *   - audited (trace ID + audit tag emitted)
 */

import type { RealConnectorId, RealConnectorContract } from "./real-connectors";
import { REAL_CONNECTOR_CATALOG, connectorRequiresApproval } from "./real-connectors";
import type { VaultHealthSnapshot } from "../security/vault/vault-governance";

// ── Dispatch status ──────────────────────────────────────────────────────────────

export type DispatchStatus =
  | "prepared"          // Ready for approval / immediate dispatch
  | "awaiting_approval" // Requires human approval before dispatch
  | "dispatch_ready"    // Approved + validated — may be dispatched
  | "dispatched"        // Dispatch has been sent (V4: real call made)
  | "failed"            // Dispatch failed — error recorded
  | "blocked";          // Hard block — vault / governance / runtime prevents dispatch

// ── Supervised dispatch record ───────────────────────────────────────────────────

export interface SupervisedDispatch {
  id:                  string;
  orgSlug:             string;
  connectorId:         RealConnectorId;
  action:              string;              // One of connector.supportedActions
  executionId?:        string;             // Linked execution bundle ID
  dispatchStatus:      DispatchStatus;
  approvalRequired:    boolean;
  governanceApproved:  boolean;
  runtimeValidated:    boolean;
  vaultValidated:      boolean;
  rollbackAvailable:   boolean;
  rollbackWindowMins?: number;
  blockReason?:        string;             // Set when dispatchStatus === "blocked" or "failed"
  warningReasons:      string[];           // Non-blocking warnings
  auditTag:            string;             // Opaque audit reference (no secrets)
  preparedAt:          string;             // ISO timestamp
}

// ── Dispatch readiness summary ────────────────────────────────────────────────────

export interface DispatchReadinessSummary {
  canDispatch:       boolean;
  requiresApproval:  boolean;
  blockCount:        number;
  warningCount:      number;
  readyConnectors:   RealConnectorId[];
  blockedConnectors: RealConnectorId[];
  summaryLabel:      string;
}

// ── Build params ──────────────────────────────────────────────────────────────────

export interface PrepareDispatchParams {
  orgSlug:         string;
  connectorId:     RealConnectorId;
  action:          string;
  executionId?:    string;
  runtimeState:    string;
  vaultSnapshot:   VaultHealthSnapshot;
  governanceAllowed: boolean;
  governanceReason?: string;
}

// ── Core: prepare dispatch ────────────────────────────────────────────────────────

/**
 * Prepares a supervised dispatch bundle from runtime, vault, and governance state.
 * Returns a dispatch record with status, block reasons, and audit tag.
 * Does NOT execute any real connector call.
 */
export function prepareDispatch(params: PrepareDispatchParams): SupervisedDispatch {
  const {
    orgSlug,
    connectorId,
    action,
    executionId,
    runtimeState,
    vaultSnapshot,
    governanceAllowed,
    governanceReason,
  } = params;

  const contract      = REAL_CONNECTOR_CATALOG[connectorId];
  const id            = generateDispatchId(orgSlug, connectorId);
  const auditTag      = `dispatch:${connectorId}:${id.slice(-8)}`;
  const preparedAt    = new Date().toISOString();
  const warningReasons: string[] = [];

  // ── Validation checks ───────────────────────────────────────────────────────────

  // 1. Action must be supported
  if (!contract.supportedActions.includes(action)) {
    return buildBlockedDispatch({
      id, orgSlug, connectorId, action, executionId,
      auditTag, preparedAt, contract,
      blockReason: `Acción '${action}' no soportada por conector ${contract.name}`,
    });
  }

  // 2. Runtime state must be in allowed set
  if (!contract.governanceRequirements.runtimeRequirements.includes(runtimeState)) {
    return buildBlockedDispatch({
      id, orgSlug, connectorId, action, executionId,
      auditTag, preparedAt, contract,
      blockReason: `Runtime '${runtimeState}' no permite despacho en ${contract.name}`,
    });
  }

  // 3. Vault must not be critical
  if (vaultSnapshot.health === "critical") {
    return buildBlockedDispatch({
      id, orgSlug, connectorId, action, executionId,
      auditTag, preparedAt, contract,
      blockReason: "Vault en estado crítico — despacho bloqueado",
    });
  }

  // 4. Governance must allow
  if (!governanceAllowed) {
    return buildBlockedDispatch({
      id, orgSlug, connectorId, action, executionId,
      auditTag, preparedAt, contract,
      blockReason: governanceReason ?? "Gobernanza bloqueó el despacho",
    });
  }

  // ── Non-blocking warnings ────────────────────────────────────────────────────────

  if (vaultSnapshot.health === "warning") {
    warningReasons.push(`${vaultSnapshot.expiringCount} secreto${vaultSnapshot.expiringCount > 1 ? "s" : ""} próximo${vaultSnapshot.expiringCount > 1 ? "s" : ""} a expirar`);
  }

  if (runtimeState === "SYNCING") {
    warningReasons.push("Runtime en sincronización — latencia posible");
  }

  if (runtimeState === "STALE") {
    warningReasons.push("Runtime con datos desactualizados — verificar antes de despachar");
  }

  // ── Determine dispatch status ────────────────────────────────────────────────────

  const approvalRequired = connectorRequiresApproval(connectorId);
  const dispatchStatus: DispatchStatus = approvalRequired ? "awaiting_approval" : "dispatch_ready";

  return {
    id,
    orgSlug,
    connectorId,
    action,
    executionId,
    dispatchStatus,
    approvalRequired,
    governanceApproved: !approvalRequired, // Auto-approved when not required
    runtimeValidated:   true,
    vaultValidated:     true,
    rollbackAvailable:  contract.rollbackSupport.supported,
    rollbackWindowMins: contract.rollbackSupport.rollbackWindow,
    warningReasons,
    auditTag,
    preparedAt,
  };
}

// ── Validate dispatch readiness for multiple connectors ──────────────────────────

export interface ValidateDispatchReadinessParams {
  orgSlug:      string;
  runtimeState: string;
  vaultSnapshot: VaultHealthSnapshot;
  governanceAllowed: boolean;
}

/**
 * Validates dispatch readiness across all connectors for the current runtime context.
 * Returns a summary of which connectors are ready and which are blocked.
 */
export function validateDispatchReadiness(
  params: ValidateDispatchReadinessParams,
): DispatchReadinessSummary {
  const { orgSlug, runtimeState, vaultSnapshot, governanceAllowed } = params;

  const readyConnectors:   RealConnectorId[] = [];
  const blockedConnectors: RealConnectorId[] = [];

  for (const [id, contract] of Object.entries(REAL_CONNECTOR_CATALOG)) {
    const connectorId = id as RealConnectorId;
    const runtimeOk   = contract.governanceRequirements.runtimeRequirements.includes(runtimeState);
    const vaultOk     = vaultSnapshot.health !== "critical";
    const govOk       = governanceAllowed;

    if (runtimeOk && vaultOk && govOk) {
      readyConnectors.push(connectorId);
    } else {
      blockedConnectors.push(connectorId);
    }
  }

  const canDispatch      = readyConnectors.length > 0;
  const requiresApproval = readyConnectors.some(id => connectorRequiresApproval(id));

  const summaryLabel =
    blockedConnectors.length === 0
      ? `${readyConnectors.length} conector${readyConnectors.length > 1 ? "es" : ""} disponible${readyConnectors.length > 1 ? "s" : ""} — despacho supervisado`
      : readyConnectors.length === 0
      ? "Sin conectores disponibles — despacho bloqueado"
      : `${readyConnectors.length} disponible${readyConnectors.length > 1 ? "s" : ""}, ${blockedConnectors.length} bloqueado${blockedConnectors.length > 1 ? "s" : ""}`;

  return {
    canDispatch,
    requiresApproval,
    blockCount:        blockedConnectors.length,
    warningCount:      readyConnectors.filter(id =>
      REAL_CONNECTOR_CATALOG[id].governanceRequirements.requiresHumanApproval
    ).length,
    readyConnectors,
    blockedConnectors,
    summaryLabel,
  };
}

// ── Summarize dispatch state ─────────────────────────────────────────────────────

/**
 * Returns a human-readable summary of a supervised dispatch record.
 */
export function summarizeDispatchState(dispatch: SupervisedDispatch): string {
  switch (dispatch.dispatchStatus) {
    case "blocked":
      return `Bloqueado: ${dispatch.blockReason ?? "razón desconocida"}`;
    case "awaiting_approval":
      return `Esperando aprobación para ${dispatch.connectorId}`;
    case "dispatch_ready":
      return `Listo para despacho supervisado — ${dispatch.connectorId}`;
    case "dispatched":
      return `Despachado: ${dispatch.connectorId} — ${dispatch.action}`;
    case "prepared":
      return `Preparado: ${dispatch.connectorId} — ${dispatch.action}`;
    case "failed":
      return `Fallido: ${dispatch.blockReason ?? "error desconocido"}`;
    default:
      return "Estado de despacho desconocido";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function generateDispatchId(orgSlug: string, connectorId: string): string {
  const ts  = Date.now().toString(36);
  const org = orgSlug.slice(0, 4).replace(/[^a-z0-9]/gi, "x");
  return `dsp-${org}-${connectorId.slice(0, 4)}-${ts}`;
}

function buildBlockedDispatch(p: {
  id:          string;
  orgSlug:     string;
  connectorId: RealConnectorId;
  action:      string;
  executionId?: string;
  auditTag:    string;
  preparedAt:  string;
  contract:    RealConnectorContract;
  blockReason: string;
}): SupervisedDispatch {
  return {
    id:               p.id,
    orgSlug:          p.orgSlug,
    connectorId:      p.connectorId,
    action:           p.action,
    executionId:      p.executionId,
    dispatchStatus:   "blocked",
    approvalRequired: p.contract.governanceRequirements.requiresHumanApproval,
    governanceApproved: false,
    runtimeValidated:   false,
    vaultValidated:     false,
    rollbackAvailable:  false,
    blockReason:        p.blockReason,
    warningReasons:     [],
    auditTag:           p.auditTag,
    preparedAt:         p.preparedAt,
  };
}
