/**
 * lib/runtime/runtime-state.ts
 *
 * Agentik — Runtime Health State Layer V1
 *
 * Block A of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Models the health of the Agentik runtime engine and its connectors.
 * Drives degradation propagation, connector governance, and execution gating.
 *
 * V1: deterministic mock — no DB, no external pings.
 * V2: real connector health checks via SAG adapter + Prisma.ConnectorHealth.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type RuntimeHealthState =
  | "healthy"     // All systems nominal
  | "syncing"     // In the process of re-syncing data
  | "degraded"    // Partial failure — some subsystems down
  | "stale"       // Data present but not fresh
  | "blocked"     // Hard block — execution gates are closed
  | "recovering"; // Recovery in progress after degradation

export interface RuntimeConnectorHealth {
  connectorId:   string;
  name:          string;
  state:         RuntimeHealthState;
  lastSyncAt:    string;            // ISO string
  errorMessage?: string;
  retryCount:    number;
}

export interface RuntimeState {
  orgSlug:           string;
  state:             RuntimeHealthState;
  connectors:        RuntimeConnectorHealth[];
  lastEvaluatedAt:   string;        // ISO string
  degradedCount:     number;        // Connectors in degraded state
  blockedCount:      number;        // Hard-blocked connectors
  stalledCount:      number;        // Stale connectors
  recoveryAvailable: boolean;       // Can trigger recovery?
  summary:           string;        // 1-line status
}

// ── Copilot → Runtime state mapper ────────────────────────────────────────────

/**
 * Maps the existing copilot runtime state (uppercase) to the new lowercase contract.
 */
export function mapCopilotRuntimeState(copilotState: string): RuntimeHealthState {
  const MAP: Record<string, RuntimeHealthState> = {
    HEALTHY:   "healthy",
    SYNCING:   "syncing",
    STALE:     "stale",
    DEGRADED:  "degraded",
    BLOCKED:   "blocked",
  };
  return MAP[copilotState] ?? "degraded";
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the runtime state for a given org from copilot signal engine output.
 * V1: derives connector health deterministically from runtime state + org context.
 */
export function buildRuntimeState(
  orgSlug:       string,
  runtimeHealth: string,   // Copilot runtime state (uppercase)
  connectorHints?: Array<{ id: string; name: string; healthy: boolean }>,
): RuntimeState {
  const mappedState = mapCopilotRuntimeState(runtimeHealth);

  // V1 connector health: derive from runtime state
  const defaultConnectors: RuntimeConnectorHealth[] = [
    {
      connectorId:  "sag-main",
      name:         "SAG ERP",
      state:        mappedState === "degraded" ? "degraded" : mappedState === "stale" ? "stale" : "healthy",
      lastSyncAt:   new Date(Date.now() - 15 * 60_000).toISOString(),
      retryCount:   mappedState === "degraded" ? 2 : 0,
      errorMessage: mappedState === "degraded" ? "Timeout en respuesta del conector" : undefined,
    },
    {
      connectorId:  "signal-engine",
      name:         "Motor de señales",
      state:        mappedState === "blocked" ? "blocked" : mappedState,
      lastSyncAt:   new Date(Date.now() - 5 * 60_000).toISOString(),
      retryCount:   0,
    },
  ];

  // Merge with any passed hints
  const connectors: RuntimeConnectorHealth[] = connectorHints
    ? connectorHints.map(h => ({
        connectorId:  h.id,
        name:         h.name,
        state:        h.healthy ? "healthy" : mappedState === "degraded" ? "degraded" : "stale",
        lastSyncAt:   new Date(Date.now() - 10 * 60_000).toISOString(),
        retryCount:   h.healthy ? 0 : 1,
      }))
    : defaultConnectors;

  const degradedCount    = connectors.filter(c => c.state === "degraded").length;
  const blockedCount     = connectors.filter(c => c.state === "blocked").length;
  const stalledCount     = connectors.filter(c => c.state === "stale").length;
  const recoveryAvailable = mappedState === "degraded" || mappedState === "stale";

  const summary =
    mappedState === "healthy"    ? "Runtime operativo — todos los sistemas nominales"   :
    mappedState === "degraded"   ? `${degradedCount} conector${degradedCount !== 1 ? "es" : ""} degradado${degradedCount !== 1 ? "s" : ""} — supervisión activa` :
    mappedState === "stale"      ? "Datos pendientes de sincronización"                 :
    mappedState === "syncing"    ? "Resincronización en curso…"                         :
    mappedState === "blocked"    ? "Runtime bloqueado — ejecución suspendida"            :
    mappedState === "recovering" ? "Recuperación en progreso — monitoreo activo"        :
    "Estado desconocido";

  return {
    orgSlug,
    state:           mappedState,
    connectors,
    lastEvaluatedAt: new Date().toISOString(),
    degradedCount,
    blockedCount,
    stalledCount,
    recoveryAvailable,
    summary,
  };
}

/**
 * Returns true if the runtime state allows supervised execution.
 */
export function canExecuteUnderRuntime(state: RuntimeHealthState): boolean {
  return state !== "blocked";
}

/**
 * Returns true if the runtime state allows automatic execution.
 * V3: automatic is never allowed (reserved for V4+).
 */
export function canExecuteAutomatically(_state: RuntimeHealthState): boolean {
  return false; // Phase 12 constraint: automatic mode never enabled in V3
}
