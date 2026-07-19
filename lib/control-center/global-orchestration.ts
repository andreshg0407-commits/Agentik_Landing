/**
 * lib/control-center/global-orchestration.ts
 *
 * Agentik — Global Orchestration View
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block C2
 *
 * Aggregates queues, workloads, incidents, governance blocks,
 * replay continuity, and runtime degradation propagation
 * into a single global orchestration snapshot.
 *
 * V1: derived from existing pipeline signals.
 * V4: aggregated from real multi-tenant Prisma state.
 */

// ── System pressure ───────────────────────────────────────────────────────────

export type SystemPressure =
  | "nominal"    // Everything operational — no pressure
  | "elevated"   // Minor issues — monitoring recommended
  | "high"       // Active issues — intervention likely needed
  | "critical";  // Blocking issues — immediate action required

// ── Global orchestration snapshot ────────────────────────────────────────────

export interface GlobalOrchestration {
  orgSlug:               string;
  systemPressure:        SystemPressure;
  orchestrationMode:     string;    // "normal"|"supervised"|"restricted"|"maintenance"|"recovery"
  totalQueueDepth:       number;    // All queued operations across modules
  blockedQueueCount:     number;    // Operations blocked in queue
  activeWorkloads:       number;    // Active agent workloads
  incidentPressure:      SystemPressure;
  governanceBlockCount:  number;    // Operations blocked by governance rules
  replayContinuity:      boolean;   // Audit trail intact
  degradationPropagated: boolean;   // Runtime degradation is affecting subsystems
  connectorReadiness:    number;    // 0–100%
  executionCapacity:     number;    // 0–100% remaining execution capacity
  systemSummary:         string;
  pressureFactors:       string[];  // What's causing pressure
  evaluatedAt:           string;
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildGlobalOrchestrationParams {
  orgSlug:              string;
  orchestrationMode:    string;
  runtimeState:         string;
  totalQueueDepth:      number;
  blockedQueueCount:    number;
  activeWorkloads:      number;
  incidentCount:        number;
  criticalIncidentCount: number;
  governanceBlockCount: number;
  replayContinuity:     boolean;
  connectorReadiness:   number;
}

// ── Core: build global orchestration ─────────────────────────────────────────

/**
 * Builds the global orchestration snapshot from aggregated pipeline state.
 */
export function buildGlobalOrchestration(
  params: BuildGlobalOrchestrationParams,
): GlobalOrchestration {
  const {
    orgSlug, orchestrationMode, runtimeState,
    totalQueueDepth, blockedQueueCount, activeWorkloads,
    incidentCount, criticalIncidentCount, governanceBlockCount,
    replayContinuity, connectorReadiness,
  } = params;

  const pressureFactors: string[] = [];

  if (criticalIncidentCount > 0) pressureFactors.push(`${criticalIncidentCount} incidente${criticalIncidentCount > 1 ? "s" : ""} crítico${criticalIncidentCount > 1 ? "s" : ""}`);
  if (blockedQueueCount > 0)     pressureFactors.push(`${blockedQueueCount} operación${blockedQueueCount > 1 ? "es" : ""} bloqueada${blockedQueueCount > 1 ? "s" : ""} en cola`);
  if (governanceBlockCount > 0)  pressureFactors.push(`${governanceBlockCount} bloqueo${governanceBlockCount > 1 ? "s" : ""} de gobernanza`);
  if (!replayContinuity)         pressureFactors.push("Gap de continuidad de auditoría");
  if (connectorReadiness < 50)   pressureFactors.push("Menos del 50% de conectores disponibles");
  if (runtimeState === "DEGRADED") pressureFactors.push("Runtime degradado — propagación activa");
  if (runtimeState === "BLOCKED")  pressureFactors.push("Runtime bloqueado — ejecución suspendida");

  const incidentPressure: SystemPressure =
    criticalIncidentCount > 0 ? "critical" :
    incidentCount > 2         ? "high"     :
    incidentCount > 0         ? "elevated" :
    "nominal";

  const systemPressure = resolveSystemPressure(params);
  const degradationPropagated = runtimeState === "DEGRADED" || runtimeState === "BLOCKED";

  // Execution capacity: inverse of blocked + degraded indicators
  const blockRatio       = totalQueueDepth > 0 ? blockedQueueCount / totalQueueDepth : 0;
  const executionCapacity = Math.max(0, Math.round((1 - blockRatio) * connectorReadiness));

  const systemSummary = summarizeGlobalOrchestration({
    systemPressure, pressureFactors,
    orchestrationMode, connectorReadiness,
  });

  return {
    orgSlug,
    systemPressure,
    orchestrationMode,
    totalQueueDepth,
    blockedQueueCount,
    activeWorkloads,
    incidentPressure,
    governanceBlockCount,
    replayContinuity,
    degradationPropagated,
    connectorReadiness,
    executionCapacity,
    systemSummary,
    pressureFactors,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Resolve system pressure ───────────────────────────────────────────────────

/**
 * Resolves the system-wide pressure level from all signals.
 */
export function resolveSystemPressure(
  p: BuildGlobalOrchestrationParams,
): SystemPressure {
  if (
    p.criticalIncidentCount > 0 ||
    p.runtimeState === "BLOCKED"
  ) return "critical";

  if (
    p.runtimeState === "DEGRADED" ||
    p.blockedQueueCount > 2 ||
    p.governanceBlockCount > 1 ||
    p.connectorReadiness < 30
  ) return "high";

  if (
    p.incidentCount > 0 ||
    p.blockedQueueCount > 0 ||
    p.governanceBlockCount > 0 ||
    !p.replayContinuity ||
    p.connectorReadiness < 70
  ) return "elevated";

  return "nominal";
}

// ── Summarize global orchestration ───────────────────────────────────────────

/**
 * Returns a 1-line system summary for display.
 */
export function summarizeGlobalOrchestration(p: {
  systemPressure:    SystemPressure;
  pressureFactors:   string[];
  orchestrationMode: string;
  connectorReadiness: number;
}): string {
  if (p.systemPressure === "critical") {
    return p.pressureFactors[0] ?? "Presión crítica del sistema — acción inmediata requerida";
  }
  if (p.systemPressure === "high") {
    return `${p.pressureFactors.length} factor${p.pressureFactors.length > 1 ? "es" : ""} de presión alta — monitorear activamente`;
  }
  if (p.systemPressure === "elevated") {
    return `Modo ${p.orchestrationMode} — ${p.connectorReadiness}% conectores disponibles`;
  }
  return `Sistema nominal — modo ${p.orchestrationMode}, ${p.connectorReadiness}% capacidad`;
}
