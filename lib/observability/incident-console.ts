/**
 * lib/observability/incident-console.ts
 *
 * Agentik — Incident Console Foundation
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block C2
 *
 * Builds structured incident records from runtime + vault + pipeline state.
 * Complements incident-detection.ts (which provides low-level incident signals)
 * with higher-level console records including impact assessment and replay availability.
 *
 * V1: deterministic from runtime signals — no Prisma persistence.
 * V4: persisted to Prisma.OperationalIncident + queryable incident history.
 */

import type { ReplaySession } from "./operation-replay";

// ── Incident severity ─────────────────────────────────────────────────────────────

export type IncidentSeverity =
  | "critical"  // Immediate intervention required — dispatch blocked
  | "high"      // Significant impact — attention required
  | "medium"    // Moderate impact — monitor
  | "low";      // Informational

// ── Incident category ─────────────────────────────────────────────────────────────

export type IncidentCategory =
  | "vault"         // Secret / credential issue
  | "runtime"       // Agent runtime degradation
  | "governance"    // Policy / approval violation
  | "connector"     // Integration or connector failure
  | "dispatch"      // Dispatch failure or block
  | "execution"     // Execution queue or workload issue
  | "audit"         // Audit trail gap or integrity failure
  | "replay";       // Replay integrity issue

// ── Operational incident record ───────────────────────────────────────────────────

export interface OperationalIncident {
  id:               string;
  orgSlug:          string;
  category:         IncidentCategory;
  severity:         IncidentSeverity;
  title:            string;
  description:      string;
  affectedModules:  string[];
  replayRef?:       string;   // Replay session ID if available
  replayAvailable:  boolean;
  resolved:         boolean;
  resolvedReason?:  string;
  detectedAt:       string;   // ISO timestamp
  priority:         number;   // Lower = higher priority (1 = critical)
}

// ── Incident impact summary ───────────────────────────────────────────────────────

export interface IncidentImpactSummary {
  totalCount:      number;
  criticalCount:   number;
  highCount:       number;
  mediumCount:     number;
  lowCount:        number;
  affectedModules: string[];
  dispatchBlocked: boolean;
  summary:         string;
}

// ── Console build params ──────────────────────────────────────────────────────────

export interface BuildIncidentConsoleParams {
  orgSlug:              string;
  runtimeState:         string;
  vaultHealth:          string;    // "secure" | "warning" | "critical" | "empty"
  governanceAllowed:    boolean;
  connectorBlockedCount: number;
  connectorDegradedCount: number;
  dispatchBlocked:      boolean;
  executionQueueBlocked: boolean;
  auditContinuity:      boolean;
  replaySession?:       ReplaySession;
}

// ── Build incident console ────────────────────────────────────────────────────────

/**
 * Builds a list of structured operational incidents from current runtime state.
 * Incidents are sorted by priority (critical first, then by severity).
 */
export function buildIncidentConsole(
  params: BuildIncidentConsoleParams,
): OperationalIncident[] {
  const {
    orgSlug, runtimeState, vaultHealth, governanceAllowed,
    connectorBlockedCount, connectorDegradedCount, dispatchBlocked,
    executionQueueBlocked, auditContinuity, replaySession,
  } = params;

  const incidents: OperationalIncident[] = [];
  const now = new Date().toISOString();

  // ── Vault incidents ───────────────────────────────────────────────────────────────

  if (vaultHealth === "critical") {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "vault",
      severity:        "critical",
      title:           "Vault crítico — secretos bloqueados",
      description:     "Uno o más secretos están expirados, inválidos o revocados. El despacho a conectores está bloqueado.",
      affectedModules: ["Agentik", "Dispatch", "Conectores"],
      replaySession,
    }));
  } else if (vaultHealth === "warning") {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "vault",
      severity:        "medium",
      title:           "Secretos próximos a expirar",
      description:     "Uno o más secretos expiran pronto. Rotar antes de que afecten el despacho.",
      affectedModules: ["Vault", "Dispatch"],
      replaySession,
    }));
  }

  // ── Runtime incidents ─────────────────────────────────────────────────────────────

  if (runtimeState === "BLOCKED") {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "runtime",
      severity:        "critical",
      title:           "Runtime bloqueado",
      description:     "El agente está en estado BLOCKED. Todas las operaciones están suspendidas.",
      affectedModules: ["Agentik", "Pipeline", "Dispatch"],
      replaySession,
    }));
  } else if (runtimeState === "DEGRADED") {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "runtime",
      severity:        "high",
      title:           "Runtime degradado",
      description:     "El agente opera en modo degradado. Las integraciones sensibles están restringidas.",
      affectedModules: ["Pipeline", "SAG-ERP", "DIAN"],
      replaySession,
    }));
  }

  // ── Governance incidents ──────────────────────────────────────────────────────────

  if (!governanceAllowed) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "governance",
      severity:        "high",
      title:           "Gobernanza bloqueó ejecución",
      description:     "Las reglas de gobernanza activas impiden la ejecución. Se requiere revisión.",
      affectedModules: ["Agentik", "Dispatch"],
      replaySession,
    }));
  }

  // ── Connector incidents ───────────────────────────────────────────────────────────

  if (connectorBlockedCount > 0) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "connector",
      severity:        "high",
      title:           `${connectorBlockedCount} conector${connectorBlockedCount > 1 ? "es" : ""} bloqueado${connectorBlockedCount > 1 ? "s" : ""}`,
      description:     `${connectorBlockedCount} integración${connectorBlockedCount > 1 ? "es" : ""} no puede${connectorBlockedCount > 1 ? "n" : ""} procesar operaciones.`,
      affectedModules: ["Conectores", "Gateway"],
      replaySession,
    }));
  }

  if (connectorDegradedCount > 0) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "connector",
      severity:        "medium",
      title:           `${connectorDegradedCount} conector${connectorDegradedCount > 1 ? "es" : ""} degradado${connectorDegradedCount > 1 ? "s" : ""}`,
      description:     "Conectores operando con capacidad reducida. Monitorear rendimiento.",
      affectedModules: ["Conectores"],
      replaySession,
    }));
  }

  // ── Dispatch incidents ────────────────────────────────────────────────────────────

  if (dispatchBlocked) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "dispatch",
      severity:        "high",
      title:           "Despacho bloqueado",
      description:     "El despacho supervisado está bloqueado por condiciones de runtime o vault.",
      affectedModules: ["Dispatch", "Gateway"],
      replaySession,
    }));
  }

  // ── Execution queue incidents ─────────────────────────────────────────────────────

  if (executionQueueBlocked) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "execution",
      severity:        "medium",
      title:           "Cola de ejecución bloqueada",
      description:     "Hay operaciones bloqueadas en la cola de ejecución pendientes de resolución.",
      affectedModules: ["Pipeline", "Cola"],
      replaySession,
    }));
  }

  // ── Audit incidents ───────────────────────────────────────────────────────────────

  if (!auditContinuity) {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "audit",
      severity:        "medium",
      title:           "Gap de continuidad de auditoría",
      description:     "La traza de auditoría tiene spans faltantes. Replay puede ser incompleto.",
      affectedModules: ["Auditoría", "Replay"],
      replaySession,
    }));
  }

  // ── Replay incidents ──────────────────────────────────────────────────────────────

  if (replaySession && replaySession.integrity === "corrupt") {
    incidents.push(buildIncident({
      orgSlug, now,
      category:        "replay",
      severity:        "high",
      title:           "Integridad de replay comprometida",
      description:     "La sesión de replay tiene integridad CORRUPT. Investigación manual requerida.",
      affectedModules: ["Replay", "Auditoría"],
      replaySession,
    }));
  }

  // Sort: active critical first, then by priority
  return incidents.sort((a, b) => a.priority - b.priority);
}

// ── Resolve incident priority ─────────────────────────────────────────────────────

/**
 * Returns a numeric priority for an incident (lower = more urgent).
 */
export function resolveIncidentPriority(
  severity: IncidentSeverity,
  category: IncidentCategory,
): number {
  const severityScore: Record<IncidentSeverity, number> = {
    critical: 1,
    high:     2,
    medium:   3,
    low:      4,
  };
  // Vault and runtime incidents get highest urgency within their severity tier
  const categoryBoost = category === "vault" || category === "runtime" ? 0 : 0.5;
  return severityScore[severity] + categoryBoost;
}

// ── Summarize incident impact ─────────────────────────────────────────────────────

/**
 * Returns an aggregate impact summary for rail display.
 */
export function summarizeIncidentImpact(
  incidents: OperationalIncident[],
): IncidentImpactSummary {
  if (incidents.length === 0) {
    return {
      totalCount:      0,
      criticalCount:   0,
      highCount:       0,
      mediumCount:     0,
      lowCount:        0,
      affectedModules: [],
      dispatchBlocked: false,
      summary:         "Sin incidentes activos — sistema operativo",
    };
  }

  const criticalCount   = incidents.filter(i => i.severity === "critical").length;
  const highCount       = incidents.filter(i => i.severity === "high").length;
  const mediumCount     = incidents.filter(i => i.severity === "medium").length;
  const lowCount        = incidents.filter(i => i.severity === "low").length;
  const dispatchBlocked = incidents.some(i => i.category === "dispatch" || i.category === "vault" || i.category === "runtime");

  const allModules = new Set(incidents.flatMap(i => i.affectedModules));
  const affectedModules = Array.from(allModules);

  const summary =
    criticalCount > 0
      ? `${criticalCount} incidente${criticalCount > 1 ? "s" : ""} crítico${criticalCount > 1 ? "s" : ""} — intervención requerida`
      : highCount > 0
      ? `${highCount} incidente${highCount > 1 ? "s" : ""} de alta severidad — atención requerida`
      : `${incidents.length} incidente${incidents.length > 1 ? "s" : ""} activo${incidents.length > 1 ? "s" : ""} — monitorear`;

  return {
    totalCount: incidents.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    affectedModules,
    dispatchBlocked,
    summary,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function buildIncident(p: {
  orgSlug:         string;
  now:             string;
  category:        IncidentCategory;
  severity:        IncidentSeverity;
  title:           string;
  description:     string;
  affectedModules: string[];
  replaySession?:  ReplaySession;
}): OperationalIncident {
  const id       = `inc-${p.category.slice(0, 3)}-${Date.now().toString(36)}`;
  const priority = resolveIncidentPriority(p.severity, p.category);

  return {
    id,
    orgSlug:         p.orgSlug,
    category:        p.category,
    severity:        p.severity,
    title:           p.title,
    description:     p.description,
    affectedModules: p.affectedModules,
    replayRef:       p.replaySession?.replayId,
    replayAvailable: p.replaySession?.replayAvailable ?? false,
    resolved:        false,
    detectedAt:      p.now,
    priority,
  };
}
