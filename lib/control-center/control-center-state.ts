/**
 * lib/control-center/control-center-state.ts
 *
 * Agentik — Control Center State
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block C1
 *
 * Aggregates runtime, tenant, execution, vault, and orchestration state
 * into a single enterprise control center snapshot.
 *
 * V1: derived from existing pipeline signals — no Prisma multi-tenant query.
 *     Models single-tenant (castillitos) with multi-tenant architecture ready.
 * V4: aggregated from real Prisma multi-tenant data.
 */

// ── Control center health ─────────────────────────────────────────────────────

export type ControlCenterHealth =
  | "operational"   // All systems nominal
  | "degraded"      // Partial failures — reduced capacity
  | "critical"      // Active incidents blocking execution
  | "maintenance";  // Maintenance window active

// ── Orchestration health ──────────────────────────────────────────────────────

export type OrchestrationHealth = "green" | "yellow" | "red" | "grey";

// ── Control center state ──────────────────────────────────────────────────────

export interface ControlCenterState {
  orgSlug:              string;
  health:               ControlCenterHealth;
  runtimeHealth:        string;     // "healthy"|"syncing"|"degraded"|"blocked"|"stale"
  activeTenants:        number;     // Tenants with active sessions
  degradedTenants:      number;     // Tenants with runtime degradation
  activeExecutions:     number;     // Supervised executions in progress
  blockedExecutions:    number;     // Executions blocked by governance/vault
  pendingApprovals:     number;     // Awaiting human sign-off
  incidentCount:        number;     // Active incidents
  criticalIncidentCount: number;    // Critical-severity incidents
  dispatchReady:        boolean;    // At least one connector ready
  vaultHealth:          string;     // "secure"|"warning"|"critical"|"empty"
  orchestrationHealth:  OrchestrationHealth;
  connectorReadiness:   number;     // 0–100%
  replayContinuity:     boolean;
  summary:              string;
  evaluatedAt:          string;     // ISO timestamp
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildControlCenterStateParams {
  orgSlug:              string;
  runtimeState:         string;
  vaultHealth:          string;
  activeExecutions:     number;
  blockedExecutions:    number;
  pendingApprovals:     number;
  incidentCount:        number;
  criticalIncidentCount: number;
  dispatchReady:        boolean;
  connectorReadiness:   number;
  orchestrationHealth:  OrchestrationHealth;
  replayContinuity:     boolean;
}

// ── Core: build control center state ─────────────────────────────────────────

/**
 * Builds the control center state snapshot from aggregated pipeline signals.
 */
export function buildControlCenterState(
  params: BuildControlCenterStateParams,
): ControlCenterState {
  const {
    orgSlug, runtimeState, vaultHealth,
    activeExecutions, blockedExecutions, pendingApprovals,
    incidentCount, criticalIncidentCount, dispatchReady,
    connectorReadiness, orchestrationHealth, replayContinuity,
  } = params;

  const health = resolveControlCenterHealth(params);

  // V1: single-tenant model (castillitos)
  const activeTenants   = 1;
  const degradedTenants =
    runtimeState === "DEGRADED" || runtimeState === "BLOCKED" ? 1 : 0;

  const summary = summarizeControlCenterHealth({
    health, runtimeState, incidentCount, criticalIncidentCount,
    blockedExecutions, vaultHealth, dispatchReady,
  });

  return {
    orgSlug,
    health,
    runtimeHealth:         runtimeState.toLowerCase(),
    activeTenants,
    degradedTenants,
    activeExecutions,
    blockedExecutions,
    pendingApprovals,
    incidentCount,
    criticalIncidentCount,
    dispatchReady,
    vaultHealth,
    orchestrationHealth,
    connectorReadiness,
    replayContinuity,
    summary,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Resolve health ────────────────────────────────────────────────────────────

function resolveControlCenterHealth(
  p: BuildControlCenterStateParams,
): ControlCenterHealth {
  if (p.runtimeState === "BLOCKED" || p.criticalIncidentCount > 0 || p.vaultHealth === "critical") {
    return "critical";
  }
  if (
    p.runtimeState === "DEGRADED" ||
    p.incidentCount > 0 ||
    p.blockedExecutions > 0 ||
    p.vaultHealth === "warning"
  ) {
    return "degraded";
  }
  return "operational";
}

// ── Summarize health ──────────────────────────────────────────────────────────

/**
 * Returns a 1-line control center health summary.
 */
export function summarizeControlCenterHealth(p: {
  health:                ControlCenterHealth;
  runtimeState:          string;
  incidentCount:         number;
  criticalIncidentCount: number;
  blockedExecutions:     number;
  vaultHealth:           string;
  dispatchReady:         boolean;
}): string {
  if (p.health === "critical") {
    return p.criticalIncidentCount > 0
      ? `${p.criticalIncidentCount} incidente${p.criticalIncidentCount > 1 ? "s" : ""} crítico${p.criticalIncidentCount > 1 ? "s" : ""} — intervención inmediata requerida`
      : p.vaultHealth === "critical"
      ? "Vault crítico — dispatch bloqueado en todos los sistemas"
      : `Runtime ${p.runtimeState} — operaciones suspendidas`;
  }
  if (p.health === "degraded") {
    return p.incidentCount > 0
      ? `${p.incidentCount} incidente${p.incidentCount > 1 ? "s" : ""} activo${p.incidentCount > 1 ? "s" : ""} — capacidad reducida`
      : p.blockedExecutions > 0
      ? `${p.blockedExecutions} ejecución${p.blockedExecutions > 1 ? "es" : ""} bloqueada${p.blockedExecutions > 1 ? "s" : ""} — requieren atención`
      : "Sistema degradado — monitorear activamente";
  }
  return p.dispatchReady
    ? "Todos los sistemas operativos — dispatch disponible"
    : "Sistema operativo — dispatch no disponible";
}
