/**
 * lib/observability/orchestration-log.ts
 *
 * Agentik — Orchestration Log V1
 *
 * Block C of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Aggregates execution traces, audit events, and incidents into
 * a single observability snapshot for the rail and monitoring layer.
 *
 * V1: fully derived from pipeline state — no DB, no external APM.
 * V4: backed by Prisma.OrchestrationLog + external observability platform.
 */

import type { ExecutionTrace }  from "./execution-trace";
import type { AuditTrail }      from "./audit-events";
import type { Incident }        from "./incident-detection";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ObservabilityHealth =
  | "green"   // All systems nominal
  | "yellow"  // Warnings present — monitor
  | "red"     // Critical incidents — action required
  | "grey";   // Insufficient data

export interface OrchestrationLog {
  orgSlug:              string;
  health:               ObservabilityHealth;
  traceId:              string;
  traceSummary:         string;
  traceStatus:          string;
  activeIncidentCount:  number;
  criticalIncidentCount: number;
  auditEventCount:      number;
  recentAuditSummary:   string;
  topIncident?:         { title: string; severity: string; resolution?: string };
  overallSummary:       string;
  evaluatedAt:          string;  // ISO string
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the orchestration log from trace, audit, and incident data.
 */
export function buildOrchestrationLog(
  orgSlug:   string,
  trace:     ExecutionTrace,
  audit:     AuditTrail,
  incidents: Incident[],
): OrchestrationLog {
  const activeIncidents   = incidents.filter(i => i.status === "active");
  const criticalIncidents = incidents.filter(
    i => i.severity === "critical" || (i.severity === "high" && i.status === "active")
  );

  const health: ObservabilityHealth =
    criticalIncidents.length > 0                     ? "red"    :
    activeIncidents.length > 0                       ? "yellow" :
    audit.events.some(e => e.severity === "warning") ? "yellow" :
    trace.overallStatus === "ok"                     ? "green"  :
    "grey";

  const topIncident = activeIncidents[0]
    ? { title: activeIncidents[0].title, severity: activeIncidents[0].severity, resolution: activeIncidents[0].resolution }
    : undefined;

  const overallSummary =
    health === "red"    ? `${criticalIncidents.length} incidente${criticalIncidents.length !== 1 ? "s" : ""} crítico${criticalIncidents.length !== 1 ? "s" : ""} — atención inmediata` :
    health === "yellow" ? `${activeIncidents.length} incidente${activeIncidents.length !== 1 ? "s" : ""} activo${activeIncidents.length !== 1 ? "s" : ""} — monitoreo activo` :
    health === "green"  ? "Sistema operativo — sin incidentes" :
    "Datos insuficientes para evaluación";

  return {
    orgSlug,
    health,
    traceId:               trace.traceId,
    traceSummary:          trace.summary,
    traceStatus:           trace.overallStatus,
    activeIncidentCount:   activeIncidents.length,
    criticalIncidentCount: criticalIncidents.length,
    auditEventCount:       audit.events.length,
    recentAuditSummary:    audit.summary,
    topIncident,
    overallSummary,
    evaluatedAt:           new Date().toISOString(),
  };
}

/**
 * Returns the health color for UI rendering.
 */
export function getHealthColor(health: ObservabilityHealth): string {
  const MAP: Record<ObservabilityHealth, string> = {
    green:  "#16a34a",
    yellow: "#d97706",
    red:    "#dc2626",
    grey:   "#94a3b8",
  };
  return MAP[health];
}

/**
 * Returns the health label for UI rendering.
 */
export function getHealthLabel(health: ObservabilityHealth): string {
  const MAP: Record<ObservabilityHealth, string> = {
    green:  "Nominal",
    yellow: "Advertencia",
    red:    "Crítico",
    grey:   "Sin datos",
  };
  return MAP[health];
}
