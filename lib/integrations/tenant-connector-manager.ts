/**
 * lib/integrations/tenant-connector-manager.ts
 *
 * Agentik — Tenant Connector Manager
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block A2
 *
 * Builds, validates, and summarizes per-tenant connector states.
 * Validates vault, governance, runtime, scopes, permissions,
 * execution readiness, and replay continuity for each connector.
 *
 * V1: derived from runtime + vault signals — no live connector pings.
 * V4: driven by Prisma.Integration records + vault health checks.
 */

import type { RealConnectorId } from "./real-connectors";
import { REAL_CONNECTOR_CATALOG } from "./real-connectors";
import type { VaultHealthSnapshot } from "../security/vault/vault-governance";
import type {
  TenantIntegrationState,
  TenantIntegrationStatus,
  TenantIntegrationSummary,
  IntegrationScope,
  IntegrationPermission,
} from "./tenant-integration-state";
import { statusToHealth } from "./tenant-integration-state";

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildTenantConnectorStateParams {
  orgSlug:           string;
  connectorId:       RealConnectorId;
  runtimeState:      string;
  vaultSnapshot:     VaultHealthSnapshot;
  governanceAllowed: boolean;
  replayContinuity:  boolean;
  configuredSecrets?: string[];    // Vault secret IDs actually provisioned
}

// ── Connector risk summary ────────────────────────────────────────────────────

export interface TenantConnectorRisk {
  connectorId:  RealConnectorId;
  riskLevel:    "low" | "medium" | "high" | "critical";
  riskFactors:  string[];
  mitigations:  string[];
  summary:      string;
}

// ── Core: build tenant connector state ───────────────────────────────────────

/**
 * Builds a full TenantIntegrationState for one connector,
 * validating all gates: vault, runtime, governance, scopes, replay.
 */
export function buildTenantConnectorState(
  params: BuildTenantConnectorStateParams,
): TenantIntegrationState {
  const {
    orgSlug, connectorId, runtimeState, vaultSnapshot,
    governanceAllowed, replayContinuity, configuredSecrets = [],
  } = params;

  const contract  = REAL_CONNECTOR_CATALOG[connectorId];
  const now       = new Date().toISOString();
  const warnings: string[] = [];

  // ── Gate evaluation ───────────────────────────────────────────────────────

  // 1. Vault gate
  const vaultReady = vaultSnapshot.health !== "critical";
  if (!vaultReady) {
    warnings.push("Vault en estado crítico — secretos bloqueados");
  } else if (vaultSnapshot.health === "warning") {
    warnings.push(`${vaultSnapshot.expiringCount} secreto${vaultSnapshot.expiringCount > 1 ? "s" : ""} próximo${vaultSnapshot.expiringCount > 1 ? "s" : ""} a expirar`);
  }

  // 2. Runtime gate
  const runtimeReady = contract.governanceRequirements.runtimeRequirements.includes(runtimeState);
  if (!runtimeReady) {
    warnings.push(`Runtime '${runtimeState}' no permite despacho para ${contract.name}`);
  }

  // 3. Governance gate
  const governanceReady = governanceAllowed;
  if (!governanceReady) {
    warnings.push("Gobernanza bloqueó el despacho");
  }

  // 4. Secret presence gate (V1: check required secrets are in configured list)
  const missingSecrets = contract.requiredSecretIds.filter(
    s => !configuredSecrets.includes(s)
  );
  const secretsReady = missingSecrets.length === 0;
  if (!secretsReady && configuredSecrets.length > 0) {
    warnings.push(`Secretos no configurados: ${missingSecrets.join(", ")}`);
  }

  // 5. Replay gate
  if (!replayContinuity) {
    warnings.push("Gap de continuidad de auditoría detectado");
  }

  // ── Resolve status ─────────────────────────────────────────────────────────

  let status: TenantIntegrationStatus;
  let blockReason: string | undefined;

  if (vaultSnapshot.health === "critical") {
    status      = "blocked";
    blockReason = "Vault crítico — secretos requeridos inaccesibles";
  } else if (!runtimeReady) {
    status      = "blocked";
    blockReason = `Runtime ${runtimeState} no compatible con este conector`;
  } else if (!governanceReady) {
    status      = "blocked";
    blockReason = "Gobernanza bloqueó el despacho para este conector";
  } else if (vaultSnapshot.health === "warning") {
    status = "expiring";
  } else if (runtimeState === "DEGRADED") {
    status = "degraded";
  } else {
    // V1: default connected if all gates pass (V4: driven by real Prisma record)
    status = "connected";
  }

  const dispatchReady = status === "connected" || status === "expiring";

  // ── Build scopes (V1: derived from dispatch capabilities) ─────────────────

  const scopes: IntegrationScope[] = buildScopesFromContract(contract);
  const permissions: IntegrationPermission[] = buildPermissionsFromContract(contract, dispatchReady);

  return {
    id:              `ti-${orgSlug.slice(0, 4)}-${connectorId}-${Date.now().toString(36)}`,
    orgSlug,
    integrationId:   connectorId,
    integrationName: contract.name,
    status,
    health:          statusToHealth(status),
    scopes,
    permissions,
    runtimeReady,
    vaultReady,
    dispatchReady,
    governanceReady,
    replayContinuity,
    riskLevel:       contract.riskLevel,
    requiredSecrets: contract.requiredSecretIds,
    lastValidatedAt: now,
    expiresAt:       vaultSnapshot.health === "warning" ? getExpiryWindow() : undefined,
    blockReason,
    warnings,
  };
}

// ── Validate connector ────────────────────────────────────────────────────────

export interface TenantConnectorValidation {
  valid:           boolean;
  errors:          string[];
  warnings:        string[];
  dispatchAllowed: boolean;
  summary:         string;
}

/**
 * Validates a connector state record and returns a structured verdict.
 */
export function validateTenantConnector(
  state: TenantIntegrationState,
): TenantConnectorValidation {
  const errors: string[] = [];

  if (state.status === "blocked") {
    errors.push(state.blockReason ?? "Conector bloqueado sin razón especificada");
  }
  if (state.status === "revoked") {
    errors.push("Credenciales revocadas — intervención manual requerida");
  }
  if (!state.vaultReady) {
    errors.push("Vault no está listo — secretos inaccesibles o inválidos");
  }
  if (!state.runtimeReady) {
    errors.push("Runtime no compatible con este conector en el estado actual");
  }

  const valid          = errors.length === 0;
  const dispatchAllowed = valid && (state.status === "connected" || state.status === "expiring");

  const summary =
    !valid            ? `${errors.length} error${errors.length > 1 ? "es" : ""} de validación — dispatch bloqueado`
    : state.warnings.length > 0 ? `Válido con ${state.warnings.length} advertencia${state.warnings.length > 1 ? "s" : ""}`
    : "Conector válido — dispatch disponible";

  return { valid, errors, warnings: state.warnings, dispatchAllowed, summary };
}

// ── Summarize tenant connector health ────────────────────────────────────────

/**
 * Aggregates multiple connector states into a single health summary.
 */
export function summarizeTenantConnectorHealth(
  states: TenantIntegrationState[],
): TenantIntegrationSummary {
  if (states.length === 0) {
    return {
      totalCount: 0, connectedCount: 0, degradedCount: 0, blockedCount: 0,
      expiringCount: 0, disconnectedCount: 0, dispatchReadyCount: 0,
      overallHealth: "offline",
      summary: "Sin integraciones configuradas",
    };
  }

  const connectedCount    = states.filter(s => s.status === "connected").length;
  const degradedCount     = states.filter(s => s.status === "degraded").length;
  const blockedCount      = states.filter(s => s.status === "blocked" || s.status === "revoked").length;
  const expiringCount     = states.filter(s => s.status === "expiring").length;
  const disconnectedCount = states.filter(s => s.status === "disconnected" || s.status === "pending_setup").length;
  const dispatchReadyCount = states.filter(s => s.dispatchReady).length;

  const overallHealth =
    blockedCount > 0    ? "critical" :
    degradedCount > 0 || expiringCount > 0 ? "warning"  :
    connectedCount > 0  ? "healthy"  :
    "offline";

  const summary =
    blockedCount > 0
      ? `${blockedCount} integración${blockedCount > 1 ? "es" : ""} bloqueada${blockedCount > 1 ? "s" : ""} — intervención requerida`
    : degradedCount > 0
      ? `${degradedCount} integración${degradedCount > 1 ? "es" : ""} degradada${degradedCount > 1 ? "s" : ""} — dispatch reducido`
    : expiringCount > 0
      ? `${expiringCount} credencial${expiringCount > 1 ? "es" : ""} próxima${expiringCount > 1 ? "s" : ""} a expirar`
    : `${connectedCount} integración${connectedCount > 1 ? "es" : ""} activa${connectedCount > 1 ? "s" : ""} — sistema operativo`;

  return {
    totalCount: states.length,
    connectedCount,
    degradedCount,
    blockedCount,
    expiringCount,
    disconnectedCount,
    dispatchReadyCount,
    overallHealth,
    summary,
  };
}

// ── Resolve connector risk ────────────────────────────────────────────────────

/**
 * Returns a structured risk assessment for a connector in a given state.
 */
export function resolveTenantConnectorRisk(
  state: TenantIntegrationState,
): TenantConnectorRisk {
  const riskFactors: string[] = [];
  const mitigations: string[] = [];

  if (state.riskLevel === "critical" || state.riskLevel === "high") {
    riskFactors.push(`Conector de riesgo ${state.riskLevel} — gobernanza reforzada requerida`);
    mitigations.push("Aprobación humana obligatoria antes de despachar");
  }
  if (!state.replayContinuity) {
    riskFactors.push("Auditoría sin continuidad completa");
    mitigations.push("Verificar replay antes de operaciones críticas");
  }
  if (state.status === "expiring") {
    riskFactors.push("Credenciales próximas a expirar");
    mitigations.push("Rotar secretos en los próximos 14 días");
  }
  if (state.status === "degraded") {
    riskFactors.push("Conector operando con capacidad reducida");
    mitigations.push("Monitorear errores — reducir carga de dispatch");
  }

  const effectiveRisk =
    state.status === "blocked" || state.status === "revoked" ? "critical" :
    state.status === "degraded" || state.status === "expiring" ? "high" :
    (state.riskLevel as "low" | "medium" | "high" | "critical");

  const summary =
    riskFactors.length === 0
      ? `Riesgo ${effectiveRisk} — sin factores adicionales identificados`
      : `Riesgo ${effectiveRisk} — ${riskFactors.length} factor${riskFactors.length > 1 ? "es" : ""} de riesgo activo${riskFactors.length > 1 ? "s" : ""}`;

  return {
    connectorId:  state.integrationId as RealConnectorId,
    riskLevel:    effectiveRisk,
    riskFactors,
    mitigations,
    summary,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScopesFromContract(contract: typeof REAL_CONNECTOR_CATALOG[RealConnectorId]): IntegrationScope[] {
  const caps = contract.dispatchCapabilities;
  const scopes: IntegrationScope[] = [];
  if (caps.canSendMessages)    scopes.push({ scope: "send:messages",   granted: true,  required: false });
  if (caps.canPublishContent)  scopes.push({ scope: "publish:content", granted: true,  required: false });
  if (caps.canReadData)        scopes.push({ scope: "read:data",       granted: true,  required: true  });
  if (caps.canWriteData)       scopes.push({ scope: "write:data",      granted: true,  required: false });
  if (caps.canGenerateMedia)   scopes.push({ scope: "generate:media",  granted: true,  required: false });
  if (caps.canSubmitFiscal)    scopes.push({ scope: "submit:fiscal",   granted: true,  required: true  });
  if (caps.canTriggerWorkflows) scopes.push({ scope: "trigger:workflows", granted: true, required: false });
  return scopes;
}

function buildPermissionsFromContract(
  contract: typeof REAL_CONNECTOR_CATALOG[RealConnectorId],
  available: boolean,
): IntegrationPermission[] {
  return contract.supportedActions.map(action => ({
    permission: action,
    available,
    restricted: !available,
  }));
}

function getExpiryWindow(): string {
  return new Date(Date.now() + 14 * 86_400_000).toISOString();
}
