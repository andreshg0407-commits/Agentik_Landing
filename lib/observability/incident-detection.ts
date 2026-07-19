/**
 * lib/observability/incident-detection.ts
 *
 * Agentik — Incident Detection V1
 *
 * Block C of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Detects operational incidents from runtime, governance, and execution signals.
 * An incident is an anomaly that requires human awareness or action.
 *
 * V1: rule-based detection from pipeline state — no ML, no historical patterns.
 * V4: anomaly detection with Prisma historical data + statistical thresholds.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentType =
  | "runtime_failure"        // Runtime degraded or blocked
  | "connector_failure"      // Connector went offline
  | "execution_blocked"      // Supervised execution was blocked
  | "governance_violation"   // Governance rule was violated
  | "approval_timeout"       // Approval window expired
  | "integration_failure"    // Integration failed to respond
  | "queue_overflow"         // Execution queue overloaded
  | "workload_overload";     // Agent workload exceeded threshold

export type IncidentStatus =
  | "active"      // Currently active — needs attention
  | "monitoring"  // Observed but not critical yet
  | "resolved";   // Addressed — for reference

export interface Incident {
  id:          string;
  type:        IncidentType;
  severity:    IncidentSeverity;
  status:      IncidentStatus;
  title:       string;
  description: string;
  detectedAt:  string;  // ISO string
  orgSlug:     string;
  agentId:     string;
  resolution?: string;  // Suggested resolution
}

// ── Detection rules ────────────────────────────────────────────────────────────

/**
 * Detects incidents from the current pipeline state.
 * Returns all active incidents sorted by severity.
 */
export function detectIncidents(params: {
  orgSlug:           string;
  agentId:           string;
  runtimeState:      string;
  connectorDegradedCount: number;
  connectorBlockedCount:  number;
  governanceAllowed: boolean;
  executionStatus?:  string;
  queueBlockedCount: number;
  workloadLevel?:    string;
  pendingApprovals:  number;
}): Incident[] {
  const {
    orgSlug, agentId, runtimeState, connectorDegradedCount, connectorBlockedCount,
    governanceAllowed, executionStatus, queueBlockedCount, workloadLevel,
  } = params;

  const incidents: Incident[] = [];
  const now = new Date().toISOString();

  // Runtime failure
  if (runtimeState === "DEGRADED") {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "runtime_failure",
      severity:    "high",
      status:      "active",
      title:       "Runtime degradado",
      description: "El motor de señales está en estado degradado — capacidades operativas reducidas",
      detectedAt:  now,
      orgSlug,
      agentId,
      resolution:  "Verificar conectores SAG y reiniciar sincronización desde Integraciones",
    });
  }

  // Connector failures
  if (connectorBlockedCount > 0) {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "connector_failure",
      severity:    "high",
      status:      "active",
      title:       `${connectorBlockedCount} conector${connectorBlockedCount !== 1 ? "es" : ""} bloqueado${connectorBlockedCount !== 1 ? "s" : ""}`,
      description: "Uno o más conectores de datos están bloqueados — sincronización interrumpida",
      detectedAt:  now,
      orgSlug,
      agentId,
      resolution:  "Revisar credenciales y estado del conector en Integraciones",
    });
  } else if (connectorDegradedCount > 0) {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "connector_failure",
      severity:    "medium",
      status:      "monitoring",
      title:       `${connectorDegradedCount} conector${connectorDegradedCount !== 1 ? "es" : ""} degradado${connectorDegradedCount !== 1 ? "s" : ""}`,
      description: "Conectores en estado parcial — posibles retrasos en datos",
      detectedAt:  now,
      orgSlug,
      agentId,
    });
  }

  // Execution blocked
  if (executionStatus === "failed") {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "execution_blocked",
      severity:    "medium",
      status:      "active",
      title:       "Ejecución supervisada fallida",
      description: "La última ejecución supervisada terminó en estado fallido",
      detectedAt:  now,
      orgSlug,
      agentId,
      resolution:  "Revisar historial de lifecycle y resolver bloqueos antes de reintentar",
    });
  }

  // Governance violation
  if (!governanceAllowed) {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "governance_violation",
      severity:    "medium",
      status:      "monitoring",
      title:       "Gobernanza bloqueó ejecución",
      description: "La gobernanza de ejecución denegó la operación en el contexto actual",
      detectedAt:  now,
      orgSlug,
      agentId,
      resolution:  "Revisar nivel de aprobación y estado del runtime antes de reintentar",
    });
  }

  // Queue overflow
  if (queueBlockedCount >= 2) {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "queue_overflow",
      severity:    "medium",
      status:      "monitoring",
      title:       `${queueBlockedCount} operaciones en cola bloqueadas`,
      description: "Múltiples operaciones esperando resolución de dependencias",
      detectedAt:  now,
      orgSlug,
      agentId,
    });
  }

  // Workload overload
  if (workloadLevel === "overloaded") {
    incidents.push({
      id:          crypto.randomUUID(),
      type:        "workload_overload",
      severity:    "low",
      status:      "monitoring",
      title:       "Carga de agente alta",
      description: "El agente activo supera la carga operativa normal",
      detectedAt:  now,
      orgSlug,
      agentId,
    });
  }

  // Sort: active + critical first
  const SEVERITY_SCORE: Record<IncidentSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const STATUS_SCORE: Record<IncidentStatus, number>     = { active: 2, monitoring: 1, resolved: 0 };

  return incidents.sort(
    (a, b) =>
      STATUS_SCORE[b.status]   - STATUS_SCORE[a.status]   ||
      SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity]
  );
}

/**
 * Returns a 1-line incident summary for rail display.
 */
export function summarizeIncidents(incidents: Incident[]): string {
  if (incidents.length === 0) return "Sin incidentes detectados";
  const active   = incidents.filter(i => i.status === "active");
  const critical = incidents.filter(i => i.severity === "critical" || i.severity === "high");
  if (active.length > 0) {
    return `${active.length} incidente${active.length !== 1 ? "s" : ""} activo${active.length !== 1 ? "s" : ""}${critical.length > 0 ? " — atención requerida" : ""}`;
  }
  return `${incidents.length} incidente${incidents.length !== 1 ? "s" : ""} en monitoreo`;
}
