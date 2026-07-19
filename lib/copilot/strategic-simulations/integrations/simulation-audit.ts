// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 22 — Simulation Audit
// Audit trail for simulation runs. Pure domain — no DB, no server-only.

export type SimulationAuditEventType =
  | "SIMULATION_STARTED"
  | "SIMULATION_COMPLETED"
  | "SIMULATION_FAILED"
  | "SCENARIO_BUILT"
  | "COMPARISON_BUILT"
  | "RECOMMENDATION_GENERATED"
  | "TENANT_BOUNDARY_CHECKED"
  | "TENANT_BOUNDARY_VIOLATION";

export interface SimulationAuditEvent {
  readonly id:          string;
  readonly eventType:   SimulationAuditEventType;
  readonly orgSlug:     string;
  readonly runId:       string;
  readonly occurredAt:  string;
  readonly metadata:    Record<string, unknown>;
}

let _auditCounter = 0;

export function buildSimulationAuditEvent(
  eventType: SimulationAuditEventType,
  orgSlug:   string,
  runId:     string,
  metadata?: Record<string, unknown>
): SimulationAuditEvent {
  _auditCounter = (_auditCounter + 1) % 99999;
  return {
    id:         `simaudit_${Date.now().toString(36)}_${_auditCounter}`,
    eventType,
    orgSlug,
    runId,
    occurredAt: new Date().toISOString(),
    metadata:   metadata ?? {},
  };
}

export function auditSimulationStarted(orgSlug: string, runId: string): SimulationAuditEvent {
  return buildSimulationAuditEvent("SIMULATION_STARTED", orgSlug, runId);
}

export function auditSimulationCompleted(orgSlug: string, runId: string, scenarioCount: number): SimulationAuditEvent {
  return buildSimulationAuditEvent("SIMULATION_COMPLETED", orgSlug, runId, { scenarioCount });
}

export function auditSimulationFailed(orgSlug: string, runId: string, error: string): SimulationAuditEvent {
  return buildSimulationAuditEvent("SIMULATION_FAILED", orgSlug, runId, { error });
}

export function auditTenantBoundaryViolation(orgSlug: string, runId: string, violatingOrgSlug: string): SimulationAuditEvent {
  return buildSimulationAuditEvent("TENANT_BOUNDARY_VIOLATION", orgSlug, runId, { violatingOrgSlug });
}
