/**
 * lib/observability/audit-events.ts
 *
 * Agentik — Observability Audit Events V1
 *
 * Block C of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Records significant governance and execution events for the audit trail.
 * Every decision, block, approval, and dispatch generates an audit event.
 *
 * V1: in-memory event generation. No Prisma writes yet.
 * V4: persisted to Prisma.ObservabilityAuditEvent.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | "runtime_degraded"           // Runtime entered degraded state
  | "connector_blocked"          // A connector was blocked
  | "execution_prepared"         // Supervised execution was prepared
  | "execution_dispatched"       // Execution was dispatched (V4)
  | "execution_blocked"          // Execution was blocked by governance
  | "approval_requested"         // Approval request generated
  | "governance_denied"          // Governance engine denied execution
  | "integration_draft_created"  // Integration dispatch draft prepared
  | "incident_detected";         // Incident was detected

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEvent {
  id:          string;
  type:        AuditEventType;
  severity:    AuditSeverity;
  orgSlug:     string;
  agentId:     string;
  title:       string;
  description: string;
  timestamp:   string;    // ISO string
  metadata?:   Record<string, unknown>;
}

export interface AuditTrail {
  orgSlug:  string;
  events:   AuditEvent[];
  summary:  string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Generates audit events from the current pipeline state.
 */
export function buildAuditTrail(params: {
  orgSlug:          string;
  agentId:          string;
  runtimeState:     string;
  governanceAllowed: boolean;
  governanceReason?: string;
  hasExecution:     boolean;
  executionStatus?: string;
  hasApprovalRequest: boolean;
  integrationDraftCreated: boolean;
  integrationName?: string;
}): AuditTrail {
  const {
    orgSlug, agentId, runtimeState, governanceAllowed, governanceReason,
    hasExecution, executionStatus, hasApprovalRequest,
    integrationDraftCreated, integrationName,
  } = params;

  const events: AuditEvent[] = [];
  const now = new Date().toISOString();

  // Runtime degraded event
  if (runtimeState === "DEGRADED" || runtimeState === "STALE") {
    events.push({
      id:          crypto.randomUUID(),
      type:        "runtime_degraded",
      severity:    runtimeState === "DEGRADED" ? "warning" : "info",
      orgSlug,
      agentId,
      title:       runtimeState === "DEGRADED" ? "Runtime degradado" : "Datos desactualizados",
      description: runtimeState === "DEGRADED"
        ? "El motor de señales reporta estado degradado — capacidades reducidas"
        : "Datos pendientes de sincronización — retrasos posibles",
      timestamp: new Date(Date.now() - 15 * 60_000).toISOString(),
    });
  }

  // Governance denied event
  if (!governanceAllowed) {
    events.push({
      id:          crypto.randomUUID(),
      type:        "governance_denied",
      severity:    "warning",
      orgSlug,
      agentId,
      title:       "Gobernanza: ejecución denegada",
      description: governanceReason ?? "Gobernanza bloqueó la ejecución en este contexto",
      timestamp:   new Date(Date.now() - 5 * 60_000).toISOString(),
    });
  }

  // Execution prepared event
  if (hasExecution) {
    events.push({
      id:          crypto.randomUUID(),
      type:        executionStatus === "failed" ? "execution_blocked" : "execution_prepared",
      severity:    executionStatus === "failed" ? "critical" : "info",
      orgSlug,
      agentId,
      title:       executionStatus === "failed" ? "Ejecución bloqueada" : "Ejecución supervisada preparada",
      description: `Estado: ${executionStatus ?? "prepared"} — modo supervisado`,
      timestamp:   new Date(Date.now() - 2 * 60_000).toISOString(),
    });
  }

  // Approval requested event
  if (hasApprovalRequest) {
    events.push({
      id:          crypto.randomUUID(),
      type:        "approval_requested",
      severity:    "info",
      orgSlug,
      agentId,
      title:       "Aprobación requerida",
      description: "Operación supervisada esperando confirmación del operador",
      timestamp:   new Date(Date.now() - 1 * 60_000).toISOString(),
    });
  }

  // Integration draft created event
  if (integrationDraftCreated && integrationName) {
    events.push({
      id:          crypto.randomUUID(),
      type:        "integration_draft_created",
      severity:    "info",
      orgSlug,
      agentId,
      title:       `Borrador de despacho preparado — ${integrationName}`,
      description: `Integración ${integrationName} lista para despacho tras aprobación`,
      timestamp:   now,
    });
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const criticalCount = events.filter(e => e.severity === "critical").length;
  const warnCount     = events.filter(e => e.severity === "warning").length;

  const summary =
    criticalCount > 0 ? `${criticalCount} evento${criticalCount !== 1 ? "s" : ""} crítico${criticalCount !== 1 ? "s" : ""}` :
    warnCount > 0     ? `${warnCount} advertencia${warnCount !== 1 ? "s" : ""} activa${warnCount !== 1 ? "s" : ""}` :
    events.length > 0 ? `${events.length} evento${events.length !== 1 ? "s" : ""} auditado${events.length !== 1 ? "s" : ""}` :
    "Sin eventos de auditoría";

  return { orgSlug, events, summary };
}

/**
 * Returns the most recent N events serialized for RSC props.
 */
export function getRecentAuditEvents(
  trail: AuditTrail,
  limit: number = 3,
): Array<{ type: string; title: string; severity: string; relativeTime: string }> {
  const now = Date.now();
  return trail.events.slice(0, limit).map(e => ({
    type:         e.type,
    title:        e.title,
    severity:     e.severity,
    relativeTime: formatRelative(now - new Date(e.timestamp).getTime()),
  }));
}

function formatRelative(diffMs: number): string {
  const m = Math.floor(diffMs / 60_000);
  if (m < 1)   return "ahora";
  if (m < 60)  return `hace ${m}m`;
  return `hace ${Math.floor(m / 60)}h`;
}
